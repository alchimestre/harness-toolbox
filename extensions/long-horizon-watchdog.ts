// Watchdog clock for long-horizon subagents and background jobs.
// The rule in rules/long-horizon-watchdog.md holds the procedure; this supplies the clock and the
// job list, because a rule cannot fire on wall time. Main sessions only: spawned sessions rebind the
// same factory and would tick on their own parent's work.

const MIN_AGE_MS = Number(process.env.OMP_WATCHDOG_MIN_AGE_MS ?? 600_000);
const BASE_MS = Number(process.env.OMP_WATCHDOG_BASE_MS ?? 300_000);
const MAX_MS = BASE_MS * 6;

type JobEntry = {
	id?: string;
	type?: string;
	status?: string;
	label?: string;
	command?: string;
	startTime?: number;
};

type Snapshot = {
	running?: JobEntry[];
	delivery?: { queued?: number; delivering?: boolean; pendingJobIds?: string[] };
};

const formatElapsed = (startTime: number | undefined) => {
	if (typeof startTime !== "number") return "?";
	const ms = Date.now() - startTime;
	if (!Number.isFinite(ms)) return "?";
	if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
};

const buildTick = (long: JobEntry[], snapshot: Snapshot) => {
	const rows = long.map((job) => {
		const label = (job.label ?? job.command ?? job.type ?? "-").replace(/\s+/g, " ").trim();
		return `  ${job.id ?? "?"}  ${job.type ?? "-"}  ${job.status ?? "-"}  ${formatElapsed(job.startTime)}  ${label}`;
	});
	const lines = [
		`<watchdog-tick jobs="${long.length}">`,
		`Long-horizon watchdog fired. ${long.length} job${long.length === 1 ? "" : "s"} past ${Math.round(MIN_AGE_MS / 60_000)}m:`,
		"",
		...rows,
	];
	const queued = snapshot.delivery?.queued ?? 0;
	if (queued > 0 && snapshot.delivery?.delivering !== true) {
		lines.push(
			"",
			`Delivery queue holds ${queued} finished result${queued === 1 ? "" : "s"} that never reached this session. Read them before trusting the silence.`,
		);
	}
	lines.push(
		"",
		"Run the check from the long-horizon watchdog rule now: `read proc://`, then `read agent://<id>` for each job above, and `read history://<id>` for anything past two ticks or unmoved. Remediate per the rule, then close with one visible line per job.",
		"</watchdog-tick>",
	);
	return lines.join("\n");
};

export default function (pi) {
	let delay = BASE_MS;

	const arm = (ctx) => {
		ctx.setTimeout(() => {
			const snapshot: Snapshot | null = ctx.getAsyncJobSnapshot?.() ?? null;
			const long = (snapshot?.running ?? []).filter((job) => {
				const status = (job.status ?? "").toLowerCase();
				const live =
					status === "" || status === "running" || status === "queued" || status === "active" || status === "pending";
				// A missing startTime counts as long: over-checking beats a silent stall.
				return live && !(typeof job.startTime === "number" && Date.now() - job.startTime < MIN_AGE_MS);
			});
			if (long.length > 0) {
				pi.sendMessage(
					{
						customType: "omp.watchdog.tick",
						content: buildTick(long, snapshot ?? {}),
						display: true,
						attribution: "agent",
					},
					{ deliverAs: "aside", triggerTurn: true },
				);
				delay = Math.min(delay * 2, MAX_MS);
			} else {
				delay = BASE_MS;
			}
			arm(ctx);
		}, delay);
	};

	pi.on("session_start", async (_event, ctx) => {
		// Skip only a session we know is a subagent: an unknown kind should tick, not fall silent.
		if (ctx.agent?.kind === "sub") return;
		arm(ctx);
	});
}
