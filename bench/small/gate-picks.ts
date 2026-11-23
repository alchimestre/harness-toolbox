// Prints the effort jev-effort-gate would pick for each case prompt read from stdin as
// JSON {kind: {agent, prompt}}. Quota is left unknown so only Jev signals decide.

import { askJev, chooseLevel } from "../../extensions/jev-effort-gate.ts";

const cases = (await Bun.stdin.json()) as Record<string, { agent: string; prompt: string }>;
const picks: Record<string, unknown> = {};
for (const [kind, { agent, prompt }] of Object.entries(cases)) {
	const started = performance.now();
	const jev = await askJev(agent, prompt);
	const decision = chooseLevel("medium", ["low", "high"], jev.signals, undefined);
	picks[kind] = { ...decision, signals: jev.signals, error: jev.error, ms: Math.round(performance.now() - started) };
}
console.log(JSON.stringify(picks, null, 2));
