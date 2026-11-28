// Refuses a task call that spawns a reviewer with nothing to review: the reviewer would only report
// `BLOCKED: no diff supplied`. Any sign of a diff (the word, a hunk, a local:// or pr:// path) lets it through,
// and so does a README or whole-repo review, which reads the files as they stand.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export const REVIEWERS: Record<string, true> = { "readonly-reviewer": true, "review-high": true, "review-low": true };
const DIFF_SIGN = /\bdiff\b|\bpatch\b|^@@ |^\+\+\+ |^--- |local:\/\/|pr:\/\//im;
// The scope word and the repo word may sit on different lines (context, then task), but only this close together:
// an unbounded gap would pass any diffless review that says "full" early and "repo" late.
const SCOPE_TO_REPO_MAX_CHARS = 60;
const STANDING_FILES_SIGN = new RegExp(`\\bREADME\\b|\\b(whole|entire|full|comprehensive)\\b[\\s\\S]{0,${SCOPE_TO_REPO_MAX_CHARS}}\\b(repo|repository|codebase)\\b`, "i");

type TaskInput = { context?: string; tasks?: { name?: string; agent?: string; task?: string }[] };
type ToolCallEvent = { toolName: string; input: TaskInput };

export default function reviewerDiffGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event: ToolCallEvent) => {
		if (event.toolName !== "task") return;
		const missing = reviewersWithoutTarget(event.input);
		if (missing.length === 0) return;
		return {
			block: true,
			reason: `No diff supplied to ${missing.join(", ")}: a reviewer needs the diff inline or as a local:// path, or a task that names a README or whole-repo review, and would only report BLOCKED. Nothing in this call was started; resend it with the diff.`,
		};
	});
	pi.setLabel("Reviewer diff guard");
}

export function reviewersWithoutTarget(input: TaskInput): string[] {
	const context = input.context ?? "";
	return (input.tasks ?? [])
		.filter((task) => REVIEWERS[task.agent ?? ""] && !hasReviewTarget(`${context}\n${task.task ?? ""}`))
		.map((task) => task.name ?? task.agent ?? "reviewer");
}

function hasReviewTarget(assignment: string): boolean {
	return DIFF_SIGN.test(assignment) || STANDING_FILES_SIGN.test(assignment);
}
