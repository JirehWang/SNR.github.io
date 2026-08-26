import argparse
import json
import logging
import math
import sqlite3
import threading
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT.parent
DEFAULT_DB = ROOT.parent / "data" / "rlab_reservation.db"
LOGGER = logging.getLogger(__name__)
STATIC_FILES = {"/index.html", "/app.js", "/styles.css", "/preview.html"}
STATIC_ASSETS_DIR = (STATIC_DIR / "assets").resolve()


def is_allowed_static_path(path: str):
    """Allow only the bundled frontend files and files inside the assets tree."""
    if path in STATIC_FILES:
        return True
    decoded_path = unquote(path)
    if not (decoded_path == "/assets" or decoded_path.startswith("/assets/")):
        return False
    candidate = (STATIC_DIR / decoded_path.lstrip("/")).resolve()
    try:
        candidate.relative_to(STATIC_ASSETS_DIR)
    except ValueError:
        return False
    return candidate.is_file()


class App:
    def __init__(self, db_path: str | Path = DEFAULT_DB):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init_db(self):
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS equipment (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    label_name TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL,
                    location TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'available',
                    capacity INTEGER NOT NULL DEFAULT 1,
                    equipment_spec TEXT NOT NULL DEFAULT '',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS equipment_floorplan_placements (
                    equipment_id INTEGER PRIMARY KEY REFERENCES equipment (id) ON DELETE CASCADE,
                    x_percent REAL NOT NULL CHECK (x_percent >= 0 AND x_percent <= 100),
                    y_percent REAL NOT NULL CHECK (y_percent >= 0 AND y_percent <= 100),
                    width_percent REAL NOT NULL CHECK (width_percent > 0 AND width_percent <= 100),
                    height_percent REAL NOT NULL CHECK (height_percent > 0 AND height_percent <= 100),
                    location_state TEXT NOT NULL DEFAULT 'placed'
                        CHECK (location_state IN ('unplaced', 'placing', 'placed')),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CHECK (x_percent + width_percent <= 100),
                    CHECK (y_percent + height_percent <= 100)
                );

                CREATE TABLE IF NOT EXISTS reservations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    equipment_id INTEGER NOT NULL,
                    requester_name TEXT NOT NULL,
                    requester_email TEXT NOT NULL,
                    department TEXT NOT NULL,
                    project_name TEXT NOT NULL DEFAULT '',
                    purpose TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'reserved',
                    approval_status TEXT NOT NULL DEFAULT 'not_required',
                    checked_in_at TEXT,
                    checked_out_at TEXT,
                    notes TEXT NOT NULL DEFAULT '',
                    cancel_reason TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
                );

                CREATE TABLE IF NOT EXISTS reservation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reservation_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    changed_by TEXT NOT NULL DEFAULT 'system',
                    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
                );

                """
            )
            equipment_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(equipment)").fetchall()
            }
            if "equipment_spec" not in equipment_columns:
                conn.execute(
                    "ALTER TABLE equipment ADD COLUMN equipment_spec TEXT NOT NULL DEFAULT ''"
                )
            if "label_name" not in equipment_columns:
                conn.execute(
                    "ALTER TABLE equipment ADD COLUMN label_name TEXT NOT NULL DEFAULT ''"
                )
            reservation_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(reservations)").fetchall()
            }
            if "project_name" not in reservation_columns:
                conn.execute(
                    "ALTER TABLE reservations ADD COLUMN project_name TEXT NOT NULL DEFAULT ''"
                )
            count = conn.execute("SELECT COUNT(*) AS count FROM equipment").fetchone()["count"]
            if count == 0:
                conn.executemany(
                    """
                    INSERT INTO equipment (name, category, location, status, capacity)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        ("環境箱 A", "環境箱", "可靠度實驗室 1F", "available", 1),
                        ("ESD 測試機", "ESD", "可靠度實驗室 1F", "available", 1),
                        ("Drop Tester", "DROP", "可靠度實驗室 2F", "available", 1),
                        ("Vibration Table", "VIBRATION", "可靠度實驗室 2F", "maintenance", 1),
                    ],
                )

    def start_for_tests(self):
        server = TestServer(self)
        server.start()
        return server


def create_app(db_path: str | Path = DEFAULT_DB):
    return App(db_path)


def row_to_dict(row: sqlite3.Row | None):
    return dict(row) if row is not None else None


