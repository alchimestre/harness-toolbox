// Crossroads survey CLI. Run: bun src/crossroads/survey.ts <command> ...
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, globSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jevBackend } from "./backend.ts";
import type { BenchCase } from "./bench.ts";
import { readJsonl, runCase, scoreBenchDir, writeBench } from "./bench.ts";
import type { Pick } from "./extract.ts";
import { attachPicks, codeUnits, promptUnits } from "./extract.ts";
import type { Sample } from "./pilot.ts";
import { runPilot } from "./pilot.ts";
import type { CandidateRecord, RunDiff } from "./records.ts";
import { applyHumanEdits, buildRecords, carryForward, classify, diffRuns, gateStatus, rank } from "./records.ts";
import { renderReport } from "./report.ts";

const CONCURRENCY = 8;
const RUNS_DIR = join(".scratch", "crossroads");
const USAGE = `usage:
  survey <target-repo> [--picks picks.jsonl]   extract, classify, rank; writes <target>/.scratch/crossroads/<date>/
  report <run-dir>                             re-apply human edits in candidates.jsonl and regenerate report.md
  pilot <run-dir> <id> <samples.jsonl>         pilot one pilot-ready record
  bench <run-dir> <id> <cases.jsonl>           write bench/<id>/ for a record that passed its pilot
  bench-run <bench-dir> <model|current> <case-id> <rep 1-5>
  bench-score <bench-dir> <results.jsonl>`;

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void> | void> = {
	survey,
	report: (args) => saveRun(args[0], loadRecords(args[0]), null),
	pilot,
	bench,
	"bench-run": async ([dir, decider, caseId, rep]) => console.log(JSON.stringify(await runCase(dir, decider, caseId, Number(rep), jevBackend()))),
	"bench-score": ([dir, results]) => console.log(JSON.stringify(scoreBenchDir(dir, results), null, 2)),
};
const handler = commands[command ?? ""];
if (!handler) {
	console.error(USAGE);
	process.exit(2);
}
await handler(args);

async function survey(args: string[]): Promise<void> {
	const target = resolve(args[0] ?? ".");
	const picksPath = flag(args, "--picks");
	const picks = picksPath ? readJsonl<Pick>(picksPath) : [];
	const units = attachPicks([...promptUnits(target, installedAgentDirs(target)), ...codeUnits(target)], picks);
	const backend = jevBackend();
	const classified = await classify(backend, units, CONCURRENCY);
	const failures = classified.filter((item) => item.error);
	if (failures.length === classified.length && failures.length) throw new Error(`every classification failed: ${failures[0].error}`);
	const runsRoot = join(target, RUNS_DIR);
	const runDir = join(runsRoot, new Date().toISOString().slice(0, 10));
	const previousDir = previousRun(runsRoot, runDir);
	const previous = previousDir ? loadRecords(previousDir) : [];
	const stateDir = existsSync(join(runDir, "candidates.jsonl")) ? runDir : previousDir;
	const state = stateDir === previousDir ? previous : loadRecords(runDir);
	const records = buildRecords(classified, backend, new Set(state.map((record) => record.id)));
	carryForward(records, state);
	excludeScratch(target);
	const firstError = failures[0] ? ` First failure: ${failures[0].error}.` : "";
	const summary = `${units.length} units extracted from ${target}; ${classified.length - failures.length} classified, ${failures.length} failed;${firstError} ${records.length} records above the review floor.`;
	saveRun(runDir, records, previousDir ? diffRuns(records, previous) : null, summary);
	console.log(`${summary}\n${join(runDir, "report.md")}`);
}

function saveRun(runDir: string, records: CandidateRecord[], diff: RunDiff | null, summary = `${records.length} records.`): void {
	records.forEach(applyHumanEdits);
	const ranked = rank(records);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(join(runDir, "candidates.jsonl"), ranked.map((record) => JSON.stringify(record)).join("\n") + "\n");
	const passing = ranked.filter((record) => gateStatus(record) !== "fail").length;
	writeFileSync(join(runDir, "report.md"), renderReport(ranked, diff, `${summary} ${passing} not rejected.`));
}

async function pilot([runDir, id, samplesPath]: string[]): Promise<void> {
	const records = loadRecords(runDir);
	const record = findRecord(records, id);
	const outcome = await runPilot(record, readJsonl<Sample>(samplesPath), jevBackend());
	record.pilot = outcome.result;
	saveRun(runDir, records, null);
	const disagreementsPath = join(runDir, `pilot-${id}-disagreements.jsonl`);
	if (outcome.disagreements.length) writeFileSync(disagreementsPath, outcome.disagreements.map((d) => JSON.stringify(d)).join("\n") + "\n");
	else rmSync(disagreementsPath, { force: true });
	console.log(JSON.stringify(outcome.result));
}

function bench([runDir, id, casesPath]: string[]): void {
	const record = findRecord(loadRecords(runDir), id);
	const benchDir = join(runDir, "bench", id);
	writeBench(record, readJsonl<BenchCase>(casesPath), benchDir);
	console.log(benchDir);
}

function loadRecords(runDir: string): CandidateRecord[] {
	return readJsonl<CandidateRecord>(join(runDir, "candidates.jsonl"));
}

function findRecord(records: CandidateRecord[], id: string): CandidateRecord {
	const record = records.find((candidate) => candidate.id === id);
	if (!record) throw new Error(`no record ${id}`);
	return record;
}

function previousRun(runsRoot: string, runDir: string): string | undefined {
	if (!existsSync(runsRoot)) return undefined;
	const current = runDir.slice(runsRoot.length + 1);
	const earlier = readdirSync(runsRoot).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name) && name < current).sort();
	const latest = earlier.at(-1);
	if (latest) return join(runsRoot, latest);
	return existsSync(join(runDir, "candidates.jsonl")) ? runDir : undefined;
}

// Keeps run output out of the target's git without touching its .gitignore.
function excludeScratch(target: string): void {
	const ignored = spawnSync("git", ["check-ignore", "-q", join(RUNS_DIR, "x")], { cwd: target });
	if (ignored.status !== 1) return;
	const gitDir = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: target, encoding: "utf8" }).stdout.trim();
	const exclude = resolve(target, gitDir, "info", "exclude");
	mkdirSync(resolve(exclude, ".."), { recursive: true });
	const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
	appendFileSync(exclude, `${current.endsWith("\n") || !current ? "" : "\n"}.scratch/\n`);
}

function flag(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
}

// omp agent sources, lowest precedence first: bundled, plugins, user, project.
function installedAgentDirs(target: string): string[] {
	const ompHome = join(homedir(), ".omp");
	const bundled = mkdtempSync(join(tmpdir(), "crossroads-agents-"));
	const unpack = spawnSync("omp", ["agents", "unpack", "--dir", bundled, "--force"], { encoding: "utf8" });
	if (unpack.status !== 0) console.error(`bundled agents skipped: omp agents unpack failed (${unpack.error?.message ?? unpack.stderr.trim()})`);
	const plugins = globSync("plugins/cache/plugins/*/agents", { cwd: ompHome }).map((dir) => join(ompHome, dir)).sort();
	const dirs = [bundled, ...plugins, join(ompHome, "agent", "agents"), join(target, ".omp", "agents")];
	return dirs.filter((dir) => existsSync(dir));
}
