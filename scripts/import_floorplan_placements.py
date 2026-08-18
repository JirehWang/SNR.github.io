import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.server import App, DEFAULT_DB, normalize_floorplan_placement


def backup_database(db_path: Path, backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"{db_path.stem}-before-floorplan-import-{timestamp}{db_path.suffix}"
    shutil.copy2(db_path, backup_path)
    return backup_path


def load_placements(input_path: Path):
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError("Input JSON must be a non-empty array")
    placements = []
    for item in payload:
        placements.append(
            normalize_floorplan_placement(
                {
                    "equipment_id": item.get("equipmentId"),
                    "x_percent": item.get("x"),
                    "y_percent": item.get("y"),
                    "width_percent": item.get("w"),
                    "height_percent": item.get("h"),
                    "location_state": item.get("locationState", "placed"),
                }
            )
        )
    return placements


def import_placements(db_path: Path, input_path: Path, backup_dir: Path | None):
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")
    app = App(db_path)
    placements = load_placements(input_path)
    backup_path = backup_database(db_path, backup_dir) if backup_dir else None
    with app.connect() as conn:
        equipment_ids = [item["equipment_id"] for item in placements]
        found_ids = {
            row["id"]
            for row in conn.execute(
                f"SELECT id FROM equipment WHERE id IN ({','.join('?' for _ in equipment_ids)})",
                equipment_ids,
            ).fetchall()
        }
        missing_ids = sorted(set(equipment_ids) - found_ids)
        if missing_ids:
            raise ValueError(f"Equipment not found in database: {', '.join(str(item) for item in missing_ids)}")
        conn.executemany(
            """
            INSERT INTO equipment_floorplan_placements (
                equipment_id, x_percent, y_percent, width_percent, height_percent,
                location_state, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(equipment_id) DO UPDATE SET
                x_percent = excluded.x_percent,
                y_percent = excluded.y_percent,
                width_percent = excluded.width_percent,
                height_percent = excluded.height_percent,
                location_state = excluded.location_state,
                updated_at = CURRENT_TIMESTAMP
            """,
            [
                (
                    item["equipment_id"],
                    item["x_percent"],
                    item["y_percent"],
                    item["width_percent"],
                    item["height_percent"],
                    item["location_state"],
                )
                for item in placements
            ],
        )
    return backup_path, len(placements)


def main():
    parser = argparse.ArgumentParser(description="Import equipment floorplan placements into the local SQLite database.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to the SQLite database.")
    parser.add_argument("--input", required=True, help="Path to the placement JSON export.")
    parser.add_argument("--backup-dir", default="backups", help="Directory for the pre-import DB backup.")
    parser.add_argument("--no-backup", action="store_true", help="Skip the pre-import DB backup.")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    input_path = Path(args.input).resolve()
    backup_dir = None if args.no_backup else Path(args.backup_dir).resolve()
    backup_path, imported_count = import_placements(db_path, input_path, backup_dir)

    if backup_path:
        print(f"Backup: {backup_path}")
    print(f"Imported placements: {imported_count}")


if __name__ == "__main__":
    main()
