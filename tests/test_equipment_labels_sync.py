import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "prototypes" / "equipment-labels-source.json"
HTML_PATH = ROOT / "prototypes" / "equipment-floorplan-ux.html"
EXPECTED_NAMES = {
    "Chamber NO.2",
    "ESD 測試機",
    "Drop Tester",
    "Vibration Table",
    "Chamber NO.3",
    "Chamber NO.4",
    "Chamber NO.5",
    "Chamber NO.6",
    "Chamber NO.7",
    "Chamber NO.8",
    "Chamber NO.9",
    "Chamber NO.10",
    "Chamber NO.1",
    "ESS A",
    "ESS B",
    "鹽水噴霧試驗機",
}


class EquipmentLabelSyncTest(unittest.TestCase):
    def test_json_and_html_hooks_match_equipment_source(self):
        self.assertTrue(JSON_PATH.exists(), "missing prototypes/equipment-labels-source.json")

        payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        self.assertEqual(payload["source"], "data/rlab_reservation.db")
        self.assertEqual(payload["sourceReachability"], "network endpoint unavailable")

        equipment = payload["equipment"]
        self.assertEqual(len(equipment), 16)
        self.assertEqual({item["name"] for item in equipment}, EXPECTED_NAMES)
        self.assertEqual(len({item["equipmentId"] for item in equipment}), 16)

        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('src="equipment-floorplan-ui-transparent-clean.png"', html)
        self.assertIn('id="exportPlacements"', html)
        self.assertIn("const sourceEquipment =", html)

        for equipment_id in range(1, 17):
          self.assertIn(f"equipmentId: {equipment_id}", html)


if __name__ == "__main__":
    unittest.main()
