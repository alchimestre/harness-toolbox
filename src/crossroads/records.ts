import { createHash } from "node:crypto";
import type { Answer, DecisionBackend, Question } from "./backend.ts";
import { estimateTokens } from "./backend.ts";
import type { CrossroadsClass, Occurrences, Source, Unit } from "./extract.ts";

export type GateStatus = "pass" | "fail" | "unknown";
export type Gate = { status: GateStatus; reason: string };
export type Band = "candidate" | "review";

export type Contract = Question & { input: string; reference: string };

export type CandidateRecord = {
	id: string;
	source: Source;
	locations: string[];
	class: CrossroadsClass;
	heading: string;
	excerpt: string;
	question: Contract;
	gates: Record<string, Gate>;
	verdict: number | null;
	band: Band;
	occurrences: Occurrences | null;
	fallback: { proposal: string; accepted: boolean };
	overrides: Record<string, GateStatus>;
	pilot: string | Record<string, unknown>;
	benchmark: string | Record<string, unknown>;
};

export const CANDIDATE_FLOOR = 0.7;
export const REVIEW_FLOOR = 0.3;
const GATE_PASS = 0.7;
const GATE_FAIL = 0.3;
// Classifier p drifts ~0.05 between runs; inside the band a gate stays unknown and a record keeps its previous inclusion.
const DEAD_BAND = 0.05;
export const DEFAULT_BUDGET_MS = 2_000;
const P95 = 0.95;
const MIN_LABELS = 2;
const CLASSIFY_TIMEOUT_MS = 30_000;
export const CLASS_ORDER: CrossroadsClass[] = ["llm closed choice", "prompt instruction", "harness branch", "rule pretending to judge"];
export const LLM_CLASSES: CrossroadsClass[] = ["llm closed choice", "prompt instruction"];

export const CLASSIFIER: Record<string, Question> = {
	crossroads: { kind: "yes_no", instructions: "Does this text make an agent or program pick one option from a closed set of options by judging the meaning of some text (a task, request, message or file), rather than by a fixed rule?" },
	closed_set: { kind: "yes_no", instructions: "Are all the options of this pick named or clearly implied?" },
	independent: { kind: "yes_no", instructions: "Can each case of this pick be judged from the one case in front of it, without comparing it to other cases or earlier picks?" },
	rule_decidable: { kind: "yes_no", instructions: "Could a regex, file check or short script make this pick reliably, with no judgment of meaning?" },
	irreplaceable: { kind: "yes_no", instructions: "Is this a security or permission check, a path that must work offline or without an API key, a hot loop, or a decision that must be reproducible for an audit?" },
	kind: { kind: "choice", instructions: "What answer shape would this pick need?", labels: { yes_no: "a single yes or no", label: "one label from several named options", score: "a graded level on a scale", none: "not a pick" } },
};

export function normalise(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function recordId(source: Source, excerpt: string): string {
	return createHash("sha256").update(`${source}\n${normalise(excerpt)}`).digest("hex").slice(0, 12);
}

export type Classified = { unit: Unit; answers: Record<string, Answer> | null; ms: number | null; error?: string };

export function classify(backend: DecisionBackend, units: Unit[], concurrency: number): Promise<Classified[]> {
	const timeoutMs = CLASSIFY_TIMEOUT_MS;
	let next = 0;
	const results: Classified[] = new Array(units.length);
	const worker = async () => {
		while (next < units.length) {
			const index = next++;
			const unit = units[index];
			const state = { file: unit.location, section: unit.heading, text: unit.context };
			try {
				const asked = await backend.ask(state, CLASSIFIER, timeoutMs);
				results[index] = { unit, answers: asked.answers, ms: asked.ms };
			} catch (error) {
				results[index] = { unit, answers: null, ms: null, error: String(error) };
			}
		}
	};
	return Promise.all(Array.from({ length: concurrency }, worker)).then(() => results);
}

export function percentile95(values: number[]): number | undefined {
	if (!values.length) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(P95 * sorted.length) - 1)];
}

