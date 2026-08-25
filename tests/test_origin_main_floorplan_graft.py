"""Regression checks for the origin/main-only core graft.

The floorplan and bulletin viewport work add state, DOM hooks, dynamic
bulletin-range behavior, and a small equipment filter to the Gantt renderer.
This test compares the origin/main function bodies that are not part of those
integrations, and normalises the explicit shared-surface differences before
comparing the renderer.
"""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def origin_file(relative_path: str) -> str:
    result = subprocess.run(
        ["git", "show", f"origin/main:{relative_path}"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.decode("utf-8")


def function_body(source: str, name: str) -> str:
    """Return one top-level function, with enough lexical handling for app.js."""
    match = re.search(rf"(?m)^(?:async )?function {re.escape(name)}\s*\(", source)
    if not match:
        raise AssertionError(f"function {name}() is missing")

    # A destructured parameter (for example renderGanttSurface's
    # ``({ scaleId, chartId, ... })``) contains braces before the body.
    # Locate the closing parameter parenthesis first.
    parameter_depth = 0
    parameter_end = None
    parameter_index = source.find("(", match.end() - 1)
    while parameter_index < len(source):
        char = source[parameter_index]
        if char == "(":
            parameter_depth += 1
        elif char == ")":
            parameter_depth -= 1
            if parameter_depth == 0:
                parameter_end = parameter_index
                break
        parameter_index += 1
    if parameter_end is None:
        raise AssertionError(f"function {name}() has no closed parameter list")
    opening = source.find("{", parameter_end)
    if opening < 0:
        raise AssertionError(f"function {name}() has no body")

    depth = 0
    quote = None
    escaped = False
    index = opening
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char == "/" and next_char == "/":
            newline = source.find("\n", index + 2)
            index = len(source) if newline < 0 else newline + 1
            continue
        if char == "/" and next_char == "*":
            end = source.find("*/", index + 2)
            index = len(source) if end < 0 else end + 2
            continue
        if char in "'\"`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[match.start() : index + 1].strip()
        index += 1
    raise AssertionError(f"function {name}() has an unclosed body")


class OriginMainFloorplanGraftTest(unittest.TestCase):
    def test_shared_gantt_reservation_and_bulletin_functions_match_origin(self):
        origin = origin_file("app.js")
        current = (ROOT / "app.js").read_text(encoding="utf-8")

        # These bodies are outside the floorplan integration boundary.  An
        # accidental Gantt, reservation-list, or bulletin rewrite changes the
        # comparison and fails this test immediately.
        stable_functions = (
            "renderGantt",
            "handleMainGanttLaneDoubleClick",
            "layoutStackedReservations",
            "applyRightEdgeFill",
            "isSingleDayReservation",
            "getVisibleStackedReservations",
            "getReservationsIntersectingRange",
            "getDefaultGanttMetrics",
            "getBulletinGanttMetrics",
            "getGanttLaneSummary",
            "getGanttBarStyle",
            "getStackedGanttBarStyle",
            "getMainGanttBarMarkup",
            "getBulletinGanttBarMarkup",
            "renderReservationRows",
            "setReservationListStatus",
            "moveReservationListPage",
            "renderEquipmentScheduleDialog",
        )
        for name in stable_functions:
            self.assertEqual(
                function_body(current, name),
                function_body(origin, name),
                f"{name}() differs from origin/main",
            )

        origin_surface = function_body(origin, "renderGanttSurface")
        current_surface = function_body(current, "renderGanttSurface")
        floorplan_filter = (
            "  const visibleEquipment = state.equipment.filter((equipment) => !isEquipmentDisabled(equipment));\n"
            "  const ganttEquipment = state.selectedGanttEquipmentId == null\n"
            "    ? visibleEquipment\n"
            "    : visibleEquipment.filter((equipment) => Number(equipment.id) === Number(state.selectedGanttEquipmentId));\n"
            "  ganttEquipment.forEach((equipment) => {"
        )
        self.assertIn(floorplan_filter, current_surface)
        origin_equipment_loop = "  state.equipment.forEach((equipment) => {"

        def strip_floorplan_filter(surface: str) -> str:
            return surface.replace(floorplan_filter, origin_equipment_loop, 1)

        bulletin_geometry = (
            "  const geometry = variant === \"default\"\n"
            "    ? getGanttDisplayGeometry(document.querySelector(\".gantt-schedule-wrap\"))\n"
            "    : getGanttDisplayGeometry(document.querySelector(\".bulletin-wrap\"), { variant: \"bulletin\", dayCount: range.dayCount });\n"
            "  const { dayWidth, equipmentColumnWidth } = geometry;\n"
            "  const minWidth = equipmentColumnWidth + range.dayCount * dayWidth;\n"
            "  scale.style.gridTemplateColumns = `${equipmentColumnWidth}px repeat(${range.dayCount}, ${dayWidth}px)`;\n"
            "  scale.style.width = `${minWidth}px`;\n"
            "  scale.style.minWidth = `${minWidth}px`;\n"
            "  scale.style.setProperty(\"--gantt-year-label-left\", `calc(${equipmentColumnWidth}px + 8px)`);\n"
            "  scale.style.setProperty(\"--gantt-year-label-right\", \"8px\");\n"
            "  chart.style.width = `${minWidth}px`;\n"
            "  chart.style.minWidth = `${minWidth}px`;"
        )
        origin_geometry = (
            "  const dayWidth = variant === \"default\"\n"
            "    ? getMainScheduleDayWidth()\n"
            "    : getGanttDisplayDayWidth(document.querySelector(\".bulletin-wrap\"));\n"
            "  const minWidth = 220 + range.dayCount * dayWidth;\n"
            "  scale.style.gridTemplateColumns = `220px repeat(${range.dayCount}, ${dayWidth}px)`;\n"
            "  scale.style.width = `${minWidth}px`;\n"
            "  scale.style.minWidth = `${minWidth}px`;\n"
            "  scale.style.setProperty(\"--gantt-year-label-left\", \"calc(220px + 8px)\");\n"
            "  scale.style.setProperty(\"--gantt-year-label-right\", \"8px\");\n"
            "  chart.style.width = `${minWidth}px`;\n"
            "  chart.style.minWidth = `${minWidth}px`;"
        )
        bulletin_day_header = (
            "    if (variant === \"bulletin\") {\n"
            "      tick.innerHTML = `<span>${dayNames[date.getDay()].replace(\".\", \"\")}</span><span>${formatDate(date)}</span>`;\n"
            "    } else {\n"
            "      tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;\n"
            "    }"
        )
        origin_day_header = "    tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;"
        self.assertIn(bulletin_geometry, current_surface)
        self.assertIn(bulletin_day_header, current_surface)
        self.assertIn('    row.style.gridTemplateColumns = `${equipmentColumnWidth}px minmax(0, 1fr)`;', current_surface)
        normalised_surface = strip_floorplan_filter(current_surface).replace(
            bulletin_geometry,
            origin_geometry,
            1,
        )
        normalised_surface = normalised_surface.replace(bulletin_day_header, origin_day_header, 1)
        normalised_surface = normalised_surface.replace(
            '    row.style.gridTemplateColumns = `${equipmentColumnWidth}px minmax(0, 1fr)`;\n',
            "",
            1,
        )
        self.assertEqual(normalised_surface, strip_floorplan_filter(origin_surface))

    def test_bulletin_range_behavior_is_intentional(self):
        current = (ROOT / "app.js").read_text(encoding="utf-8")
        render_bulletin = function_body(current, "renderBulletinBoard")
        move_bulletin = function_body(current, "moveBulletinMonth")
        update_range = function_body(current, "updateBulletinRangeSelection")

        self.assertIn("const BULLETIN_RANGE_DAY_OPTIONS = [7, 14, 28];", current)
        self.assertIn("const BULLETIN_DEFAULT_RANGE_DAYS = 28;", current)
        self.assertIn("bulletinRangeStart: startOfDay(new Date())", current)
        self.assertIn("bulletinRangeDays: BULLETIN_DEFAULT_RANGE_DAYS", current)
        self.assertIn("bulletinRangeSyncTimerId: null", current)
        self.assertIn("function getBulletinScheduleRange(", current)
        self.assertIn("const bulletinRange = getBulletinScheduleRange();", render_bulletin)
        self.assertIn("state.bulletinRangeStart = addDays(state.bulletinRangeStart || new Date(), direction * days);", move_bulletin)
        self.assertIn("state.bulletinRangeDays = getBulletinRangeDays(rangeSelect.value);", update_range)
        self.assertIn("relayoutBulletinBoard({ resetAutoScroll: true });", update_range)

        sync_range = function_body(current, "syncBulletinRangeToToday")
        schedule_sync = function_body(current, "scheduleBulletinRangeSync")
        visibility_sync = function_body(current, "handleBulletinVisibilityChange")
        self.assertIn("const today = startOfDay(new Date());", sync_range)
        self.assertIn("state.bulletinRangeStart = today;", sync_range)
        self.assertIn("relayoutBulletinBoard({ resetAutoScroll: true });", sync_range)
        self.assertIn("const nextMidnight = startOfDay(addDays(now, 1));", schedule_sync)
        self.assertIn("state.bulletinRangeSyncTimerId = window.setTimeout(", schedule_sync)
        self.assertIn("syncBulletinRangeToToday();", schedule_sync)
        self.assertIn("scheduleBulletinRangeSync();", schedule_sync)
        self.assertIn('if (document.visibilityState !== "visible") return;', visibility_sync)
        self.assertIn("syncBulletinRangeToToday();", visibility_sync)
        self.assertIn("scheduleBulletinRangeSync();", visibility_sync)

    def test_bulletin_settings_are_collapsed_by_default(self):
        current = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn('<details id="bulletinSettings" class="bulletin-settings">', current)
        self.assertIn('id="bulletinSettingsToggle"', current)
        self.assertIn('aria-controls="bulletinSettingsPanel"', current)
        self.assertIn('aria-expanded="false"', current)
        self.assertIn('id="bulletinSettingsPanel"', current)
        self.assertNotIn('<details id="bulletinSettings" class="bulletin-settings" open>', current)
        self.assertIn("function bindBulletinSettingsToggle()", app)
        self.assertIn('settings.addEventListener("toggle", syncExpandedState);', app)

    def test_origin_reservation_and_bulletin_hooks_remain_in_index(self):
        origin = origin_file("index.html")
        current = (ROOT / "index.html").read_text(encoding="utf-8")
        required_origin_hooks = (
            'id="reservationRows"',
            'id="reservationOpenTab"',
            'id="reservationClosedTab"',
            'id="reservationPrevPage"',
            'id="reservationNextPage"',
            'id="bulletinPrevMonth"',
            'id="bulletinMonthLabel"',
            'id="bulletinNextMonth"',
            'id="ganttScale"',
            'id="ganttChart"',
            'id="reservationDetailDialog"',
        )
        for hook in required_origin_hooks:
            self.assertIn(hook, origin)
            self.assertIn(hook, current, f"origin/main hook removed: {hook}")
        self.assertIn('id="bulletinRangeSelect"', current, "bulletin range selector removed")
        self.assertIn('id="bulletinSettings"', current, "bulletin settings wrapper removed")

    def test_equipment_view_exposes_only_floorplan_and_disabled_labels(self):
        current = (ROOT / "index.html").read_text(encoding="utf-8")
        start = current.index('<div class="workspace-view" data-view="equipment">')
        end = current.index('<div class="workspace-view" data-view="requester">', start)
        equipment_view = current[start:end]

        self.assertIn('id="floorplanCanvas"', equipment_view)
        self.assertIn('id="floorplanOverlay"', equipment_view)
        self.assertIn('id="disabledEquipmentSection"', equipment_view)
        self.assertIn('id="disabledEquipmentList"', equipment_view)

        # The legacy renderer/form remain in the DOM for app.js synchronisation,
        # but neither is part of the visible equipment-management surface.
        self.assertRegex(
            equipment_view,
            r'<div[^>]*class="[^"]*legacy-equipment-summary-title[^"]*"[^>]*hidden',
        )
        self.assertRegex(
            equipment_view,
            r'<div[^>]*id="equipmentSummary"[^>]*hidden',
        )
        self.assertRegex(
            equipment_view,
            r'<aside[^>]*class="[^"]*admin-panel[^"]*"[^>]*hidden',
        )
        self.assertIn('id="equipmentForm"', equipment_view)
        self.assertIn('id="equipmentMessage"', equipment_view)

    def test_equipment_editor_uses_modal_and_shared_entry_points(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("dialog?.showModal();", app)
        self.assertNotIn("dialog?.show();", app)
        self.assertIn('getElementById("equipmentAddBtn")?.addEventListener("click", () => startEditEquipment(null))', app)
        self.assertIn("startEditEquipment(Number(button.dataset.equipmentId))", app)
        self.assertIn("startEditEquipment(Number(button.dataset.editDisabledEquipment))", app)
        self.assertIn('id="equipmentEditorDialog"', html)
        self.assertIn('id="equipmentDialogFloorplanCanvas"', html)
        self.assertIn('id="equipmentDialogFloorplanOverlay"', html)

    def test_stylesheet_has_no_base_deletions(self):
        origin = origin_file("styles.css")
        current = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertTrue(current.endswith(origin[-1:]))
        allowed_bulletin_viewport_replacements = {
            "  min-width: 1320px;",
            "  height: calc(100vh - 140px);",
            "  min-height: 240px;",
        }
        self.assertEqual(
            [
                line for line in origin.splitlines()
                if line not in current.splitlines() and line not in allowed_bulletin_viewport_replacements
            ],
            [],
            "styles.css dropped an origin/main line outside the floorplan append",
        )


if __name__ == "__main__":
    unittest.main()
