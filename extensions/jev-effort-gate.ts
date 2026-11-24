// Sets each subagent's thinking effort when it starts, from Jev signals on its own
// assignment and the provider's remaining quota. Runs inside the child, so task, eval
// agent() and workpool spawns are all covered. Only the level moves, one step at most,
// inside the agent's range below; the model and its fallback chain stay as configured.

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
// Agents whose effort may move. Only task is benched across levels with the gate; every
// other agent runs at its configured level until its own bench shows a gain.
// The range stops at high: Haiku xhigh scored no better than high (scout 4/6, explore 6/6) at 1.5x cost.
const AGENT_RANGE: Record<string, [Level, Level]> = {
	task: ["low", "high"],
};

export const QUESTIONS = {
	exhaustive: {
		type: "noul",
		instructions:
			"Would a worker who stops at the first plausible match give a wrong or incomplete result, because the assignment asks for all instances, for other places that do the same thing, or for confirmation that nothing else exists?",
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

const DECISION_ENTRY = "harness-toolbox.jev-effort-gate";
// Every subagent prompt carries this wrapper; left in, it shifts Jev's signals away from the benched ones.
const ASSIGNMENT_WRAPPER = /^Complete assignment thoroughly:\s*/;

type StartEvent = { prompt?: string; reason?: string };
type ChildContext = { agent?: { kind?: string; id?: string; name?: string }; model?: { provider?: string } };
type QuotaReport = { provider?: string; limits?: { window?: { id?: string }; amount?: { usedFraction?: number } }[] };

// Shared by the parent and every child session in the process, so one fetch serves all.
let quota = new Map<string, number>();
let quotaFetchedAt = 0;

// The factory runs once per session, so `decided` is per child.
export default function jevEffortGate(pi: ExtensionAPI): void {
	let decided = false;

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

	pi.on("before_agent_start", async (event: StartEvent, ctx: ChildContext) => {
		const { kind, id, name } = ctx.agent ?? {};
		if (kind !== "sub" || !id || !name) {
			void refreshQuota();
			return;
		}
		const assignment = (event.prompt ?? "").replace(ASSIGNMENT_WRAPPER, "").trim();
		// A revive fires with an empty prompt; wait for the real assignment. Later wakes keep the first decision.
		if (decided || event.reason === "revive" || !assignment) return;
		decided = true;
		const range = AGENT_RANGE[name];
		const configured = pi.getThinkingLevel() as Level;
		if (!range || !LEVELS.includes(configured)) return;

		void refreshQuota();
		const jev = await askJev(name, assignment);
		const used = ctx.model?.provider ? quota.get(ctx.model.provider) : undefined;
		const decision = chooseLevel(configured, range, jev.signals, used);
		if (decision.level !== configured) pi.setThinkingLevel(decision.level);
		pi.appendEntry(DECISION_ENTRY, { configured, ...decision, signals: jev.signals, jevError: jev.error });
	});
}

export function chooseLevel(
	configured: Level,
	[min, max]: [Level, Level],
	signals: Signals | undefined,
	quotaUsed: number | undefined,
): { level: Level; reason: string } {
	const quotaNote = quotaUsed === undefined ? "quota unknown" : `quota ${Math.round(quotaUsed * 100)}%`;
	const current = LEVELS.indexOf(configured);
	// The range bounds movement; a configured level outside it stays put rather than snapping in.
	const floor = Math.min(LEVELS.indexOf(min), current);
	const ceiling = Math.max(LEVELS.indexOf(max), current);
	const step = (delta: number, why: string) => {
		const bounded = Math.min(Math.max(current + delta, floor), ceiling);
		return { level: LEVELS[bounded], reason: `${why}; ${quotaNote}` };
	};
	const pressed = quotaUsed !== undefined && quotaUsed >= QUOTA_PRESSURE;
	const critical = quotaUsed !== undefined && quotaUsed >= QUOTA_CRITICAL;

	if (!signals) return pressed ? step(-1, "no Jev signals, quota pressure") : step(0, "no Jev signals");
	// "Fix every typo in README.md" scores exhaustive too; a named target needs no wider search.
	const exhaustive = signals.exhaustive >= SIGNAL_THRESHOLD && signals.exact < SIGNAL_THRESHOLD;
	if (exhaustive && !critical) return step(1, `exhaustive ${signals.exhaustive.toFixed(2)}: accuracy first`);
	if (exhaustive) return step(0, `exhaustive ${signals.exhaustive.toFixed(2)}, quota critical: hold`);
	if (signals.exact >= SIGNAL_THRESHOLD) return step(-1, `exact target ${signals.exact.toFixed(2)}: cheaper and faster`);
	if (signals.urgent >= SIGNAL_THRESHOLD) return step(-1, `urgent ${signals.urgent.toFixed(2)}: faster`);
	if (pressed) return step(-1, "quota pressure: cheaper");
	return step(0, "no strong signal");
}

export async function askJev(
	agent: string,
	assignment: string,
	questions: Record<keyof Signals, { type: string; instructions: string }> = QUESTIONS,
): Promise<{ signals?: Signals; error?: string }> {
	const key = process.env.TYPESAFE_API_KEY;
	if (!key) return { error: "TYPESAFE_API_KEY unset" };
	try {
		const response = await fetch(JEV_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: JEV_MODEL, state: { agent, assignment }, questions }),
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
