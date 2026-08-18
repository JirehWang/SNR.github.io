import re
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = Path(
    r"C:\Users\105221\AppData\Local\Temp\codex-clipboard-348d924c-ff06-4597-b0e5-e10142e6b637.png"
)
SCRIPT_PATH = ROOT / "prototypes" / "process_ui_floorplan_transparent.py"
OUTPUT_PATH = ROOT / "prototypes" / "equipment-floorplan-ui-transparent.png"
HTML_PATH = ROOT / "prototypes" / "equipment-floorplan-ux.html"
EXPECTED_SIZE = (804, 608)
LINE_POINTS = (
    (24, 50),
    (83, 300),
    (260, 570),
    (611, 150),
    (768, 100),
)


def _open_rgba(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


class TransparentFloorplanTest(unittest.TestCase):
    def test_script_tracks_latest_source(self):
        self.assertTrue(SOURCE_PATH.exists(), "missing source clipboard image")
        self.assertTrue(SCRIPT_PATH.exists(), "missing transparent processing script")

        script_text = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn(str(SOURCE_PATH), script_text)

    def test_output_is_rgba_same_size_and_has_transparent_corners(self):
        self.assertTrue(OUTPUT_PATH.exists(), "missing transparent floorplan PNG")

        with Image.open(SOURCE_PATH) as source:
            self.assertEqual(source.size, EXPECTED_SIZE)

        with Image.open(OUTPUT_PATH) as output:
            self.assertEqual(output.mode, "RGBA")
            self.assertEqual(output.size, EXPECTED_SIZE)

        rgba = _open_rgba(OUTPUT_PATH)
        for x, y in ((0, 0), (803, 0), (0, 607), (803, 607)):
            self.assertEqual(int(rgba[y, x, 3]), 0, f"corner {(x, y)} should be transparent")

    def test_linework_pixels_remain_visible(self):
        rgba = _open_rgba(OUTPUT_PATH)

        visible_count = 0
        for x, y in LINE_POINTS:
            alpha = int(rgba[y, x, 3])
            darkness = int(rgba[y, x, :3].max())
            self.assertGreater(alpha, 0, f"line pixel {(x, y)} lost alpha")
            self.assertLess(darkness, 250, f"line pixel {(x, y)} no longer looks like linework")
            visible_count += 1

        self.assertEqual(visible_count, len(LINE_POINTS))
        self.assertGreater(int((rgba[:, :, 3] > 0).sum()), 15000)

    def test_html_uses_transparent_png_and_keeps_interaction_hooks(self):
        html = HTML_PATH.read_text(encoding="utf-8")

        self.assertIn('src="equipment-floorplan-ui-transparent-clean.png"', html)
        self.assertNotIn("equipment-floorplan-clean.svg", html)
        for hook in ('id="overlay"', 'id="addDevice"', 'id="layoutMode"', 'id="selectedName"'):
            self.assertIn(hook, html)
        self.assertIn("data-device-id", html)

        self.assertIn('id="exportPlacements"', html)

        for device_id in ("ch06", "drop", "salt", "ess-a", "ess-b"):
            pattern = r'id:\s*"' + re.escape(device_id) + r'".*?x:\s*[0-9.]+,\s*y:\s*[0-9.]+'
            self.assertRegex(html, pattern)


if __name__ == "__main__":
    unittest.main()
