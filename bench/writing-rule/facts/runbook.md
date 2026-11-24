# Facts about the alert (from the on-call wiki and incident notes)

Alert: PostgresReplicaLagHigh. Fires when `replay_lag` on a read replica stays above 30 seconds for 5 minutes. Pages the on-call engineer.

Usually harmless, honestly. Most of the time it is a big batch job on the primary and it clears alone within 10 minutes, so do not panic.

Diagnosis order:
1. On the primary, run `SELECT client_addr, state, replay_lag FROM pg_stat_replication;` to see which replica is behind and its state.
2. On the lagging replica, run `SELECT pg_last_xact_replay_timestamp(), now();` to confirm the lag.
3. On the primary, run `SELECT pid, now() - xact_start AS age, query FROM pg_stat_activity WHERE state = 'active' ORDER BY age DESC LIMIT 5;` to find a long-running batch.
4. If a batch job is running and the lag is falling, wait. Check again every 5 minutes.
5. If the lag is rising for 15 minutes, or the replica state is not `streaming`, page the database owner via the `db-owner` rotation.

Limits: never restart the primary. Never run `pg_resetwal`. Do not promote a replica without the database owner's approval.

Reassurance and history: this alert was noisy in 2023 because the threshold was 5 seconds, which is why it was raised to 30. The worst incident was INC-2291 in November 2023, when an autovacuum on the primary starved the replica and reads went stale for 40 minutes; the fix then was to cancel the vacuum. Nobody was blamed. If it feels scary, remember the replicas are only used for dashboards, so customers are not affected unless the lag passes 10 minutes.

Escalation: if customer-facing reads are stale, also post in #incidents.

Dashboards: Grafana board "Postgres replicas", panel "Replay lag".
