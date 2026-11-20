// Wires each extension against a fake harness API. Run: bun test/wiring.ts

import { mock } from "bun:test";

import searchGuard from "../extensions/search-guard.ts";
import watchdog from "../extensions/long-horizon-watchdog.ts";

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

// --- long-horizon-watchdog -------------------------------------------------
{
	const { pi, handlers, messages } = fakePi();
	watchdog(pi as never);

	check("session_start" in handlers, "watchdog registers session_start");

	const timers: Array<{ fn: () => void; ms: number }> = [];
	const timerCtx = {
		agent: { kind: "main" },
		setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
		getAsyncJobSnapshot: () => ({
			running: [
				{ id: "bg_1", type: "bash", status: "running", startTime: Date.now() - 700_000, label: "long job" },
				{ id: "bg_2", type: "bash", status: "running", startTime: Date.now() - 1_000, label: "young job" },
			],
		}),
	};

	handlers["session_start"]({}, timerCtx);
	check(timers.length === 1 && timers[0].ms === 300_000, "first tick armed at 5m");

	timers[0].fn();
	check(messages.length === 1, "one tick message sent");
	const tick = messages[0] as { customType: string; content: string };
	check(tick.customType === "omp.watchdog.tick", "tick customType");
	check(tick.content.includes("bg_1") && !tick.content.includes("bg_2"), "only jobs past the age floor listed");
	check(timers.length === 2 && timers[1].ms === 600_000, "delay doubles while jobs remain");

	const sub = fakePi();
	watchdog(sub.pi as never);
	sub.handlers["session_start"]({}, { ...timerCtx, agent: { kind: "sub" }, setTimeout: () => {
		throw new Error("subagent must not arm a timer");
	} });
	console.log("ok subagent session arms no timer");
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

	const applied = overrides.length;
	handlers["session_start"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent session start leaves the advisor alone");
	handlers["retry_fallback_applied"]({}, harness("anthropic/claude-opus-5-5", "sub"));
	check(overrides.length === applied, "subagent fallback leaves the advisor alone");
}

console.log("\nall wiring checks passed");
