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

- Focus: Expand reservation history and organize the project list.
- Changed: Loaded all reservations for the list, split it into 未結案 and 已結案 tabs, added ten-project pagination, and kept the gantt/dashboard data scoped to the selected week; moved project status actions to the right side of the detail action bar.
- Verification: Browser checks confirmed 10 rows per page, page navigation, closed-project filtering, right-aligned status actions, and equal 40px action-button heights.
- Next: Push the hosted frontend update and confirm the Pages asset update.

- Focus: Polish the reservation project action buttons.
- Changed: Kept save/copy as secondary buttons, made 專案完成 a success-colored action, kept 專案取消 in the danger style, and normalized the action-row button heights and separation.
- Verification: Browser computed-style check confirmed all three action buttons share a 40px height and render with the intended colors.
- Next: Push the hosted frontend polish and confirm the Pages asset update.

- Focus: Route reservation status operations through the project detail interface.
- Changed: Replaced reservation-list completion/cancellation actions with one 編輯 button; renamed the detail actions to 專案完成 and 專案取消, added completion confirmation, required a cancellation reason, and made completed/cancelled reservations read-only.
- Verification: Static UI regression checks, 19 project tests, JavaScript syntax check, and diff check passed; browser visual verification is next.
- Next: Push the hosted frontend fix and confirm the Pages asset update.

- Focus: Calculate dashboard reservation hours within the displayed week.
- Changed: Clipped each active reservation to `state.weekStart` through seven days later before summing hours; cancellation flow review found one reason prompt and no second confirmation dialog.
- Verification: Regression checks for weekly clipping and the single cancellation reason prompt, 19 project tests, JavaScript syntax check, and diff check passed.
- Next: Push the hosted frontend fix and confirm the Pages asset update.

- Focus: Set the bulletin playback defaults requested by the user.
- Changed: Kept the scroll interval default at 30 seconds and changed the scroll animation duration default to 1 second in both HTML and JavaScript fallbacks.
- Verification: Red-green static UI regression check, 19 project tests, JavaScript syntax check, and diff check passed.
- Next: Push the hosted frontend fix and confirm the Pages asset update.

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
