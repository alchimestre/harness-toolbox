// Wires each extension against a fake harness API. Run: bun test/wiring.ts

import { mock } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import readonlyLsp, { READONLY_AGENTS } from "../extensions/readonly-lsp.ts";
import searchGuard from "../extensions/search-guard.ts";
import workerSkillTrim from "../extensions/worker-skill-trim.ts";
import subagentScheduler from "../extensions/subagent-scheduler.ts";
import gitChoresFastPath from "../extensions/git-chores-fast-path.ts";
import reviewerDiffGuard from "../extensions/reviewer-diff-guard.ts";
import type { DecisionBackend } from "../src/crossroads/backend.ts";

type Handler = (event: unknown, ctx: unknown) => unknown;

function fakePi() {
	const handlers: Record<string, Handler> = {};
	const messages: Array<Record<string, unknown>> = [];
	return {
		pi: {
			on: (name: string, fn: Handler) => {
				handlers[name] = fn;
			},
			sendMessage: (message: Record<string, unknown>) => messages.push(message),
			setLabel: () => {},
		},
		handlers,
		messages,
	};
}

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

const ctx = { cwd: "/tmp/scope", agent: { kind: "main" }, hasUI: false };

// --- search-guard ---------------------------------------------------------
{
	const { pi, handlers, messages } = fakePi();
	searchGuard(pi as never);

	check("tool_call" in handlers, "search-guard registers tool_call");
	check("tool_result" in handlers, "search-guard registers tool_result");
	check("before_agent_start" in handlers, "search-guard registers before_agent_start");

	const call = handlers["tool_call"];
	const results: unknown[] = [];
	for (let i = 1; i <= 16; i++) {
		results.push(call({ toolName: "web_search", input: { query: `q${i}` } }, ctx));
	}

	check(results.slice(0, 15).every((r) => r === undefined), "first 15 searches allowed");
	const blocked = results[15] as { block?: boolean; reason?: string };
	check(blocked?.block === true, "16th search blocked");
	check(/budget/i.test(blocked.reason ?? ""), "block carries budget reason");
	check(call({ toolName: "read", input: { path: "https://example.com" } }, ctx) === undefined, "read unaffected");

	const rewritten = handlers["tool_result"](
		{
			toolName: "web_search",
			isError: true,
			content: [{ type: "text", text: "Error: all providers failed" }],
		},
		ctx,
	) as { content: Array<{ text: string }> };
	check(rewritten.content[0].text.includes("DO NOT retry"), "provider error gets no-retry suffix");

	const ok = handlers["tool_result"](
		{ toolName: "web_search", isError: false, content: [{ type: "text", text: "results" }] },
		ctx,
	);
	check(ok === undefined, "successful search untouched");

	const injected = handlers["before_agent_start"]({}, ctx) as {
		message: { customType: string };
	};
	check(injected.message.customType === "search-hang-policy", "policy injected at agent start");
	check(messages.length === 0, "search-guard sends no user-visible messages");
}

