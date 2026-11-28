// Checks crossroads-survey logic without network calls. Run: bun test/crossroads.ts

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DecisionBackend, Question } from "../src/crossroads/backend.ts";
import { effectiveConfidence, isFallback } from "../src/crossroads/backend.ts";
import type { BenchCase, RunResult } from "../src/crossroads/bench.ts";
import { HOLDOUT_CASES, PILOT_CASES, runCase, scoreBench, writeBench } from "../src/crossroads/bench.ts";
import { attachPicks, codeUnits, markdownBlocks, promptUnits, routingUnits } from "../src/crossroads/extract.ts";
import type { Classified } from "../src/crossroads/records.ts";
import { applyHumanEdits, buildRecords, carryForward, gateStatus, rank, recordId } from "../src/crossroads/records.ts";
import { runPilot } from "../src/crossroads/pilot.ts";

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

// --- effective confidence and fallback --------------------------------------
{
	const yesNo: Question = { kind: "yes_no", instructions: "" };
	const choice: Question = { kind: "choice", instructions: "", labels: { a: "", b: "" } };
	check(effectiveConfidence("yes_no", { pYes: 0.1 }) === 0.9, "yes/no confidence is max(p, 1-p)");
	check(!isFallback(yesNo, { pYes: 0.1 }), "confident 'no' is not a fallback");
	check(isFallback(yesNo, { pYes: 0.55 }), "uncertain yes/no falls back");
	check(isFallback(yesNo, {}), "missing yes/no value falls back");
	check(isFallback(choice, { label: "c", confidence: 0.95 }), "label outside contract falls back");
	check(isFallback(choice, { label: "a", confidence: 1.5 }), "confidence outside [0,1] falls back");
	check(!isFallback(choice, { label: "a", probabilities: { a: 0.8, b: 0.2 } }), "choice without confidence uses top probability");
}

// --- record id ---------------------------------------------------------------
check(recordId("prompt text", "Pick  A or B") === recordId("prompt text", "pick a or b"), "id ignores case and whitespace");
check(recordId("prompt text", "pick a or b") !== recordId("harness code", "pick a or b"), "id includes source");

// --- markdown units ----------------------------------------------------------
{
	const markdown = ["---", "description: x", "---", "# View", "- Flame graph: when asked for cost", "- Timeline, only when the request asks what happened when", "", "Decide whether to cache the result or recompute it."].join("\n");
	const blocks = markdownBlocks(markdown);
	check(blocks.length === 2 && blocks[0].list, "conditional sibling bullets form one list unit");
	check(blocks[0].text.includes("Timeline"), "list unit keeps every alternative");
	check(blocks[1].heading === "View", "block carries nearest heading");
	const axes = markdownBlocks(["# Rules", "## Axes", "Report each axis.", "", "**Spec**: missing requirements.", "", "**Tests**: risky path covered?"].join("\n"));
	check(axes.length === 2 && axes[1].text.includes("Spec") && axes[1].text.includes("Tests"), "sibling bold-lead paragraphs form one unit");
	check(axes[1].heading === "Rules > Axes", "heading is the heading path");
	const fenced = markdownBlocks(["# Axes", "**Spec**: missing requirements.", "", "```", "example", "```", "", "**Tests**: risky path covered?", "", "**Note** read twice.", ""].join("\n"));
	check(fenced.length === 3 && fenced.every((block) => !block.list), "a fence or a colon-less bold lead breaks the bold-lead run");
}

// --- repo extraction, merge, carry-forward -----------------------------------
const root = mkdtempSync(join(tmpdir(), "crossroads-"));
for (const [name, text] of [["a", "Review code."], ["b", "Run benchmarks."]]) {
	mkdirSync(join(root, "agents"), { recursive: true });
	writeFileSync(join(root, "agents", `${name}.md`), `---\ndescription: ${text}\n---\n\nDecide whether the change needs a spec review or not.\n`);
}
mkdirSync(join(root, "extensions"));
writeFileSync(join(root, "extensions", "gate.ts"), "export function gate(event: { prompt: string }) {\n\tif (/urgent/i.test(event.prompt)) return 'fast';\n\tif (count > 3) return 'slow';\n}\n");
writeFileSync(join(root, "classify.py"), "def route(client, message):\n    out = client.chat(messages=[{'role': 'user', 'content': 'Answer yes or no: ' + message.body}])\n    return out == 'yes'\n");
mkdirSync(join(root, "test"));
writeFileSync(join(root, "test", "fixture.ts"), "export function fixture(event: { prompt: string }) {\n\tif (/urgent/i.test(event.prompt)) return 'fast';\n}\n");

