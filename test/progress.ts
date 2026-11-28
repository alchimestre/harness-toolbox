// Checks the todo bar, bucketing, and widget line built by src/progress-core.ts. Run: bun test/progress.ts

import { BUCKET_MS, WINDOW_BUCKETS, buckets, newTrack, record, renderLine, todoCounts } from "../src/progress-core.ts";

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

const todo = todoCounts({
	phases: [
		{ tasks: [{ status: "completed" }, { status: "in_progress" }] },
		{ tasks: [{ status: "abandoned" }, { status: "pending" }, { status: "completed" }] },
	],
});
check(todo?.done === 2 && todo.total === 4, "todo counts skip dropped tasks");
check(todoCounts(undefined) === undefined, "non-todo details give no counts");

const nowMs = BUCKET_MS * 100 + 1;
const samples: [number, number][] = [];
record(samples, nowMs - BUCKET_MS * WINDOW_BUCKETS - 1, 99);
record(samples, nowMs - BUCKET_MS, 300);
record(samples, nowMs, 5);
const sums = buckets(samples, nowMs);
check(samples.length === 2, "samples older than the window are pruned");
check(sums.at(-1) === 5 && sums.at(-2) === 300, "samples land in their buckets, newest last");

const track = newTrack("explore", nowMs);
track.todoDone = 3;
track.todoTotal = 6;
track.tokens = samples;
track.endedAtMs = nowMs;
const line = renderLine(track, nowMs);
check(line.includes("██████░░░░░░ 3/6"), "bar fills half for 3 of 6");
check(line.includes("30/s"), "token rate comes from the last full bucket");
check(line.endsWith(" done"), "ended agent is marked done");
