from pathlib import Path
import unittest

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = Path(
    r"C:\Users\105221\AppData\Local\Temp\codex-clipboard-fd7f0b10-f3ce-42a2-87e9-68fefe127449.png"
)
SCRIPT_PATH = ROOT / "prototypes" / "process_preserved_contour.py"
OUTPUT_PATH = ROOT / "prototypes" / "equipment-floorplan-preserved-contour.png"
EXPECTED_SIZE = (990, 778)

EQUIPMENT_MASKS = (
    (305, 378, 365, 470),
    (625, 403, 690, 470),
    (900, 495, 943, 552),
)


def _open_rgba(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def _edge_map(rgba):
    gray = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
    return cv2.Canny(gray, 45, 130)


def _excluded_mask(shape):
    mask = np.zeros(shape, dtype=np.uint8)
    for x1, y1, x2, y2 in EQUIPMENT_MASKS:
        mask[y1:y2 + 1, x1:x2 + 1] = 255
    return cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=1)


class PreservedContourFloorplanTest(unittest.TestCase):
    def test_output_exists_and_keeps_reference_canvas(self):
        self.assertTrue(SOURCE_PATH.exists(), "missing source clipboard image")
        self.assertTrue(OUTPUT_PATH.exists(), "missing preserved-contour PNG")

        with Image.open(SOURCE_PATH) as source:
            self.assertEqual(source.size, EXPECTED_SIZE)
        with Image.open(OUTPUT_PATH) as output:
            self.assertEqual(output.size, EXPECTED_SIZE)

    def test_script_uses_latest_source_and_no_old_assets(self):
        self.assertTrue(SCRIPT_PATH.exists(), "missing processing script")
        script_text = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn(str(SOURCE_PATH), script_text)
        forbidden_tokens = (
            "1597",
            "1242",
            "equipment-floorplan-beautified",
            "equipment-floorplan-reference-v2",
            "equipment-floorplan-base",
            ".svg",
        )
        for token in forbidden_tokens:
            self.assertNotIn(token, script_text)

    def test_geometry_edges_are_preserved_outside_equipment_masks(self):
        source = _open_rgba(SOURCE_PATH)
        output = _open_rgba(OUTPUT_PATH)

        source_edges = _edge_map(source)
        output_edges = _edge_map(output)
        output_edges = cv2.dilate(output_edges, np.ones((5, 5), np.uint8), iterations=1)
        excluded = _excluded_mask(source_edges.shape)
        source_keep = (source_edges > 0) & (excluded == 0)
        output_keep = output_edges > 0

        source_edge_count = int(source_keep.sum())
        preserved_count = int((source_keep & output_keep).sum())
        preserved_ratio = preserved_count / source_edge_count

        self.assertGreater(source_edge_count, 1000)
        self.assertGreaterEqual(preserved_ratio, 0.98)

    def test_output_is_cosmetically_processed(self):
        source = _open_rgba(SOURCE_PATH)
        output = _open_rgba(OUTPUT_PATH)
        self.assertFalse(np.array_equal(source, output), "output is pixel-identical to source")


if __name__ == "__main__":
    unittest.main()
