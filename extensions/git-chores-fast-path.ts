// Answers a one-path ignore or untrack chore without spawning git-chores: Jev picks the first
// action, the extension runs it, and the task call is blocked with the result as its reason.
// Anything else, or any Jev doubt or error, spawns the agent unchanged.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DecisionBackend, Question } from "../src/crossroads/backend.ts";
import { decidedLabel, effectiveConfidence, isFallback, jevBackend } from "../src/crossroads/backend.ts";

const AGENT = "git-chores";
const JEV_TIMEOUT_MS = 2_000;
// Jobs the three benchmarked actions cannot do; they need the agent's checks.
const AGENT_ONLY = /\b(commit|push|remote|delete|prune|worktree|branch|history|secret|credential|rewrite|force|reset|clean)/i;
// Without an explicit ignore or untrack ask, a confident label could mutate a repo the user only asked about.
const IGNORE_INTENT = /\b(ignor|exclud|untrack|stop tracking|keep (it |them )?out of|out of (git|the repo))/i;
const BACKTICKED = /`([^`]+)`/g;
// "Do not commit or push" is the usual guard line in an ignore chore, not a commit job.
const NEGATED_CLAUSE = /\b(do not|don't|not|never|without|no)\b[^.\n]*/gi;
const IGNORE_FILES: Record<string, true> = { ".gitignore": true, ".git/info/exclude": true };
const DEFAULT_LOG_FILE = join(homedir(), ".omp", "agent", "git-chores-fast-path.jsonl");

export const QUESTION: Question = {
	kind: "choice",
	instructions: "Which action does the git-chores agent take first for this request?",
	labels: {
		untrack: "The path is already tracked: git rm -r --cached so it leaves the repo but stays on disk.",
		gitignore: "The path is untracked and should be ignored for everyone: add it to .gitignore.",
		exclude: "The path is untracked and should be ignored on this machine only, or the request says exclude: add it to .git/info/exclude.",
	},
};

type TaskInput = { context?: string; tasks?: { agent?: string; task?: string }[] };
type ToolCallEvent = { toolName: string; input: TaskInput };
export type Chore = { path: string; tracked: boolean; request: string };
type Eligibility = { chore: Chore } | { reason: string };
type Verdict = { reason?: string; label?: string; confidence?: number };
type Decision = Verdict & { reason: string; path?: string; block?: string };
type LogEntry = { ts: string; outcome: "fast" | "agent"; reason: string; label?: string; confidence?: number; path?: string; ms: number };

export default function gitChoresFastPath(pi: ExtensionAPI, backend?: DecisionBackend): void {
	pi.on("tool_call", async (event: ToolCallEvent, ctx: { cwd: string }) => {
		const targetsChores = (event.input.tasks ?? []).some((task) => task.agent === AGENT);
		if (event.toolName !== "task" || !targetsChores) return;
		const started = Date.now();
		const { block, ...decision } = await decide(event.input, ctx.cwd, backend);
		appendLog({ ts: new Date().toISOString(), outcome: block ? "fast" : "agent", ...decision, ms: Date.now() - started });
		return block ? { block: true, reason: block } : undefined;
	});
	pi.setLabel("git-chores fast path");
}

async function decide(input: TaskInput, cwd: string, backend: DecisionBackend | undefined): Promise<Decision> {
	const eligibility = eligibleChore(input, cwd);
	if ("reason" in eligibility) return { reason: eligibility.reason };
	const { chore } = eligibility;
	const verdict = await askLabel(backend, chore);
	const { label, confidence } = verdict;
	if (verdict.reason || label === undefined) return { reason: verdict.reason ?? "jev-unsure", label, confidence };
	if ((label === "untrack") !== chore.tracked) return { reason: "label-contradicts-tracked", label, confidence };
	const block = tryApplyChore(cwd, chore.path, label);
	return block ? { label, confidence, path: chore.path, reason: "done", block } : { label, confidence, reason: "action-failed" };
}

export function eligibleChore(input: TaskInput, cwd: string): Eligibility {
	const tasks = input.tasks ?? [];
	if (tasks.length !== 1) return { reason: "not-eligible:task-count" };
	const request = tasks[0].task ?? "";
	const paths = new Set([...request.matchAll(BACKTICKED)].map((match) => match[1]).filter(isPathToken));
	const asked = `${input.context ?? ""}\n${request}`.replace(NEGATED_CLAUSE, "");
	if (AGENT_ONLY.test(asked)) return { reason: "not-eligible:agent-only-job" };
	if (!IGNORE_INTENT.test(asked)) return { reason: "not-eligible:no-ignore-intent" };
	if (paths.size !== 1) return { reason: "not-eligible:path-count" };
	const [path] = paths;
	// shortcut: only runs from the repo root, so ignore patterns need no prefix; subdirectories go to the agent.
	const root = git(cwd, "rev-parse", "--show-toplevel");
	if (root.status !== 0 || realpathSync(root.stdout.trim()) !== realpathSync(cwd)) return { reason: "not-eligible:not-repo-root" };
	const tracked = git(cwd, "ls-files", "--error-unmatch", "--", path).status === 0;
	return { chore: { path, tracked, request } };
}

function isPathToken(token: string): boolean {
	return !IGNORE_FILES[token] && !/\s/.test(token) && !token.startsWith("-") && !token.startsWith("/") && !token.split("/").includes("..");
}

async function askLabel(backend: DecisionBackend | undefined, chore: Chore): Promise<Verdict> {
	const state = `Path \`${chore.path}\` is ${chore.tracked ? "tracked" : "untracked"}. Request: ${chore.request}`;
	try {
		const asked = await (backend ?? jevBackend()).ask({ input: state }, { decision: QUESTION }, JEV_TIMEOUT_MS);
		const answer = asked.answers.decision;
		const label = decidedLabel(QUESTION, answer);
		const confidence = effectiveConfidence(QUESTION.kind, answer);
		return isFallback(QUESTION, answer) ? { reason: "jev-unsure", label, confidence } : { label, confidence };
	} catch {
		return { reason: "jev-error" };
	}
}

