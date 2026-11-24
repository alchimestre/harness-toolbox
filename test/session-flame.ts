// Checks folded stacks and the timeline built from a session transcript. Run: bun test/session-flame.ts

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fold, loadSpans, spansOf, trace } from "../src/session-flame.ts";

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

const usage = {
	input: 4,
	output: 284,
	cacheRead: 100,
	cacheWrite: 0,
	cost: { input: 0.000008, output: 0.00284, cacheRead: 0.00001, cacheWrite: 0 },
};

function modelCall(timestamp: number, duration: number, toolCalls: object[], ttft?: number) {
	const content = toolCalls.map((call) => ({ type: "toolCall", ...call }));
	return { type: "message", message: { role: "assistant", model: "m", timestamp, duration, ttft, usage, content } };
}

function toolResult(toolCallId: string, timestamp: number, wallTimeMs?: number) {
	return { type: "message", message: { role: "toolResult", toolCallId, timestamp, details: { wallTimeMs } } };
}

const parallelTools = [
	{ id: "a", name: "bash", intent: "Run; tests" },
	{ id: "b", name: "grep" },
];
const entries = [
	{ type: "session", title: "Demo" },
	modelCall(1000, 500, parallelTools, 200),
	toolResult("a", 1600, 40),
	toolResult("b", 2500),
	modelCall(2600, 100, [{ id: "c", name: "bash", intent: "Run; tests" }]),
	toolResult("c", 2800),
];
const spans = spansOf(entries, ["Demo"]);

const byTime = fold(spans, "ms").trim().split("\n");
check(byTime.includes("Demo;model:m;first token 200"), "time to first token is its own frame");
check(byTime.includes("Demo;model:m;generation 300"), "generation is the rest of the model call");
check(byTime.includes("Demo;model:m 100"), "model call without a first-token time keeps its duration");
check(byTime.includes("Demo;tool:grep 1000"), "a tool call without a recorded run time runs from dispatch to its result");
check(byTime.includes("Demo;tool:bash;Run tests 140"), "a recorded run time wins, same stack sums, a semicolon cannot split a frame");

const byCost = fold(spans, "microusd").trim().split("\n");
check(byCost.includes("Demo;model:m;output 5680"), "sub-dollar cost folds to whole micro-dollars");
check(!byCost.some((line) => line.includes("cacheWrite")), "zero-weight stacks are left out");
check(fold(spans, "tokens").includes("Demo;model:m;cacheRead 200\n"), "tokens fold per usage kind");

type TraceEvent = { name: string; ts: number; dur: number; tid: number; args: { interval: string } };
const events = trace(spans).traceEvents as TraceEvent[];
const [firstBash, secondBash] = events.filter((event) => event.name === "tool:bash: Run; tests");
const grep = events.find((event) => event.name === "tool:grep")!;
check(grep.ts === 500_000 && grep.dur === 1_000_000, "timeline is in microseconds from the first event");
check(firstBash.ts === 560_000 && firstBash.dur === 40_000, "a measured call starts its run time before its result, not at dispatch");
check(firstBash.args.interval === "measured" && grep.args.interval === "dispatch to result", "each event says how its interval was obtained");
check(firstBash.tid !== grep.tid, "overlapping calls take separate lanes");
check(secondBash.tid === grep.tid, "a lane is reused once it is free");

const sessionsDir = mkdtempSync(join(tmpdir(), "session-flame-"));
const asLines = (records: object[]) => records.map((record) => JSON.stringify(record)).join("\n");
mkdirSync(join(sessionsDir, "main", "Worker"), { recursive: true });
writeFileSync(join(sessionsDir, "main.jsonl"), asLines(entries));
writeFileSync(join(sessionsDir, "main", "Worker.jsonl"), asLines([modelCall(3000, 50, [])]));
writeFileSync(join(sessionsDir, "main", "Worker", "Worker.Leaf.jsonl"), asLines([modelCall(3100, 70, [])]));
writeFileSync(join(sessionsDir, "main", "changes.jsonl"), asLines([{ type: "change", at: 1 }]));
const nested = fold(loadSpans(join(sessionsDir, "main.jsonl")), "ms");
writeFileSync(join(sessionsDir, "torn.jsonl"), `${asLines(entries.slice(0, 2))}\n{"type":"mess`);
let tornError = "";
try {
	loadSpans(join(sessionsDir, "torn.jsonl"));
} catch (error) {
	tornError = String(error);
}
rmSync(sessionsDir, { recursive: true });
check(nested.includes("Demo;agent:Worker;model:m 50\n"), "subagent stacks sit under the session title");
check(nested.includes("Demo;agent:Worker;agent:Leaf;model:m 70\n"), "nested subagents sit under their parent");
check(!nested.includes("changes"), "a file without messages adds no stack");
check(tornError.endsWith("torn.jsonl:3: not a JSON record"), "a torn line is reported with its file and line");

console.log("\nall session-flame checks passed");
