import re
import unittest
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "prototypes" / "equipment-floorplan-ux.html"
SVG_PATH = ROOT / "prototypes" / "equipment-floorplan-clean.svg"

EXPECTED_COORDS = {
    "eq-12": (4.1, 18.8, 8.5, 7.2),
    "eq-11": (26.4, 19.4, 8.3, 7.6),
    "eq-8": (45.0, 18.7, 7.7, 9.8),
    "eq-7": (56.2, 18.9, 7.4, 9.4),
    "eq-6": (67.8, 18.7, 7.7, 9.9),
    "eq-10": (24.0, 32.2, 8.3, 7.3),
    "eq-9": (35.5, 31.4, 8.3, 7.7),
    "eq-5": (46.1, 31.4, 8.8, 7.7),
    "eq-1": (57.5, 31.4, 8.3, 7.7),
    "eq-13": (68.2, 31.4, 8.5, 7.7),
    "eq-2": (73.8, 85.2, 10.8, 6.2),
    "eq-4": (67.5, 7.2, 10.2, 4.9),
    "eq-3": (81.7, 7.2, 9.0, 11.9),
    "eq-16": (6.8, 64.0, 4.3, 7.2),
}


class FloorplanPrototypeTest(unittest.TestCase):
    def test_html_references_clean_png_and_preserves_overlay_coordinates(self):
        html = HTML_PATH.read_text(encoding="utf-8")

        self.assertIn('src="equipment-floorplan-ui-transparent-clean.png"', html)
        self.assertNotIn('src="equipment-floorplan-clean.svg"', html)
        self.assertNotIn('src="equipment-floorplan.png"', html)
        self.assertIn('class="overlay" id="overlay"', html)
        self.assertIn("data-device-id", html)

        for device_id, coords in EXPECTED_COORDS.items():
            pattern = (
                r'id:\s*"'
                + re.escape(device_id)
                + r'".*?x:\s*([0-9.]+),\s*y:\s*([0-9.]+),\s*w:\s*([0-9.]+),\s*h:\s*([0-9.]+)'
            )
            match = re.search(pattern, html)
            self.assertIsNotNone(match, f"missing coordinates for {device_id}")
            self.assertEqual(tuple(float(value) for value in match.groups()), coords)

    def test_clean_svg_has_vector_plan_structure_without_raster_or_grid(self):
        svg_text = SVG_PATH.read_text(encoding="utf-8")
        root = ElementTree.fromstring(svg_text)

        self.assertTrue(root.tag.endswith("svg"))
        self.assertEqual(root.attrib.get("viewBox"), "0 0 1597 1242")
        self.assertNotIn("<image", svg_text)
        self.assertNotIn("<pattern", svg_text)
        self.assertNotIn("grid", svg_text.lower())

        ids = {element.attrib.get("id") for element in root.iter() if element.attrib.get("id")}
        self.assertNotIn("equipment-backdrop", ids)
        self.assertNotIn("fixed-utilities", ids)

        for required_id in {
            "outer-wall",
            "interior-walls",
            "central-corridor",
            "top-chamber-lane",
            "lower-work-area",
            "esd-corner",
            "doors",
        }:
            self.assertIn(required_id, ids)


if __name__ == "__main__":
    unittest.main()
