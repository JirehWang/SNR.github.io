import argparse
import json
import os
import re
import sqlite3
import sys
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.server import create_app


TABLES = ("equipment", "reservations", "reservation_history", "requester_directory")


def read_frontend_config(path: Path):
    text = path.read_text(encoding="utf-8")
    url_match = re.search(r'const\s+SUPABASE_URL\s*=\s*"([^"]+)"', text)
    key_match = re.search(r'const\s+SUPABASE_ANON_KEY\s*=\s*"([^"]+)"', text)
    if not url_match or not key_match:
        raise RuntimeError("Supabase URL or anon key was not found in the frontend source")
    return url_match.group(1), key_match.group(1)


def fetch_table(base_url: str, anon_key: str, table: str, page_size: int = 1000):
    rows = []
    offset = 0
    while True:
        query = urlencode({"select": "*", "order": "id.asc"})
        request = Request(
            f"{base_url.rstrip('/')}/rest/v1/{table}?{query}",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {anon_key}",
                "Accept": "application/json",
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + page_size - 1}",
            },
        )
        with urlopen(request, timeout=30) as response:
            page = json.loads(response.read().decode("utf-8"))
        if not isinstance(page, list):
            raise RuntimeError(f"Unexpected response while reading {table}")
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def _json_text(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def export_to_sqlite(db_path: Path, tables: dict[str, list[dict]]):
    db_path = Path(db_path)
    create_app(db_path)

    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM reservation_history")
        conn.execute("DELETE FROM reservations")
        conn.execute("DELETE FROM equipment")
        conn.execute("DELETE FROM requester_directory")

        for row in tables.get("equipment", []):
            conn.execute(
                """
                INSERT INTO equipment (
                    id, name, category, location, status, capacity, equipment_spec,
                    requires_test_condition, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"], row["name"], row["category"], row.get("location", ""),
                    row.get("status", "available"), row.get("capacity", "1"),
                    row.get("equipment_spec", ""), int(bool(row.get("requires_test_condition"))),
                    int(bool(row.get("is_active", True))), row.get("created_at"),
                    row.get("updated_at") or row.get("created_at"),
                ),
            )

        for row in tables.get("reservations", []):
            conn.execute(
                """
                INSERT INTO reservations (
                    id, equipment_id, requester_id, requester_name, requester_email, department,
                    project_name, purpose, test_condition, start_time, end_time, status,
                    approval_status, checked_in_at, checked_out_at, notes, cancel_reason,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"], row["equipment_id"], row.get("requester_id"),
                    row["requester_name"], row["requester_email"], row["department"],
                    row.get("project_name", ""), row["purpose"], row.get("test_condition", ""),
                    row["start_time"], row["end_time"], row.get("status", "reserved"),
                    row.get("approval_status", "not_required"), row.get("checked_in_at"),
                    row.get("checked_out_at"), row.get("notes", ""), row.get("cancel_reason"),
                    row.get("created_at"), row.get("updated_at") or row.get("created_at"),
                ),
            )

        for row in tables.get("reservation_history", []):
            conn.execute(
                """
                INSERT INTO reservation_history (
                    id, reservation_id, action, old_value, new_value, changed_by,
                    changed_by_name, changed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"], row["reservation_id"], row["action"],
                    _json_text(row.get("old_value")), _json_text(row.get("new_value")),
                    row.get("changed_by") or "system", row.get("changed_by_name") or "system",
                    row.get("changed_at"),
                ),
            )

        for row in tables.get("requester_directory", []):
            conn.execute(
                """
                INSERT INTO requester_directory (
                    id, name, email, department, sort_order, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"], row["name"], row["email"], row.get("department", "PQE"),
                    row.get("sort_order", 100), int(bool(row.get("is_active", True))),
                    row.get("created_at"),
                ),
            )
        conn.commit()

    return {table: len(tables.get(table, [])) for table in TABLES}


def main():
    parser = argparse.ArgumentParser(description="Back up Supabase data and create a local SQLite copy")
    parser.add_argument("--db", default=str(ROOT / "data" / "rlab_reservation.synced.db"))
    parser.add_argument("--backup-dir", default=str(ROOT / "data"))
    parser.add_argument("--url", default=os.environ.get("SNR_SUPABASE_URL"))
    parser.add_argument("--anon-key", default=os.environ.get("SNR_SUPABASE_ANON_KEY"))
    parser.add_argument("--source-app-js", default=str(ROOT / "app.js"))
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if db_path.exists() and not args.replace:
        raise SystemExit(f"Refusing to overwrite existing database: {db_path}; pass --replace explicitly")

    base_url, anon_key = args.url, args.anon_key
    if not base_url or not anon_key:
        base_url, anon_key = read_frontend_config(Path(args.source_app_js))

    tables = {table: fetch_table(base_url, anon_key, table) for table in TABLES}
    exported_at = datetime.now(timezone.utc).isoformat()
    backup_dir = Path(args.backup_dir).resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    snapshot_path = backup_dir / f"supabase-backup-{stamp}.json"
    snapshot_path.write_text(
        json.dumps(
            {
                "exported_at": exported_at,
                "source_url": base_url,
                "tables": tables,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    temp_db_path = db_path.with_name(f".{db_path.name}.{stamp}.tmp")
    try:
        counts = export_to_sqlite(temp_db_path, tables)
        os.replace(temp_db_path, db_path)
    finally:
        if temp_db_path.exists():
            temp_db_path.unlink()
    print(f"Snapshot: {snapshot_path}")
    print(f"SQLite: {db_path}")
    for table in TABLES:
        print(f"{table}: {counts[table]} rows")


if __name__ == "__main__":
    main()
