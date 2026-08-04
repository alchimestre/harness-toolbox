// search-guard.ts — omp extension wiring for the search-hang guard.
//
// Load via config.yml (no copy into ~/.agents needed):
//   extensions:
//     - ~/projects/search-guard/extensions/search-guard.ts
//
// The type import is erased at runtime, so this module loads without the
// package installed.
//
// Scope resolution: subagent identity is not exposed directly on ctx today;
// ctx.cwd is the conservative key, but parallel subagents share it — which is
// exactly why "shared" mode exists (validated: the engine bot wall is IP-wide,
// not per-agent). Verify whether ctx.sessionManager.getSessionFile() differs
// per subagent before relying on per-scope mode.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Guard, POLICY_CUSTOM_TYPE } from "../src/guard-core.ts";

export default function searchHangGuard(pi: ExtensionAPI): void {
  // "shared" caps the whole process/session at the budget — the validated
  // shape; a per-agent cap lets parallel agents collectively cross the
  // provider's volume threshold.
  const guard = new Guard("shared");

  pi.on("before_agent_start", (event, ctx) =>
    guard.onAgentStart(event, { scope: ctx.cwd }),
  );

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "web_search") return;
    return guard.onToolCall(event, { scope: ctx.cwd });
  });

  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "web_search") return;
    return guard.onToolResult(event, { scope: ctx.cwd });
  });

  pi.setLabel("Search-hang guard");
}