// --- advisor-cross-family --------------------------------------------------
{
	// Dynamic import: the registry subpath does not resolve outside the harness loader, and the
	// mock must exist before the extension module evaluates. A static import would fail to load.
	let configured: Record<string, string> = { advisor: "openai-codex/gpt-6-luna:high" };
	const overrides: Array<Record<string, string>> = [];
	mock.module("@oh-my-pi/pi-coding-agent/config/registry", () => ({
		lookup: (id: string) =>
			id === "modelRoles"
				? {
						get: () => configured,
						override: (_scope: unknown, value: Record<string, string>) => {
							overrides.push(value);
						},
					}
				: undefined,
	}));
	const { default: advisorCrossFamily } = await import("../extensions/advisor-cross-family.ts");

	const FAMILY: Record<string, string> = {
		"openai-codex/gpt-6-luna": "gpt",
		"openai-codex/gpt-6.2-sol": "gpt",
		"anthropic/claude-opus-5-5": "claude",
		"deepseek/deepseek-v4-flash": "deepseek",
	};
	const model = (spec: string) => {
		const id = spec.replace(/:\w+$/, "");
		return id in FAMILY ? { id, family: FAMILY[id] } : undefined;
	};
	const harness = (primary: string, kind = "main") => ({
		agent: { kind },
		models: { current: () => model(primary), resolve: model, family: (m: { family: string }) => m.family },
	});

	const { pi, handlers } = fakePi();
	(pi as Record<string, unknown>).pi = { settings: {} };
	advisorCrossFamily(pi as never);

	check("session_start" in handlers, "advisor registers session_start");
	check("retry_fallback_applied" in handlers, "advisor registers retry_fallback_applied");

	handlers["session_start"]({}, harness("anthropic/claude-opus-5-5"));
	check(overrides.length === 0, "cross-family advisor left alone");

	configured = { advisor: "anthropic/claude-opus-5-5:high" };
	handlers["session_start"]({}, harness("anthropic/claude-opus-5-5"));
	check(overrides.at(-1)?.advisor === "openai-codex/gpt-6-luna:high", "same-family advisor moved to luna");

	configured = { advisor: "openai-codex/gpt-6-luna:high" };
	handlers["session_start"]({}, harness("openai-codex/gpt-6.2-sol"));
	check(overrides.at(-1)?.advisor === "deepseek/deepseek-v4-flash:high", "openai primary moves advisor to deepseek flash");

	// Same-family advisor, so a main session would override: the kind guard is what suppresses the calls below.
	configured = { advisor: "anthropic/claude-opus-5-5:high" };
	const applied = overrides.length;
	handlers["session_start"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent session start leaves the advisor alone");
	handlers["retry_fallback_applied"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent fallback leaves the advisor alone");

	handlers["retry_fallback_applied"]({}, harness("anthropic/claude-opus-5-5"));
	check(overrides.at(-1)?.advisor === "openai-codex/gpt-6-luna:high", "main-session fallback applies the override");
}

// --- readonly-lsp ---------------------------------------------------------
{
	const { pi, handlers } = fakePi();
	readonlyLsp(pi as never);
	const lsp = (action: unknown, name: string) =>
		handlers["tool_call"]({ toolName: "lsp", input: { action } }, { agent: { kind: "sub", name } }) as
			| { block?: boolean; reason?: string }
			| undefined;

	check(lsp("references", "review-low") === undefined, "reviewer lsp lookup allowed");
	for (const action of ["rename", "rename_file", "code_actions", "request", "reload", "constructor", undefined]) {
		check(lsp(action, "review-low")?.block === true, `reviewer lsp ${action} blocked`);
	}
	check(/read-only/.test(lsp("rename", "review-high")?.reason ?? ""), "block names the read-only rule");
	check(lsp("rename", "task") === undefined, "other agents keep lsp rename");
	check(handlers["tool_call"]({ toolName: "lsp", input: { action: "rename" } }, { agent: { kind: "main" } }) === undefined, "main session keeps lsp rename");

	const WRITING_TOOLS = ["edit", "write", "bash"];
	for (const file of readdirSync("agents")) {
		const frontmatter = readFileSync(`agents/${file}`, "utf8").split(/^---$/m)[1];
		const tools = (/^tools: (.*)$/m.exec(frontmatter)?.[1] ?? "").split(/,\s*/);
		const name = /^name: (.*)$/m.exec(frontmatter)?.[1] ?? "";
		const lookupOnly = tools.includes("lsp") && !WRITING_TOOLS.some((tool) => tools.includes(tool));
		check(lookupOnly === Object.hasOwn(READONLY_AGENTS, name), `${name}: guard list matches its tool list`);
	}

	const body = (file: string) => readFileSync(`agents/${file}.md`, "utf8").split(/^---$/m).slice(2).join("---");
	for (const [copy, source] of [["task-fast", "task"], ["review-high", "readonly-reviewer"], ["review-low", "readonly-reviewer"]]) {
		check(body(copy) === body(source), `${copy}: body identical to ${source}`);
	}
}

// --- worker-skill-trim ----------------------------------------------------
{
	const { pi, handlers } = fakePi();
	workerSkillTrim(pi as never);
	const start = (systemPrompt: unknown, kind: string) =>
		handlers["before_agent_start"]({ systemPrompt }, { agent: { kind } }) as { systemPrompt?: unknown } | undefined;
	const blocks = ["core", "rules\n<skills>\n- a: b\n</skills>\ntools"];

	check(JSON.stringify(start(blocks, "sub")?.systemPrompt) === JSON.stringify(["core", "rules\ntools"]), "worker loses the skills catalog");
	check(start("x<skills>y</skills>\nz", "sub")?.systemPrompt === "xz", "string prompt trimmed");
	check(start(blocks, "main") === undefined, "main session keeps the catalog");
	check(start(["no catalog"], "sub") === undefined, "prompt without a catalog untouched");
}

// --- subagent-scheduler ---------------------------------------------------
{
	process.env.SUBAGENT_SCHEDULER_DIR = mkdtempSync(join(tmpdir(), "subagent-scheduler-"));
	process.env.SUBAGENT_SCHEDULER_SLOTS = "1";
	delete process.env.SUBAGENT_SCHEDULER_SLOT;
	const first = fakePi();
	const second = fakePi();
	subagentScheduler(first.pi as never);
	subagentScheduler(second.pi as never);
	const sub = { agent: { kind: "sub" }, cwd: "/work/project" };
	const call = (handlers: Record<string, Handler>, toolName: string, ctx: unknown = sub) =>
		handlers["tool_call"]({ toolName }, ctx) as Promise<void> | undefined;
	const ADMISSION_POLL_MS = 1500;
	const ADMISSION_TIMEOUT_MS = 3000;
	let secondAdmitted = false;

	await call(first.handlers, "read");
	const queued = call(second.handlers, "read")?.then(() => {
		secondAdmitted = true;
	});
	await Bun.sleep(ADMISSION_POLL_MS);
	check(!secondAdmitted, "second subagent waits while the only slot is held");
	await call(first.handlers, "wait");
	await queued;
	check(secondAdmitted, "waiting on children frees the slot for the queued subagent");
	check((await call(second.handlers, "read", { agent: { kind: "main" }, cwd: "/" })) === undefined, "main session never queues");
	let evalChildAdmitted = false;
	const evalChild = call(first.handlers, "read")?.then(() => {
		evalChildAdmitted = true;
	});
	await call(second.handlers, "eval");
	await Promise.race([evalChild, Bun.sleep(ADMISSION_TIMEOUT_MS)]);
	check(evalChildAdmitted, "a subagent awaiting eval children frees its slot for them");
	first.handlers["agent_end"]({}, sub);
}

// --- git-chores-fast-path ---------------------------------------------------
{
	const logDir = mkdtempSync(join(tmpdir(), "fast-path-log-"));
	const logFile = join(logDir, "git-chores-fast-path.jsonl");
	process.env.GIT_CHORES_FAST_PATH_LOG = logFile;
	const logLines = (): Array<Record<string, unknown>> => (existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []);
	const lastEntry = () => logLines().at(-1);
	const repo = mkdtempSync(join(tmpdir(), "fast-path-"));
	const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: repo }).stdout.toString();
	git("init", "-q");
	git("config", "core.excludesfile", "/dev/null");
	writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
	writeFileSync(join(repo, "build.log"), "x\n");
	writeFileSync(join(repo, "notes.md"), "x\n");
	writeFileSync(join(repo, "db.sqlite3"), "x\n");
	git("add", ".gitignore", "db.sqlite3");
	git("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-qm", "init");

	const CONFIDENT = 0.95;
	const UNSURE = 0.4;
	let asked = 0;
	const fakeJev = (label: string, confidence: number): DecisionBackend => ({
		name: "fake",
		limits: { maxStateTokens: 32_000, maxOptions: 255, maxLevels: 10 },
		usdPerInputToken: 0,
		ask: async () => {
			asked++;
			return { answers: { decision: { label, probabilities: { [label]: confidence }, confidence } }, ms: 0, inputTokens: 0 };
		},
	});
	const callTask = async (backend: DecisionBackend, task: string, agent = "git-chores") => {
		const { pi, handlers } = fakePi();
		gitChoresFastPath(pi as never, backend);
		return (await handlers["tool_call"]({ toolName: "task", input: { tasks: [{ agent, task }] } }, { cwd: repo })) as { block: true; reason: string } | undefined;
	};

	const ignored = await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `build.log` for everyone.");
	check(ignored?.block && readFileSync(join(repo, ".gitignore"), "utf8").includes("build.log\n"), "confident gitignore appends the path and blocks the spawn");
	check(ignored?.reason.includes("Do not retry"), "the block reason tells the parent the chore is done");
	const first = lastEntry();
	check(logLines().length === 1 && first?.outcome === "fast" && first?.reason === "done" && first?.label === "gitignore" && first?.path === "build.log" && typeof first?.ms === "number", "a done chore logs one fast line with its label and path");
	await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `build.log` for everyone.");
	check(readFileSync(join(repo, ".gitignore"), "utf8").split("build.log").length === 2, "a repeated gitignore does not duplicate the line");
	const excluded = await callTask(fakeJev("exclude", CONFIDENT), "Exclude `notes.md`, only on my machine.");
	check(excluded?.block && readFileSync(join(repo, ".git/info/exclude"), "utf8").includes("notes.md\n"), "confident exclude appends to .git/info/exclude");
	const untracked = await callTask(fakeJev("untrack", CONFIDENT), "Stop tracking `db.sqlite3`, keep the file.");
	check(untracked?.block && git("ls-files", "db.sqlite3") === "" && existsSync(join(repo, "db.sqlite3")), "confident untrack removes the path from the index and keeps it on disk");
	const realContext = "Repo: current working directory. Git hygiene only. Keep `notes.md` untracked and ignored on this machine only, so the change is not committed or pushed. Use the local exclude file (`.git/info/exclude`), not `.gitignore`. Do not commit, push, or rewrite history. If `notes.md` is already tracked, report that and stop without untracking it.";
	const realAssignment = "# Target\nPath `notes.md` only.\n\n# Change\nAdd `notes.md` to `.git/info/exclude` so it is ignored locally. Do not touch `.gitignore`. Do not commit or push.\n\n# Acceptance\n`git check-ignore -v notes.md` reports a match from `.git/info/exclude`.";
	const { pi: realPi, handlers: realHandlers } = fakePi();
	gitChoresFastPath(realPi as never, fakeJev("exclude", CONFIDENT));
	const realCall = (await realHandlers["tool_call"]({ toolName: "task", input: { context: realContext, tasks: [{ agent: "git-chores", task: realAssignment }] } }, { cwd: repo })) as { block?: boolean } | undefined;
	check(realCall?.block, "a real parent assignment with ignore-file names and do-not-commit guards takes the fast path");
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `../outside.log`.")) === undefined, "a path outside the repo spawns the agent");
	check(lastEntry()?.reason === "not-eligible:path-count", "a path outside the repo logs not-eligible:path-count");
	const READ_ONLY = 0o444;
	const WRITABLE = 0o644;
	chmodSync(join(repo, ".gitignore"), READ_ONLY);
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `locked.log` for everyone.")) === undefined, "a failed write spawns the agent instead of failing the hook");
	check(lastEntry()?.reason === "action-failed" && lastEntry()?.outcome === "agent" && !("path" in (lastEntry() ?? {})), "a failed write logs action-failed without the path and spawns the agent");
	chmodSync(join(repo, ".gitignore"), WRITABLE);

	const before = readFileSync(join(repo, ".gitignore"), "utf8");
	asked = 0;
	check((await callTask(fakeJev("gitignore", UNSURE), "Ignore `other.log`.")) === undefined, "an unsure Jev answer spawns the agent");
	check(lastEntry()?.reason === "jev-unsure" && lastEntry()?.confidence === UNSURE, "an unsure Jev answer logs jev-unsure with its confidence");
	check((await callTask(fakeJev("untrack", CONFIDENT), "Untrack `other.log`.")) === undefined, "untrack on an untracked path spawns the agent");
	check(lastEntry()?.reason === "label-contradicts-tracked", "an untrack label on an untracked path logs label-contradicts-tracked");
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `a.log` and `b.log`.")) === undefined, "two paths spawn the agent");
	check(lastEntry()?.reason === "not-eligible:path-count", "two paths log not-eligible:path-count");
	check(asked === 2, "Jev is asked only for one-path chores");
	asked = 0;
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `x.log`, then commit and push.")) === undefined, "a commit or push spawns the agent");
	check(lastEntry()?.reason === "not-eligible:agent-only-job", "a commit or push logs not-eligible:agent-only-job");
	check((await callTask(fakeJev("gitignore", CONFIDENT), "What is the status of `x.log`?")) === undefined, "a request without ignore or untrack intent spawns the agent");
	check(lastEntry()?.reason === "not-eligible:no-ignore-intent", "a request without ignore intent logs not-eligible:no-ignore-intent");
	const linesBeforeOtherAgent = logLines().length;
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `x.log`.", "task")) === undefined, "other agents are untouched");
	check(logLines().length === linesBeforeOtherAgent, "a non-git-chores task writes no log line");
	check(asked === 0 && readFileSync(join(repo, ".gitignore"), "utf8") === before, "ineligible calls never reach Jev or touch the repo");
	const failing: DecisionBackend = { ...fakeJev("gitignore", CONFIDENT), ask: async () => Promise.reject(new Error("TIMEOUT")) };
	check((await callTask(failing, "Ignore `y.log`.")) === undefined, "a Jev error spawns the agent");
	check(lastEntry()?.reason === "jev-error", "a Jev error logs jev-error");
	check(logLines().length === 13, "every git-chores call writes exactly one log line");
	process.env.GIT_CHORES_FAST_PATH_LOG = join(repo, ".gitignore", "unwritable.jsonl");
	check((await callTask(fakeJev("gitignore", CONFIDENT), "Ignore `late.log` for everyone."))?.block, "an unwritable log path never breaks the fast path");
	rmSync(logDir, { recursive: true, force: true });
	delete process.env.GIT_CHORES_FAST_PATH_LOG;
	rmSync(repo, { recursive: true, force: true });
}

