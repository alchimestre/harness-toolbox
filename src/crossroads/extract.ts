import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export type Source = "prompt text" | "harness code" | "session" | "other repo";
export type CrossroadsClass = "llm closed choice" | "prompt instruction" | "harness branch" | "rule pretending to judge";

export type Unit = {
	source: Source;
	class: CrossroadsClass;
	location: string;
	heading: string;
	excerpt: string; // identity text: what a human would recognise as the decision point
	context: string; // what the classifier reads
	options?: Record<string, string>;
	occurrences?: Occurrences;
	endLine?: number; // code units: last line of the matched statement
	branchesOnAnswer?: boolean;
};

export type Occurrences = { count: number; samples: Pick[] };
export type Pick = { kind: string; choice: string; input?: string; session?: string; callId?: string };

const IGNORED = /(^|\/)(node_modules|\.git|\.scratch|dist|build|vendor|forks)\//;
const TEST_FILE = /\/(tests?|__tests__|spec|fixtures)\/|\.(test|spec)\.[jt]sx?$|\/test_[^/]*\.py$|_test\.py$|\/conftest\.py$/;
const MIN_BLOCK_CHARS = 20;
const MIN_CONDITION_ITEMS = 2;
const MAX_CONTEXT_CHARS = 6_000;
const SAMPLES_PER_KIND = 5;

const LEXICON =
	/\b(decide|choose|pick|whether|prefer|otherwise|unless)\b|\b(if|when) (the )?(user|task|request)\b|\b\w+ or \w+\b/i;
