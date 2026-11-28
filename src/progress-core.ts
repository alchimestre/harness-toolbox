// Per-agent progress: todo bar plus output-token and tool-call sparklines, drawn as widget lines.

export const BUCKET_MS = 10_000;
export const WINDOW_BUCKETS = 12;
const BAR_WIDTH = 12;
const TODO_COLUMN_WIDTH = BAR_WIDTH + " 9/9".length;
const LABEL_WIDTH = 16;
const SPARKS = "▁▂▃▄▅▆▇█";
const MS_PER_SECOND = 1000;

type Sample = [atMs: number, value: number];
export type Track = {
  label: string;
  todoDone: number;
  todoTotal: number;
  tokens: Sample[];
  toolCalls: Sample[];
  startedAtMs: number;
  lastActivityMs: number;
  endedAtMs?: number;
};
export type TodoDetails = { phases?: { tasks?: { status?: string }[] }[] };

export function newTrack(label: string, nowMs: number): Track {
  return { label, todoDone: 0, todoTotal: 0, tokens: [], toolCalls: [], startedAtMs: nowMs, lastActivityMs: nowMs };
}

export function record(samples: Sample[], nowMs: number, value: number): void {
  samples.push([nowMs, value]);
  const oldestMs = nowMs - BUCKET_MS * WINDOW_BUCKETS;
  while (samples.length && samples[0][0] < oldestMs) samples.shift();
}

export function buckets(samples: Sample[], nowMs: number): number[] {
  const sums = new Array<number>(WINDOW_BUCKETS).fill(0);
  const currentBucket = Math.floor(nowMs / BUCKET_MS);
  for (const [atMs, value] of samples) {
    const age = currentBucket - Math.floor(atMs / BUCKET_MS);
    if (age >= 0 && age < WINDOW_BUCKETS) sums[WINDOW_BUCKETS - 1 - age] += value;
  }
  return sums;
}

export function sparkline(values: number[]): string {
  const peak = Math.max(...values);
  if (peak === 0) return SPARKS[0].repeat(values.length);
  return values.map((value) => SPARKS[Math.round((value / peak) * (SPARKS.length - 1))]).join("");
}

export function bar(done: number, total: number): string {
  const filled = total ? Math.round((done / total) * BAR_WIDTH) : 0;
  return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)} ${done}/${total}`;
}

// Dropped todos ("abandoned") leave the total, so the bar can still reach full.
export function todoCounts(details: TodoDetails | undefined): { done: number; total: number } | undefined {
  if (!details?.phases) return undefined;
  const statuses = details.phases.flatMap((phase) => phase.tasks ?? []).map((task) => task.status);
  const counted = statuses.filter((status) => status !== "abandoned");
  return { done: counted.filter((status) => status === "completed").length, total: counted.length };
}

export function renderLine(track: Track, nowMs: number): string {
  const tokenBuckets = buckets(track.tokens, nowMs);
  const lastFullBucket = tokenBuckets[WINDOW_BUCKETS - 2];
  const tokensPerSecond = Math.round(lastFullBucket / (BUCKET_MS / MS_PER_SECOND));
  // Subagents have no todo tool by default, so their bar shows elapsed time instead.
  const elapsedSeconds = Math.round(((track.endedAtMs ?? nowMs) - track.startedAtMs) / MS_PER_SECOND);
  const todo = track.todoTotal ? bar(track.todoDone, track.todoTotal) : `${elapsedSeconds}s elapsed`.padEnd(TODO_COLUMN_WIDTH);
  const state = track.endedAtMs === undefined ? "" : " done";
  const label = track.label.slice(0, LABEL_WIDTH).padEnd(LABEL_WIDTH);
  const tools = sparkline(buckets(track.toolCalls, nowMs));
  return `${label} ${todo}  tok ${sparkline(tokenBuckets)} ${tokensPerSecond}/s  tools ${tools}${state}`;
}