// --- reviewer-diff-guard ----------------------------------------------------
{
	const { pi, handlers } = fakePi();
	reviewerDiffGuard(pi as never);
	const call = (input: unknown, toolName = "task") => handlers["tool_call"]({ toolName, input }, ctx) as { block: true; reason: string } | undefined;
	const review = (task: string, agent = "review-low", context?: string) => call({ context, tasks: [{ name: "Check", agent, task }] });

	check(review("Review the change to src/app.ts for correctness.")?.block, "a reviewer with no diff is blocked before it spawns");
	check(review("Review the change.", "review-high")?.reason.includes("Check"), "the block names the reviewer task");
	check(review("Review this diff: src/app.ts") === undefined, "a diff mentioned in the task lets the reviewer spawn");
	check(review("Review it.", "readonly-reviewer", "Diff at local://change.md") === undefined, "a diff in the shared context lets the reviewer spawn");
	check(review("@@ -1,2 +1,3 @@\n-a\n+b") === undefined, "an inline hunk lets the reviewer spawn");
	check(review("Review pr://12.") === undefined, "a PR reference lets the reviewer spawn");
	check(review("Read README.md only and report what blocks installation.") === undefined, "a README review lets the reviewer spawn");
	check(review("Read every module.", "review-high", "Full code review of the repository at ./app") === undefined, "a whole-repo review lets the reviewer spawn");
	check(review("Fix the bug in src/app.ts.", "task") === undefined, "other agents are untouched");
	check(call({ tasks: [{ agent: "task", task: "x" }, { name: "R", agent: "review-low", task: "Review it." }] })?.block, "a call with one diffless reviewer among other tasks is blocked");
	check(call({ command: "ls" }, "bash") === undefined, "other tools are untouched");
}

console.log("\nall wiring checks passed");
