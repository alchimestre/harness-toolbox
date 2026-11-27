import type { DecisionBackend } from "./backend.ts";
import { BackendError, decidedLabel, isFallback } from "./backend.ts";
import type { CandidateRecord } from "./records.ts";
import { pilotReady } from "./records.ts";

export type Sample = { input: string; logged?: string; human?: string; fallbackAnswer?: string };

export const PILOT_SAMPLES = 30;
const MIN_PER_LABEL = 3;
export const PILOT_AGREEMENT = 0.9;
export const MAX_FALLBACK_RATE = 0.2;
const PILOT_TIMEOUT_MS = 10_000;

export type PilotOutcome = {
	result: Record<string, unknown> | string;
	disagreements: Array<Sample & { model: string | null }>;
};

// Takes up to MIN_PER_LABEL samples per reference label first, then fills in input order.
export function stratify(samples: Sample[], size = PILOT_SAMPLES): Sample[] {
	const reference = (sample: Sample) => sample.human ?? sample.logged ?? "";
	const chosen = new Set<Sample>();
	for (const group of Map.groupBy(samples, reference).values()) group.slice(0, MIN_PER_LABEL).forEach((sample) => chosen.add(sample));
	for (const sample of samples) if (chosen.size < size) chosen.add(sample);
	return [...chosen].slice(0, size);
}

export async function runPilot(record: CandidateRecord, samples: Sample[], backend: DecisionBackend): Promise<PilotOutcome> {
	if (!pilotReady(record)) throw new Error(`${record.id} is not pilot-ready: complete question.instructions, labels, input, reference and accept the fallback`);
	const labels = record.question.kind === "yes_no" ? new Set(["yes", "no"]) : new Set(Object.keys(record.question.labels ?? {}));
	const usable = samples.filter((sample) => labels.has(sample.human ?? sample.logged ?? ""));
	const outsideLabels = samples.length - usable.length;
	const chosen = stratify(usable);
	if (chosen.some((sample) => !sample.human && !sample.logged)) throw new Error("every sample needs a logged pick or a human label");
	let agreed = 0;
	let fallbacks = 0;
	const disagreements: PilotOutcome["disagreements"] = [];
	for (const sample of chosen) {
		const model = await modelLabel(record, sample, backend);
		const answer = model.fallback ? fallbackAnswer(record, sample) : model.label;
		if (model.fallback) fallbacks++;
		if (!model.fallback && model.label !== sample.logged && !sample.human) disagreements.push({ ...sample, model: model.label });
		if (answer !== undefined && answer === (sample.human ?? sample.logged)) agreed++;
	}
	if (disagreements.length) return { result: `pending: ${disagreements.length} disagreements need a human label`, disagreements };
	const agreement = agreed / chosen.length;
	const fallbackRate = fallbacks / chosen.length;
	const passed = agreement >= PILOT_AGREEMENT && fallbackRate <= MAX_FALLBACK_RATE;
	return { result: { samples: chosen.length, outsideLabels, agreement, fallbackRate, passed }, disagreements };
}

async function modelLabel(record: CandidateRecord, sample: Sample, backend: DecisionBackend): Promise<{ label: string | null; fallback: boolean }> {
	try {
		const asked = await backend.ask({ input: sample.input }, { decision: record.question }, PILOT_TIMEOUT_MS);
		const answer = asked.answers.decision;
		return { label: decidedLabel(record.question, answer) ?? null, fallback: isFallback(record.question, answer) };
	} catch (error) {
		if (error instanceof BackendError) return { label: null, fallback: true };
		throw error;
	}
}

// The accepted fallback is the current decider, so its answer is the logged pick unless the sample states one.
function fallbackAnswer(record: CandidateRecord, sample: Sample): string | undefined {
	if (!record.fallback.accepted) return undefined;
	return sample.fallbackAnswer ?? sample.logged;
}
