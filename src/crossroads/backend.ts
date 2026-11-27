export type QuestionKind = "choice" | "score" | "yes_no";

export type Question = {
	kind: QuestionKind;
	instructions: string;
	labels?: Record<string, string>; // choice: label -> criterion; score: level -> criterion, lowest first
};

export type Answer = {
	label?: string;
	probabilities?: Record<string, number>;
	score?: number;
	pYes?: number;
	confidence?: number;
};

export type BackendLimits = { maxStateTokens: number; maxOptions: number; maxLevels: number };

export type Asked = { answers: Record<string, Answer>; ms: number; inputTokens: number };

export type BackendErrorKind = "OVERSIZE" | "TIMEOUT" | "RATE_LIMITED" | "UNAVAILABLE" | "INCOMPLETE" | "MISSING_CONFIG";

export class BackendError extends Error {
	constructor(
		readonly kind: BackendErrorKind,
		detail: string,
	) {
		super(`${kind}: ${detail}`);
	}
}

export interface DecisionBackend {
	name: string;
	limits: BackendLimits;
	usdPerInputToken: number;
	ask(state: unknown, questions: Record<string, Question>, timeoutMs: number): Promise<Asked>;
}

export const CONFIDENCE_FLOOR = 0.7;
const CHARS_PER_TOKEN = 4;
const YES_CUTOFF = 0.5;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function effectiveConfidence(kind: QuestionKind, answer: Answer | undefined): number | undefined {
	if (!answer) return undefined;
	if (kind === "yes_no") return answer.pYes === undefined ? undefined : Math.max(answer.pYes, 1 - answer.pYes);
	if (answer.confidence !== undefined) return answer.confidence;
	const probabilities = Object.values(answer.probabilities ?? {});
	return probabilities.length ? Math.max(...probabilities) : undefined;
}

export function decidedLabel(question: Question, answer: Answer | undefined): string | undefined {
	if (!answer) return undefined;
	if (question.kind === "yes_no") return answer.pYes === undefined ? undefined : answer.pYes >= YES_CUTOFF ? "yes" : "no";
	return answer.label;
}

// A fallback case: low effective confidence, or a missing or invalid answer.
export function isFallback(question: Question, answer: Answer | undefined): boolean {
	const confidence = effectiveConfidence(question.kind, answer);
	if (confidence === undefined || confidence < 0 || confidence > 1) return true;
	const label = decidedLabel(question, answer);
	if (label === undefined) return true;
	if (question.kind !== "yes_no" && !(label in (question.labels ?? {}))) return true;
	return confidence < CONFIDENCE_FLOOR;
}

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.14.0";
const JEV_USD_PER_MILLION_INPUT = 0.042;
const TOKENS_PER_MILLION = 1_000_000;
const HTTP_PAYLOAD_TOO_LARGE = 400;
const HTTP_RATE_LIMITED = 429;

export function jevBackend(key = process.env.TYPESAFE_API_KEY): DecisionBackend {
	return {
		name: JEV_MODEL,
		limits: { maxStateTokens: 32_000, maxOptions: 255, maxLevels: 10 },
		usdPerInputToken: JEV_USD_PER_MILLION_INPUT / TOKENS_PER_MILLION,
		async ask(state, questions, timeoutMs) {
			if (!key) throw new BackendError("MISSING_CONFIG", "TYPESAFE_API_KEY unset");
			const started = performance.now();
			const response = await post(key, state, questions, timeoutMs);
			const body = (await response.json()) as { answers?: Record<string, JevAnswer>; usage?: { input_tokens?: number } };
			const ms = performance.now() - started;
			const answers = Object.fromEntries(Object.entries(questions).map(([name, q]) => [name, fromJev(q, body.answers?.[name])]));
			return { answers, ms, inputTokens: body.usage?.input_tokens ?? 0 };
		},
	};
}

type JevAnswer = { noul?: number; choice?: string; score?: number; confidence?: number; probabilities?: Record<string, number> };

async function post(key: string, state: unknown, questions: Record<string, Question>, timeoutMs: number): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(JEV_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: JEV_MODEL, state, questions: toJev(questions) }),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		const timedOut = error instanceof Error && error.name === "TimeoutError";
		throw new BackendError(timedOut ? "TIMEOUT" : "UNAVAILABLE", String(error));
	}
	if (response.status === HTTP_RATE_LIMITED) throw new BackendError("RATE_LIMITED", "HTTP 429");
	if (response.status === HTTP_PAYLOAD_TOO_LARGE) throw new BackendError("OVERSIZE", await response.text());
	if (!response.ok) throw new BackendError("UNAVAILABLE", `HTTP ${response.status}`);
	return response;
}

function toJev(questions: Record<string, Question>): Record<string, object> {
	const converted: Record<string, object> = {};
	for (const [name, q] of Object.entries(questions)) {
		if (q.kind === "yes_no") converted[name] = { type: "noul", instructions: q.instructions };
		if (q.kind === "choice") converted[name] = { type: "choice", instructions: q.instructions, criteria: q.labels };
		if (q.kind === "score") converted[name] = { type: "score", instructions: q.instructions, criteria: Object.values(q.labels ?? {}) };
	}
	return converted;
}

function fromJev(question: Question, raw: JevAnswer | undefined): Answer {
	if (!raw) return {};
	if (question.kind === "yes_no") return { pYes: raw.noul };
	if (question.kind === "choice") return { label: raw.choice, confidence: raw.confidence, probabilities: raw.probabilities };
	const levels = Object.keys(question.labels ?? {});
	const probabilities = Object.fromEntries(Object.entries(raw.probabilities ?? {}).map(([index, p]) => [levels[Number(index)], p]));
	const top = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
	return { label: top, score: raw.score, confidence: raw.confidence, probabilities };
}
