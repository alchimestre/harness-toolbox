// Checks the effort policy and the child-side hook. Run: bun test/effort-policy.ts

import gate, { chooseLevel } from "../extensions/jev-effort-gate.ts";

function check(condition: unknown, label: string): void {
	if (!condition) throw new Error(`FAIL ${label}`);
	console.log(`ok ${label}`);
}

const quiet = { exhaustive: 0.1, exact: 0.1, urgent: 0.1 };
const full: ["low", "high"] = ["low", "high"];

check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.2).level === "high", "exhaustive steps up");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9, urgent: 0.9 }, 0.2).level === "high", "accuracy beats urgency");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.9).level === "high", "accuracy beats quota pressure");
check(chooseLevel("medium", full, { ...quiet, exhaustive: 0.9 }, 0.97).level === "medium", "critical quota blocks step up");
check(chooseLevel("medium", full, { ...quiet, exact: 0.9 }, 0.2).level === "low", "exact target steps down");
check(chooseLevel("medium", full, { ...quiet, urgent: 0.9 }, 0.2).level === "low", "urgency steps down");
check(chooseLevel("medium", full, quiet, 0.85).level === "low", "quota pressure steps down");
check(chooseLevel("medium", full, quiet, 0.2).level === "medium", "no signal holds");
check(chooseLevel("medium", full, undefined, undefined).level === "medium", "Jev down holds");
check(chooseLevel("high", ["medium", "high"], { ...quiet, exhaustive: 0.9 }, 0.2).level === "high", "range caps step up");
check(chooseLevel("medium", ["medium", "high"], { ...quiet, exact: 0.9 }, 0.2).level === "medium", "range floors step down");

type Start = (event: unknown, ctx: unknown) => Promise<unknown>;

function childSession(level: string) {
	const session = { level, entries: [] as unknown[], start: undefined as unknown as Start };
	const pi = {
		on: (name: string, handler: Start) => {
			if (name === "before_agent_start") session.start = handler;
		},
		exec: async () => ({ code: 1, stdout: "" }),
		getThinkingLevel: () => session.level,
		setThinkingLevel: (next: string) => (session.level = next),
		appendEntry: (_type: string, data: unknown) => session.entries.push(data),
	};
	gate(pi as never);
	return session;
}

const child = (name: string) => ({ agent: { kind: "sub", id: "Same", name }, model: { provider: "anthropic" } });
delete process.env.TYPESAFE_API_KEY;

const unkeyed = childSession("medium");
await unkeyed.start({ prompt: "Sweep every file." }, child("task"));
const entry = unkeyed.entries[0] as { jevError?: string };
check(unkeyed.level === "medium" && entry.jevError === "TYPESAFE_API_KEY unset", "no key keeps effort and records why");

const pinned = childSession("medium");
await pinned.start({ prompt: "Review this." }, child("review-high"));
check(pinned.level === "medium" && pinned.entries.length === 0, "pinned agent untouched");

const main = childSession("medium");
await main.start({ prompt: "Do it." }, { agent: { kind: "main", id: "Main", name: "main" } });
check(main.entries.length === 0, "main session untouched");

// Same child id in a second session (a reused task name) must still be decided.
const first = childSession("medium");
const second = childSession("medium");
await first.start({ prompt: "a" }, child("task"));
await first.start({ prompt: "b" }, child("task"));
await second.start({ prompt: "c" }, child("task"));
check(first.entries.length === 1 && second.entries.length === 1, "one decision per session, reused ids included");
check(chooseLevel("high", ["low", "medium"], { exhaustive: 0, exact: 0, urgent: 0 }, 0.2).level === "high", "configured level above range holds without a signal");

const realFetch = globalThis.fetch;
const jevAnswers = (exhaustive: number, exact: number) =>
	(async () => Response.json({ answers: { exhaustive: { noul: exhaustive }, exact: { noul: exact }, urgent: { noul: 0 } } })) as unknown as typeof fetch;
process.env.TYPESAFE_API_KEY = "test";
try {
	globalThis.fetch = jevAnswers(0.9, 0.1);
	const sweep = childSession("medium");
	await sweep.start({ prompt: "Find every caller." }, child("task"));
	check(sweep.level === "high", "exhaustive assignment steps the child up");

	let sentAssignment = "";
	globalThis.fetch = (async (_url: string, init: { body: string }) => {
		sentAssignment = JSON.parse(init.body).state.assignment;
		return Response.json({ answers: { exhaustive: { noul: 0.9 }, exact: { noul: 0 }, urgent: { noul: 0 } } });
	}) as unknown as typeof fetch;
	const revived = childSession("medium");
	await revived.start({ prompt: "", reason: "revive" }, child("task"));
	await revived.start({ prompt: "Complete assignment thoroughly:\n\nFind every caller." }, child("task"));
	check(revived.level === "high" && sentAssignment === "Find every caller.", "revive waits for the assignment; wrapper stripped");

	globalThis.fetch = jevAnswers(0.1, 0.9);
	const review = childSession("low");
	await review.start({ prompt: "Fix line 3." }, child("reviewer"));
	check(review.level === "low", "step down stops at the range floor");

	globalThis.fetch = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
	const outage = childSession("medium");
	await outage.start({ prompt: "Find every caller." }, child("task"));
	const logged = outage.entries[0] as { jevError?: string };
	check(outage.level === "medium" && logged.jevError === "HTTP 503", "Jev outage keeps effort and logs status");
} finally {
	globalThis.fetch = realFetch;
	delete process.env.TYPESAFE_API_KEY;
}
