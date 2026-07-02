import unittest
from pathlib import Path


STATIC = Path(__file__).resolve().parents[1] / "app" / "static"


class StaticUiTestCase(unittest.TestCase):
    def test_supabase_hosted_mode_assets_are_present(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")

        self.assertIn("@supabase/supabase-js@2", html)
        self.assertNotIn('id="supabaseConfigForm"', html)
        self.assertNotIn('id="supabaseUrl"', html)
        self.assertNotIn('id="supabaseAnonKey"', html)
        self.assertIn('const SUPABASE_URL = "https://sbqqylrnjfrrqwrdiiun.supabase.co"', js)
        self.assertIn("const SUPABASE_ANON_KEY =", js)
        self.assertIn("function initializeSupabase()", js)
        self.assertIn("function buildClient", js)
        self.assertIn("window.supabase.createClient", js)

    def test_gantt_view_assets_are_present(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")
        css = (STATIC / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="ganttChart"', html)
        self.assertIn('id="ganttScale"', html)
        self.assertIn("function renderGantt()", js)
        self.assertIn("function getGanttBarStyle", js)
        self.assertIn("project_name", js)
        self.assertIn(".gantt-chart", css)
        self.assertIn(".gantt-bar", css)

    def test_reservation_form_has_project_name_and_no_week_schedule_panel(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")

        self.assertIn('name="project_name"', html)
        self.assertIn("project_name: payload.project_name.trim()", js)
        self.assertNotIn('id="scheduleBoard"', html)
        self.assertNotIn("function renderWeek()", js)

    def test_legacy_excel_and_local_api_ui_is_removed(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")

        self.assertNotIn("/api/export.xlsx", html)
        self.assertNotIn("SharePoint Excel", html)
        self.assertNotIn('fetch("/api/', js)

    def test_dashboard_and_equipment_management_views_are_present(self):
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        js = (STATIC / "app.js").read_text(encoding="utf-8")
        css = (STATIC / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="dashboardMetrics"', html)
        self.assertIn('data-view="reservation"', html)
        self.assertIn('data-view="equipment"', html)
        self.assertIn('id="equipmentFormTitle"', html)
        self.assertIn('id="equipmentCancelBtn"', html)
        self.assertIn('option value="validation"', html)
        self.assertIn("function renderDashboardMetrics()", js)
        self.assertIn("function startEditEquipment", js)
        self.assertIn("function syncEquipmentForm", js)
        self.assertIn("function cancelEquipmentEdit", js)
        self.assertIn("function equipmentMatchesPayload", js)
        self.assertIn('statusText.validation = "驗證中"', js)
        self.assertIn(".metrics-grid", css)
        self.assertIn(".workspace-tab", css)
        self.assertIn(".equipment-card-actions", css)
        self.assertIn(".badge.validation", css)


if __name__ == "__main__":
    unittest.main()
