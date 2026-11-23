// Picks each subagent's thinking effort at spawn from Jev signals on its assignment and
// the provider's remaining quota. The model stays the one config resolved; only the
// effort suffix moves, one step at most, inside the agent's range below.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.14.0";
const JEV_TIMEOUT_MS = 2_000;
const QUOTA_TTL_MS = 5 * 60_000;
const QUOTA_COMMAND_TIMEOUT_MS = 12_000;
const QUOTA_WINDOWS = ["5h", "7d"];
const SIGNAL_THRESHOLD = 0.7;
const QUOTA_PRESSURE = 0.8;
const QUOTA_CRITICAL = 0.95;
const LEVELS = ["low", "medium", "high"] as const;

type Level = (typeof LEVELS)[number];
export type Signals = { exhaustive: number; exact: number; urgent: number };
// Agents whose effort may move. Agents named for a level (review-low, review-high) and
// task-fast stay pinned: on the explore bench Sonnet below high dropped to 4-6/8 from 8/8.
const AGENT_RANGE: Record<string, [Level, Level]> = {
	task: ["low", "high"],
	scout: ["low", "high"],
	reviewer: ["low", "medium"],
	"readonly-reviewer": ["low", "medium"],
};

const QUESTIONS = {
	exhaustive: {
		type: "noul",
		instructions:
			"Does doing this correctly require finding every instance of something across many files, or tracing behavior across components, where one missed instance makes the result wrong?",
	},
	exact: {
		type: "noul",
		instructions:
			"Is the target already fully identified (file, function, or exact text given), so the work is a direct edit, a lookup, or a fixed reply?",
	},
	urgent: {
		type: "noul",
		instructions: "Does the assignment say speed matters more than thoroughness or cost?",
	},
};

type Pending = { agent: string; text: string };
type TaskInput = { context?: string; tasks?: { name?: string; agent?: string; task?: string; solutionSpace?: string }[] };
type SpawnEvent = { agent: string; patterns?: string[]; spawnKey?: string };
type QuotaReport = { provider?: string; limits?: { window?: { id?: string }; amount?: { usedFraction?: number } }[] };

export default function jevEffortGate(pi: ExtensionAPI): void {
	const pending = new Map<string, Pending>();
	let quota = new Map<string, number>();
	let quotaFetchedAt = 0;

	const refreshQuota = async () => {
		if (Date.now() - quotaFetchedAt < QUOTA_TTL_MS) return;
		quotaFetchedAt = Date.now();
		const args = ["usage", "--json", "--redact", "--no-extensions"];
		try {
			const result = await pi.exec("omp", args, { timeout: QUOTA_COMMAND_TIMEOUT_MS });
			if (result.code === 0) quota = quotaUsedByProvider(result.stdout);
		} catch {
			// Stale quota is kept; chooseLevel reports "quota unknown" until a fetch succeeds.
		}
	};

	pi.on("session_start", () => {
		void refreshQuota();
	});

	pi.on("tool_call", (event: { toolName?: string; input?: unknown }) => {
		if (event.toolName !== "task") return;
		const input = event.input as TaskInput;
		for (const item of input.tasks ?? []) {
			if (!item.name || !item.agent) continue;
			const text = [input.context, item.task, item.solutionSpace].filter(Boolean).join("\n\n");
			pending.set(item.name, { agent: item.agent, text });
		}
	});

	pi.on("before_subagent_spawn", async (event: SpawnEvent) => {
		const assignment = event.spawnKey ? pending.get(event.spawnKey) : undefined;
		if (event.spawnKey) pending.delete(event.spawnKey);
		const range = AGENT_RANGE[event.agent];
		const [primary, ...fallbacks] = event.patterns ?? [];
		const match = primary?.match(/^(.+):(low|medium|high)$/);
		if (!range || !match) return undefined;
		const [, model, configured] = match as unknown as [string, string, Level];

		void refreshQuota();
		const jev = assignment?.agent === event.agent ? await askJev(event.agent, assignment.text) : { error: "no assignment text" };
		const used = quota.get(model.split("/")[0]);
		const decision = chooseLevel(configured, range, jev.signals, used);
		const note = jev.error ? `${decision.reason}; Jev: ${jev.error}` : decision.reason;
		return { model: [`${model}:${decision.level}`, ...fallbacks], note };
	});
}

export function chooseLevel(
	configured: Level,
	[min, max]: [Level, Level],
	signals: Signals | undefined,
	quotaUsed: number | undefined,
): { level: Level; reason: string } {
	const quotaNote = quotaUsed === undefined ? "quota unknown" : `quota ${Math.round(quotaUsed * 100)}%`;
	const step = (delta: number, why: string) => {
		const index = LEVELS.indexOf(configured) + delta;
		const bounded = Math.min(Math.max(index, LEVELS.indexOf(min)), LEVELS.indexOf(max));
		return { level: LEVELS[bounded], reason: `${why}; ${quotaNote}` };
	};
	const pressed = quotaUsed !== undefined && quotaUsed >= QUOTA_PRESSURE;
	const critical = quotaUsed !== undefined && quotaUsed >= QUOTA_CRITICAL;

	if (!signals) return pressed ? step(-1, "no Jev signals, quota pressure") : step(0, "no Jev signals");
	const exhaustive = signals.exhaustive >= SIGNAL_THRESHOLD;
	if (exhaustive && !critical) return step(1, `exhaustive ${signals.exhaustive.toFixed(2)}: accuracy first`);
	if (exhaustive) return step(0, `exhaustive ${signals.exhaustive.toFixed(2)}, quota critical: hold`);
	if (signals.exact >= SIGNAL_THRESHOLD) return step(-1, `exact target ${signals.exact.toFixed(2)}: cheaper and faster`);
	if (signals.urgent >= SIGNAL_THRESHOLD) return step(-1, `urgent ${signals.urgent.toFixed(2)}: faster`);
	if (pressed) return step(-1, "quota pressure: cheaper");
	return step(0, "no strong signal");
}

async function askJev(agent: string, assignment: string): Promise<{ signals?: Signals; error?: string }> {
	const key = process.env.TYPESAFE_API_KEY;
	if (!key) return { error: "TYPESAFE_API_KEY unset" };
	try {
		const response = await fetch(JEV_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: JEV_MODEL, state: { agent, assignment }, questions: QUESTIONS }),
			signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
		});
		if (!response.ok) return { error: `HTTP ${response.status}` };
		const { answers } = (await response.json()) as { answers?: Record<keyof Signals, { noul?: number }> };
		const read = (name: keyof Signals) => answers?.[name]?.noul;
		const signals = { exhaustive: read("exhaustive"), exact: read("exact"), urgent: read("urgent") };
		const complete = Object.values(signals).every((value) => typeof value === "number");
		return complete ? { signals: signals as Signals } : { error: "incomplete answers" };
	} catch (error) {
		return { error: error instanceof Error ? error.name : "request failed" };
	}
}

// Least-used account per provider; within an account, its most-used window.
function quotaUsedByProvider(output: string): Map<string, number> {
	const used = new Map<string, number>();
	let reports: QuotaReport[] = [];
	try {
		reports = JSON.parse(output).reports ?? [];
	} catch {
		return used;
	}
	for (const report of reports) {
		const fractions = (report.limits ?? [])
			.filter((limit) => QUOTA_WINDOWS.includes(limit.window?.id ?? ""))
			.map((limit) => limit.amount?.usedFraction)
			.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
		if (!report.provider || !fractions.length) continue;
		const account = Math.max(...fractions);
		used.set(report.provider, Math.min(used.get(report.provider) ?? 1, account));
	}
	return used;
}
