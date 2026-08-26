import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.server import create_app


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "test.db")
        self.app = create_app(self.db_path)
        self.server = self.app.start_for_tests()
        self.base = f"http://127.0.0.1:{self.server.port}"

    def tearDown(self):
        self.server.stop()
        self.tmp.cleanup()

    def request(self, method, path, payload=None):
        body = None
        headers = {"Content-Type": "application/json"}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
        req = Request(f"{self.base}{path}", data=body, headers=headers, method=method)
        with urlopen(req, timeout=5) as response:
            data = response.read().decode("utf-8")
            return response.status, json.loads(data) if data else None

    def test_seeded_equipment_is_available(self):
        status, data = self.request("GET", "/api/equipment")

        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(data["equipment"]), 3)
        self.assertEqual(data["equipment"][0]["capacity"], 1)

    def test_root_frontend_is_served_without_exposing_project_files(self):
        with urlopen(f"{self.base}/", timeout=5) as response:
            html = response.read().decode("utf-8")
        self.assertIn("可靠度實驗室設備預約系統", html)

        with self.assertRaises(HTTPError) as ctx:
            self.request("GET", "/app/server.py")
        self.assertEqual(ctx.exception.code, 404)

    def test_preview_page_is_served_but_other_files_remain_blocked(self):
        with urlopen(f"{self.base}/preview.html", timeout=5) as response:
            html = response.read().decode("utf-8")
            status = response.status

        self.assertEqual(status, 200)
        self.assertIn("僅供本機 responsive 驗證", html)
        self.assertIn('src="/?view=bulletin#bulletinBoard"', html)

        with self.assertRaises(HTTPError) as ctx:
            self.request("GET", "/README.md")
        self.assertEqual(ctx.exception.code, 404)

    def test_frontend_assets_are_served_without_allowing_path_traversal(self):
        asset_path = "/assets/floorplan/equipment-floorplan-ui-transparent-clean.png"
        with urlopen(f"{self.base}{asset_path}", timeout=5) as response:
            image = response.read()
            status = response.status
            content_type = response.headers.get_content_type()

        self.assertEqual(status, 200)
        self.assertEqual(content_type, "image/png")
        self.assertTrue(image.startswith(b"\x89PNG\r\n\x1a\n"))

        with self.assertRaises(HTTPError) as ctx:
            self.request("GET", "/assets/../app/server.py")
        self.assertEqual(ctx.exception.code, 404)

    def test_equipment_fields_can_be_updated(self):
        status, data = self.request(
            "PATCH",
            "/api/equipment/1",
            {
                "name": "環境箱 A-1",
                "category": "環測",
                "label_name": "A-1",
                "location": "可靠度實驗室 3F",
                "capacity": 3,
                "equipment_spec": "落下高度：1 m",
                "status": "validation",
                "is_active": 0,
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["equipment"]["name"], "環境箱 A-1")
        self.assertEqual(data["equipment"]["label_name"], "A-1")
        self.assertEqual(data["equipment"]["location"], "可靠度實驗室 3F")
        self.assertEqual(data["equipment"]["capacity"], 3)
        self.assertEqual(data["equipment"]["equipment_spec"], "落下高度：1 m")
        self.assertEqual(data["equipment"]["status"], "validation")
        self.assertEqual(data["equipment"]["is_active"], 0)

        status, equipment = self.request("GET", "/api/equipment")
        updated = next(item for item in equipment["equipment"] if item["id"] == 1)
        self.assertEqual(updated["name"], "環境箱 A-1")
        self.assertEqual(updated["label_name"], "A-1")
        self.assertEqual(updated["status"], "validation")

    def test_capacity_allows_that_many_overlapping_reservations(self):
        _, equipment_data = self.request(
            "POST",
            "/api/equipment",
            {
                "name": "Shared Drop Tester",
                "label_name": "Shared Drop",
                "category": "DROP",
                "location": "可靠度實驗室 3F",
                "capacity": 2,
                "equipment_spec": "最大試片重量：5 kg",
            },
        )
        equipment = equipment_data["equipment"]
        self.assertEqual(equipment["label_name"], "Shared Drop")
        self.assertEqual(equipment["equipment_spec"], "最大試片重量：5 kg")

        reservation = {
            "equipment_id": equipment["id"],
            "requester_name": "Test User",
            "requester_email": "test@example.com",
            "department": "QA",
            "project_name": "Shared fixture qualification",
            "purpose": "Capacity test",
            "start_time": "2026-07-04T09:00",
            "end_time": "2026-07-04T10:00",
        }
        self.assertEqual(self.request("POST", "/api/reservations", reservation)[0], 201)
        self.assertEqual(
            self.request(
                "POST",
                "/api/reservations",
                {**reservation, "requester_name": "Second User", "requester_email": "second@example.com"},
            )[0],
            201,
        )

        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "POST",
                "/api/reservations",
                {**reservation, "requester_name": "Third User", "requester_email": "third@example.com"},
            )
        self.assertEqual(ctx.exception.code, 409)

        with self.assertRaises(HTTPError) as ctx:
            self.request("PATCH", "/api/equipment/1", {"status": "broken"})
        self.assertEqual(ctx.exception.code, 400)

    def test_reservation_conflict_and_cancel_flow(self):
        payload = {
            "equipment_id": 1,
            "requester_name": "王小明",
            "requester_email": "ming@example.com",
            "department": "可靠度實驗室",
            "project_name": "Apollo 耐久性驗證",
            "purpose": "可靠度驗證",
            "start_time": "2026-07-02T09:00",
            "end_time": "2026-07-02T11:00",
            "notes": "MVP 測試",
        }

        status, created = self.request("POST", "/api/reservations", payload)
        self.assertEqual(status, 201)
        self.assertEqual(created["reservation"]["status"], "reserved")
        self.assertEqual(created["reservation"]["project_name"], "Apollo 耐久性驗證")

        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "POST",
                "/api/reservations",
                {
                    **payload,
                    "requester_name": "李小華",
                    "requester_email": "hua@example.com",
                    "start_time": "2026-07-02T10:30",
                    "end_time": "2026-07-02T12:00",
                },
            )
        self.assertEqual(ctx.exception.code, 409)

        reservation_id = created["reservation"]["id"]
        status, updated = self.request(
            "PATCH",
            f"/api/reservations/{reservation_id}",
            {"status": "cancelled", "cancel_reason": "測試取消", "changed_by": "王小明"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["reservation"]["status"], "cancelled")

        status, recreated = self.request("POST", "/api/reservations", payload)
        self.assertEqual(status, 201)
        self.assertEqual(recreated["reservation"]["status"], "reserved")

    def test_invalid_numeric_inputs_return_400(self):
        invalid_requests = [
            ("PATCH", "/api/equipment/not-a-number", {"status": "available"}),
            ("POST", "/api/equipment", {"name": "Tester", "category": "TEST", "capacity": "many"}),
            ("GET", "/api/reservations?equipment_id=not-a-number", None),
        ]

        for method, path, payload in invalid_requests:
            with self.subTest(method=method, path=path):
                with self.assertRaises(HTTPError) as ctx:
                    self.request(method, path, payload)
                self.assertEqual(ctx.exception.code, 400)

    def test_invalid_reservation_status_is_rejected(self):
        payload = {
            "equipment_id": 1,
            "requester_name": "Test User",
            "requester_email": "test@example.com",
            "department": "QA",
            "project_name": "Reservation status validation",
            "purpose": "Status validation",
            "start_time": "2026-07-03T09:00",
            "end_time": "2026-07-03T10:00",
        }
        _, created = self.request("POST", "/api/reservations", payload)

        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "PATCH",
                f"/api/reservations/{created['reservation']['id']}",
                {"status": "unknown"},
            )
        self.assertEqual(ctx.exception.code, 400)

    def test_project_name_is_required_for_reservations(self):
        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "POST",
                "/api/reservations",
                {
                    "equipment_id": 1,
                    "requester_name": "Test User",
                    "requester_email": "test@example.com",
                    "department": "QA",
                    "purpose": "Reliability test",
                    "start_time": "2026-07-05T09:00",
                    "end_time": "2026-07-05T10:00",
                },
            )
        self.assertEqual(ctx.exception.code, 400)

    def test_json_body_must_be_an_object(self):
        with self.assertRaises(HTTPError) as ctx:
            self.request("POST", "/api/equipment", ["not", "an", "object"])
        self.assertEqual(ctx.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
