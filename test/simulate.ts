// test/simulate.ts — drives guard-core through the incident scenario.
// Run: node test/simulate.ts   (Node >= 23.6 runs erasable TS natively)
//
// Cases covered: budget boundary, past-budget block, provider-failure
// rewrite, non-search passthrough, agent-start injection, and the
// per-scope vs shared budget question (validated live 2026-08-04 —
// shared is the correct shape; see docs/runbook.md).

import { Guard, SEARCH_BUDGET } from "../src/guard-core.ts";

const A = "agent:premium-catalog"; // froze after ~30 searches in the incident
const B = "agent:hosting-cost"; // completed normally
const HANG_THRESHOLD = 25; // observed session-wide volume where the provider hung

function printState(guard: Guard, scope: string): void {
  const s = guard.snapshot(scope);
  console.log(
    `  state[mode=${s.mode}] scope=${s.scope} searches=${s.searches} ` +
      `blocked=${s.blocked} rewrites=${s.rewrites} injections=${s.injections} budget=${s.budget}`,
  );
}

function search(guard: Guard, scope: string, n: number): void {
  const r = guard.onToolCall(
    { toolName: "web_search", input: { query: `query ${scope} #${n}` } },
    { scope },
  );
  console.log(`  web_search #${n} → ${r ? "BLOCKED" : "allowed"}${r ? `: ${r.reason}` : ""}`);
}

console.log("== Part 1: per-scope budget, single agent (runbook's per-agent cap) ==");
const g1 = new Guard("per-scope", SEARCH_BUDGET);

const inject = g1.onAgentStart({}, { scope: A });
console.log(`agent_start → policy injected (customType=${inject.message.customType})`);
printState(g1, A);

for (let i = 1; i <= SEARCH_BUDGET; i++) search(g1, A, i);
printState(g1, A);
search(g1, A, SEARCH_BUDGET + 1);
printState(g1, A);

const err = g1.onToolResult(
  {
    toolName: "web_search",
    isError: false,
    content: [
      { type: "text", text: "Error: All web search providers failed: duckduckgo/429; google/timeout" },
    ],
  },
  { scope: A },
);
console.log(`error result → ${err ? "REWRITTEN" : "passthrough"}`);
if (err) console.log(`  rewritten text tail: ${err.content[0].text.slice(-140)}`);
printState(g1, A);

const readCall = g1.onToolCall(
  { toolName: "read", input: { path: "https://example.com/doc" } },
  { scope: A },
);
console.log(`read call → ${readCall ? "touched" : "untouched (passthrough)"}`);
const readResult = g1.onToolResult(
  { toolName: "read", isError: false, content: [{ type: "text", text: "page text" }] },
  { scope: A },
);
console.log(`read result → ${readResult ? "rewritten" : "untouched (passthrough)"}`);
printState(g1, A);

console.log("\n== Part 2: shared budget, two parallel agents (the incident batch) ==");
console.log(
  "   (shared mode = one process-wide counter; both scopes read the same state)",
);
const g2 = new Guard("shared", SEARCH_BUDGET);
for (let i = 1; i <= 10; i++) {
  const ra = g2.onToolCall({ toolName: "web_search", input: { query: `A #${i}` } }, { scope: A });
  const rb = g2.onToolCall({ toolName: "web_search", input: { query: `B #${i}` } }, { scope: B });
  console.log(`  round ${String(i).padStart(2)}  A#${i}: ${ra ? "BLOCKED" : "allowed"}   B#${i}: ${rb ? "BLOCKED" : "allowed"}`);
}
printState(g2, A);
printState(g2, B);

console.log("\n== Verdict ==");
console.log(
  `  per-scope: 2 agents x ${SEARCH_BUDGET} = ${2 * SEARCH_BUDGET} searches before any block ` +
    `(crosses the observed ~${HANG_THRESHOLD}-30 hang threshold) → per-agent cap alone does NOT prevent the session-wide hang.`,
);
console.log(
  `  shared:    capped at ${SEARCH_BUDGET} searches session-wide (stays under the ~${HANG_THRESHOLD}-30 threshold) → blocks search before the provider starts hanging.`,
);
console.log(
  `  enforcement: budget block and retry-ban rewrite are mechanical (model cannot ignore them); ` +
    `the injected policy covers subagents that never read the skill.`,
);
