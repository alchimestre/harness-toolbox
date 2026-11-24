# Ticket facts (from the wayfinder map)

Ticket file: 14-webhook-retries.md. Status: ready. Blocked by ticket 12 (delivery log). Estimate: 2 days. Owner: the webhook team.

Problem: the webhook sender drops an event on the first 5xx or timeout from the customer's endpoint. Support (SUP-4012) has seen 30 lost events in April.

Decision: retry up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s). After the fifth failure move the event to a dead-letter queue the customer can replay from the dashboard. 4xx responses are never retried.

History: the original design in 2022 deliberately had no retries because customers complained about duplicates. Duplicates are now handled by an `event_id` idempotency key added in v3.1.

Out of scope: per-customer retry settings, signing changes.
