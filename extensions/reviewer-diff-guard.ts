// Refuses a task call that spawns a reviewer without any diff: the reviewer would only report
// `BLOCKED: no diff supplied`. Any sign of a diff (the word, a hunk, a local:// or pr:// path) lets it through.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export const REVIEWERS: Record<string, true> = { "readonly-reviewer": true, "review-high": true, "review-low": true };
const DIFF_SIGN = /\bdiff\b|\bpatch\b|^@@ |^\+\+\+ |^--- |local:\/\/|pr:\/\//im;

type TaskInput = { context?: string; tasks?: { name?: string; agent?: string; task?: string }[] };
type ToolCallEvent = { toolName: string; input: TaskInput };

export default function reviewerDiffGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event: ToolCallEvent) => {
		if (event.toolName !== "task") return;
		const missing = reviewersWithoutDiff(event.input);
		if (missing.length === 0) return;
		return {
			block: true,
			reason: `No diff supplied to ${missing.join(", ")}: a reviewer needs the diff inline or as a local:// path, and would only report BLOCKED. Nothing in this call was started; resend it with the diff.`,
		};
	});
	pi.setLabel("Reviewer diff guard");
}

export function reviewersWithoutDiff(input: TaskInput): string[] {
	const context = input.context ?? "";
	return (input.tasks ?? [])
		.filter((task) => REVIEWERS[task.agent ?? ""] && !DIFF_SIGN.test(`${context}\n${task.task ?? ""}`))
		.map((task) => task.name ?? task.agent ?? "reviewer");
}
