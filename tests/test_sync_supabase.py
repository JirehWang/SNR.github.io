import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from scripts.sync_supabase_to_sqlite import export_to_sqlite


class SupabaseSyncTestCase(unittest.TestCase):
    def test_export_preserves_local_runtime_tables_and_ids(self):
        tables = {
            "equipment": [
                {
                    "id": 8,
                    "name": "DROP",
                    "category": "ESD",
                    "location": "3F",
                    "status": "available",
                    "capacity": "2槽",
                    "equipment_spec": "10 kg",
                    "requires_test_condition": True,
                    "is_active": True,
                    "created_at": "2026-07-01T00:00:00+00:00",
                    "updated_at": "2026-07-02T00:00:00+00:00",
                }
            ],
            "reservations": [
                {
                    "id": 12,
                    "equipment_id": 8,
                    "requester_id": None,
                    "requester_name": "Tester",
                    "requester_email": "tester@example.com",
                    "department": "PQE",
                    "project_name": "P1",
                    "purpose": "Drop test",
                    "test_condition": "1 m",
                    "start_time": "2026-07-20T01:00:00+00:00",
                    "end_time": "2026-07-20T02:00:00+00:00",
                    "status": "reserved",
                    "approval_status": "not_required",
                    "checked_in_at": None,
                    "checked_out_at": None,
                    "notes": "",
                    "cancel_reason": None,
                    "created_at": "2026-07-19T00:00:00+00:00",
                    "updated_at": "2026-07-19T00:00:00+00:00",
                }
            ],
            "reservation_history": [
                {
                    "id": 16,
                    "reservation_id": 12,
                    "action": "created",
                    "old_value": None,
                    "new_value": {"project_name": "P1"},
                    "changed_by": None,
                    "changed_by_name": "Tester",
                    "changed_at": "2026-07-19T00:00:00+00:00",
                }
            ],
            "requester_directory": [
                {
                    "id": 4,
                    "name": "Tester",
                    "email": "tester@example.com",
                    "department": "PQE",
                    "sort_order": 10,
                    "is_active": True,
                    "created_at": "2026-07-01T00:00:00+00:00",
                }
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "synced.db"
            counts = export_to_sqlite(db_path, tables)

            self.assertEqual({name: 1 for name in tables}, counts)
            with closing(sqlite3.connect(db_path)) as conn:
                conn.row_factory = sqlite3.Row
                equipment = conn.execute("SELECT * FROM equipment").fetchone()
                reservation = conn.execute("SELECT * FROM reservations").fetchone()
                history = conn.execute("SELECT * FROM reservation_history").fetchone()
                requester = conn.execute("SELECT * FROM requester_directory").fetchone()

            self.assertEqual(8, equipment["id"])
            self.assertEqual("2槽", equipment["capacity"])
            self.assertEqual(1, equipment["requires_test_condition"])
            self.assertEqual("1 m", reservation["test_condition"])
            self.assertEqual({"project_name": "P1"}, json.loads(history["new_value"]))
            self.assertEqual("tester@example.com", requester["email"])


if __name__ == "__main__":
    unittest.main()
