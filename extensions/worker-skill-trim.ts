/**
 * Drops the <skills> catalog from subagent system prompts. Workers can still load a skill by name
 * through skill://<name>; the main session keeps its catalog.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

type StartEvent = { systemPrompt?: string | string[] };
type ChildContext = { agent?: { kind?: string } };

const SKILLS_CATALOG = /<skills>[\s\S]*?<\/skills>\n?/g;

export default function workerSkillTrim(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event: StartEvent, ctx: ChildContext) => {
		if (ctx.agent?.kind !== "sub" || event.systemPrompt === undefined) return;
		const systemPrompt = withoutSkillsCatalog(event.systemPrompt);
		if (systemPrompt === event.systemPrompt) return;
		return { systemPrompt };
	});
}

export function withoutSkillsCatalog(prompt: string | string[]): string | string[] {
	if (typeof prompt === "string") return prompt.replace(SKILLS_CATALOG, "");
	const blocks = prompt.map(block => block.replace(SKILLS_CATALOG, ""));
	return blocks.some((block, index) => block !== prompt[index]) ? blocks : prompt;
}
