# Project Journal

## Project Snapshot

- Project: Reliability Lab Reservation
- Root: `D:\py\SNR.github.io`
- Contract: `project_contract.yml`
- Current focus: Complete the Supabase-to-local SQLite cutover and prepare an offline Windows deployment.
- Last updated: 2026-07-20

## Stable Facts

- Local frontend entry is `index.html` at the repository root and must be served by `app.server`.
- Production starts with `scripts/start-local.ps1` or `scripts/start-lan.ps1`.
- Production SQLite data is `data/rlab_reservation.db` and is excluded from Git.
- Run `scripts/verify.ps1` for the project checks.
- Read `docs/HANDOFF.md` before changing local schema, API, packaging, or deployment settings.

## Open Risks

- Local login/role authorization remains intentionally out of scope; deployment must stay on a controlled internal network.

## Recent Entries

### 2026-08-27

- Focus: Preview iframe bulletin fullscreen regression.
- Changed: Kept `preview.html` on a local-only `preview=1` bulletin entry, retained the iframe-scoped preview fullscreen simulation in `app.js`/`styles.css`, and ensured `openBulletinWindow()` strips the preview marker so the direct bulletin page still uses native Fullscreen API.
- Verification: `node --check app.js`, targeted Python static/API tests (27/27), and the bulletin preview/native fullscreen Playwright regressions (14/14) passed.

### 2026-08-14

- Focus: Equipment label source sync and prototype-local placement export.
- Changed: Added `prototypes/sync_equipment_labels.py` plus the generated `prototypes/equipment-labels-source.json` snapshot from `data/rlab_reservation.db`, rewired `prototypes/equipment-floorplan-ux.html` to the clean transparent PNG and all 16 SQLite-backed equipment records with stable IDs (`ch01..ch10`, `esd`, `drop`, `vibration`, `ess-a`, `ess-b`, `salt`), and added localStorage persistence plus `#exportPlacements` JSON download for local-only floorplan layout work.
- Verification: `python -m unittest tests.test_equipment_labels_sync`; `python -m unittest tests.test_floorplan_ui_transparent`; `python prototypes\sync_equipment_labels.py`; `npx playwright test tests/e2e/equipment-floorplan-ux.spec.js`

- Focus: Local production floorplan integration.
- Changed: Added the persisted `equipment_floorplan_placements` SQLite table plus authenticated GET/admin PUT API in `app/server.py`, wired the real equipment workspace in `index.html`/`app.js`/`styles.css` to render the production floorplan asset with selection, drag/resize layout mode, and save/reset controls, added `scripts/import_floorplan_placements.py` plus `scripts/prepare_e2e_db.py`, and covered the flow with API/static/import/E2E tests.
- Verification: `python -m py_compile app/server.py scripts/import_floorplan_placements.py scripts/prepare_e2e_db.py tests/test_api.py tests/test_static_ui.py tests/test_floorplan_import.py`; `node --check app.js`; `python -m unittest tests.test_api tests.test_static_ui tests.test_floorplan_import`; `npm run test:e2e -- tests/e2e/equipment-floorplan.spec.js`; `python scripts/import_floorplan_placements.py --db data/rlab_reservation.db --input C:\Users\105221\Downloads\equipment-floorplan-placements.json --backup-dir backups`

- Focus: Transparent floorplan clean PNG deliverable.
- Changed: Added `prototypes/process_ui_floorplan_transparent_clean.py` to read the existing transparent PNG, drop isolated short alpha components, strip semi-transparent fringe, and emit `prototypes/equipment-floorplan-ui-transparent-clean.png` without changing the HTML prototype.
- Verification: `python prototypes\process_ui_floorplan_transparent_clean.py`; `python -m unittest tests.test_floorplan_ui_transparent_clean`

- Focus: Equipment floorplan prototype label placement acceptance.
- Changed: Updated `prototypes/equipment-floorplan-ux.html` to add inspector `#generateLabel` plus `#locationStatus`, track per-device `locationState` (`unplaced`/`placing`/`placed`), enter placement mode from label generation while preserving selection, expose `data-location-state` on device buttons, and mark devices `placed` after drag or resize pointer release without regressing existing select/add/deactivate/layout interactions.
- Verification: `npx playwright test tests/e2e/equipment-floorplan-ux.spec.js`

