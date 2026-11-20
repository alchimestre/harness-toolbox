// Keeps the advisor's *configured* model in a different family from the session's live model.
// Config cannot express that: modelRoles.advisor is static while the primary moves between
// providers on fallback. A fallback chain can still land a review in the primary's family
// after this check; chain entries are shared with the primary, so the guard cannot see or
// rewrite them. Keep primary-family models out of the advisor's chain by hand.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

const PREFERENCE = [
	"openai-codex/gpt-6.2-sol:high",
	// Not opus: its fallback chain returns to gpt-6.2-sol, the primary family in the case this entry serves.
	"anthropic/claude-sonnet-5-5:high",
	"deepseek/deepseek-v4-pro:high",
];

type Model = { id: string };
type Facade = {
	current(): Model | undefined;
	resolve(spec: string): Model | undefined;
	family(model: Model): string;
};
type SessionContext = { models: Facade; agent?: { kind?: string } };

export default function advisorCrossFamily(pi: ExtensionAPI): void {
	const roles = lookup("modelRoles");
	if (!roles) return;

	const pickContrast = (ctx: SessionContext) => {
		const primary = ctx.models.current();
		if (!primary) return undefined;
		const primaryFamily = ctx.models.family(primary);
		for (const spec of PREFERENCE) {
			const candidate = ctx.models.resolve(spec.replace(/:\w+$/, ""));
			if (!candidate) continue;
			const family = ctx.models.family(candidate);
			if (family !== primaryFamily) return { spec, family };
		}
		return undefined;
	};

	const align = (ctx: SessionContext) => {
		const target = pickContrast(ctx);
		if (!target) return;
		const configured = roles.get(pi.pi.settings) ?? {};
		const current = ctx.models.resolve(String(configured.advisor ?? "").replace(/:\w+$/, ""));
		// Compare resolved families, not selectors: the same family under two ids is still a collision.
		if (current && ctx.models.family(current) === target.family) return;
		roles.override(pi.pi.settings, { ...configured, advisor: target.spec });
	};

	pi.on("session_start", (_event, ctx) => {
		if (ctx.agent?.kind === "sub") return;
		align(ctx);
	});
	pi.on("retry_fallback_applied", (_event, ctx) => {
		// A subagent shares the settings store with its parent; its fallback must not rewrite the parent's advisor.
		if (ctx.agent?.kind === "sub") return;
		align(ctx);
	});
}
