import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export const READONLY_AGENTS: Record<string, true> = {
	"readonly-reviewer": true,
	"review-high": true,
	"review-low": true,
};

// Allowlist, not denylist: an action the lsp tool gains later must stay blocked until listed here.
// A Set, not a Record: `constructor` or `toString` as the action must not pass.
export const LOOKUP_ACTIONS = new Set([
	"definition",
	"type_definition",
	"implementation",
	"references",
	"hover",
	"symbols",
	"diagnostics",
	"status",
	"capabilities",
]);

export default function readonlyLsp(pi: ExtensionAPI): void {
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "lsp") return;
		const agentName = ctx.agent?.name ?? "";
		if (!Object.hasOwn(READONLY_AGENTS, agentName)) return;
		const action = event.input.action;
		if (typeof action === "string" && LOOKUP_ACTIONS.has(action)) return;
		const allowed = [...LOOKUP_ACTIONS].join(", ");
		return { block: true, reason: `${agentName} is read-only: lsp ${action} can write files. Allowed actions: ${allowed}.` };
	});

	pi.setLabel("Read-only LSP");
}