const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+|^\s*\|/;
const CONDITION_LEAD = /^(\*\*[^*]{1,60}\*\*:?|`[^`]{1,60}`[^:.]{0,40}:|[^:.`]{1,40}:)\s|^(when|if|only when|unless)\b|^[^,.]{1,40},\s*(only )?(when|if|unless)\b/i;
const HEADING = /^(#+)\s*(.*)/;
const BOLD_LEAD = /^\*\*[^*]{1,60}(\*\*:|:\*\*)\s/;

export function listFiles(root: string, pattern: string): string[] {
	return globSync(pattern, { cwd: root }).filter((path) => !IGNORED.test(`/${path}`)).sort();
}

export function promptFiles(root: string): string[] {
	const patterns = ["**/SKILL.md", "**/agents/*.md", "**/rules/*.md", "**/AGENTS.md", "**/CLAUDE.md"];
	return [...new Set(patterns.flatMap((pattern) => listFiles(root, pattern)))].sort();
}

export function promptUnits(root: string, installedAgentDirs: string[] = [], installedSkills: Record<string, string> = {}): Unit[] {
	const units: Unit[] = [];
	for (const path of promptFiles(root)) {
		for (const block of markdownBlocks(readFileSync(join(root, path), "utf8"))) {
			if (!block.list && (block.text.length <= MIN_BLOCK_CHARS || !LEXICON.test(block.text))) continue;
			units.push({
				source: "prompt text",
				class: "prompt instruction",
				location: `${path}:${block.line}`,
				heading: block.heading,
				excerpt: block.text,
				context: `${block.heading}\n${block.text}`,
			});
		}
	}
	return [...units, ...routingUnits(root, installedAgentDirs, installedSkills)];
}

type Block = { heading: string; text: string; line: number; list: boolean };
type Group = { starts: number[]; end: number; items: string[]; list: boolean };
type Span = Omit<Block, "heading">;

// shortcut: lists and paragraphs only; nested list levels flatten into the parent list.
export function markdownBlocks(markdown: string): Block[] {
	const lines = markdown.split("\n");
	const blocks: Block[] = [];
	const trail: string[] = [];
	let sectionStart = frontmatterEnd(lines);
	let groups: Group[] = [];
	let fenced = false;
	let group: Group | undefined;
	const flush = () => {
		if (group) groups.push(group);
		group = undefined;
	};
	const closeSection = (end: number) => {
		flush();
		blocks.push(...sectionBlocks(trail.filter(Boolean).join(" > "), lines.slice(sectionStart, end), sectionStart, groups));
		groups = [];
	};
	for (let index = sectionStart; index < lines.length; index++) {
		const line = lines[index];
		if (line.startsWith("```")) fenced = !fenced;
		if (fenced || line.startsWith("```")) continue;
		const heading = line.match(HEADING);
		if (heading) {
			closeSection(index);
			trail.length = heading[1].length - 1;
			trail[heading[1].length - 1] = heading[2].trim();
			sectionStart = index + 1;
			continue;
		}
		if (!line.trim()) {
			flush();
			continue;
		}
		const isItem = LIST_ITEM.test(line);
		if (group && isItem !== group.list && !(group.list && /^\s+/.test(line))) flush();
		group ??= { starts: [], end: index + 1, items: [], list: isItem };
		group.end = index + 1;
		if (isItem || !group.list) {
			group.items.push(line.trim());
			group.starts.push(index + 1);
		} else group.items[group.items.length - 1] += ` ${line.trim()}`;
	}
	closeSection(lines.length);
	return blocks;
}

// sectionLines start at 0-based document index `offset`; groups carry 1-based document lines.
function sectionBlocks(heading: string, sectionLines: string[], offset: number, groups: Group[]): Block[] {
	const spans: Span[] = [];
	const boldLead = (group: Group) => !group.list && BOLD_LEAD.test(group.items[0]);
	// Group end is 1-based, so sectionLines[end - offset] is the first line after it.
	const blankGap = (before: Group, after: Group) => sectionLines.slice(before.end - offset, after.starts[0] - 1 - offset).every((row) => !row.trim());
	for (let index = 0; index < groups.length; ) {
		let run = index;
		while (run < groups.length && boldLead(groups[run]) && (run === index || blankGap(groups[run - 1], groups[run]))) run++;
		if (run - index < MIN_CONDITION_ITEMS) {
			spans.push(...groupSpans(groups[index]));
			index++;
			continue;
		}
		const paragraphs = groups.slice(index, run);
		spans.push({ text: paragraphs.map((paragraph) => paragraph.items.join(" ")).join("\n"), line: paragraphs[0].starts[0], list: true });
		index = run;
	}
	return spans.map((span) => ({ heading, ...span }));
}

function groupSpans(group: Group): Span[] {
	if (!group.list) return [{ text: group.items.join(" "), line: group.starts[0], list: false }];
	const items = group.items.map((item) => item.replace(LIST_ITEM, ""));
	const conditional = items.filter((item) => CONDITION_LEAD.test(item)).length;
	if (conditional >= MIN_CONDITION_ITEMS) return [{ text: group.items.join("\n"), line: group.starts[0], list: true }];
	return group.items.map((item, offset) => ({ text: item, line: group.starts[offset], list: false }));
}

function frontmatterEnd(lines: string[]): number {
	if (lines[0] !== "---") return 0;
	const close = lines.indexOf("---", 1);
	return close === -1 ? 0 : close + 1;
}

export function description(markdown: string): string | undefined {
	const match = markdown.match(/^description:[ \t]*(.*)$((?:\n[ \t]+\S.*)*)/m);
	if (!match) return undefined;
	const blockIndicator = /^[>|][-+]?\s*$/;
	const text = (match[1].replace(blockIndicator, "") + match[2]).replace(/\s+/g, " ").trim();
	return text.replace(/^["']|["']$/g, "") || undefined;
}

// installedAgentDirs: agent definition dirs outside the target, lowest precedence first; installedSkills: name → description.
// The target's own agents and skills win over installed ones.
export function routingUnits(root: string, installedAgentDirs: string[] = [], installedSkills: Record<string, string> = {}): Unit[] {
	const catalogs: Array<[string, string, (path: string) => string, Record<string, string>]> = [
		["agent", "**/agents/*.md", (path) => basename(path, ".md"), {}],
		["skill", "**/SKILL.md", (path) => basename(dirname(path)), installedSkills],
	];
	const units: Unit[] = [];
	for (const [kind, pattern, nameOf, installed] of catalogs) {
		const options: Record<string, string> = { ...installed };
		const sources = kind === "agent" ? [...installedAgentDirs.map((dir) => [dir, "*.md"]), [root, pattern]] : [[root, pattern]];
		for (const [dir, glob] of sources) {
			for (const path of listFiles(dir, glob)) {
				const text = description(readFileSync(join(dir, path), "utf8"));
				if (text) options[nameOf(path)] = text;
			}
		}
		if (Object.keys(options).length < MIN_CONDITION_ITEMS) continue;
		units.push(catalogUnit(kind, pattern, options));
	}
	return units;
}

export function catalogUnit(kind: string, location: string, options: Record<string, string>): Unit {
	const lines = Object.entries(options).map(([name, text]) => `- ${name}: ${text}`);
	return {
		source: location === "session" ? "session" : "prompt text",
		class: "llm closed choice",
		location,
		heading: `${kind} routing`,
		excerpt: `Choose which ${kind} handles the request.`,
		context: `Choose which ${kind} handles the request, from:\n${lines.join("\n")}`.slice(0, MAX_CONTEXT_CHARS),
		options,
	};
}

// Transcript picks attach to the routing catalog of the same kind; a kind without a catalog gets its own unit.
export function attachPicks(units: Unit[], picks: Pick[]): Unit[] {
	const byKind = Map.groupBy(picks, (pick) => pick.kind);
	const extra: Unit[] = [];
	for (const [kind, group] of byKind) {
		const occurrences = { count: group.length, samples: group.slice(0, SAMPLES_PER_KIND) };
		const catalog = units.find((unit) => unit.heading === `${kind} routing`);
		if (catalog) {
			catalog.occurrences = occurrences;
			continue;
		}
		const seen = Object.fromEntries([...new Set(group.map((pick) => pick.choice))].map((choice) => [choice, choice]));
		extra.push({ ...catalogUnit(kind, "session", seen), occurrences });
	}
	return [...units, ...extra];
}

const TEXT_SUBJECT = /\b\w*(prompt|message|assignment|instruction|request|task|text|content|body|title|description|comment|query)s?\b/i;
const JUDGING_TEST = /\.test\(|re\.(search|match|fullmatch)\(|\.match\(|\.includes\(|\bin\s+[A-Z_]{2,}|\bin\s*[[({]|[=!]==?\s*["'`]|\.startsWith\(|\.endswith\(|\.startswith\(|\.lower\(\)|\.toLowerCase\(\)/;
const CLOSED_ANSWER = /response_format|json_schema|z\.enum|Literal\[|generateObject|tool_choice|yes or no|one of:|respond with only|classify|[=!]==?\s*["'](yes|no|true|false)["']/i;
const PROMPT_ARGUMENT = /\b(messages|prompt|system)\s*[:=]/;
const HARNESS_PATH = /^(extensions|hooks)\//;

const LANGUAGES = [
	{ name: "TypeScript", glob: "**/*.{ts,tsx,mts,cts,js,mjs}", branch: ["if_statement", "ternary_expression", "switch_statement"], call: "call_expression", fn: ["function_declaration", "arrow_function", "method_definition", "function_expression"] },
	{ name: "Python", glob: "**/*.py", branch: ["if_statement", "conditional_expression", "match_statement"], call: "call", fn: ["function_definition"] },
];

type Match = { ruleId: string; text: string; file: string; range: { start: { line: number }; end: { line: number } } };

export function codeUnits(root: string): Unit[] {
	return LANGUAGES.flatMap((language) => {
		const files = listFiles(root, language.glob).filter((path) => !TEST_FILE.test(`/${path}`));
		if (!files.length) return [];
		const matches = astMatches(root, language, files);
		return [...branchUnits(matches), ...llmCallUnits(matches)];
	});
}

function astMatches(root: string, language: (typeof LANGUAGES)[number], files: string[]): Match[] {
	const kinds = (ids: string[]) => `{any: [${ids.map((id) => `{kind: ${id}}`).join(", ")}]}`;
	const rules = [
		`id: branch\nlanguage: ${language.name}\nrule: ${kinds(language.branch)}`,
		`id: call\nlanguage: ${language.name}\nrule: {kind: ${language.call}}`,
		`id: fn\nlanguage: ${language.name}\nrule: ${kinds(language.fn)}`,
	].join("\n---\n");
	const result = spawnSync("ast-grep", ["scan", "--inline-rules", rules, "--json=stream", ...files], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 });
	if (result.error) throw new Error(`ast-grep unavailable: ${result.error.message} (brew install ast-grep)`);
	return result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Match);
}

function enclosing(matches: Match[], target: Match): Match | undefined {
	const inside = (fn: Match) => fn.file === target.file && fn.range.start.line <= target.range.start.line && fn.range.end.line >= target.range.end.line;
	return matches.filter((m) => m.ruleId === "fn" && inside(m)).sort((a, b) => a.text.length - b.text.length)[0];
}

const STRING_LITERAL = /(["'`])(?:\\.|(?!\1).)*\1/g;

function branchUnits(matches: Match[]): Unit[] {
	return matches
		.filter((m) => m.ruleId === "branch")
		.filter((m) => {
			const condition = m.text.split("\n")[0];
			const code = condition.replace(STRING_LITERAL, '""');
			return TEXT_SUBJECT.test(code) && JUDGING_TEST.test(condition);
		})
		.map((m) => {
			const harness = HARNESS_PATH.test(m.file);
			return codeUnit(matches, m, harness ? "harness code" : "other repo", harness ? "harness branch" : "rule pretending to judge");
		});
}

function llmCallUnits(matches: Match[]): Unit[] {
	return matches
		.filter((m) => m.ruleId === "call" && PROMPT_ARGUMENT.test(m.text))
		.filter((m) => CLOSED_ANSWER.test(scopeText(matches, m)) || branchesOnAnswer(scopeText(matches, m), m.text))
		.filter((m, index, calls) => !calls.some((outer, j) => j !== index && outer.file === m.file && outer.text.length > m.text.length && outer.text.includes(m.text)))
		.map((m) => llmCallUnit(matches, m));
}

function llmCallUnit(matches: Match[], m: Match): Unit {
	const unit = codeUnit(matches, m, HARNESS_PATH.test(m.file) ? "harness code" : "other repo", "llm closed choice");
	const scope = scopeText(matches, m);
	const labels = schemaLabels(scope);
	unit.branchesOnAnswer = branchesOnAnswer(scope, m.text);
	if (labels.length >= MIN_CONDITION_ITEMS) unit.options = Object.fromEntries(labels.map((label) => [label, ""]));
	return unit;
}

function scopeText(matches: Match[], m: Match): string {
	return enclosing(matches, m)?.text ?? m.text;
}

const LABEL_SCHEMA = /z\.enum\(\s*\[([^\]]*)\]|Literal\[([^\]]*)\]|["']?enum["']?\s*[:=]\s*\[([^\]]*)\]/;
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;

// shortcut: reads the first enum schema inside the enclosing function; a schema declared at module level is missed, follow the identifier when that costs labels.
export function schemaLabels(code: string): string[] {
	const schema = code.match(LABEL_SCHEMA);
	const members = schema?.[1] ?? schema?.[2] ?? schema?.[3] ?? "";
	return [...members.matchAll(QUOTED)].map((quoted) => quoted[2]);
}

const ASSIGNED_NAME = /(?:(\w+)|\{\s*(\w+)[^}]*\})\s*(?::[^=\n]+)?=\s*(?:await\s+)?$/;

// shortcut: follows the variable the call is assigned to, by name, inside the enclosing function; an answer returned raw or passed on is not seen, trace data flow when recall matters.
export function branchesOnAnswer(scope: string, call: string): boolean {
	const callStart = scope.indexOf(call);
	if (callStart === -1) return false;
	const assigned = scope.slice(0, callStart).match(ASSIGNED_NAME);
	const name = assigned?.[1] ?? assigned?.[2];
	if (!name) return false;
	const afterCall = scope.slice(callStart + call.length);
	const branchOnName = new RegExp(`\\b(if|elif|switch|match|while|case)\\b[^\\n]*\\b${name}\\b|\\b${name}\\b[^\\n;]*?(===?|!==?|\\bin\\b|\\.(includes|startsWith|startswith|test)\\()`);
	return branchOnName.test(afterCall);
}

// Commits that changed the unit's lines, the creating commit included; null outside git, for lines git cannot trace,
// and for a file with uncommitted edits, whose working-tree line numbers no longer match HEAD.
export function lineChurn(root: string, unit: { location: string; endLine?: number }): number | null {
	const [, file, startLine] = unit.location.match(/^(.*):(\d+)$/) ?? [];
	if (!file || unit.endLine === undefined) return null;
	const clean = spawnSync("git", ["diff", "--quiet", "HEAD", "--", file], { cwd: root });
	if (clean.status !== 0) return null;
	const log = spawnSync("git", ["log", "--no-patch", "--format=%H", `-L${startLine},${unit.endLine}:${file}`], { cwd: root, encoding: "utf8" });
	return log.status === 0 ? log.stdout.split("\n").filter(Boolean).length : null;
}

function codeUnit(matches: Match[], m: Match, source: Source, unitClass: CrossroadsClass): Unit {
	const fn = enclosing(matches, m);
	return {
		source,
		class: unitClass,
		location: `${m.file}:${m.range.start.line + 1}`,
		endLine: m.range.end.line + 1,
		heading: fn?.text.split("\n")[0].trim() ?? relative(".", m.file),
		excerpt: m.text.split("\n")[0].trim(),
		context: (fn?.text ?? m.text).slice(0, MAX_CONTEXT_CHARS),
	};
}
