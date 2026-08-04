---
name: search-hang
description: Anti-hang rules for web_search-heavy tasks — session-wide search budget, no-retry policy, read-fallback. Use when running or spawning research agents that will call web_search.
---

# Search anti-hang rules

Modified from Matt Pocock's `research` skill. See `docs/runbook.md` for the
incident that motivated these rules.

Sustained search volume trips IP-wide bot walls on the credential-free engines
(Startpage empty, DuckDuckGo 403, Ecosia Cloudflare, Google challenge, Mojeek
rate-limit). ~128 searches in ~20 minutes tripped all five; the walls clear
only after quiet time.

- **Cap searches session-wide:** ~15 `web_search` calls per session, not per
  agent — parallel agents share the wall and fresh sessions don't reset it.
  Past the cap, use `read` on known URLs.
- **Never retry a hung, failed, or walled search.** Each failure burns
  ~17–32s of provider-chain grinding. `read` the target URLs directly; mark
  unverified items as `[INFERENCE]`.
- **Prefer `read` over search** for known URLs (primary sources, official
  docs) — direct reads are unaffected by engine walls.
- **Split discovery from writing** in parallel batches: discovery agents
  search (bounded), writing agents only `read` + write.
- **Keep batches under ~4 search-heavy agents;** stagger them.
- **Keep google/ecosia/mojeek in the chain** — quality results while healthy;
  the wall is volume-driven, not engine-choice-driven.