const units = attachPicks([...promptUnits(root), ...codeUnits(root)], [{ kind: "agent", choice: "a" }, { kind: "agent", choice: "b" }]);
const routing = units.find((unit) => unit.heading === "agent routing");
check(routing?.options?.a === "Review code.", "routing catalog unit lists agent descriptions");
check(routing?.occurrences?.count === 2, "transcript picks attach to the routing catalog");
check(units.filter((unit) => unit.class === "harness branch").length === 1, "only the text-reading harness branch is extracted");
check(units.some((unit) => unit.class === "llm closed choice" && unit.location.startsWith("classify.py")), "closed-answer LLM call is extracted");
{
	const installed = mkdtempSync(join(tmpdir(), "crossroads-installed-"));
	writeFileSync(join(installed, "scout.md"), "---\ndescription: Explore code.\n---\n");
	writeFileSync(join(installed, "a.md"), "---\ndescription: Installed copy.\n---\n");
	const catalog = routingUnits(root, [installed]).find((unit) => unit.heading === "agent routing");
	check(catalog?.options?.scout === "Explore code.", "installed agents join the routing catalog");
	check(catalog?.options?.a === "Review code.", "the target's own agent overrides an installed one");
	check(catalog?.excerpt === routing?.excerpt, "catalog record id is unchanged by installed agents");
}
{
	writeFileSync(join(root, "agents", "folded.md"), "---\ndescription: >\n  Folded across\n  two lines.\nmodel: x\n---\n");
	mkdirSync(join(root, "skills", "own"), { recursive: true });
	writeFileSync(join(root, "skills", "own", "SKILL.md"), "---\ndescription: Own skill.\n---\n");
	const [agents, skills] = routingUnits(root, [], { hosted: "Installed skill.", own: "Installed copy." });
	check(agents.options?.folded === "Folded across two lines.", "a YAML block-scalar description is read whole");
	check(skills.options?.hosted === "Installed skill.", "installed skills join the routing catalog");
	check(skills.options?.own === "Own skill.", "the target's own skill overrides an installed one");
	rmSync(join(root, "skills"), { recursive: true });
	rmSync(join(root, "agents", "folded.md"));
}

const backend: DecisionBackend = { name: "fake", limits: { maxStateTokens: 32_000, maxOptions: 255, maxLevels: 10 }, usdPerInputToken: 0, ask: async () => ({ answers: {}, ms: 0, inputTokens: 0 }) };
const allPass = { crossroads: { pYes: 0.9 }, closed_set: { pYes: 0.9 }, independent: { pYes: 0.9 }, rule_decidable: { pYes: 0.1 }, irreplaceable: { pYes: 0.1 }, kind: { label: "yes_no" } };
const classified: Classified[] = units.map((unit) => ({ unit, answers: allPass, ms: 150 }));
const records = buildRecords(classified, backend);
{
	const nearCuts = { ...allPass, closed_set: { pYes: 0.72 }, independent: { pYes: 0.28 } };
	const [nearRecord] = buildRecords([{ unit: units[0], answers: nearCuts, ms: 150 }], backend);
	check(nearRecord.gates["closed set"].status === "unknown" && nearRecord.gates.independent.status === "unknown", "p within the dead band of a gate cut stays unknown");
}
{
	const borderline = (pYes: number): Classified[] => [{ unit: units[0], answers: { ...allPass, crossroads: { pYes } }, ms: 150 }];
	const knownId = recordId(units[0].source, units[0].excerpt);
	check(buildRecords(borderline(0.32), backend).length === 0, "a new record inside the review-floor band is not added");
	check(buildRecords(borderline(0.27), backend, new Set([knownId])).length === 1, "a previous record inside the review-floor band is kept");
	check(buildRecords(borderline(0.24), backend, new Set([knownId])).length === 0, "a previous record below the band is dropped");
	for (const crossroads of [true, false]) {
		const [labelled] = buildRecords(borderline(0.5), backend);
		labelled.crossroads = crossroads;
		const resurveyed = buildRecords(borderline(0.1), backend, new Set([knownId]), new Set([knownId]));
		carryForward(resurveyed, [labelled]);
		resurveyed.forEach(applyHumanEdits);
		const kept = resurveyed.find((record) => record.id === knownId);
		check(kept?.crossroads === crossroads && (crossroads ? kept.band === "candidate" : gateStatus(kept) === "fail"), `a human crossroads: ${crossroads} survives a resurvey below the review floor`);
	}
}
const review = records.find((record) => record.excerpt.startsWith("Decide whether"));
check(review?.locations.length === 2, "identical excerpts in two files merge into one record");
check(gateStatus(review!) === "unknown" && review!.gates.fallback.status === "unknown", "unaccepted fallback keeps gates unknown, not failed");
check(rank(records)[0].class === "llm closed choice", "llm closed choice ranks first");