function tryApplyChore(cwd: string, path: string, label: string): string | undefined {
	try {
		return applyChore(cwd, path, label);
	} catch {
		return undefined;
	}
}

// Returns undefined when nothing changed, so the agent runs instead.
export function applyChore(cwd: string, path: string, label: string): string | undefined {
	let action: string;
	if (label === "untrack") {
		const removed = git(cwd, "rm", "-r", "-q", "--cached", "--", path);
		if (removed.status !== 0) return undefined;
		action = `git rm -r --cached -- ${path}`;
	} else {
		const file = label === "gitignore" ? join(cwd, ".gitignore") : resolve(cwd, git(cwd, "rev-parse", "--git-path", "info/exclude").stdout.trim());
		action = appendLine(file, path) ? `added ${path} to ${label === "gitignore" ? ".gitignore" : ".git/info/exclude"}` : `${path} was already listed in ${file}`;
	}
	const status = git(cwd, "status", "--short").stdout.trim() || "(clean)";
	return `Done by the git-chores fast path; no subagent was spawned. Do not retry this task.\nAction: ${action}\nNothing was committed or pushed.\ngit status --short:\n${status}`;
}

function appendLine(file: string, line: string): boolean {
	const current = existsSync(file) ? readFileSync(file, "utf8") : "";
	if (current.split("\n").includes(line)) return false;
	const separator = current === "" || current.endsWith("\n") ? "" : "\n";
	appendFileSync(file, `${separator}${line}\n`);
	return true;
}

function appendLog(entry: LogEntry): void {
	try {
		const file = process.env.GIT_CHORES_FAST_PATH_LOG || DEFAULT_LOG_FILE;
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, `${JSON.stringify(entry)}\n`);
	} catch {
		// Logging must never block a task call.
	}
}

function git(cwd: string, ...args: string[]) {
	return spawnSync("git", args, { cwd, encoding: "utf8" });
}
