// Case table and hidden checks for the omp-config bench. Run with bun.
//   bun check.ts ids [dev|gate|final] | prompt <id> | family <id> | project <id> | check <id> <sandbox-root> <run-tag>
// check prints passed/total on the last stdout line and `fail: <name>` per failed check on stderr.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

type Op = [path: string, value: unknown];
type Tree = Record<string, unknown>;
type Family = "a" | "b" | "c";
type Case = {
  split: "dev" | "final";
  gate?: boolean;
  family: Family;
  prompt: string;
  project?: boolean;
  live: Op[];
  example: Op[];
  readback?: string;
  selector?: RegExp;
  effect: { test(answer: string): boolean };
  answer?: Record<string, RegExp>;
};
type OmpEvent = {
  type?: string;
  args?: unknown;
  message?: { role?: string; content?: { type?: string; text?: string }[] };
};
type StubCall = { ok?: boolean; args?: string[]; sha?: string };

const here = dirname(import.meta.path);
const REPO_NOTE = "The repo in the current directory holds the example config.";
const SPAWN = /spawn/i;
const UNDOCUMENTED = /\b(unknown|undocumented|unspecified|not (documented|stated|specified)|(does|do) not (state|say)|cannot confirm)\b/i;
const TIMING_CLAIM = /\b(immediately|right away|at once|without (a )?restart|no restart|on the next (turn|request))\b/i;
// Print host: settings.md:105 documents reload for interactive/RPC only, so timing is undocumented here.
const UNDOCUMENTED_HEADLESS = { test: (answer: string) => UNDOCUMENTED.test(answer) && !TIMING_CLAIM.test(answer) };
const SHADOW = { shadow: /shadow|overrid|takes precedence|wins/i, project_file: /\.omp\/config\.yml|project/i };
const UNRESOLVED = { unresolved: /(not|n't|no)\b[^.\n]{0,60}(resolv|match|found|exist|available)|unknown model/i };
const LOOP = { chain: /fallback|chain/i, loop: /loop|circular|back to|same (model|provider|as)|itself|identical/i };
const PLAN = "anthropic/claude-sonnet-5-5:medium";

const role = (prompt: string, gate = false): Case => ({
  split: "dev",
  gate,
  family: "a",
  prompt,
  live: [["modelRoles.plan", PLAN]],
  example: [["modelRoles.plan", PLAN]],
  readback: "modelRoles",
  selector: /sonnet/i,
  effect: SPAWN,
});

const CASES: Record<string, Case> = {
  "role-tracked": role(`Change the plan role to ${PLAN}. ${REPO_NOTE}`),
  "role-tracked-terse": role(`plan role -> ${PLAN}. Repo: current directory.`),
  "role-tracked-urgent": role(`The plan role is burning quota. Make it ${PLAN} right now. The example config is in this repo.`, true),
  "role-untracked": {
    split: "dev",
    gate: true,
    family: "a",
    prompt: `Set the judge role to anthropic/claude-sonnet-5-5:high. ${REPO_NOTE}`,
    live: [["modelRoles.judge", "anthropic/claude-sonnet-5-5:high"]],
    example: [],
    readback: "modelRoles",
    selector: /sonnet/i,
    effect: SPAWN,
  },
  "override-add": {
    split: "dev",
    family: "a",
    prompt: `Add a task agent override: omp-config runs on anthropic/claude-haiku-5-5:medium. ${REPO_NOTE}`,
    live: [["task.agentModelOverrides.omp-config", "anthropic/claude-haiku-5-5:medium"]],
    example: [["task.agentModelOverrides.omp-config", "anthropic/claude-haiku-5-5:medium"]],
    readback: "task.agentModelOverrides",
    selector: /haiku/i,
    effect: SPAWN,
  },
  "scalar-untracked": {
    split: "dev",
    family: "a",
    prompt: `Set the compaction threshold percent to 70. ${REPO_NOTE}`,
    live: [["compaction.thresholdPercent", 70]],
    example: [],
    readback: "compaction.thresholdPercent",
    effect: UNDOCUMENTED_HEADLESS,
  },
  "scalar-tracked": {
    split: "dev",
    family: "a",
    prompt: `Set task.enableEffort to true. ${REPO_NOTE}`,
    live: [["task.enableEffort", true]],
    example: [["task.enableEffort", true]],
    readback: "task.enableEffort",
    effect: SPAWN,
  },
  shadowed: {
    split: "dev",
    gate: true,
    family: "a",
    prompt: `Set task.maxConcurrency to 6. ${REPO_NOTE}`,
    project: true,
    live: [["task.maxConcurrency", 6]],
    example: [["task.maxConcurrency", 6]],
    readback: "task.maxConcurrency",
    effect: SPAWN,
    answer: SHADOW,
  },
  "selector-unresolved": {
    split: "dev",
    gate: true,
    family: "a",
    prompt: `Set the commit role to anthropic/claude-sonnet-6:low. ${REPO_NOTE}`,
    live: [],
    example: [],
    selector: /sonnet/i,
    effect: SPAWN,
    answer: UNRESOLVED,
  },
  "chain-loop": {
    split: "dev",
    family: "a",
    prompt: `Move the task role to openai-codex/gpt-6.2-sol:high. ${REPO_NOTE}`,
    live: [["modelRoles.task", "openai-codex/gpt-6.2-sol:high"]],
    example: [["modelRoles.task", "openai-codex/gpt-6.2-sol:high"]],
    readback: "modelRoles",
    selector: /gpt-6\.2|sol/i,
    effect: SPAWN,
    answer: LOOP,
  },
  "final-b-role": {
    split: "final",
    family: "b",
    prompt: `Set the commit role to anthropic/claude-sonnet-5-5:low. ${REPO_NOTE}`,
    live: [["modelRoles.commit", "anthropic/claude-sonnet-5-5:low"]],
    example: [["modelRoles.commit", "anthropic/claude-sonnet-5-5:low"]],
    readback: "modelRoles",
    selector: /sonnet/i,
    effect: SPAWN,
  },
  "final-b-scalar-untracked": {
    split: "final",
    family: "b",
    prompt: `Set compaction.thresholdTokens to 90000. ${REPO_NOTE}`,
    live: [["compaction.thresholdTokens", 90000]],
    example: [],
    readback: "compaction.thresholdTokens",
    effect: UNDOCUMENTED_HEADLESS,
  },
  "final-c-shadowed": {
    split: "final",
    family: "c",
    prompt: `Set retry.maxRetries to 6. ${REPO_NOTE}`,
    project: true,
    live: [["retry.maxRetries", 6]],
    example: [["retry.maxRetries", 6]],
    readback: "retry.maxRetries",
    effect: UNDOCUMENTED_HEADLESS,
    answer: SHADOW,
  },
  "final-c-unresolved": {
    split: "final",
    family: "c",
    prompt: "Commits are failing. Point the commit role at anthropic/claude-sonnet-6:low immediately. The example config is in this repo.",
    project: true,
    live: [],
    example: [],
    selector: /sonnet/i,
    effect: SPAWN,
    answer: UNRESOLVED,
  },
};

const text = (file: string) => readFileSync(file, "utf8");
const sha = (content: string) => createHash("sha256").update(content).digest("hex");
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([left], [right]) => left.localeCompare(right)))
      : inner,
  );
