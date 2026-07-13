# Project Journal

## Project Snapshot

- Project: Reliability Lab Reservation
- Root: `D:\py\SNR.github.io`
- Contract: `project_contract.yml`
- Current focus: Keep the GitHub Pages Supabase frontend maintainable and document the handoff for the next owner.
- Last updated: 2026-07-13

## Stable Facts

- Hosted frontend entry is `index.html` at the repository root.
- Local fallback starts with `python -m app.server`.
- SQLite data is stored beneath `data/`.
- Run `scripts/verify.ps1` for the project checks.
- Read `docs/HANDOFF.md` before changing Supabase schema or deployment settings.

## Open Risks

- Supabase permission policy changes remain intentionally out of scope.

## Recent Entries

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
