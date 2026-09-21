# Proximity Targeting Research Lab

An explainable research prototype for audience-aware digital signage: simulated pedestrian attributes, overlapping audience segments, campaign eligibility and bidding, edge content cache readiness, playback evidence, A/B assignment, billing review, and a local OpenPAR/PromptPAR experiment.

This repository is an independent research project. It is not part of [`COINCIDENCE_algorithms_suite`](https://github.com/WarinWatt/COINCIDENCE_algorithms_suite).

## Research scope

- Five integrated location + camera + screen stations.
- Multi-label full/partial matching with visible exclusion and ranking reasons.
- Campaign sales simulation, per-screen prices, A/B assignment, two-tier pricing experiments, charge/refund history, audience and operator dashboards.
- MariaDB-backed local authentication for customer, operator, reviewer, and owner roles.
- A bounded single-screen persistent pilot: buy campaign, verify browser cache by SHA-256, simulate target observation, allocate by bid, play cached media, settle on completion, and review/refund.
- Optional local OpenPAR PromptPAR PA100K inference for 26 pedestrian attributes.

This is **not production ad tech**. Most five-screen flows remain browser simulations. The single-screen flow is persistent, but browser reports are not trusted device proof. No payment provider, invoice system, real gaze verification, cross-camera identity, or production fleet monitoring is included. Appearance-based age/gender labels can be wrong and must not be treated as identity facts.

## Run the web lab

1. Copy `.env.example` to `.env` and replace the database root password.
2. Run `docker compose up --build`.
3. Open `http://127.0.0.1:8090/index.html` (or the configured `WEB_PORT`).

The local bootstrap creates four clearly marked test accounts. Their passwords are shown only when the hostname is `localhost` or `127.0.0.1`. The API itself rejects non-local hostnames in this research build. Remove demo account creation and local-only restrictions before designing any deployment.

Run frontend/unit tests with:

```text
node --test web/*.test.mjs
```

## Optional OpenPAR service

The frontend checks `http://127.0.0.1:8042`. The model service binds to loopback, accepts a manually framed single-person JPEG, runs one inference at a time, and stores no images.

The 1.3 GB checkpoint is intentionally excluded. Review `openpar/README.md`, create a Python environment, install PyTorch/torchvision plus `openpar/requirements.txt`, and run `python openpar/download_model.py`. Check source, checkpoint, and dataset terms independently before use.

OpenPAR upstream source is retained under `openpar/vendor/OpenPAR` with its MIT license and identified revision. Local adapter changes are documented in `openpar/README.md`.

## Research provenance

The design was motivated by the student project *Proximity Targeting Using Deep Demographics Recognition System* (academic year 2021) and the 2025 article *Analysis of Deep Demographics for Advertisement Recommendation*. Source PDF page images are deliberately not redistributed in this repository. The in-app reference/archive text distinguishes prior work from proposed extensions.

Generated fictional personas, advertising panels, and deployment mockups are documented in `web/ASSETS.md` and `web/assets/station-prompts.md`. They are demonstration fixtures, not model predictions or real people.

## Security and privacy notes

- Passwords are hashed; session cookies are HTTP-only and same-site; modifying requests require CSRF tokens and local origins.
- Database credentials are generated into a Docker volume and `.env` is ignored.
- Uploaded pilot clips are limited to 8 MB and stored in MariaDB only for the bounded local pilot. A production design should use dedicated media storage.
- Never expose this build directly to the internet. Add real identity management, HTTPS, device credentials, authorization tests, retention controls, backups, migrations, observability, and an evidence policy first.

See `web/architecture.html`, `web/SINGLE-SCREEN.md`, and `web/references.html` for detailed design and limitations.

## License

Project-authored source code is MIT licensed. Third-party code in `openpar/vendor/OpenPAR` retains its upstream license. Model weights, datasets, referenced papers, and generated/media assets are not automatically covered by the project code license; review their provenance and terms separately.