const next = buildRecords(classified, backend);
review!.fallback.accepted = true;
carryForward(next, records);
next.forEach(applyHumanEdits);
const carried = next.find((record) => record.id === review!.id);
check(carried?.fallback.accepted && gateStatus(carried) === "pass", "accepted fallback carries forward by id and passes the gate");
{
	const [promoted, refused] = next;
	promoted.band = "review";
	promoted.crossroads = true;
	refused.crossroads = false;
	const later = buildRecords(classified, backend);
	later.forEach((record) => (record.band = "review"));
	carryForward(later, [promoted, refused]);
	later.forEach(applyHumanEdits);
	const [up, down] = [promoted, refused].map((record) => later.find((each) => each.id === record.id)!);
	check(up.band === "candidate", "a human crossroads: true promotes a record to the candidate band and carries forward");
	check(down.gates.crossroads?.status === "fail" && gateStatus(down) === "fail", "a human crossroads: false rejects the record");
}
{
	const catalogRecord = (labels: Record<string, string>) => ({ ...records.find((record) => record.heading === "agent routing")!, question: { kind: "choice" as const, instructions: "pick", labels, input: "text", reference: "logs" } });
	const fresh = [catalogRecord({ a: "", scout: "" })];
	carryForward(fresh, [{ ...catalogRecord({ a: "" }), fallback: { proposal: "x", accepted: true } }]);
	check(fresh[0].question.labels?.scout !== undefined && fresh[0].fallback.accepted, "fresh catalog labels survive carry-forward; human fields still carry");
	const pilotBackend: DecisionBackend = { ...backend, ask: async () => ({ answers: { decision: { label: "a", confidence: 0.9 } }, ms: 1, inputTokens: 1 }) };
	const outcome = await runPilot(fresh[0], [{ input: "x", logged: "a" }, { input: "y", logged: "uninstalled" }, { input: " ", logged: "a" }], pilotBackend);
	check(typeof outcome.result === "object" && outcome.result.outsideLabels === 1, "pilot drops samples whose logged pick is outside the labels");
	check(typeof outcome.result === "object" && outcome.result.emptyInputs === 1 && outcome.result.samples === 1, "pilot drops samples with an empty input");
	const mostlySure: DecisionBackend = { ...backend, ask: async (state) => ({ answers: { decision: { label: "a", confidence: state.input === "unsure" ? 0.1 : 0.9 } }, ms: 1, inputTokens: 1 }) };
	const sureSamples = ["p", "q", "r", "s"].map((input) => ({ input, human: "a" }));
	const unscored = await runPilot(fresh[0], [...sureSamples, { input: "unsure", human: "a" }], mostlySure);
	const scored = await runPilot(fresh[0], [...sureSamples, { input: "unsure", human: "a", fallbackAnswer: "a" }], mostlySure);
	const [blind, known] = [unscored, scored].map((outcome) => (typeof outcome.result === "object" ? outcome.result : {}));
	check(blind.agreement === null && blind.unscoredFallbacks === 1 && blind.maxAgreement === 1 && blind.passed === false, "a fallback with no logged or fallback answer leaves agreement unmeasured and blocks a pass");
	check(known.agreement === 1 && known.passed === true, "the same pilot passes once the fallback answer is known");
}

// --- benchmark pass bars ------------------------------------------------------
function fullMatrix(cases: BenchCase[], make: (decider: RunResult["decider"], i: number, rep: number) => RunResult): RunResult[] {
	return cases.flatMap((_, i) => [1, 2, 3, 4, 5].flatMap((rep) => [make("model", i, rep), make("current", i, rep)]));
}
{
	const cases: BenchCase[] = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, split: i < 3 ? "pilot" : "holdout", input: "", reference: "a", referenceSource: "blind human" }));
	const results = fullMatrix(cases, (decider, i, rep) => ({ case: `c${i}`, decider, rep, label: decider === "model" && i === 3 ? "b" : "a", fallback: false, ms: 100, usd: decider === "model" ? 0.00001 : 0.001 }));
	const llm = scoreBench({ class: "llm closed choice", budgetMs: 2_000 }, cases, results);
	check(llm.table.model.pilot.accuracy === 1, "pilot split scored separately");
	check(!llm.checks.accuracy && !llm.checks.passed, "holdout accuracy drop over 2 points fails");
	const rule = scoreBench({ class: "rule pretending to judge", budgetMs: 2_000 }, cases, results);
	check(!("cost" in rule.checks), "code deciders skip the cost bar");
	const throws = (results: RunResult[]) => {
		try {
			scoreBench({ class: "llm closed choice", budgetMs: 2_000 }, cases, results);
			return false;
		} catch {
			return true;
		}
	};
	check(throws([]), "empty results are rejected, not scored as a pass");
	check(throws(results.slice(1)), "a missing rep is rejected");
	check(throws([...results, results[0]]), "a duplicate cell is rejected");
}

