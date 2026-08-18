from pathlib import Path
import unittest

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = Path(
    r"C:\Users\105221\AppData\Local\Temp\codex-clipboard-fd7f0b10-f3ce-42a2-87e9-68fefe127449.png"
)
SCRIPT_PATH = ROOT / "prototypes" / "process_professional_floorplan.py"
OUTPUT_PATH = ROOT / "prototypes" / "equipment-floorplan-professional.png"
EXPECTED_SIZE = (990, 778)

ARTIFACT_MASKS = (
    (305, 378, 365, 470),
    (625, 403, 690, 470),
    (900, 495, 943, 552),
    (914, 330, 975, 550),
    (35, 310, 100, 340),
    (125, 630, 205, 655),
    (530, 686, 600, 750),
)

TEXT_SCRUB_RECTS = (
    (914, 330, 975, 550),
    (35, 310, 100, 340),
    (530, 686, 600, 750),
)

TARGET_PALETTE = {
    "paper": np.array([245, 245, 239], dtype=np.int16),
    "lab_band": np.array([231, 238, 231], dtype=np.int16),
    "circulation": np.array([211, 218, 226], dtype=np.int16),
    "service": np.array([234, 240, 244], dtype=np.int16),
    "support": np.array([242, 238, 229], dtype=np.int16),
}


def _open_rgba(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def _edge_map(rgba):
    gray = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
    return cv2.Canny(gray, 45, 130)


def _excluded_mask(shape):
    mask = np.zeros(shape, dtype=np.uint8)
    for x1, y1, x2, y2 in ARTIFACT_MASKS:
        mask[y1 : y2 + 1, x1 : x2 + 1] = 255
    return cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=1)


def _largest_component(mask):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    if count <= 1:
        return 0
    return int(stats[1:, cv2.CC_STAT_AREA].max())


class ProfessionalFloorplanTest(unittest.TestCase):
    def test_output_exists_and_keeps_reference_canvas(self):
        self.assertTrue(SOURCE_PATH.exists(), "missing source clipboard image")
        self.assertTrue(SCRIPT_PATH.exists(), "missing professional processing script")
        self.assertTrue(OUTPUT_PATH.exists(), "missing professional PNG")

        with Image.open(SOURCE_PATH) as source:
            self.assertEqual(source.size, EXPECTED_SIZE)
        with Image.open(OUTPUT_PATH) as output:
            self.assertEqual(output.size, EXPECTED_SIZE)

    def test_script_uses_latest_source_and_no_old_assets(self):
        self.assertTrue(SCRIPT_PATH.exists(), "missing professional processing script")
        script_text = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn(str(SOURCE_PATH), script_text)
        forbidden_tokens = (
            "1597",
            "1242",
            "equipment-floorplan-beautified",
            "equipment-floorplan-reference-v2",
            "equipment-floorplan-base",
            "equipment-floorplan-preserved-contour",
            "equipment-floorplan-polished",
            ".svg",
        )
        for token in forbidden_tokens:
            self.assertNotIn(token, script_text)

    def test_geometry_edges_are_preserved_outside_artifact_masks(self):
        source = _open_rgba(SOURCE_PATH)
        output = _open_rgba(OUTPUT_PATH)

        source_edges = _edge_map(source)
        output_edges = cv2.dilate(
            _edge_map(output), np.ones((7, 7), np.uint8), iterations=1
        )
        excluded = _excluded_mask(source_edges.shape)
        source_keep = (source_edges > 0) & (excluded == 0)
        output_keep = output_edges > 0

        source_edge_count = int(source_keep.sum())
        preserved_count = int((source_keep & output_keep).sum())
        preserved_ratio = preserved_count / source_edge_count

        self.assertGreater(source_edge_count, 1000)
        self.assertGreaterEqual(preserved_ratio, 0.98)

    def test_output_uses_engineering_palette_not_plain_copy(self):
        source = _open_rgba(SOURCE_PATH)
        output = _open_rgba(OUTPUT_PATH)

        self.assertFalse(np.array_equal(source, output), "output is pixel-identical")
        mean_abs_diff = float(
            np.mean(np.abs(source[:, :, :3].astype(np.int16) - output[:, :, :3].astype(np.int16)))
        )
        self.assertGreater(mean_abs_diff, 2.0)

        rgb = output[:, :, :3].astype(np.int16)
        matched_large_regions = 0
        for target in TARGET_PALETTE.values():
            distance = np.max(np.abs(rgb - target), axis=2)
            if _largest_component(distance <= 5) >= 2500:
                matched_large_regions += 1

        self.assertGreaterEqual(matched_large_regions, 3)

    def test_scrub_zones_remove_large_dark_textlike_fragments_and_red_marks(self):
        output = _open_rgba(OUTPUT_PATH)
        rgb = output[:, :, :3]
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

        red_like = (rgb[:, :, 0] >= 135) & (rgb[:, :, 1] <= 95) & (rgb[:, :, 2] <= 95)
        for x1, y1, x2, y2 in TEXT_SCRUB_RECTS:
            crop_gray = gray[y1 : y2 + 1, x1 : x2 + 1]
            crop_rgb = rgb[y1 : y2 + 1, x1 : x2 + 1]
            dark = crop_gray < 120

            count, labels, stats, _ = cv2.connectedComponentsWithStats(
                dark.astype(np.uint8), connectivity=8
            )
            largest = 0
            for label in range(1, count):
                largest = max(largest, int(stats[label, cv2.CC_STAT_AREA]))

            self.assertLessEqual(largest, 650, f"dark textlike fragment too large in {(x1, y1, x2, y2)}")
            self.assertFalse(red_like[y1 : y2 + 1, x1 : x2 + 1].any(), f"red mark remains in {(x1, y1, x2, y2)}")


if __name__ == "__main__":
    unittest.main()
