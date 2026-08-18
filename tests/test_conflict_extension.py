import unittest
from pathlib import Path

class ConflictExtensionTestCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parent.parent
        self.html = (self.root / "index.html").read_text(encoding="utf-8")
        self.js = (self.root / "app.js").read_text(encoding="utf-8")
        self.css = (self.root / "styles.css").read_text(encoding="utf-8")

    def test_dialogs_are_present_in_html(self):
        self.assertIn('id="equipmentConflictWarningDialog"', self.html)
        self.assertIn('id="conflictWarningTitle"', self.html)
        self.assertIn('id="conflictWarningRows"', self.html)
        self.assertIn('id="conflictWarningCloseBtn"', self.html)
        self.assertIn('id="conflictWarningConfirmBtn"', self.html)
        
        self.assertIn('id="maintenanceExtensionDialog"', self.html)
        self.assertIn('id="maintenanceExtensionTitle"', self.html)
        self.assertIn('id="maintenanceExtendBtn"', self.html)
        self.assertIn('id="maintenanceLaterBtn"', self.html)

    def test_conflict_logic_functions_are_present_in_js(self):
        self.assertIn("function getReservationEquipmentConflict(", self.js)
        self.assertIn("function isMaintenanceExpired(", self.js)
        self.assertIn("function showEquipmentConflictWarningDialog(", self.js)
        self.assertIn("function promptMaintenanceExtensionDialog(", self.js)
        self.assertIn("function extendEquipmentMaintenance(", self.js)
        self.assertIn("getReservationEquipmentConflict(reservation)", self.js)

    def test_css_classes_for_conflict_highlight_exist(self):
        self.assertIn(".reservation-row.is-equipment-conflict", self.css)
        self.assertIn(".badge.badge-conflict-danger", self.css)
        self.assertIn(".gantt-bar.is-equipment-conflict", self.css)
        self.assertIn(".conflict-warning-dialog", self.css)
        self.assertIn(".maintenance-extension-dialog", self.css)

if __name__ == "__main__":
    unittest.main()
