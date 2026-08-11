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

### 2026-08-10

- Focus: Restructure the hosted reservation workflow around a month-at-a-glance schedule.
- Changed: Moved the reservation form into a modal; made the main schedule show the calendar month starting today with a sticky date header and independently scrollable vertical/horizontal schedule area; clicking an available blank cell now preselects its equipment and date at 08:30 while leaving the end time blank. Added requester categories with PQE priority, Senao-internal and external color treatments in both requester management and the reservation form/typeahead.
- Verification: Focused static regression test, full `scripts/verify.ps1` suite (21 tests), JavaScript syntax and diff checks passed. Browser checks verified desktop and mobile modal layout, the one-month range, sticky/overflowing schedule dimensions, blank-cell prefill (Drop Tester / 2026-08-11 08:30 / empty end time), and requester category rendering.
- Deployment: Changes remain uncommitted and unpushed in the dedicated cloud-version worktree at `D:\py\SNR.github.io-cloud-feature`, as requested.

- Follow-up: Reworked the main schedule into a one-month viewport backed by a six-month buffer on each side; horizontal dragging and month buttons update the focused month, and reaching either buffer edge extends it by another six months. Equipment labels and a representative reservation summary remain frozen while the schedule moves. Applied the same requester-category colors to main/bulletin reservation bars and paginated reservation rows; bulletin month navigation now advances one month at a time.
- Follow-up verification: Browser checks confirmed initial 8/10-9/9 alignment, horizontal scroll, right-edge buffer extension, sticky equipment/reservation summaries, month-button movement, mobile no-page-overflow, bulletin horizontal containment, and category background colors.

- Follow-up: Moved the frozen reservation summary out of the equipment-name column and into the Gantt lane, where it stays pinned to the lane's left edge during horizontal dragging. Main Gantt row sizing now recalculates from overlaps inside the currently focused month; overlapping reservations use the stacked compact layout, while months without visible overlap return to the original single-row height. Month buttons and cross-month horizontal scrolling both trigger the same recalculation.
- Follow-up verification: Static regression suite (23 tests), JavaScript syntax check, and diff check passed. Browser checks confirmed no frozen summary under equipment labels, lane-pinned summary position before/after horizontal scroll, 90px stacked rows for the July overlap window, and return to 76px rows for the non-overlap August window.

- Follow-up: Replaced the separate lane reservation summary with the original `.gantt-bar-info` content. During horizontal scrolling, the existing bar text is translated to the visible Gantt left edge while its bar intersects the viewport, then released when the bar leaves; the text is also bounded by the Gantt right edge. Added resize synchronization so the behavior follows viewport changes.
- Follow-up verification: Red-green focused static checks, browser coordinate checks, and screenshot review confirmed zero duplicate frozen-summary nodes, bar text pinned at the Gantt left edge, release after the bar exits, and no text beyond the Gantt right boundary.

- Follow-up: Applied light same-hue completed styling for PQE, Senao-internal, and external reservations across Gantt bars, bulletin bars, and completed reservation-list rows. Kept the category identity while making the checked-out state visually distinct. Refactored the main blank-lane click into an explicit handler so clicking an empty Gantt cell continues to open the booking dialog with equipment and 08:30 start prefilled and end time blank.
- Follow-up verification: Focused red-green checks, full 23-test verification, browser color assertions, closed-list row checks, screenshot review, and blank-cell booking interaction passed.

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

### 2026-08-10

- Focus: Restore blank-cell reservation clicks without losing horizontal Gantt dragging.
- Changed: Added a 6px horizontal movement threshold before pointer capture, kept normal clicks available for lane reservation, and changed the idle Gantt cursor from `grab` to the default cursor.
- Learned: Capturing the pointer immediately on `pointerdown` caused a simple lane click to be treated as a drag gesture.
- Verification: Browser check opened a blank-cell reservation dialog with equipment prefilled, start time at 08:30, and blank end time; an actual horizontal drag still changed `scrollLeft` and cleared the dragging state afterward.
- Next: Keep this cloud-feature worktree uncommitted and unsynced until explicitly requested.

### 2026-08-10 (follow-up)

- Focus: Change blank-cell reservation activation to double-click.
- Changed: Replaced the main Gantt lane reservation listener with `dblclick` and renamed the handler to reflect the interaction.
- Verification: Static regression test confirms the lane no longer listens for single-click reservation activation.

### 2026-08-10 (display range follow-up)

- Focus: Use a fixed 31-day display window for the reservation Gantt and bulletin board.
- Changed: Centralized the fixed display range, updated the main date label and bulletin range to 31 days, sized both Gantt column widths against the container, and re-rendered the visible board after view changes or resize.
- Preserved: The main schedule's six-month extension buffer, month navigation, drag behavior, reservation interactions, colors, and bulletin playback logic.
- Verification: Browser checks showed the main label as an exact 31-day window and the bulletin board rendered 31 date cells; static tests and JavaScript syntax checks passed.

### 2026-08-11

- Focus: Align bulletin and reservation Gantt grid lines.
- Changed: Removed the bulletin-only minimum-width expansion and explicitly set each Gantt scale and chart to the same calculated width (`220px + dayCount × dayWidth`).
- Learned: `min-width` allowed the block containers to expand beyond the inline grid tracks, so lane background lines were calculated over a wider width than the date headers.
- Verification: Browser geometry checks at desktop and mobile sizes reported zero day-to-lane width delta for both bulletin and reservation Gantts; focused regression test passed.
