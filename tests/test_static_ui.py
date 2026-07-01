import unittest
from pathlib import Path


STATIC = Path(__file__).resolve().parents[1] / "app" / "static"


class StaticUiTestCase(unittest.TestCase):
    def test_gantt_view_assets_are_present(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")
        css = (STATIC / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="ganttChart"', html)
        self.assertIn('id="ganttScale"', html)
        self.assertIn("function renderGantt()", js)
        self.assertIn("function getGanttBarStyle", js)
        self.assertIn(".gantt-chart", css)
        self.assertIn(".gantt-bar", css)

    def test_excel_download_ui_is_removed(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")

        self.assertNotIn("/api/export.xlsx", html)
        self.assertNotIn("下載 Excel", html)
        self.assertNotIn("SharePoint Excel", html)

    def test_dashboard_and_equipment_status_controls_are_present(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")
        css = (STATIC / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="dashboardMetrics"', html)
        self.assertIn("function renderDashboardMetrics()", js)
        self.assertIn("function updateEquipmentStatus", js)
        self.assertIn("equipment-status-select", js)
        self.assertIn(".metrics-grid", css)
        self.assertIn(".equipment-status-select", css)


if __name__ == "__main__":
    unittest.main()
