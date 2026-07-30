# Project Journal

## Project Snapshot

- Project: Reliability Lab Reservation
- Root: `D:\py\SNR.github.io`
- Contract: `project_contract.yml`
- Current focus: Keep the GitHub Pages Supabase frontend maintainable and stabilize the bulletin auto-scroll.
- Last updated: 2026-07-30

## Stable Facts

- Hosted frontend entry is `index.html` at the repository root.
- Local fallback starts with `python -m app.server`.
- SQLite data is stored beneath `data/`.
- Run `scripts/verify.ps1` for the project checks.
- Read `docs/HANDOFF.md` before changing Supabase schema or deployment settings.

## Open Risks

- Supabase permission policy changes remain intentionally out of scope.

## Recent Entries

### 2026-07-30

- Focus: Make the bulletin scroll duration setting control the actual animation.
- Changed: Replaced browser-defined smooth scrolling with a `requestAnimationFrame` animation driven by `durationSeconds`; overlapping animation frames are cancelled when playback stops or settings change.
- Learned: The old duration value only controlled when `scrollBehavior` was cleared, while the browser chose the actual smooth-scroll duration.
- Verification: Focused static regression check and JavaScript syntax check passed; browser playback was exercised with a 10-second interval as requested.
- Next: Monitor the GitHub Pages rollout after pushing the hosted frontend fix.

- Focus: Correct the sticky-header offset in bulletin row snapping.
- Changed: Added a measured sticky-header offset to the scroll snap padding and bottom target calculation so every landing row starts immediately below the date header.
- Learned: The date header is 41 CSS pixels in the current layout; without `scroll-padding-top`, mandatory snapping moved the first row to `scrollTop=41` and hid its first 41 pixels.
- Verification: Red-green static regression check, 19 project tests, JavaScript syntax check, and browser checks at 1920×1080 and 1366×768 passed; the top reached `scrollTop=0` and subsequent rows landed at a zero-pixel offset below the sticky header.
- Next: Monitor the GitHub Pages rollout after pushing the hosted frontend fix.

- Focus: Repair bulletin board auto-scroll on the hosted frontend.
- Changed: Constrained `.bulletin-wrap` to a viewport-based height, limited auto-scroll to fullscreen playback, aligned page transitions to bulletin rows, stopped/reset scrolling on fullscreen exit, and added static regression assertions.
- Learned: The prior `min-height` let the bulletin container grow to its full content height (`scrollHeight === clientHeight`), so the scheduler returned without starting its interval.
- Verification: Browser probe confirmed stable normal view, row-aligned fullscreen transitions, and no scrolling after fullscreen exit; full project verification is pending.
- Next: Run the full verification pass and push the hosted frontend fix.

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
