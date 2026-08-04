---
name: search-hang
description: Anti-hang rules for web_search-heavy tasks — session-wide search budget, no-retry policy, read-fallback. Use when running or spawning research agents that will call web_search.
---

# Search anti-hang rules

Validated 2026-08-04 by a controlled load test (see docs/runbook.md):
sustained search volume trips **IP-wide bot walls** on the credential-free
engines (Startpage empty, DuckDuckGo 403/bot-detection, Ecosia Cloudflare,
Google traffic challenge, Mojeek rate-limit). ~128 searches across ~20 minutes
tripped every engine at once; the walls clear only after quiet time. The
incident's "pending forever" was these walls with the browser path hung on the
challenge page instead of failing fast.

- **Cap searches session-wide:** at most ~15 `web_search` calls per session —
  not per agent: parallel agents share the wall, and fresh sessions do NOT
  reset it. Past the cap, switch to direct `read` of known URLs.
- **Never retry a hung, failed, or walled search.** A `web_search` that returns
  an error or stays `pending` is a dead end, not a slow start. Each failed
  search burns ~17–32s of provider-chain grinding; retries multiply that.
  `read` the target URLs directly and mark anything unverified as `[INFERENCE]`.
- **Prefer `read` over search** wherever the target URLs are already known
  (primary-source pages, official docs). Direct reads were 100% reliable in
  both the incident and the load test.
- **Split discovery from writing** in parallel research batches: discovery
  agents search (bounded), writing agents receive findings + URLs and only
  `read` + write.
- **Keep batches small:** no more than ~4 search-heavy agents at once; consider
  staggering them.
- **Browser engines (google/ecosia/mojeek) are keepers:** they delivered
  high-quality primary-source results while healthy (10–15 sources, primary
  URLs). The wall is volume-driven, not engine-choice-driven.