def parse_dt(value: str, field: str):
    if not value:
        raise ApiError(400, f"{field} is required")
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(400, f"{field} must be ISO datetime") from exc


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def normalize_status(value: str):
    status = str(value or "").strip()
    allowed_statuses = {"available", "validation", "maintenance", "offline"}
    if status not in allowed_statuses:
        raise ApiError(400, "status must be available, validation, maintenance, or offline")
    return status


def normalize_floorplan_placement(item: dict[str, Any]):
    """Validate and clamp one imported floorplan placement for SQLite."""
    try:
        equipment_id = int(item.get("equipment_id"))
    except (TypeError, ValueError) as exc:
        raise ValueError("equipment_id must be an integer") from exc
    if equipment_id < 1:
        raise ValueError("equipment_id must be positive")

    def number(field: str, default: float):
        try:
            value = float(item.get(field, default))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field} must be a number") from exc
        if not math.isfinite(value):
            raise ValueError(f"{field} must be finite")
        return value

    width = min(max(number("width_percent", 8), 3), 100)
    height = min(max(number("height_percent", 8), 3), 100)
    x = min(max(number("x_percent", 0), 0), max(100 - width, 0))
    y = min(max(number("y_percent", 0), 0), max(100 - height, 0))
    location_state = str(item.get("location_state", "placed") or "placed").strip()
    if location_state not in {"unplaced", "placing", "placed"}:
        raise ValueError("location_state must be unplaced, placing, or placed")
    return {
        "equipment_id": equipment_id,
        "x_percent": round(x, 2),
        "y_percent": round(y, 2),
        "width_percent": round(width, 2),
        "height_percent": round(height, 2),
        "location_state": location_state,
    }


def parse_int(value: Any, field: str):
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ApiError(400, f"{field} must be an integer") from exc


def normalize_reservation_status(value: str):
    status = str(value or "").strip()
    allowed_statuses = {"reserved", "cancelled", "checked_in", "checked_out"}
    if status not in allowed_statuses:
        raise ApiError(400, "status must be reserved, cancelled, checked_in, or checked_out")
    return status


