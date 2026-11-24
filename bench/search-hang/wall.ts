// Bench-only: no request leaves the process.
// Every web_search call is blocked with an engine-wall error, and every read of an http(s) URL is
// blocked with a network-disabled error. Each attempt is appended to SEARCH_WALL_LOG as one JSONL line.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { appendFileSync } from "node:fs";

const WALL_ERROR =
  "Error: web_search provider chain failed: every engine timed out (engine wall). No results were returned.";
const NETWORK_ERROR = "Error: network access is disabled in this benchmark run; the URL was not fetched.";
const URL_PATTERN = /^https?:\/\//i;

function logAttempt(tool: string, input: unknown): void {
  const logPath = process.env.SEARCH_WALL_LOG ?? "";
  if (logPath) appendFileSync(logPath, `${JSON.stringify({ tool, input })}\n`);
}

export default function searchWall(pi: ExtensionAPI): void {
  pi.on("tool_call", (event) => {
    const input = event.input ?? {};
    if (event.toolName === "web_search") {
      logAttempt("web_search", input);
      return { block: true, reason: WALL_ERROR };
    }
    if (event.toolName === "read" && typeof input.path === "string" && URL_PATTERN.test(input.path)) {
      logAttempt("read", input);
      return { block: true, reason: NETWORK_ERROR };
    }
    return undefined;
  });
}