// --- generated bench directory, end to end ------------------------------------
{
	const benchDir = join(root, "bench", "x");
	const cases: BenchCase[] = Array.from({ length: PILOT_CASES + HOLDOUT_CASES }, (_, i) => ({ id: `k${i}`, split: i < PILOT_CASES ? "pilot" : "holdout", input: `case ${i}`, reference: "a", referenceSource: "blind human" }));
	const record = { ...buildRecords(classified, backend)[0], class: "llm closed choice" as const, pilot: { passed: true }, question: { kind: "choice" as const, instructions: "pick", labels: { a: "", b: "" }, input: "text", reference: "human" } };
	writeBench(record, cases, benchDir);
	const contractPath = join(benchDir, "contract.json");
	const contract = JSON.parse(readFileSync(contractPath, "utf8"));
	contract.currentDecider.command = `echo '{"label":"a","usd":0.001}'`;
	writeFileSync(contractPath, JSON.stringify(contract));
	const viaScript = spawnSync(join(benchDir, "run"), ["current", "k0", "1"], { encoding: "utf8" });
	check(JSON.parse(viaScript.stdout).label === "a" && JSON.parse(viaScript.stdout).rep === 1, "generated run script answers one cell");
	const fake: DecisionBackend = { ...backend, usdPerInputToken: 1e-8, ask: async () => ({ answers: { decision: { label: "a", confidence: 0.9 } }, ms: 150, inputTokens: 100 }) };
	const results: RunResult[] = [];
	for (const item of cases) for (let rep = 1; rep <= 5; rep++) for (const decider of ["model", "current"]) results.push(await runCase(benchDir, decider, item.id, rep, fake));
	const resultsPath = join(root, "results.jsonl");
	const score = (lines: RunResult[]) => {
		writeFileSync(resultsPath, lines.map((line) => JSON.stringify(line)).join("\n"));
		return spawnSync(join(benchDir, "score"), [resultsPath], { encoding: "utf8" });
	};
	check(score([]).status !== 0, "generated score script rejects an empty results file");
	check(score(results.slice(0, results.length / 2)).status !== 0, "generated score script rejects a partial matrix");
	const full = score(results);
	check(full.status === 0 && JSON.parse(full.stdout).checks.passed === true, "generated score script passes a complete matrix");
	const stdinLog = join(root, "current-stdin.jsonl");
	const leakCases = cases.map((item) => ({ ...item, referenceSource: item.split === "holdout" ? "blind agent" : item.referenceSource, fallbackAnswer: "b" }));
	writeBench(record, leakCases, benchDir);
	const leakContract = JSON.parse(readFileSync(contractPath, "utf8"));
	leakContract.currentDecider.command = `cat >> '${stdinLog}'; echo >> '${stdinLog}'; echo '{"label":"a","usd":0}'`;
	writeFileSync(contractPath, JSON.stringify(leakContract));
	const unsure: DecisionBackend = { ...backend, ask: async () => ({ answers: { decision: { label: "a", confidence: 0.1 } }, ms: 1, inputTokens: 1 }) };
	const fellBack = await runCase(benchDir, "model", "k40", 1, unsure);
	await runCase(benchDir, "current", "k40", 1, unsure);
	const seenInputs = readFileSync(stdinLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
	check(fellBack.fallback && seenInputs.length === 2 && seenInputs.every((seen) => Object.keys(seen).sort().join() === "id,input"), "the current decider and the model's fallback see only id and input, never reference or fallbackAnswer");
	check(JSON.parse(score(results).stdout).holdoutReferenceSources.join() === "blind agent", "a blind-agent holdout is accepted and named in the score output");
	leakContract.fallbackDecider = { command: `echo '{"label":"b","usd":0}'` };
	writeFileSync(contractPath, JSON.stringify(leakContract));
	check((await runCase(benchDir, "model", "k40", 1, unsure)).label === "b", "a set fallbackDecider answers the model's fallback instead of the current decider");
}