class Handler(SimpleHTTPRequestHandler):
    app: App

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any):
        return

    def do_GET(self):
        self.route()

    def do_POST(self):
        self.route()

    def do_PATCH(self):
        self.route()

    def route(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                self.handle_api(parsed.path, parse_qs(parsed.query))
            else:
                if parsed.path == "/":
                    self.path = "/index.html"
                elif not is_allowed_static_path(parsed.path):
                    raise ApiError(404, "Static file not found")
                super().do_GET()
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)
        except Exception:
            LOGGER.exception("Unexpected server error while handling %s %s", self.command, self.path)
            self.send_json({"error": "Unexpected server error"}, 500)

    def handle_api(self, path: str, query: dict[str, list[str]]):
        if self.command == "GET" and path == "/api/equipment":
            return self.get_equipment()
        if self.command == "POST" and path == "/api/equipment":
            return self.create_equipment()
        if self.command == "PATCH" and path.startswith("/api/equipment/"):
            equipment_id = parse_int(path.rsplit("/", 1)[1], "equipment_id")
            return self.update_equipment(equipment_id)
        if self.command == "GET" and path == "/api/reservations":
            return self.get_reservations(query)
        if self.command == "POST" and path == "/api/reservations":
            return self.create_reservation()
        if self.command == "PATCH" and path.startswith("/api/reservations/"):
            reservation_id = parse_int(path.rsplit("/", 1)[1], "reservation_id")
            return self.update_reservation(reservation_id)
        raise ApiError(404, "API route not found")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ApiError(400, "Invalid JSON body") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "JSON body must be an object")
        return data

    def send_json(self, payload: dict[str, Any], status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def get_equipment(self):
        with self.app.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, name, label_name, category, location, status, capacity, equipment_spec, is_active
                FROM equipment
                ORDER BY is_active DESC, category, name
                """
            ).fetchall()
        self.send_json({"equipment": [row_to_dict(row) for row in rows]})

    def create_equipment(self):
        data = self.read_json()
        required = ["name", "category"]
        missing = [field for field in required if not str(data.get(field, "")).strip()]
        if missing:
            raise ApiError(400, f"Missing required fields: {', '.join(missing)}")
        capacity = parse_int(data.get("capacity") or 1, "capacity")
        if capacity < 1:
            raise ApiError(400, "capacity must be at least 1")
        status = normalize_status(data.get("status", "available"))
        label_name = str(data.get("label_name", "")).strip()
        equipment_spec = str(data.get("equipment_spec", "")).strip()
        is_active = 1 if parse_int(data.get("is_active", 1), "is_active") else 0
        with self.app.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO equipment
                    (name, label_name, category, location, status, capacity, equipment_spec, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["name"].strip(),
                    label_name,
                    data["category"].strip(),
                    str(data.get("location", "")).strip(),
                    status,
                    capacity,
                    equipment_spec,
                    is_active,
                ),
            )
            row = conn.execute("SELECT * FROM equipment WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json({"equipment": row_to_dict(row)}, 201)

    def update_equipment(self, equipment_id: int):
        data = self.read_json()
        with self.app.connect() as conn:
            current = conn.execute("SELECT * FROM equipment WHERE id = ?", (equipment_id,)).fetchone()
            if current is None:
                raise ApiError(404, "Equipment not found")
            name = str(data.get("name", current["name"])).strip()
            label_name = str(data.get("label_name", current["label_name"])).strip()
            category = str(data.get("category", current["category"])).strip()
            location = str(data.get("location", current["location"])).strip()
            status = normalize_status(data.get("status", current["status"]))
            capacity = parse_int(data.get("capacity", current["capacity"]) or 1, "capacity")
            equipment_spec = str(data.get("equipment_spec", current["equipment_spec"])).strip()
            is_active = 1 if parse_int(data.get("is_active", current["is_active"]), "is_active") else 0
            if not name:
                raise ApiError(400, "name is required")
            if not category:
                raise ApiError(400, "category is required")
            if capacity < 1:
                raise ApiError(400, "capacity must be at least 1")
            conn.execute(
                """
                UPDATE equipment
                SET name = ?, label_name = ?, category = ?, location = ?, status = ?, capacity = ?,
                    equipment_spec = ?, is_active = ?
                WHERE id = ?
                """,
                (name, label_name, category, location, status, capacity, equipment_spec, is_active, equipment_id),
            )
            row = conn.execute(
                """
                SELECT id, name, label_name, category, location, status, capacity, equipment_spec, is_active
                FROM equipment
                WHERE id = ?
                """,
                (equipment_id,),
            ).fetchone()
        self.send_json({"equipment": row_to_dict(row)})

    def get_reservations(self, query: dict[str, list[str]]):
        where = ["1 = 1"]
        params: list[Any] = []
        if query.get("from"):
            where.append("end_time > ?")
            params.append(query["from"][0])
        if query.get("to"):
            where.append("start_time < ?")
            params.append(query["to"][0])
        if query.get("equipment_id"):
            where.append("equipment_id = ?")
            params.append(parse_int(query["equipment_id"][0], "equipment_id"))
        with self.app.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT r.*, e.name AS equipment_name, e.category AS equipment_category
                FROM reservations r
                JOIN equipment e ON e.id = r.equipment_id
                WHERE {' AND '.join(where)}
                ORDER BY r.start_time, e.name
                """,
                params,
            ).fetchall()
        self.send_json({"reservations": [row_to_dict(row) for row in rows]})

    def create_reservation(self):
        data = self.read_json()
        required = [
            "equipment_id",
            "requester_name",
            "requester_email",
            "department",
            "project_name",
            "purpose",
            "start_time",
            "end_time",
        ]
        missing = [field for field in required if not str(data.get(field, "")).strip()]
        if missing:
            raise ApiError(400, f"Missing required fields: {', '.join(missing)}")

        equipment_id = parse_int(data["equipment_id"], "equipment_id")
        start = parse_dt(data["start_time"], "start_time")
        end = parse_dt(data["end_time"], "end_time")
        if end <= start:
            raise ApiError(400, "end_time must be later than start_time")

        with self.app.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            equipment = conn.execute(
                "SELECT * FROM equipment WHERE id = ? AND is_active = 1", (equipment_id,)
            ).fetchone()
            if equipment is None:
                raise ApiError(404, "Equipment not found")
            if equipment["status"] not in ("available", "reserved"):
                raise ApiError(409, "Equipment is not available for booking")
            overlap_count = count_overlapping_reservations(
                conn, equipment_id, data["start_time"], data["end_time"]
            )
            if overlap_count >= equipment["capacity"]:
                raise ApiError(409, "Reservation limit reached for this time")

            cursor = conn.execute(
                """
                INSERT INTO reservations (
                    equipment_id, requester_name, requester_email, department, project_name, purpose,
                    start_time, end_time, status, approval_status, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', 'not_required', ?)
                """,
                (
                    equipment_id,
                    data["requester_name"].strip(),
                    data["requester_email"].strip(),
                    data["department"].strip(),
                    data["project_name"].strip(),
                    data["purpose"].strip(),
                    data["start_time"],
                    data["end_time"],
                    str(data.get("notes", "")).strip(),
                ),
            )
            reservation_id = cursor.lastrowid
            conn.execute(
                """
                INSERT INTO reservation_history (reservation_id, action, new_value, changed_by)
                VALUES (?, 'created', ?, ?)
                """,
                (reservation_id, json.dumps(data, ensure_ascii=False), data["requester_name"].strip()),
            )
            row = get_reservation(conn, reservation_id)
        self.send_json({"reservation": row_to_dict(row)}, 201)

    def update_reservation(self, reservation_id: int):
        data = self.read_json()
        with self.app.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            current = get_reservation(conn, reservation_id)
            if current is None:
                raise ApiError(404, "Reservation not found")

            new_status = normalize_reservation_status(data.get("status", current["status"]))
            new_start = data.get("start_time", current["start_time"])
            new_end = data.get("end_time", current["end_time"])
            parse_dt(new_start, "start_time")
            if parse_dt(new_end, "end_time") <= parse_dt(new_start, "start_time"):
                raise ApiError(400, "end_time must be later than start_time")

            if new_status != "cancelled":
                overlap_count = count_overlapping_reservations(
                    conn, current["equipment_id"], new_start, new_end, reservation_id
                )
                if overlap_count >= current["equipment_capacity"]:
                    raise ApiError(409, "Reservation limit reached for this time")

            old_value = json.dumps(row_to_dict(current), ensure_ascii=False)
            conn.execute(
                """
                UPDATE reservations
                SET start_time = ?, end_time = ?, status = ?, notes = ?, cancel_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    new_start,
                    new_end,
                    new_status,
                    data.get("notes", current["notes"]),
                    data.get("cancel_reason", current["cancel_reason"]),
                    reservation_id,
                ),
            )
            updated = get_reservation(conn, reservation_id)
            conn.execute(
                """
                INSERT INTO reservation_history
                    (reservation_id, action, old_value, new_value, changed_by)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    reservation_id,
                    "cancelled" if new_status == "cancelled" else "updated",
                    old_value,
                    json.dumps(row_to_dict(updated), ensure_ascii=False),
                    data.get("changed_by", "system"),
                ),
            )
        self.send_json({"reservation": row_to_dict(updated)})

