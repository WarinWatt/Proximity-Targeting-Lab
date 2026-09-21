# Single-screen pilot

Open single-screen.html on localhost. Login first. Owner can exercise the whole pilot; customer buys, operator prefetches/auctions/plays, reviewer approves or refunds.

Implemented: MariaDB persistence, uploaded MP4/WebM (8 MB maximum), browser Cache Storage with SHA-256 verification, simulated adult/senior target event, exact/any targeting, descending bid ranking, one queued/playing slot serialized by station row lock, frozen price and decision trace, completion charge and retrospective refund with unique ledger keys. No external payment.

Queued/playing slot is the single-station reservation. A stale slot blocks new allocation until operator marks it failed. Refresh recovers records, not playback position. Do not use this as production proof-of-play: cache readiness and completion are client reports and a privileged client can fabricate them. Playback completion is not gaze, attention or target verification. UI disables automatic mid-clip replacement; device-authenticated evidence is future work.

Limits: only station 1, no A/B or attention surcharge in this pilot, no real AI connection, no invoice/payment, no automatic expiry/reconciliation, no filesystem edge player. Clips are stored in DB for this bounded pilot; production media storage should be separate. Browser cache persists per origin; test files remain until browser site data is cleared. API is local-host restricted as in api.php.

Schema: cycle-migrate.php is CLI-only and additive. schema.mjs lists cycle_campaigns, cycle_runs and cycle_ledger; application account has DML only. Tests exercised purchase, cache exclusion, role enforcement, pre-play review rejection, allocation retry, repeated completion and refund against the API. This is not a browser playback/device test. Test runs and matching refunds are retained as audit history.
