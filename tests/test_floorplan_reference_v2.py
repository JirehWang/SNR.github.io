from pathlib import Path
from xml.etree import ElementTree
import unittest


ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "prototypes" / "equipment-floorplan-reference-v2.svg"
PNG_PATH = ROOT / "prototypes" / "equipment-floorplan-reference-v2.png"


def _find_by_id(root, element_id):
    for node in root.iter():
        if node.attrib.get("id") == element_id:
            return node
    return None


def _float_attr(node, name):
    return float(node.attrib[name])


class ReferenceV2FloorplanTest(unittest.TestCase):
    def test_svg_is_reference_sized_clean_structure(self):
        self.assertTrue(SVG_PATH.exists(), "missing v2 SVG")
        svg_text = SVG_PATH.read_text(encoding="utf-8")
        root = ElementTree.fromstring(svg_text)

        self.assertTrue(root.tag.endswith("svg"))
        self.assertEqual(root.attrib.get("viewBox"), "0 0 990 778")
        self.assertEqual(root.attrib.get("width"), "990")
        self.assertEqual(root.attrib.get("height"), "778")
        self.assertNotIn("<image", svg_text)
        self.assertNotIn("1597", svg_text)
        self.assertNotIn("1242", svg_text)

        forbidden_tokens = {
            "ch01",
            "ch02",
            "ch03",
            "ch04",
            "ch05",
            "ch06",
            "ch07",
            "ch08",
            "ch09",
            "ch10",
            "equipment",
            "device",
            "fixture",
            "grille",
        }
        lower_svg = svg_text.lower()
        for token in forbidden_tokens:
            self.assertNotIn(token, lower_svg)

        ids = {node.attrib.get("id") for node in root.iter() if node.attrib.get("id")}
        self.assertTrue(
            {
                "outer-wall",
                "aisle",
                "ess",
                "accessory",
                "lower-right-zone",
                "entry",
                "doors",
            }.issubset(ids)
        )

    def test_major_geometry_matches_latest_reference_canvas(self):
        root = ElementTree.fromstring(SVG_PATH.read_text(encoding="utf-8"))

        outer = _find_by_id(root, "outer-wall")
        self.assertIsNotNone(outer)
        outer_d = outer.attrib["d"]
        for expected in ("M22 75", "L49 75", "L49 47", "L140 47", "L140 7", "L186 7", "L186 47", "L313 47", "L313 75", "L356 75", "L356 47", "L628 47", "L628 74", "L663 74", "L663 47", "L944 47"):
            self.assertIn(expected, outer_d)

        expected_rects = {
            "aisle": (27, 200, 721, 37),
            "ess": (22, 264, 85, 183),
            "accessory": (24, 571, 287, 127),
            "lower-right-zone": (665, 537, 270, 210),
            "entry": (914, 330, 24, 124),
        }
        for element_id, expected in expected_rects.items():
            with self.subTest(element_id=element_id):
                node = _find_by_id(root, element_id)
                self.assertIsNotNone(node)
                actual = tuple(round(_float_attr(node, attr)) for attr in ("x", "y", "width", "height"))
                self.assertEqual(actual, expected)

        doors = _find_by_id(root, "doors")
        self.assertIsNotNone(doors)
        door_geometry = " ".join(node.attrib.get("d", "") for node in doors.iter())
        for expected in ("M139 47", "A47 47", "M508 747", "L635 747", "M914 330", "A46 46", "M914 454"):
            self.assertIn(expected, door_geometry)

    def test_png_is_exported_at_reference_size(self):
        from PIL import Image

        self.assertTrue(PNG_PATH.exists(), "missing v2 PNG")
        with Image.open(PNG_PATH) as image:
            self.assertEqual(image.size, (990, 778))


if __name__ == "__main__":
    unittest.main()
