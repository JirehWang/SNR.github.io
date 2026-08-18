from pathlib import Path
import unittest

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "prototypes" / "process_ui_floorplan_transparent_clean.py"
INPUT_PATH = ROOT / "prototypes" / "equipment-floorplan-ui-transparent.png"
OUTPUT_PATH = ROOT / "prototypes" / "equipment-floorplan-ui-transparent-clean.png"
EXPECTED_SIZE = (804, 608)
OPAQUE_ALPHA = 224
LINE_POINTS = (
    (24, 50),
    (83, 300),
    (260, 570),
    (611, 150),
    (768, 100),
)
BOX_POINTS = (
    (257, 327),
    (520, 327),
)


def _open_rgba(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def _component_stats(alpha):
    mask = (alpha > 0).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return stats[1:count]


class TransparentFloorplanCleanTest(unittest.TestCase):
    def test_clean_output_exists_and_keeps_rgba_canvas(self):
        self.assertTrue(SCRIPT_PATH.exists(), "missing clean processing script")
        self.assertTrue(INPUT_PATH.exists(), "missing transparent input PNG")
        self.assertTrue(OUTPUT_PATH.exists(), "missing clean transparent PNG")

        with Image.open(INPUT_PATH) as input_image:
            self.assertEqual(input_image.size, EXPECTED_SIZE)

        with Image.open(OUTPUT_PATH) as output_image:
            self.assertEqual(output_image.mode, "RGBA")
            self.assertEqual(output_image.size, EXPECTED_SIZE)

        rgba = _open_rgba(OUTPUT_PATH)
        for x, y in ((0, 0), (803, 0), (0, 607), (803, 607)):
            self.assertEqual(int(rgba[y, x, 3]), 0, f"corner {(x, y)} should stay transparent")

    def test_clean_output_keeps_three_components_and_removes_all_low_alpha_fringe(self):
        input_rgba = _open_rgba(INPUT_PATH)
        output_rgba = _open_rgba(OUTPUT_PATH)
        input_alpha = input_rgba[:, :, 3]
        output_alpha = output_rgba[:, :, 3]

        self.assertFalse(np.array_equal(input_rgba, output_rgba), "clean output must differ from input")
        self.assertEqual(int(((output_alpha > 0) & (output_alpha < 255)).sum()), 0)

        input_components = _component_stats(input_alpha)
        output_components = _component_stats(output_alpha)
        removed_mask = (input_alpha > 0) & (output_alpha == 0)
        low_alpha_mask = (input_alpha > 0) & (input_alpha < OPAQUE_ALPHA)

        self.assertGreaterEqual(len(input_components), 3)
        self.assertEqual(len(output_components), 3)
        self.assertGreater(int(input_components[:, cv2.CC_STAT_AREA].sum()), int(output_components[:, cv2.CC_STAT_AREA].sum()))
        self.assertEqual(int(removed_mask.sum()), int(low_alpha_mask.sum()))
        self.assertTrue(np.array_equal(removed_mask, low_alpha_mask), "removed pixels must be exactly the low-alpha fringe")

        for x, y in BOX_POINTS:
            pixel = output_rgba[y, x]
            self.assertEqual(int(pixel[3]), 255, f"box pixel {(x, y)} should stay opaque")

    def test_main_line_samples_remain_visible(self):
        output_rgba = _open_rgba(OUTPUT_PATH)

        for x, y in LINE_POINTS:
            pixel = output_rgba[y, x]
            self.assertEqual(int(pixel[3]), 255, f"line pixel {(x, y)} lost opacity")
            self.assertLess(int(pixel[:3].max()), 250, f"line pixel {(x, y)} no longer looks dark")

        self.assertGreater(int((output_rgba[:, :, 3] > 0).sum()), 18000)


if __name__ == "__main__":
    unittest.main()
