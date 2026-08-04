// Extension wiring for the search-hang guard.
// Load via the harness's extension loader; the type import is erased at runtime.
// Parallel subagents share ctx.cwd, so the guard runs in "shared" mode —
// verify ctx.sessionManager.getSessionFile() before switching to per-scope.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Guard, POLICY_CUSTOM_TYPE } from "../src/guard-core.ts";

export default function searchHangGuard(pi: ExtensionAPI): void {
  // Session-wide cap: per-agent caps let parallel agents trip the wall together.
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
