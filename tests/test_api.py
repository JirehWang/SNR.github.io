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
        self.assertEqual(data["equipment"][0]["requires_test_condition"], 0)

    def test_equipment_fields_can_be_updated(self):
        status, data = self.request(
            "PATCH",
            "/api/equipment/1",
            {
                "name": "Temp Chamber A-1",
                "category": "TEMP",
                "location": "3F Zone A",
                "capacity": 3,
                "status": "validation",
                "is_active": 0,
                "requires_test_condition": 1,
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(data["equipment"]["name"], "Temp Chamber A-1")
        self.assertEqual(data["equipment"]["location"], "3F Zone A")
        self.assertEqual(data["equipment"]["capacity"], 3)
        self.assertEqual(data["equipment"]["status"], "validation")
        self.assertEqual(data["equipment"]["is_active"], 0)
        self.assertEqual(data["equipment"]["requires_test_condition"], 1)

        status, equipment = self.request("GET", "/api/equipment")
        updated = next(item for item in equipment["equipment"] if item["id"] == 1)
        self.assertEqual(updated["name"], "Temp Chamber A-1")
        self.assertEqual(updated["status"], "validation")
        self.assertEqual(updated["requires_test_condition"], 1)

        with self.assertRaises(HTTPError) as ctx:
            self.request("PATCH", "/api/equipment/1", {"status": "broken"})
        self.assertEqual(ctx.exception.code, 400)

    def test_reservation_conflict_and_cancel_flow(self):
        payload = {
            "equipment_id": 1,
            "requester_name": "Ming",
            "requester_email": "ming@example.com",
            "department": "PQE",
            "project_name": "SNR-MVP",
            "purpose": "Reliability Validation",
            "start_time": "2026-07-02T09:00",
            "end_time": "2026-07-02T11:00",
            "notes": "MVP validation",
        }

        status, created = self.request("POST", "/api/reservations", payload)
        self.assertEqual(status, 201)
        self.assertEqual(created["reservation"]["status"], "reserved")
        self.assertEqual(created["reservation"]["project_name"], "SNR-MVP")

        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "POST",
                "/api/reservations",
                {
                    **payload,
                    "requester_name": "Hua",
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
            {"status": "cancelled", "cancel_reason": "schedule changed", "changed_by": "Ming"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["reservation"]["status"], "cancelled")

        status, recreated = self.request("POST", "/api/reservations", payload)
        self.assertEqual(status, 201)
        self.assertEqual(recreated["reservation"]["status"], "reserved")

    def test_capacity_allows_overlap_and_test_condition_can_be_required(self):
        status, equipment = self.request(
            "PATCH",
            "/api/equipment/1",
            {
                "capacity": 2,
                "requires_test_condition": 1,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(equipment["equipment"]["capacity"], 2)
        self.assertEqual(equipment["equipment"]["requires_test_condition"], 1)

        base_payload = {
            "equipment_id": 1,
            "requester_name": "Alpha",
            "requester_email": "alpha@example.com",
            "department": "PQE",
            "project_name": "SNR-Overlap",
            "purpose": "Reliability Validation",
            "start_time": "2026-07-03T09:00",
            "end_time": "2026-07-03T11:00",
            "notes": "",
        }

        with self.assertRaises(HTTPError) as ctx:
            self.request("POST", "/api/reservations", base_payload)
        self.assertEqual(ctx.exception.code, 400)

        status, first = self.request(
            "POST",
            "/api/reservations",
            {
                **base_payload,
                "test_condition": "25C / sample A",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(first["reservation"]["test_condition"], "25C / sample A")

        status, second = self.request(
            "POST",
            "/api/reservations",
            {
                **base_payload,
                "requester_name": "Beta",
                "requester_email": "beta@example.com",
                "test_condition": "25C / sample B",
            },
        )
        self.assertEqual(status, 201)

        with self.assertRaises(HTTPError) as ctx:
            self.request(
                "POST",
                "/api/reservations",
                {
                    **base_payload,
                    "requester_name": "Gamma",
                    "requester_email": "gamma@example.com",
                    "test_condition": "25C / sample C",
                },
            )
        self.assertEqual(ctx.exception.code, 409)


if __name__ == "__main__":
    unittest.main()
