from pathlib import Path
from xml.etree import ElementTree
import unittest


ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "prototypes" / "equipment-floorplan-beautified.svg"
PNG_PATH = ROOT / "prototypes" / "equipment-floorplan-beautified.png"


class BeautifiedFloorplanTest(unittest.TestCase):
    def test_clean_vector_floorplan_has_structure_only(self):
        self.assertTrue(SVG_PATH.exists())
        svg_text = SVG_PATH.read_text(encoding="utf-8")
        root = ElementTree.fromstring(svg_text)
        self.assertTrue(root.tag.endswith("svg"))
        self.assertEqual(root.attrib.get("viewBox"), "0 0 1597 1242")
        self.assertNotIn("equipment", svg_text.lower())
        self.assertNotIn("<image", svg_text)
        required_ids = {"outer-wall", "main-aisle", "doors", "ess-room", "accessory-room"}
        actual_ids = {node.attrib.get("id") for node in root.iter() if node.attrib.get("id")}
        self.assertTrue(required_ids.issubset(actual_ids))

    def test_png_is_exported_at_floorplan_size(self):
        from PIL import Image

        self.assertTrue(PNG_PATH.exists())
        with Image.open(PNG_PATH) as image:
            self.assertEqual(image.size, (1597, 1242))


if __name__ == "__main__":
    unittest.main()
