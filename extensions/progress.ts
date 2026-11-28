/**
 * Draws a widget above the editor while agents work: one line per agent (main and subagents) with
 * a todo progress bar and sparklines of output tokens and tool calls over the last two minutes.
 * Each subagent session has its own event bus, so subagents are tracked from the
 * `task:subagent:event` frames omp forwards to the main session, worker-thread subagents included.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { newTrack, record, renderLine, todoCounts, type TodoDetails, type Track } from "../src/progress-core.ts";

const WIDGET_KEY = "harness-toolbox.progress";
const SUBAGENT_EVENT = "task:subagent:event";
const REDRAW_MS = 1000;
const ENDED_SUBAGENT_KEEP_MS = 30_000;
const IDLE_HIDE_MS = 60_000;
const MAX_WIDGET_LINES = 10;
const MAIN_ID = "main";

type WidgetUI = { setWidget(key: string, lines: string[] | undefined, options?: { placement: "aboveEditor" }): void };
type AgentContext = { agent?: { kind?: string }; hasUI?: boolean; ui: WidgetUI };
type Usage = { usage?: { output?: number } };
type SessionEvent = {
	type: string;
	toolName?: string;
	details?: TodoDetails;
	result?: { details?: TodoDetails };
	message?: { role?: string } & Usage;
};
type SubagentFrame = { id: string; event: SessionEvent };

export default function progress(pi: ExtensionAPI): void {
	const tracks = new Map<string, Track>();
	let stopDrawing: (() => void) | undefined;
	const onMain = (ctx: AgentContext, event: SessionEvent) => {
		if (ctx.agent?.kind !== "sub" && stopDrawing) apply(trackOf(tracks, MAIN_ID), event);
	};

	pi.on("session_start", (_event: unknown, ctx: AgentContext) => {
		if (ctx.agent?.kind === "sub" || !ctx.hasUI) return;
		stopDrawing?.();
		const unsubscribe = pi.events.on(SUBAGENT_EVENT, (frame: SubagentFrame) =>
			apply(trackOf(tracks, frame.id), frame.event),
		);
		const redraw = setInterval(() => ctx.ui.setWidget(WIDGET_KEY, widgetLines(tracks, Date.now())), REDRAW_MS);
		stopDrawing = () => {
			clearInterval(redraw);
			unsubscribe();
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			tracks.clear();
		};
	});
	pi.on("tool_call", (_event: unknown, ctx: AgentContext) => onMain(ctx, { type: "tool_execution_start" }));
	pi.on("tool_result", (event: SessionEvent, ctx: AgentContext) =>
		onMain(ctx, { ...event, type: "tool_execution_end", result: { details: event.details } }),
	);
	pi.on("message_end", (event: SessionEvent, ctx: AgentContext) => onMain(ctx, { ...event, type: "message_end" }));
	pi.on("session_shutdown", () => {
		stopDrawing?.();
		stopDrawing = undefined;
	});
}

function trackOf(tracks: Map<string, Track>, id: string): Track {
	const track = tracks.get(id) ?? newTrack(id, Date.now());
	tracks.set(id, track);
	return track;
}

function apply(track: Track, event: SessionEvent): void {
	const nowMs = Date.now();
	track.lastActivityMs = nowMs;
	track.endedAtMs = event.type === "agent_end" ? nowMs : undefined;
	if (event.type === "tool_execution_start") record(track.toolCalls, nowMs, 1);
	const outputTokens = event.message?.role === "assistant" ? event.message.usage?.output : undefined;
	if (event.type === "message_end" && outputTokens) record(track.tokens, nowMs, outputTokens);
	const todo = event.type === "tool_execution_end" && event.toolName === "todo" ? todoCounts(event.result?.details) : undefined;
	if (!todo) return;
	track.todoDone = todo.done;
	track.todoTotal = todo.total;
}

function widgetLines(tracks: Map<string, Track>, nowMs: number): string[] | undefined {
	for (const [id, track] of tracks) {
		if (track.endedAtMs !== undefined && nowMs - track.endedAtMs > ENDED_SUBAGENT_KEEP_MS) tracks.delete(id);
	}
	const active = [...tracks.values()].filter((track) => nowMs - track.lastActivityMs < IDLE_HIDE_MS);
	if (active.length === 0) return undefined;
	return active.slice(0, MAX_WIDGET_LINES).map((track) => renderLine(track, nowMs));
}
