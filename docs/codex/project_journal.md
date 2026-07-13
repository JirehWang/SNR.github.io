# Project Journal

## Project Snapshot

- Project: Reliability Lab Reservation
- Root: `D:\py\SNR.github.io`
- Contract: `project_contract.yml`
- Current focus: Use the GitHub Pages Supabase frontend at the repository root while retaining the local SQLite server as a fallback.
- Last updated: 2026-07-13

## Stable Facts

- Hosted frontend entry is `index.html` at the repository root.
- Local fallback starts with `python -m app.server`.
- SQLite data is stored beneath `data/`.
- Run `scripts/verify.ps1` for the project checks.

## Open Risks

- Supabase permission policy changes remain intentionally out of scope.

## Recent Entries

### 2026-07-13

- Focus: Root frontend alignment.
- Changed: Replaced the local root frontend and manual Supabase scripts with the fetched GitHub `main` versions; retained the SQLite server and API tests as a fallback.
- Learned: The hosted frontend is Supabase-backed and supplies the full bulletin experience at `?view=bulletin`.
- Verification: 19 tests passed; Python compile and JavaScript syntax checks passed.
- Next: Keep root frontend files synchronized before deploying to GitHub Pages.