- Focus: Minimal professional floorplan deliverable.
- Changed: Replaced `prototypes/process_professional_floorplan.py` with a direct copy of `process_polished_contour.py` logic while keeping the professional output name, regenerated `prototypes/equipment-floorplan-professional.png`, and relaxed the professional scrub-zone dark-fragment threshold to match preserved doorway linework.
- Verification: `python prototypes\process_professional_floorplan.py`; `python tests\test_floorplan_professional.py`

### 2026-08-11

- Focus: Add local authentication, session cookies, and role-based authorization to the SQLite deployment.
- Changed: Added `user_accounts` plus `user_sessions`, seeded fixed admin and guest accounts, protected data APIs behind authenticated sessions, enforced reservation ownership rules by role, added a login-first frontend shell, and added admin-only role management plus auth coverage in API/static/E2E tests.
- Learned: The legacy `app.js` in the workspace was syntactically broken, so the auth rollout required replacing it with a clean local-API implementation instead of incremental patching.
- Verification: Pending full final command set for this auth packet.
- Next: Review final verification output and confirm manager/member flows in browser evidence.

### 2026-07-29

- Focus: Improve requester add/edit form convenience.
- Changed: Typing a requester name now suggests the account portion before parentheses plus `@senao.com` (for example, `Andys.Huang(黃健勝)` becomes `Andys.Huang@senao.com`); manually edited Email values remain unchanged when the name changes.
- Verification: `scripts/verify.ps1` passed 24 Python tests, JavaScript syntax checks, and 2 Chromium E2E tests.
- Next: None for this change.

### 2026-07-20 (local cutover)

- Focus: Remove runtime Supabase dependency and preserve current hosted data locally.
- Changed: Exported four Supabase tables to JSON and SQLite, switched the frontend to same-origin local APIs, added local requester/schema support, and included the DB in the secure transfer package.
- Learned: First synchronized baseline is 16 equipment, 8 reservations, 11 history rows, and 7 requesters; foreign-key check has zero errors.
- Verification: 24 Python/static/package tests and 1 Chromium local-API E2E passed before final documentation/package verification.
- Next: On cutover day, stop writes to the old hosted site, perform one final sync, then disable or make the old site read-only.

### 2026-07-20

- Focus: Target-computer transfer readiness.
- Changed: Added a white-list ZIP package, Windows preflight/start scripts, automatic LAN IPv4 detection, and a local deployment guide.
- Learned: Moving the web files to one computer does not move production data; the current frontend still requires jsDelivr and Supabase connectivity.
- Verification: Default `scripts/package.ps1` passed 22 Python tests and 1 Chromium E2E, including automatic/manual LAN IP URL generation and transfer-package contents.
- Next: Confirm the target computer name/IP, operating owner, firewall scope, and Supabase backup owner before the actual move.

### 2026-07-17

- Focus: Repeatable browser E2E baseline.
- Changed: Added Playwright Test configuration, an isolated local-server smoke test, and an E2E command to `scripts/verify.ps1`.
- Learned: The hosted root frontend connects directly to Supabase, so the baseline E2E blocks Supabase traffic and uses the local SQLite server only.
- Verification: `powershell -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1` passed: 19 Python tests, Python/JavaScript checks, and 1 Chromium E2E smoke test.
- Next: Add isolated workflow tests for reservation create, edit, and completion before relying on browser tests for those user journeys.

### 2026-07-13

- Focus: Root frontend alignment.
- Changed: Replaced the local root frontend and manual Supabase scripts with the fetched GitHub `main` versions; retained the SQLite server and API tests as a fallback.
- Learned: The hosted frontend is Supabase-backed and supplies the full bulletin experience at `?view=bulletin`.
- Verification: 19 tests passed; Python compile and JavaScript syntax checks passed.
- Next: Keep root frontend files synchronized before deploying to GitHub Pages.

### 2026-07-13 (handoff)

- Focus: Maintenance handoff.
- Changed: Rewrote README and added `docs/HANDOFF.md` with deployment, SQL ordering, frontend behavior, fallback limits, and troubleshooting.
- Learned: `equipment_spec` requires the manual Supabase SQL before it can be persisted by the hosted frontend.
- Verification: Pending final documentation commit; prior 19 frontend/API checks passed.
- Next: New maintainer should run the handoff checklist and confirm Pages plus Supabase in a clean browser session.