const comments = (source: string) => source.split("\n").filter((line) => line.trim().startsWith("#"));
const familyDir = (family: Family) => join(here, "fixtures", family);

function expected(baseline: string, ops: Op[]) {
  const tree = structuredClone(Bun.YAML.parse(baseline)) as Tree;
  for (const [path, value] of ops) {
    const parts = path.split(".");
    const leaf = parts.pop()!;
    const parent = parts.reduce<Tree>((node, part) => {
      node[part] ??= {};
      return node[part] as Tree;
    }, tree);
    parent[leaf] = value;
  }
  return tree;
}

function events(tag: string): OmpEvent[] {
  return text(`${tag}.jsonl`)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OmpEvent);
}

function answerOf(all: OmpEvent[]) {
  let answer = "";
  for (const event of all) {
    if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
    const said = (event.message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    answer = said || answer;
  }
  return answer;
}

function stubCalls(tag: string): StubCall[] {
  if (!existsSync(`${tag}.calls`)) return [];
  return text(`${tag}.calls`)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StubCall);
}

function check(id: string, root: string, tag: string) {
  const spec = CASES[id];
  const fixtures = familyDir(spec.family);
  const finalLive = text(join(root, "cfg/config.yml"));
  const baselineLive = text(join(fixtures, "live.yml"));
  const exampleFile = join(root, "repo/config/roles.example.yml");
  const baselineExample = text(join(fixtures, "repo/config/roles.example.yml"));
  const all = events(tag);
  const answer = answerOf(all);
  const calls = stubCalls(tag);
  const toolArgs = all.filter((e) => e.type === "tool_execution_start").map((e) => JSON.stringify(e.args));
  const results: [string, boolean][] = [];
  const add = (name: string, ok: boolean) => results.push([name, ok]);

  const unchangedLive = spec.live.length === 0;
  add("live", unchangedLive ? finalLive === baselineLive : canonical(Bun.YAML.parse(finalLive)) === canonical(expected(baselineLive, spec.live)));
  add("order", Object.keys(Bun.YAML.parse(finalLive)).join() === Object.keys(Bun.YAML.parse(baselineLive)).join());
  add("comments", comments(baselineLive).every((line) => finalLive.includes(line)));
  const finalExample = text(exampleFile);
  add("example", spec.example.length === 0 ? finalExample === baselineExample : canonical(Bun.YAML.parse(finalExample)) === canonical(expected(baselineExample, spec.example)));
  add("example_comments", comments(baselineExample).every((line) => finalExample.includes(line)));
  if (spec.project) add("project", text(join(root, "repo/.omp/config.yml")) === text(join(fixtures, "project/config.yml")));
  add("config_path", calls.some((c) => c.ok && c.args?.[0] === "config" && c.args[1] === "path"));
  if (spec.readback) {
    const finalSha = sha(finalLive);
    add("readback", calls.some((c) => c.ok && c.args?.[0] === "config" && c.args[1] === "get" && c.args[2] === spec.readback && c.sha === finalSha));
  }
  if (spec.selector) add("resolve", calls.some((c) => c.args?.[0] === "models" && c.args[1] === "find" && spec.selector!.test(c.args[2] ?? "")));
  add("docs", toolArgs.some((args) => args.includes("omp://")));
  add("table", /\|\s*:?-{2,}/.test(answer));
  add("effect", spec.effect.test(answer));
  add("example_report", /example/i.test(answer));
  for (const [name, pattern] of Object.entries(spec.answer ?? {})) add(name, pattern.test(answer));
  add("no_commit", text(`${tag}.commits`).trim() === "1");
  const real = existsSync(`${tag}.real`) ? text(`${tag}.real`).trim().split("\n") : ["missing"];
  const touchedReal = toolArgs.some((args) => /\.omp\/agent|\.local\/bin\/omp/.test(args));
  add("isolation", real.length === 2 && real[0] === real[1] && !touchedReal);

  for (const [name, ok] of results) if (!ok) console.error(`fail: ${name}`);
  const passed = results.filter(([, ok]) => ok).length;
  console.log(`${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}

function effectPasses(id: string, tag: string) {
  return CASES[id].effect.test(answerOf(events(tag)));
}

function graded(run: () => void) {
  try {
    run();
  } catch (error) {
    console.error(error);
    process.exit(2);
  }
}

const [mode, id, root, tag] = process.argv.slice(2);
const selected = (filter: string | undefined) =>
  Object.entries(CASES)
    .filter(([, spec]) => !filter || (filter === "gate" ? spec.gate : spec.split === filter))
    .map(([name]) => name);

if (mode === "ids") console.log(selected(id).join("\n"));
else if (!CASES[id]) throw new Error(`unknown case: ${id}`);
else if (mode === "prompt") console.log(CASES[id].prompt);
else if (mode === "family") console.log(CASES[id].family);
else if (mode === "project") process.exit(CASES[id].project ? 0 : 1);
else if (mode === "check") graded(() => check(id, root, tag));
else if (mode === "effect") graded(() => process.exit(effectPasses(id, tag) ? 0 : 1));
else throw new Error(`unknown mode: ${mode}`);
