import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DecisionBackend } from "./backend.ts";
import { BackendError, decidedLabel, isFallback } from "./backend.ts";
import type { CandidateRecord, Contract } from "./records.ts";
import { DEFAULT_BUDGET_MS, LLM_CLASSES, percentile95 } from "./records.ts";
import { MAX_FALLBACK_RATE } from "./pilot.ts";

export type BenchCase = { id: string; split: "pilot" | "holdout"; input: string; reference: string; referenceSource: string; fallbackAnswer?: string };
type BenchContract = { id: string; class: CandidateRecord["class"]; question: Contract; fallback: string; budgetMs: number; latency?: "relative"; currentDecider: { command: string }; fallbackDecider?: { command: string }; action?: { command: string } };
export type RunResult = { case: string; decider: "model" | "current"; rep: number; label: string | null; fallback: boolean; ms: number; usd: number };
type ModelAnswer = Omit<RunResult, "case" | "decider" | "rep">;

export const PILOT_CASES = 30;
export const HOLDOUT_CASES = 70;
const BLIND_SOURCES = ["blind human", "blind agent"];
const MAX_ACCURACY_DROP = 0.02;
const MIN_ACCURACY_GAIN = 0.1;
const MIN_COST_RATIO = 10;
const RUN_TIMEOUT_MS = 10_000;
export const REPS = 5;
const DECIDERS: RunResult["decider"][] = ["model", "current"];

export function writeBench(record: CandidateRecord, cases: BenchCase[], benchDir: string): void {
	const passed = typeof record.pilot === "object" && record.pilot.passed === true;
	if (!passed) throw new Error(`${record.id} has not passed its pilot`);
	const count = (split: string) => cases.filter((item) => item.split === split).length;
	if (count("pilot") !== PILOT_CASES || count("holdout") !== HOLDOUT_CASES) throw new Error(`need ${PILOT_CASES} pilot and ${HOLDOUT_CASES} holdout cases, got ${count("pilot")} and ${count("holdout")}`);
	const unblind = cases.filter((item) => item.split === "holdout" && !BLIND_SOURCES.includes(item.referenceSource));
	if (unblind.length) throw new Error(`holdout references must come from ${BLIND_SOURCES.join(" or ")}; ${unblind.length} do not`);
	mkdirSync(benchDir, { recursive: true });
	const contract: BenchContract = { id: record.id, class: record.class, question: record.question, fallback: record.fallback.proposal, budgetMs: DEFAULT_BUDGET_MS, currentDecider: { command: "" } };
	writeFileSync(join(benchDir, "contract.json"), `${JSON.stringify(contract, null, 2)}\n`);
	writeFileSync(join(benchDir, "cases.jsonl"), cases.map((item) => JSON.stringify(item)).join("\n") + "\n");
	const cli = resolve(import.meta.dirname, "survey.ts");
	for (const [name, verb] of [["run", "bench-run"], ["score", "bench-score"]]) {
		writeFileSync(join(benchDir, name), `#!/bin/sh\nexec bun "${cli}" ${verb} "$(dirname "$0")" "$@"\n`);
		chmodSync(join(benchDir, name), 0o755);
	}
}

function loadBench(benchDir: string): { contract: BenchContract; cases: BenchCase[] } {
	const contract = JSON.parse(readFileSync(join(benchDir, "contract.json"), "utf8")) as BenchContract;
	const cases = readJsonl<BenchCase>(join(benchDir, "cases.jsonl"));
	return { contract, cases };
}

