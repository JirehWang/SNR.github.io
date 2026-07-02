import argparse
import json
import sqlite3
import threading
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
WORKSPACE_ROOT = ROOT.parents[2] if ROOT.parents[1].name == "work" else ROOT.parents[1]
DEFAULT_DB = WORKSPACE_ROOT / "data" / "rlab_reservation.db"


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
                    category TEXT NOT NULL,
                    location TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'available',
                    capacity INTEGER NOT NULL DEFAULT 1,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS reservations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    equipment_id INTEGER NOT NULL,
                    requester_name TEXT NOT NULL,
                    requester_email TEXT NOT NULL,
                    department TEXT NOT NULL,
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
                super().do_GET()
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)
        except Exception as exc:
            self.send_json({"error": f"Unexpected server error: {exc}"}, 500)

    def handle_api(self, path: str, query: dict[str, list[str]]):
        if self.command == "GET" and path == "/api/equipment":
            return self.get_equipment()
        if self.command == "POST" and path == "/api/equipment":
            return self.create_equipment()
        if self.command == "PATCH" and path.startswith("/api/equipment/"):
            equipment_id = int(path.rsplit("/", 1)[1])
            return self.update_equipment(equipment_id)
        if self.command == "GET" and path == "/api/reservations":
            return self.get_reservations(query)
        if self.command == "POST" and path == "/api/reservations":
            return self.create_reservation()
        if self.command == "PATCH" and path.startswith("/api/reservations/"):
            reservation_id = int(path.rsplit("/", 1)[1])
            return self.update_reservation(reservation_id)
        raise ApiError(404, "API route not found")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ApiError(400, "Invalid JSON body") from exc

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
                SELECT id, name, category, location, status, capacity, is_active
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
        capacity = int(data.get("capacity") or 1)
        if capacity < 1:
            raise ApiError(400, "capacity must be at least 1")
        status = normalize_status(data.get("status", "available"))
        is_active = 1 if int(data.get("is_active", 1)) else 0
        with self.app.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO equipment (name, category, location, status, capacity, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    data["name"].strip(),
                    data["category"].strip(),
                    str(data.get("location", "")).strip(),
                    status,
                    capacity,
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
            category = str(data.get("category", current["category"])).strip()
            location = str(data.get("location", current["location"])).strip()
            status = normalize_status(data.get("status", current["status"]))
            capacity = int(data.get("capacity", current["capacity"]) or 1)
            is_active = 1 if int(data.get("is_active", current["is_active"])) else 0
            if not name:
                raise ApiError(400, "name is required")
            if not category:
                raise ApiError(400, "category is required")
            if capacity < 1:
                raise ApiError(400, "capacity must be at least 1")
            conn.execute(
                """
                UPDATE equipment
                SET name = ?, category = ?, location = ?, status = ?, capacity = ?, is_active = ?
                WHERE id = ?
                """,
                (name, category, location, status, capacity, is_active, equipment_id),
            )
            row = conn.execute(
                """
                SELECT id, name, category, location, status, capacity, is_active
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
            params.append(int(query["equipment_id"][0]))
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
            "purpose",
            "start_time",
            "end_time",
        ]
        missing = [field for field in required if not str(data.get(field, "")).strip()]
        if missing:
            raise ApiError(400, f"Missing required fields: {', '.join(missing)}")

        equipment_id = int(data["equipment_id"])
        start = parse_dt(data["start_time"], "start_time")
        end = parse_dt(data["end_time"], "end_time")
        if end <= start:
            raise ApiError(400, "end_time must be later than start_time")

        with self.app.connect() as conn:
            equipment = conn.execute(
                "SELECT * FROM equipment WHERE id = ? AND is_active = 1", (equipment_id,)
            ).fetchone()
            if equipment is None:
                raise ApiError(404, "Equipment not found")
            if equipment["status"] not in ("available", "reserved"):
                raise ApiError(409, "Equipment is not available for booking")
            conflict = find_conflict(conn, equipment_id, data["start_time"], data["end_time"])
            if conflict:
                raise ApiError(409, f"Reservation conflicts with #{conflict['id']} ({conflict['requester_name']})")

            cursor = conn.execute(
                """
                INSERT INTO reservations (
                    equipment_id, requester_name, requester_email, department, purpose,
                    start_time, end_time, status, approval_status, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', 'not_required', ?)
                """,
                (
                    equipment_id,
                    data["requester_name"].strip(),
                    data["requester_email"].strip(),
                    data["department"].strip(),
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
            current = get_reservation(conn, reservation_id)
            if current is None:
                raise ApiError(404, "Reservation not found")

            new_status = data.get("status", current["status"])
            new_start = data.get("start_time", current["start_time"])
            new_end = data.get("end_time", current["end_time"])
            parse_dt(new_start, "start_time")
            if parse_dt(new_end, "end_time") <= parse_dt(new_start, "start_time"):
                raise ApiError(400, "end_time must be later than start_time")

            if new_status != "cancelled":
                conflict = find_conflict(conn, current["equipment_id"], new_start, new_end, reservation_id)
                if conflict:
                    raise ApiError(409, f"Reservation conflicts with #{conflict['id']} ({conflict['requester_name']})")

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
        SELECT r.*, e.name AS equipment_name, e.category AS equipment_category
        FROM reservations r
        JOIN equipment e ON e.id = r.equipment_id
        WHERE r.id = ?
        """,
        (reservation_id,),
    ).fetchone()


def find_conflict(
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
        SELECT id, requester_name, start_time, end_time
        FROM reservations
        WHERE equipment_id = ?
          AND status NOT IN ('cancelled')
          AND start_time < ?
          AND end_time > ?
          {exclude}
        ORDER BY start_time
        LIMIT 1
        """,
        params,
    ).fetchone()


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
