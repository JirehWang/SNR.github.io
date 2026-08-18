"""Regression checks for the origin/main-only core graft.

The floorplan work adds state, DOM hooks, and a small equipment filter to the
Gantt renderer.  This test compares the origin/main function bodies that are
not part of that integration, and normalises that one explicit filter before
comparing the shared Gantt surface renderer.
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
            "renderBulletinBoard",
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
            "    ? state.equipment\n"
            "    : visibleEquipment.filter((equipment) => Number(equipment.id) === Number(state.selectedGanttEquipmentId));\n"
            "  ganttEquipment.forEach((equipment) => {"
        )
        self.assertIn(floorplan_filter, current_surface)
        normalised_surface = current_surface.replace(
            floorplan_filter,
            "  state.equipment.forEach((equipment) => {",
            1,
        )
        self.assertEqual(normalised_surface, origin_surface)

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
        self.assertEqual(
            [line for line in origin.splitlines() if line not in current.splitlines()],
            [],
            "styles.css dropped an origin/main line outside the floorplan append",
        )


if __name__ == "__main__":
    unittest.main()