export function readJsonl<T>(path: string): T[] {
	return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

// Answers one case with one decider; the model falls back to fallbackDecider when set, else to the current decider.
export async function runCase(benchDir: string, decider: string, caseId: string, rep: number, backend: DecisionBackend): Promise<RunResult> {
	if (!Number.isInteger(rep) || rep < 1 || rep > REPS) throw new Error(`rep must be 1..${REPS}, got ${rep}`);
	const { contract, cases } = loadBench(benchDir);
	const item = cases.find((candidate) => candidate.id === caseId);
	if (!item) throw new Error(`no case ${caseId}`);
	if (decider === "current") return { case: caseId, decider: "current", rep, ...runCommand(contract.currentDecider.command, decisionInput(item)), fallback: false };
	if (decider !== "model") throw new Error(`decider must be model or current, got ${decider}`);
	const model = await askModel(contract, item, backend);
	if (!model.fallback) return { case: caseId, decider: "model", rep, ...withAction(contract, item, model) };
	const fallback = runCommand(contract.fallbackDecider?.command || contract.currentDecider.command, decisionInput(item));
	return { case: caseId, decider: "model", rep, label: fallback.label, fallback: true, ms: model.ms + fallback.ms, usd: model.usd + fallback.usd };
}

async function askModel(contract: BenchContract, item: BenchCase, backend: DecisionBackend): Promise<ModelAnswer> {
	const started = performance.now();
	try {
		const asked = await backend.ask({ input: item.input }, { decision: contract.question }, RUN_TIMEOUT_MS);
		const answer = asked.answers.decision;
		const usd = asked.inputTokens * backend.usdPerInputToken;
		return { label: decidedLabel(contract.question, answer) ?? null, fallback: isFallback(contract.question, answer), ms: asked.ms, usd };
	} catch (error) {
		if (!(error instanceof BackendError)) throw error;
		return { label: null, fallback: true, ms: performance.now() - started, usd: 0 };
	}
}

function decisionInput(item: BenchCase): { id: string; input: string } {
	return { id: item.id, input: item.input };
}

// Scores the state the action left, not Jev's label: an action that fails to apply it is an error.
function withAction(contract: BenchContract, item: BenchCase, model: ModelAnswer): ModelAnswer {
	if (!contract.action) return model;
	const acted = runCommand(contract.action.command, { ...decisionInput(item), label: model.label });
	return { label: acted.label, fallback: false, ms: model.ms + acted.ms, usd: model.usd + acted.usd };
}

function runCommand(command: string, stdin: object): { label: string | null; ms: number; usd: number } {
	if (!command) throw new Error("empty decider command in contract.json");
	const started = performance.now();
	// Only decision inputs: reference or fallbackAnswer on stdin would let the decider, and the model's fallback, read the answer.
	const run = spawnSync("sh", ["-c", command], { input: JSON.stringify(stdin), encoding: "utf8" });
	const ms = performance.now() - started;
	if (run.status !== 0) throw new Error(`decider command failed: ${run.stderr}`);
	const output = JSON.parse(run.stdout) as { label?: string; usd?: number };
	return { label: output.label ?? null, ms, usd: output.usd ?? 0 };
}

export type SplitScore = { accuracy: number; fallbackRate: number; p95Ms: number; usdPerDecision: number; runs: number };

export function scoreBench(contract: Pick<BenchContract, "class" | "budgetMs" | "latency">, cases: BenchCase[], results: RunResult[]) {
	requireFullMatrix(cases, results);
	const splitOf = new Map(cases.map((item) => [item.id, item]));
	const score = (decider: RunResult["decider"], split: BenchCase["split"]): SplitScore => {
		const runs = results.filter((r) => r.decider === decider && splitOf.get(r.case)?.split === split);
		const total = runs.length;
		const correct = runs.filter((r) => r.label !== null && r.label === splitOf.get(r.case)?.reference).length;
		const usd = runs.reduce((sum, r) => sum + r.usd, 0);
		return { accuracy: correct / total, fallbackRate: runs.filter((r) => r.fallback).length / total, p95Ms: percentile95(runs.map((r) => r.ms)) ?? 0, usdPerDecision: usd / total, runs: runs.length };
	};
	const table = { model: { pilot: score("model", "pilot"), holdout: score("model", "holdout") }, current: { pilot: score("current", "pilot"), holdout: score("current", "holdout") } };
	const holdoutReferenceSources = [...new Set(cases.filter((item) => item.split === "holdout").map((item) => item.referenceSource))];
	const latency = latencyLimit(contract, table.current.holdout);
	return { table, holdoutReferenceSources, latencyBar: latency.label, checks: passChecks(contract, table.model.holdout, table.current.holdout, latency.limitMs) };
}

// Every case × decider × rep exactly once: a missing, duplicate or unknown cell makes the score meaningless.
export function requireFullMatrix(cases: BenchCase[], results: RunResult[]): void {
	const expected = new Set(cases.flatMap((item) => DECIDERS.flatMap((decider) => Array.from({ length: REPS }, (_, i) => `${item.id}|${decider}|${i + 1}`))));
	const seen = new Set<string>();
	for (const result of results) {
		const cell = `${result.case}|${result.decider}|${result.rep}`;
		if (!expected.has(cell)) throw new Error(`unexpected result cell ${cell}`);
		if (seen.has(cell)) throw new Error(`duplicate result cell ${cell}`);
		seen.add(cell);
	}
	const missing = expected.size - seen.size;
	if (missing) throw new Error(`incomplete matrix: ${missing} of ${expected.size} cells missing`);
}

function latencyLimit(contract: Pick<BenchContract, "budgetMs" | "latency">, current: SplitScore): { limitMs: number; label: string } {
	if (contract.latency === undefined) return { limitMs: contract.budgetMs, label: `model p95 ≤ ${contract.budgetMs} ms` };
	if (contract.latency !== "relative") throw new Error(`latency must be "relative" or absent, got ${String(contract.latency)}`);
	return { limitMs: current.p95Ms, label: `model p95 ≤ current decider p95 (${Math.round(current.p95Ms)} ms, same run)` };
}

function passChecks(contract: Pick<BenchContract, "class">, model: SplitScore, current: SplitScore, latencyLimitMs: number): Record<string, boolean> {
	const llmDecider = LLM_CLASSES.includes(contract.class);
	const checks: Record<string, boolean> = {
		accuracy: llmDecider ? model.accuracy >= current.accuracy - MAX_ACCURACY_DROP : model.accuracy >= current.accuracy + MIN_ACCURACY_GAIN,
		latency: model.p95Ms <= latencyLimitMs,
		fallbackRate: model.fallbackRate <= MAX_FALLBACK_RATE,
	};
	if (llmDecider) checks.cost = model.usdPerDecision * MIN_COST_RATIO <= current.usdPerDecision;
	checks.passed = Object.values(checks).every(Boolean);
	return checks;
}

export function scoreBenchDir(benchDir: string, resultsPath: string) {
	const { contract, cases } = loadBench(benchDir);
	return scoreBench(contract, cases, readJsonl<RunResult>(resultsPath));
}
