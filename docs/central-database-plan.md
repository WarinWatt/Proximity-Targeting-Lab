# Central database completion plan

This document records the architecture review requested from Anthropic Claude and Google Antigravity through the read-only review bridge. Their agreement is advisory, not proof. The accepted design is intentionally smaller than the original conceptual ERD.

## Accepted decisions

- Use one central MariaDB and a modular PHP monolith for five stations. Do not add Kafka, Kubernetes, CQRS, or a distributed transaction protocol.
- Treat one station as one integrated location + camera + screen for deployment and billing. On the station, isolate sensing, playback, and synchronization processes.
- Keep media outside MariaDB, named by SHA-256. MariaDB stores metadata and the path. A station stages, verifies, and atomically activates a complete signed manifest; playback never streams from Central.
- Give each station a rotating/revocable Ed25519 identity. Sign event batches, not every event. Central signs versioned manifests separately.
- Deliver events at least once from an edge SQLite WAL outbox. Deduplicate centrally by `(station_id, boot_epoch, seq)` and stable `event_key`.
- Allocate hard-capped, expiring budget leases. Offline stations may spend only their lease. Reconciliation releases unused value. Never let stations coordinate budget peer-to-peer.
- Make proof-of-play the only billable device event in the first complete system. Attention is versioned telemetry and remains non-billable until a documented validation changes a metric version to `validated`; validation never retroactively bills old events.
- Store no raw camera frames centrally or in the outbox. Cross-camera identity, face recognition, emotion, and real gaze billing remain out of scope.

## Sources of truth

| State | Authoritative store | Examples |
|---|---|---|
| Commercial and financial | Central MariaDB | campaign, immutable ledger, lease, refund |
| Distribution contract | Central MariaDB + signed manifest | creative, media hash, targeting, price, lease cap |
| Delivery evidence | Central append-only event rows | proof-of-play, sequence, manifest and lease references |
| Experimental telemetry | Central non-billable events | dwell proxy, model/metric version |
| High-frequency and offline state | Edge SQLite + local filesystem | outbox, sequence, lease balance, applied manifest, verified media |
| Dashboard summaries | Rebuildable projections | daily spend, station revenue, health status, A/B summaries |

`db/migrations` is authoritative for implemented Central tables. `web/schema.mjs` still documents the wider research concept and must not be interpreted as deployed schema.

## Hard invariants

1. Campaign money uses integer minor units and a three-letter currency; no floating-point money.
2. Outstanding leases are reserved under a locked campaign row and their total cannot exceed available budget.
3. A station cannot produce accepted spend above its lease cap.
4. `(station_id, boot_epoch, seq)` and `event_key` are unique. Replay has no additional financial effect.
5. Ledger and accepted station event rows are insert-only; corrections use refund/reversal rows.
6. A billable play references the exact manifest, lease, creative, and media hash.
7. Attention has a metric version and cannot create ledger spend while that version is not validated.
8. Wall time is reporting context. Durations use a monotonic clock, and event ordering uses sequence numbers.
9. Raw frames, face embeddings, and persistent person identifiers are forbidden from central schemas and event contracts.

## Delivery sequence

1. **Foundation:** migrations, contracts, immutable ledger, invariant checker, MariaDB CI.
2. **One simulated station:** signed manifest, filesystem media, SQLite outbox, deterministic replay tests.
3. **Two simulated stations:** hard-capped leases, concurrent exhaustion, disconnect/replay, reconciliation.
4. **Five simulated stations:** shared budget property tests, cache corruption, clock drift, 72-hour soak.
5. **Physical station:** separate sensing/player/sync processes; prove zero raw-frame persistence.
6. **Billing workflow:** statements, review, compensating refund, tenant isolation.
7. **Operations:** health, key rotation/revocation, retention, backup/restore drill, owner revenue projections.
8. **Attention validation:** annotated evaluation set and a predetermined precision threshold before any second-tier charge can be enabled.

## Decisive acceptance tests

- Submit the same overlapping batches concurrently three times: one event and one spend per source event.
- Reject tampered, wrong-key, revoked-key, and manifest-rollback requests with zero writes.
- Disconnect stations until leases are exhausted: paid playback stops and total spend never exceeds campaign budget.
- Crash before/after SQLite commit and before/after acknowledgement: no lost billable event and no double billing.
- Corrupt one cached byte: the old manifest remains active and the screen does not go blank.
- A 5,000 ms dwell on a 10,000 ms clip does not qualify; validation of attention remains non-billable until explicitly enabled for future events.
- Attempts to update/delete event or ledger rows fail at the database layer.
- Retention and network-capture tests find no raw image payload or persistent cross-camera person ID.

## Explicitly out of scope for this research release

Payment gateways, tax invoices, external RTB/DSP integration, HA/multi-region MariaDB, more than roughly 20 stations, cross-camera re-identification, facial recognition, emotion classification, and gaze-based billing are excluded. CSV billing export and house-content fallback are sufficient.