// Merges identical normalised excerpts into one record and drops units below the review floor.
// A record from the previous run stays until p drops below the floor minus DEAD_BAND; a new one enters at the floor plus DEAD_BAND.
export function buildRecords(classified: Classified[], backend: DecisionBackend, previousIds: Set<string> = new Set()): CandidateRecord[] {
	const p95 = percentile95(classified.flatMap((c) => (c.ms === null ? [] : [c.ms])));
	const records = new Map<string, CandidateRecord>();
	for (const item of classified) {
		const verdict = item.answers?.crossroads?.pYes ?? null;
		const id = recordId(item.unit.source, item.unit.excerpt);
		const floor = previousIds.has(id) ? REVIEW_FLOOR - DEAD_BAND : REVIEW_FLOOR + DEAD_BAND;
		if (verdict !== null && verdict < floor) continue;
		const existing = records.get(id);
		if (existing) {
			existing.locations.push(item.unit.location);
			continue;
		}
		records.set(id, newRecord(id, item, verdict, backend, p95));
	}
	return [...records.values()];
}

function newRecord(id: string, item: Classified, verdict: number | null, backend: DecisionBackend, p95: number | undefined): CandidateRecord {
	const { unit, answers } = item;
	const record: CandidateRecord = {
		id,
		source: unit.source,
		locations: [unit.location],
		class: unit.class,
		heading: unit.heading,
		excerpt: unit.excerpt,
		question: proposeQuestion(unit, answers),
		gates: {},
		verdict,
		band: verdict !== null && verdict >= CANDIDATE_FLOOR ? "candidate" : "review",
		occurrences: unit.occurrences ?? null,
		fallback: { proposal: proposeFallback(unit.class), accepted: false },
		overrides: {},
		pilot: "not pilot-ready",
		benchmark: "not run",
	};
	record.gates = evaluateGates(record, answers, item, backend, p95);
	return record;
}

function proposeQuestion(unit: Unit, answers: Record<string, Answer> | null): Contract {
	const reference = unit.occurrences ? "logged picks from transcripts" : "";
	if (unit.options) {
		const instructions = `Which ${unit.heading.replace(" routing", "")} should handle this request?`;
		return { kind: "choice", instructions, labels: unit.options, input: "the request or assignment text", reference };
	}
	const kind = answers?.kind?.label;
	if (kind === "yes_no") return { kind: "yes_no", instructions: "", labels: { yes: "", no: "" }, input: "", reference };
	return { kind: kind === "score" ? "score" : "choice", instructions: "", labels: {}, input: "", reference };
}

export function proposeFallback(unitClass: CrossroadsClass): string {
	return LLM_CLASSES.includes(unitClass) ? "defer to the current LLM decider" : "run the existing code path";
}

export function evaluateGates(record: CandidateRecord, answers: Record<string, Answer> | null, item: Classified, backend: DecisionBackend, p95: number | undefined): Record<string, Gate> {
	const p = (name: string) => answers?.[name]?.pYes;
	const missing = item.error ? `classifier failed: ${item.error}` : "no answer";
	const tokens = estimateTokens(item.unit.context);
	const gates: Record<string, Gate> = {
		"closed set": tri(p("closed_set"), false, "options named or implied", missing),
		independent: tri(p("independent"), false, "each case judged alone", missing),
		"not rule-decidable": tri(p("rule_decidable"), true, "needs judgment of meaning", missing),
		"context fits": tokens <= backend.limits.maxStateTokens ? { status: "pass", reason: `~${tokens} tokens of ${backend.limits.maxStateTokens}` } : { status: "fail", reason: `~${tokens} tokens over ${backend.limits.maxStateTokens}` },
		latency: p95 === undefined ? { status: "unknown", reason: "no measured calls" } : { status: p95 <= DEFAULT_BUDGET_MS ? "pass" : "fail", reason: `measured p95 ${Math.round(p95)} ms vs ${DEFAULT_BUDGET_MS} ms default budget` },
		fallback: record.fallback.accepted ? { status: "pass", reason: "accepted by a human" } : { status: "unknown", reason: "proposed, not yet accepted" },
		replaceable: tri(p("irreplaceable"), true, "not security, offline, hot-loop or audit", missing),
	};
	for (const [name, status] of Object.entries(record.overrides)) gates[name] = { status, reason: "human override" };
	return gates;
}

