// Wires each extension against a fake harness API. Run: bun test/wiring.ts

import { mock } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import readonlyLsp, { READONLY_AGENTS } from "../extensions/readonly-lsp.ts";
import searchGuard from "../extensions/search-guard.ts";
import workerSkillTrim from "../extensions/worker-skill-trim.ts";
import subagentScheduler from "../extensions/subagent-scheduler.ts";

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
	let configured: Record<string, string> = { advisor: "openai-codex/gpt-6.2-sol:high" };
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
		"openai-codex/gpt-6.2-sol": "gpt",
		"anthropic/claude-opus-5-5": "claude",
		"anthropic/claude-sonnet-5-5": "claude",
		"deepseek/deepseek-v4-pro": "deepseek",
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
	check(overrides.at(-1)?.advisor === "openai-codex/gpt-6.2-sol:high", "same-family advisor moved to openai");

	configured = { advisor: "openai-codex/gpt-6.2-sol:high" };
	handlers["session_start"]({}, harness("openai-codex/gpt-6.2-sol"));
	check(overrides.at(-1)?.advisor === "anthropic/claude-sonnet-5-5:high", "openai primary skips opus whose chain returns to openai");

	// Same-family advisor, so a main session would override: the kind guard is what suppresses the calls below.
	configured = { advisor: "anthropic/claude-opus-5-5:high" };
	const applied = overrides.length;
	handlers["session_start"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent session start leaves the advisor alone");
	handlers["retry_fallback_applied"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent fallback leaves the advisor alone");

	handlers["retry_fallback_applied"]({}, harness("anthropic/claude-opus-5-5"));
	check(overrides.at(-1)?.advisor === "openai-codex/gpt-6.2-sol:high", "main-session fallback applies the override");
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
	second.handlers["agent_end"]({}, sub);
}

console.log("\nall wiring checks passed");
