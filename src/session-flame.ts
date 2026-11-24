// Turns a harness session transcript, with its subagent transcripts, into folded
// stacks for flamegraph.pl or a trace-event timeline.
// Run: bun src/session-flame.ts <transcript.jsonl> [ms|tokens|microusd|trace]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const USAGE_KINDS = ["input", "output", "cacheRead", "cacheWrite"] as const;
const WEIGHTS = ["ms", "tokens", "microusd"] as const;
const TRANSCRIPT_SUFFIX = ".jsonl";
const MICROUSD_PER_USD = 1_000_000;
const MICROSECONDS_PER_MS = 1000;

type UsageKind = (typeof USAGE_KINDS)[number];
type Usage = Record<UsageKind, number> & { cost: Record<UsageKind, number> };
export type Weight = (typeof WEIGHTS)[number];

export type Span = {
  agentPath: string[];
  name: string;
  detail?: string;
  startMs: number;
  durationMs: number;
  estimated?: boolean;
  firstTokenMs?: number;
  usage?: Usage;
};

type Entry = { type?: string; title?: string; message?: Record<string, any> };
type Leaf = [frames: string[], value: number];

if (import.meta.main) {
  const [transcriptPath, mode = "ms"] = process.argv.slice(2);
  const modes: string[] = [...WEIGHTS, "trace"];
  if (!transcriptPath || !modes.includes(mode)) {
    console.error(`usage: bun src/session-flame.ts <transcript.jsonl> [${modes.join("|")}]`);
    process.exit(2);
  }
  const spans = loadSpans(transcriptPath);
  if (spans.length === 0) {
    console.error(`${transcriptPath}: no model or tool calls found`);
    process.exit(1);
  }
  const output = mode === "trace" ? JSON.stringify(trace(spans)) : fold(spans, mode as Weight);
  process.stdout.write(output);
}

export function loadSpans(transcriptPath: string, parentPath: string[] = []): Span[] {
  const entries = readEntries(transcriptPath);
  const fileName = basename(transcriptPath, TRANSCRIPT_SUFFIX);
  const agentName = fileName.split(".").at(-1) as string;
  const sessionTitle = entries.find((entry) => entry.type === "session")?.title;
  const label = parentPath.length ? `agent:${agentName}` : sessionTitle || agentName;
  const agentPath = [...parentPath, label];
  const spans = spansOf(entries, agentPath);

  const subagentDir = transcriptPath.slice(0, -TRANSCRIPT_SUFFIX.length);
  if (!existsSync(subagentDir)) return spans;
  const subagentFiles = readdirSync(subagentDir).filter((file) => file.endsWith(TRANSCRIPT_SUFFIX));
  for (const file of subagentFiles) spans.push(...loadSpans(join(subagentDir, file), agentPath));
  return spans;
}

function readEntries(transcriptPath: string): Entry[] {
  const entries: Entry[] = [];
  const lines = readFileSync(transcriptPath, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (cause) {
      throw new Error(`${transcriptPath}:${index + 1}: not a JSON record`, { cause });
    }
  }
  return entries;
}

export function spansOf(entries: Entry[], agentPath: string[]): Span[] {
  const spans: Span[] = [];
  const pendingTools = new Map<string, Span>();
  for (const { type, message } of entries) {
    if (type !== "message" || !message) continue;
    if (message.role === "assistant") spans.push(modelSpan(message, agentPath, pendingTools));
    if (message.role !== "toolResult") continue;
    const tool = pendingTools.get(message.toolCallId);
    if (!tool) continue;
    closeTool(tool, message);
    spans.push(tool);
  }
  return spans;
}

// Without a recorded run time the interval is dispatch to result, which includes time queued behind other calls.
function closeTool(tool: Span, result: Record<string, any>): void {
  const measuredMs = result.details?.wallTimeMs;
  if (typeof measuredMs !== "number") {
    tool.durationMs = Math.max(0, result.timestamp - tool.startMs);
    tool.estimated = true;
    return;
  }
  tool.durationMs = measuredMs;
  tool.startMs = result.timestamp - measuredMs;
}

