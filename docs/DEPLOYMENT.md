# Deployment and rollback

The internet deployment is a persistent research pilot. Browser playback reports and simulated targets do not authorize real payments. Engagement remains nonbillable telemetry until independent validation and trusted device proof are implemented.

## Release gate

- Run all Node tests, PHP syntax checks, database migrations twice and invariant checks.
- Back up the existing site directory and proximity_lab database before updating.
- Deploy only runtime files from web; never deploy TORs, .artifacts, .env, database dumps or model weights.
- Configure PROXIMITY_ALLOWED_HOSTS explicitly for the deployment (warin.me,www.warin.me). Cookies are Secure on public hosts; POST origins must exactly match HTTPS host.
- Demo logins are rejected on public hosts; production bootstrap does not create demos unless explicitly enabled. Provision role accounts via bin/provision-account.php; initial secrets are stored outside document root with mode 0600.
- Verify public login/session, CSRF rejection, tenant isolation, role rejection, security headers and setup-script denial after release.
- Inspect application and Apache error logs; system-health reports DB reachability only, not inferred device availability.

## Rollback

Restore runtime files from the timestamped pre-release directory. Additive database changes remain; do not restore a database over newer transactions. Quiesce writes and reconcile the append-only ledger before any database restore. Retain the database snapshot and release test evidence outside web root.

## Remaining gates for monetary production

Trusted device identities and signed playback proof; privacy-approved datasets and retention; independently evaluated engagement; payment/invoice integration; disaster restore drill; load testing on production hardware; session/account recovery and password rotation. Do not describe the pilot as having passed these gates.
