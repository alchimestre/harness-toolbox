// guard-core.ts — pure logic for the search-hang guard.
// Zero runtime deps; erasable TS only (runs under `node test/simulate.ts`).
// Event shapes mirror the subset of omp's tool_call / tool_result /
// before_agent_start payloads the guard reads. The deployable extension
// (extensions/search-guard.ts) is a thin wiring of these handlers onto the
// real API.
//
// Validated 2026-08-04 by a live load test (see docs/runbook.md): sustained
// search volume trips IP-wide bot walls on the credential-free engines, and
// the wall does NOT reset per session. The budget MUST therefore be shared
// (session-wide), not per-agent.

export const SEARCH_BUDGET = 15; // calls allowed per scope before blocking

export const BUDGET_REASON =
  `web_search budget (${SEARCH_BUDGET}) exhausted for this scope. ` +
  `Stop searching. Read the known URLs directly; mark anything unverified as [INFERENCE].`;

export const RETRY_BAN_SUFFIX =
  `\n\n[search-guard] web_search provider chain failed. DO NOT retry web_search ` +
  `(retries hang under parallel load). Switch to direct read of known URLs; ` +
  `mark unverified findings as [INFERENCE].`;

export const POLICY_CUSTOM_TYPE = "search-hang-policy";
export const POLICY_MESSAGE =
  `Search anti-hang policy for this agent turn:\n` +
  `1. Budget: at most ${SEARCH_BUDGET} web_search calls per scope. Past that, calls are ` +
  `blocked — use read on known URLs instead.\n` +
  `2. A web_search returning an error or staying "pending" is a dead end: do NOT retry it. ` +
  `Read the target URLs directly.\n` +
  `3. Prefer direct read of known/primary-source URLs over search.\n` +
  `4. Unverified items: mark [INFERENCE] rather than searching again.`;

export type ScopeMode = "per-scope" | "shared";

export interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}
export interface ToolResultEvent {
  toolName: string;
  isError: boolean;
  content: Array<{ type: string; text?: string }>;
}
export interface GuardCtx {
  /** what the budget counter is keyed by (agent id / cwd / session file) */
  scope: string;
}

interface GuardState {
  searches: number;
  blocked: number;
  rewrites: number;
  injections: number;
}

export interface GuardSnapshot {
  scope: string;
  searches: number;
  blocked: number;
  rewrites: number;
  injections: number;
  mode: ScopeMode;
  budget: number;
}

function freshState(): GuardState {
  return { searches: 0, blocked: 0, rewrites: 0, injections: 0 };
}

/**
 * per-scope: each agent/cwd has its own budget. Insufficient alone: parallel
 * agents with per-agent caps can collectively exceed the provider's volume
 * threshold (validated 2026-08-04).
 * shared:    one counter across all scopes in the process (session-wide cap) —
 *            the validated default; stops search volume before the engine
 *            bot-wall threshold is reached.
 */
export class Guard {
  readonly mode: ScopeMode;
  readonly budget: number;
  private states = new Map<string, GuardState>();
  private shared: GuardState = freshState();

  constructor(mode: ScopeMode = "per-scope", budget: number = SEARCH_BUDGET) {
    this.mode = mode;
    this.budget = budget;
  }

  private stateFor(scope: string): GuardState {
    if (this.mode === "shared") return this.shared;
    let st = this.states.get(scope);
    if (!st) {
      st = freshState();
      this.states.set(scope, st);
    }
    return st;
  }

  // tool_call handler: count web_search, block past budget.
  onToolCall(
    event: ToolCallEvent,
    ctx: GuardCtx,
  ): { block: true; reason: string } | undefined {
    if (event.toolName !== "web_search") return undefined;
    const st = this.stateFor(ctx.scope);
    st.searches += 1;
    if (st.searches > this.budget) {
      st.blocked += 1;
      return { block: true, reason: BUDGET_REASON };
    }
    return undefined;
  }

  // tool_result handler: rewrite provider-failure output to ban retries.
  onToolResult(
    event: ToolResultEvent,
    ctx: GuardCtx,
  ): { content: Array<{ type: string; text: string }> } | undefined {
    if (event.toolName !== "web_search") return undefined;
    const text = event.content.map((c) => c.text ?? "").join("\n");
    if (!/^Error:/.test(text.trim())) return undefined;
    this.stateFor(ctx.scope).rewrites += 1;
    return { content: [{ type: "text", text: text + RETRY_BAN_SUFFIX }] };
  }

  // before_agent_start handler: inject the policy into every agent turn,
  // so subagents get it without depending on skill discovery/reading.
  onAgentStart(
    _event: unknown,
    ctx: GuardCtx,
  ): {
    message: {
      customType: string;
      content: Array<{ type: string; text: string }>;
      display: string;
    };
  } {
    this.stateFor(ctx.scope).injections += 1;
    return {
      message: {
        customType: POLICY_CUSTOM_TYPE,
        content: [{ type: "text", text: POLICY_MESSAGE }],
        display: "Search anti-hang policy injected",
      },
    };
  }

  snapshot(scope: string): GuardSnapshot {
    const st =
      this.mode === "shared"
        ? this.shared
        : (this.states.get(scope) ?? freshState());
    return {
      scope,
      searches: st.searches,
      blocked: st.blocked,
      rewrites: st.rewrites,
      injections: st.injections,
      mode: this.mode,
      budget: this.budget,
    };
  }
}
