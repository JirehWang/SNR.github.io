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

    def test_equipment_fields_can_be_updated(self):
        status, data = self.request(
            "PATCH",
            "/api/equipment/1",
            {
                "name": "環境箱 A-1",
                "category": "環測",
                "location": "可靠度實驗室 3F",
                "capacity": 3,
                "status": "validation",
                "is_active": 0,
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["equipment"]["name"], "環境箱 A-1")
        self.assertEqual(data["equipment"]["location"], "可靠度實驗室 3F")
        self.assertEqual(data["equipment"]["capacity"], 3)
        self.assertEqual(data["equipment"]["status"], "validation")
        self.assertEqual(data["equipment"]["is_active"], 0)

        status, equipment = self.request("GET", "/api/equipment")
        updated = next(item for item in equipment["equipment"] if item["id"] == 1)
        self.assertEqual(updated["name"], "環境箱 A-1")
        self.assertEqual(updated["status"], "validation")

        with self.assertRaises(HTTPError) as ctx:
            self.request("PATCH", "/api/equipment/1", {"status": "broken"})
        self.assertEqual(ctx.exception.code, 400)

    def test_reservation_conflict_and_cancel_flow(self):
        payload = {
            "equipment_id": 1,
            "requester_name": "王小明",
            "requester_email": "ming@example.com",
            "department": "可靠度實驗室",
            "purpose": "可靠度驗證",
            "start_time": "2026-07-02T09:00",
            "end_time": "2026-07-02T11:00",
            "notes": "MVP 測試",
        }

        status, created = self.request("POST", "/api/reservations", payload)
        self.assertEqual(status, 201)
        self.assertEqual(created["reservation"]["status"], "reserved")

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


if __name__ == "__main__":
    unittest.main()
