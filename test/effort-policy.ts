// Checks the effort policy's precedence and bounds. Run: bun test/effort-policy.ts

import { chooseLevel } from "../extensions/jev-effort-gate.ts";

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

const quiet = { exhaustive: 0.1, exact: 0.1, urgent: 0.1 };
const full: ["low", "high"] = ["low", "high"];

check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.2).level === "high", "exhaustive steps up");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9, urgent: 0.9 }, 0.2).level === "high", "accuracy beats urgency");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.9).level === "high", "accuracy beats quota pressure");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.97).level === "medium", "critical quota blocks step up");
check(chooseLevel("medium", full, { ...quiet, exact: 0.9 }, 0.2).level === "low", "exact target steps down");
check(chooseLevel("medium", full, { ...quiet, urgent: 0.9 }, 0.2).level === "low", "urgency steps down");
check(chooseLevel("medium", full, quiet, 0.85).level === "low", "quota pressure steps down");
check(chooseLevel("medium", full, quiet, 0.2).level === "medium", "no signal holds");
check(chooseLevel("medium", full, undefined, undefined).level === "medium", "Jev down holds");
check(chooseLevel("high", ["medium", "high"], { ...quiet, exhaustive: 0.9 }, 0.2).level === "high", "range caps step up");
check(chooseLevel("medium", ["medium", "high"], { ...quiet, exact: 0.9 }, 0.2).level === "medium", "range floors step down");

const handlers: Record<string, (event: unknown) => unknown> = {};
const fakePi = { on: (name: string, handler: (event: unknown) => unknown) => (handlers[name] = handler), exec: async () => ({ code: 1, stdout: "" }) };
delete process.env.TYPESAFE_API_KEY;
(await import("../extensions/jev-effort-gate.ts")).default(fakePi as never);
handlers.tool_call({ toolName: "task", input: { tasks: [{ name: "One", agent: "task", task: "Sweep every file." }] } });
const routed = (await handlers.before_subagent_spawn({ agent: "task", patterns: ["anthropic/claude-haiku-5-5:medium", "openai-codex/gpt-6.2-sol"], spawnKey: "One" })) as { model: string[]; note: string };
check(routed.model[0] === "anthropic/claude-haiku-5-5:medium" && routed.model[1] === "openai-codex/gpt-6.2-sol", "no key keeps effort and fallback tail");
check(routed.note.includes("TYPESAFE_API_KEY unset"), "no key is reported in the note");
check((await handlers.before_subagent_spawn({ agent: "review-high", patterns: ["anthropic/claude-sonnet-5-5:medium"], spawnKey: "Two" })) === undefined, "pinned agent untouched");
