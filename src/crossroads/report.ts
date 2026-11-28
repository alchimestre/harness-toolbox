import type { CandidateRecord, RunDiff } from "./records.ts";
import { gateStatus, pilotReady } from "./records.ts";

const EXCERPT_CHARS = 300;

export function renderReport(records: CandidateRecord[], diff: RunDiff | null, summary: string): string {
	const candidates = records.filter((record) => record.band === "candidate" && gateStatus(record) !== "fail");
	const sections: Array<[string, CandidateRecord[]]> = [
		["Ranked", candidates.filter(pilotReady)],
		["Not pilot-ready", candidates.filter((record) => !pilotReady(record))],
		["Review band (crossroads p 0.3–0.7)", records.filter((record) => record.band === "review" && gateStatus(record) !== "fail")],
		["Rejected appendix", records.filter((record) => gateStatus(record) === "fail")],
	];
	const lines = [`# Crossroads report`, "", summary, "", ...renderDiff(diff)];
	for (const [title, group] of sections) {
		lines.push(`## ${title} (${group.length})`, "");
		group.forEach((record, index) => lines.push(...renderRecord(record, index + 1)));
	}
	return `${lines.join("\n")}\n`;
}

function renderDiff(diff: RunDiff | null): string[] {
	if (!diff) return ["## Changed since last run", "", "First run.", ""];
	return [
		"## Changed since last run",
		"",
		`- New: ${diff.added.length ? diff.added.map((id) => `\`${id}\``).join(", ") : "none"}`,
		`- Gone: ${diff.gone.length ? diff.gone.map((record) => `\`${record.id}\` ${record.locations[0]}`).join(", ") : "none"}`,
		`- Moved: ${diff.moved.length ? diff.moved.map((id) => `\`${id}\``).join(", ") : "none"}`,
		"",
	];
}

function renderRecord(record: CandidateRecord, position: number): string[] {
	const gates = Object.entries(record.gates)
		.map(([name, gate]) => `${name}: ${gate.status}`)
		.join(", ");
	const failed = Object.entries(record.gates).filter(([, gate]) => gate.status !== "pass");
	const verdict = record.verdict === null ? "unclassified" : `p=${record.verdict.toFixed(2)}`;
	const occurrences = record.occurrences ? `${record.occurrences.count}` : "unknown";
	const pilot = typeof record.pilot === "string" ? record.pilot : JSON.stringify(record.pilot);
	const evidence = [record.churn == null ? "" : `${record.churn} commits changed these lines`, record.branchesOnAnswer ? "code branches on the LLM answer" : ""].filter(Boolean);
	return [
		`### ${position}. \`${record.id}\` ${record.class}: ${record.heading}`,
		"",
		`- Where: ${record.locations.join(", ")}`,
		`- Crossroads ${verdict}; occurrences: ${occurrences}; question kind: ${record.question.kind}`,
		...(evidence.length ? [`- Evidence: ${evidence.join("; ")}`] : []),
		`- Gates: ${gates}`,
		...failed.map(([name, gate]) => `  - ${name}: ${gate.reason}`),
		`- Fallback: ${record.fallback.proposal} (${record.fallback.accepted ? "accepted" : "not accepted"})`,
		`- Pilot: ${pilot}`,
		`- Excerpt: ${record.excerpt.replace(/\s+/g, " ").slice(0, EXCERPT_CHARS)}`,
		"",
	];
}