function tri(probability: number | undefined, inverted: boolean, meaning: string, missing: string): Gate {
	if (probability === undefined) return { status: "unknown", reason: missing };
	const p = inverted ? 1 - probability : probability;
	const status: GateStatus = p >= GATE_PASS + DEAD_BAND ? "pass" : p < GATE_FAIL - DEAD_BAND ? "fail" : "unknown";
	return { status, reason: `${meaning}: p=${p.toFixed(2)}` };
}

export function gateStatus(record: CandidateRecord): GateStatus {
	const statuses = Object.values(record.gates).map((gate) => gate.status);
	if (statuses.includes("fail")) return "fail";
	return statuses.every((status) => status === "pass") ? "pass" : "unknown";
}

export function pilotReady(record: CandidateRecord): boolean {
	const { question, fallback } = record;
	const labels = Object.keys(question.labels ?? {}).length;
	return fallback.accepted && labels >= MIN_LABELS && Boolean(question.instructions && question.input && question.reference);
}

export function rankKey(record: CandidateRecord): [number, number, number, number] {
	const status = gateStatus(record) === "pass" ? 0 : 1;
	const occurrences = record.occurrences?.count ?? -1;
	return [status, CLASS_ORDER.indexOf(record.class), -occurrences, -(record.verdict ?? 0)];
}

export function rank(records: CandidateRecord[]): CandidateRecord[] {
	const compare = (a: CandidateRecord, b: CandidateRecord) => {
		const [ka, kb] = [rankKey(a), rankKey(b)];
		const position = ka.findIndex((value, index) => value !== kb[index]);
		return position === -1 ? 0 : ka[position] - kb[position];
	};
	return [...records].sort(compare);
}

const CARRIED = ["question", "fallback", "overrides", "pilot", "benchmark"] as const;

// Human-owned fields follow the id from the previous run. Labels derived from a routing catalog stay fresh.
export function carryForward(records: CandidateRecord[], previous: CandidateRecord[]): void {
	const byId = new Map(previous.map((record) => [record.id, record]));
	for (const record of records) {
		const before = byId.get(record.id);
		if (!before) continue;
		const derivedLabels = Object.keys(record.question.labels ?? {}).length ? record.question.labels : undefined;
		for (const field of CARRIED) (record as Record<string, unknown>)[field] = before[field];
		if (derivedLabels) record.question = { ...record.question, labels: derivedLabels };
	}
}

// Gates a human decided: an accepted fallback and explicit overrides.
export function applyHumanEdits(record: CandidateRecord): void {
	if (record.fallback.accepted) record.gates.fallback = { status: "pass", reason: "accepted by a human" };
	for (const [name, status] of Object.entries(record.overrides)) record.gates[name] = { status, reason: "human override" };
}

export type RunDiff = { added: string[]; gone: CandidateRecord[]; moved: string[] };

export function diffRuns(records: CandidateRecord[], previous: CandidateRecord[]): RunDiff {
	const before = new Map(previous.map((record) => [record.id, record]));
	const now = new Set(records.map((record) => record.id));
	return {
		added: records.filter((record) => !before.has(record.id)).map((record) => record.id),
		gone: previous.filter((record) => !now.has(record.id)),
		moved: records.filter((record) => before.has(record.id) && before.get(record.id)?.locations.join() !== record.locations.join()).map((record) => record.id),
	};
}
