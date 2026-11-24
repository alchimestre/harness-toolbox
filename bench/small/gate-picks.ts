// Prints the effort jev-effort-gate would pick for each case prompt read from stdin as
// JSON {kind: {agent, prompt}}. Quota is left unknown so only Jev signals decide.
// An optional argument names a JSON file of Jev questions that replaces the gate's own.

import { askJev, chooseLevel } from "../../extensions/jev-effort-gate.ts";

const cases = (await Bun.stdin.json()) as Record<string, { agent: string; prompt: string }>;
const questions = Bun.argv[2] ? await Bun.file(Bun.argv[2]).json() : undefined;
// The gate steps from the task role's configured level, so bench from the same one.
const config = JSON.parse(await Bun.$`omp config list --json`.text());
const CONFIGURED = config.modelRoles.value.task.split(":").at(-1);
const pick = async ([kind, { agent, prompt }]: [string, { agent: string; prompt: string }]) => {
	const started = performance.now();
	const jev = await askJev(agent, prompt, questions);
	const decision = chooseLevel(CONFIGURED, ["low", "high"], jev.signals, undefined);
	return [kind, { ...decision, signals: jev.signals, error: jev.error, ms: Math.round(performance.now() - started) }];
};
const picks = Object.fromEntries(await Promise.all(Object.entries(cases).map(pick)));
console.log(JSON.stringify(picks, null, 2));
