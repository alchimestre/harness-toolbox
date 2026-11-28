// Answers a one-path ignore or untrack chore without spawning git-chores: Jev picks the first
// action, the extension runs it, and the task call is blocked with the result as its reason.
// Anything else, or any Jev doubt or error, spawns the agent unchanged.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DecisionBackend, Question } from "../src/crossroads/backend.ts";
import { decidedLabel, isFallback, jevBackend } from "../src/crossroads/backend.ts";

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

export default function gitChoresFastPath(pi: ExtensionAPI, backend?: DecisionBackend): void {
	pi.on("tool_call", async (event: ToolCallEvent, ctx: { cwd: string }) => {
		if (event.toolName !== "task") return;
		const chore = eligibleChore(event.input, ctx.cwd);
		if (!chore) return;
		const label = await askLabel(backend, chore);
		if (!label || (label === "untrack") !== chore.tracked) return;
		const reason = applyChore(ctx.cwd, chore.path, label);
		return reason ? { block: true, reason } : undefined;
	});
	pi.setLabel("git-chores fast path");
}

export function eligibleChore(input: TaskInput, cwd: string): Chore | undefined {
	const tasks = input.tasks ?? [];
	if (tasks.length !== 1 || tasks[0].agent !== AGENT) return undefined;
	const request = tasks[0].task ?? "";
	const paths = new Set([...request.matchAll(BACKTICKED)].map((match) => match[1]).filter(isPathToken));
	const asked = `${input.context ?? ""}\n${request}`.replace(NEGATED_CLAUSE, "");
	if (AGENT_ONLY.test(asked) || !IGNORE_INTENT.test(asked) || paths.size !== 1) return undefined;
	const [path] = paths;
	// shortcut: only runs from the repo root, so ignore patterns need no prefix; subdirectories go to the agent.
	const root = git(cwd, "rev-parse", "--show-toplevel");
	if (root.status !== 0 || realpathSync(root.stdout.trim()) !== realpathSync(cwd)) return undefined;
	const tracked = git(cwd, "ls-files", "--error-unmatch", "--", path).status === 0;
	return { path, tracked, request };
}

function isPathToken(token: string): boolean {
	return !IGNORE_FILES[token] && !/\s/.test(token) && !token.startsWith("-") && !token.startsWith("/") && !token.split("/").includes("..");
}

async function askLabel(backend: DecisionBackend | undefined, chore: Chore): Promise<string | undefined> {
	const state = `Path \`${chore.path}\` is ${chore.tracked ? "tracked" : "untracked"}. Request: ${chore.request}`;
	try {
		const asked = await (backend ?? jevBackend()).ask({ input: state }, { decision: QUESTION }, JEV_TIMEOUT_MS);
		const answer = asked.answers.decision;
		return isFallback(QUESTION, answer) ? undefined : decidedLabel(QUESTION, answer);
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

function git(cwd: string, ...args: string[]) {
	return spawnSync("git", args, { cwd, encoding: "utf8" });
}