function modelSpan(message: Record<string, any>, agentPath: string[], pendingTools: Map<string, Span>): Span {
  const durationMs = message.duration ?? 0;
  const toolStartMs = message.timestamp + durationMs;
  for (const part of message.content ?? []) {
    if (part.type !== "toolCall") continue;
    const tool = { agentPath, name: `tool:${part.name}`, detail: part.intent, startMs: toolStartMs, durationMs: 0 };
    pendingTools.set(part.id, tool);
  }
  return {
    agentPath,
    name: `model:${message.model}`,
    startMs: message.timestamp,
    durationMs,
    firstTokenMs: message.ttft,
    usage: message.usage,
  };
}

export function fold(spans: Span[], weight: Weight): string {
  const totals = new Map<string, number>();
  for (const span of spans) {
    for (const [frames, value] of leavesOf(span, weight)) {
      // flamegraph.pl splits frames on ";" and records on newlines.
      const stackFrames = [...span.agentPath, span.name, ...frames].map((frame) => frame.replace(/[;\s]+/g, " ").trim());
      const stack = stackFrames.join(";");
      totals.set(stack, (totals.get(stack) ?? 0) + value);
    }
  }
  let folded = "";
  for (const [stack, total] of totals) {
    const count = Math.round(total);
    if (count > 0) folded += `${stack} ${count}\n`;
  }
  return folded;
}

function leavesOf(span: Span, weight: Weight): Leaf[] {
  if (weight === "ms") return timeLeaves(span);
  const usage = span.usage;
  if (!usage) return [];
  if (weight === "tokens") return USAGE_KINDS.map((kind) => [[kind], usage[kind] ?? 0]);
  return USAGE_KINDS.map((kind) => [[kind], (usage.cost?.[kind] ?? 0) * MICROUSD_PER_USD]);
}

function timeLeaves(span: Span): Leaf[] {
  if (span.firstTokenMs === undefined) return [[span.detail ? [span.detail] : [], span.durationMs]];
  const generationMs = Math.max(0, span.durationMs - span.firstTokenMs);
  return [
    [["first token"], span.firstTokenMs],
    [["generation"], generationMs],
  ];
}

export function trace(spans: Span[]) {
  const originMs = spans.reduce((earliest, span) => Math.min(earliest, span.startMs), Infinity);
  const spansByAgent = Map.groupBy(spans, (span) => span.agentPath.join(" > "));
  const traceEvents: object[] = [];
  let pid = 0;
  for (const [agent, agentSpans] of spansByAgent) {
    pid += 1;
    traceEvents.push({ name: "process_name", ph: "M", pid, tid: 0, args: { name: agent } });
    const laneEndsMs: number[] = [];
    agentSpans.sort((left, right) => left.startMs - right.startMs);
    for (const span of agentSpans) {
      const tid = claimLane(laneEndsMs, span);
      const name = span.detail ? `${span.name}: ${span.detail}` : span.name;
      const ts = (span.startMs - originMs) * MICROSECONDS_PER_MS;
      const dur = span.durationMs * MICROSECONDS_PER_MS;
      const args = { interval: span.estimated ? "dispatch to result" : "measured" };
      traceEvents.push({ name, ph: "X", ts, dur, pid, tid, args });
    }
  }
  return { traceEvents };
}

// Complete events sharing a tid must not overlap, so parallel calls each take the first free lane.
function claimLane(laneEndsMs: number[], span: Span): number {
  const freeLane = laneEndsMs.findIndex((endMs) => endMs <= span.startMs);
  const lane = freeLane === -1 ? laneEndsMs.length : freeLane;
  laneEndsMs[lane] = span.startMs + span.durationMs;
  return lane;
}
