/**
 * Runs every subagent through src/subagent-scheduler.pl: its first tool call waits for a machine-wide
 * slot, held until the subagent's run ends. Subagents that never call a tool take no slot.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const SCHEDULER = new URL("../src/subagent-scheduler.pl", import.meta.url).pathname;
// A parent blocked on its children must not hold a slot, or queued children starve behind it.
const CHILD_WAIT_TOOLS: Record<string, true> = { task: true, wait: true };

type ToolCallEvent = { toolName: string };
type ChildContext = { agent?: { kind?: string }; cwd: string };
type Slot = { holder: ChildProcess; admitted: Promise<void> };

// An abandoned subagent gets neither agent_end nor session_shutdown; without this its slot leaks.
// shortcut: a single tool call running longer than this loses its slot mid-run; track in-flight calls if that matters.
const IDLE_RELEASE_MS = 15 * 60_000;
const IDLE_CHECK_MS = 30_000;

export default function subagentScheduler(pi: ExtensionAPI, scheduler = SCHEDULER): void {
	let slot: Slot | undefined;
	let lastActivity = 0;
	const touch = () => {
		lastActivity = Date.now();
	};
	const release = () => {
		slot?.holder.kill();
		slot = undefined;
	};
	const idleCheck = setInterval(() => {
		if (slot && Date.now() - lastActivity > IDLE_RELEASE_MS) release();
	}, IDLE_CHECK_MS);
	idleCheck.unref();

	pi.on("tool_call", async (event: ToolCallEvent, ctx: ChildContext) => {
		// A bench run already holds a slot for its whole omp process, subagents included.
		if (ctx.agent?.kind !== "sub" || process.env.SUBAGENT_SCHEDULER_SLOT !== undefined) return;
		if (Object.hasOwn(CHILD_WAIT_TOOLS, event.toolName)) return release();
		slot ??= requestSlot(scheduler, basename(ctx.cwd));
		const pending = slot;
		touch();
		await pending.admitted.catch(() => {
			if (slot === pending) slot = undefined;
		});
		touch();
	});
	pi.on("tool_result", touch);
	pi.on("agent_end", release);
	pi.on("session_shutdown", () => {
		release();
		clearInterval(idleCheck);
	});
}

function requestSlot(scheduler: string, owner: string): Slot {
	const holder = spawn("perl", [scheduler, "/bin/sh", "-c", "echo admitted; read _"], {
		env: { ...process.env, SUBAGENT_SCHEDULER_OWNER: owner },
		stdio: ["pipe", "pipe", "ignore"],
	});
	const { promise: admitted, resolve, reject } = Promise.withResolvers<void>();
	holder.stdout?.once("data", () => resolve());
	holder.once("exit", (code: number | null) => reject(new Error(`subagent-scheduler exited with ${code}`)));
	holder.once("error", reject);
	return { holder, admitted };
}
