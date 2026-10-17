// Wires both extensions against a fake harness API. Run: bun test/wiring.ts

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

console.log("\nall wiring checks passed");
