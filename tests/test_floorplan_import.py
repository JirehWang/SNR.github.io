import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.server import App


ROOT = Path(__file__).resolve().parents[1]


class FloorplanImportScriptTestCase(unittest.TestCase):
    def test_import_script_creates_backup_and_imports_rows(self):
        tmpdir_path = Path(tempfile.mkdtemp())
        try:
            db_path = tmpdir_path / "test.db"
            input_path = tmpdir_path / "placements.json"
            backup_dir = tmpdir_path / "backups"

            app = App(db_path)
            with app.connect() as conn:
                conn.executemany(
                    """
                    INSERT INTO equipment (name, category, location, status, capacity)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        ("Rig 1", "TEMP", "Lab", "available", "1"),
                        ("Rig 2", "TEMP", "Lab", "available", "1"),
                    ],
                )

            input_path.write_text(
                json.dumps(
                    [
                        {
                            "equipmentId": 1,
                            "x": 10,
                            "y": 12,
                            "w": 15,
                            "h": 16,
                            "locationState": "placed",
                        },
                        {
                            "equipmentId": 2,
                            "x": 30,
                            "y": 25,
                            "w": 12,
                            "h": 10,
                            "locationState": "placed",
                        },
                    ]
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    "python",
                    "scripts/import_floorplan_placements.py",
                    "--db",
                    str(db_path),
                    "--input",
                    str(input_path),
                    "--backup-dir",
                    str(backup_dir),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("Imported placements: 2", result.stdout)

            backups = list(backup_dir.glob("*.db"))
            self.assertEqual(len(backups), 1)
            with app.connect() as conn:
                count = conn.execute("SELECT COUNT(*) AS count FROM equipment_floorplan_placements").fetchone()["count"]
            self.assertEqual(count, 2)
        finally:
            shutil.rmtree(tmpdir_path, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