def get_reservation(conn: sqlite3.Connection, reservation_id: int):
    return conn.execute(
        """
        SELECT r.*, e.name AS equipment_name, e.category AS equipment_category,
               e.capacity AS equipment_capacity
        FROM reservations r
        JOIN equipment e ON e.id = r.equipment_id
        WHERE r.id = ?
        """,
        (reservation_id,),
    ).fetchone()


def count_overlapping_reservations(
    conn: sqlite3.Connection,
    equipment_id: int,
    start_time: str,
    end_time: str,
    exclude_reservation_id: int | None = None,
):
    params: list[Any] = [equipment_id, end_time, start_time]
    exclude = ""
    if exclude_reservation_id:
        exclude = "AND id <> ?"
        params.append(exclude_reservation_id)
    return conn.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE equipment_id = ?
          AND status NOT IN ('cancelled')
          AND start_time < ?
          AND end_time > ?
          {exclude}
        """,
        params,
    ).fetchone()["count"]


class TestServer:
    def __init__(self, app: App):
        handler = make_handler(app)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


def make_handler(app: App):
    class BoundHandler(Handler):
        pass

    BoundHandler.app = app
    return BoundHandler


def main():
    parser = argparse.ArgumentParser(description="Reliability lab reservation MVP")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--db", default=str(DEFAULT_DB))
    args = parser.parse_args()

    app = create_app(args.db)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(app))
    print(f"R-Lab reservation MVP running at http://{args.host}:{args.port}")
    print(f"SQLite database: {Path(args.db).resolve()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
