import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request
from flask_cors import CORS

DB_PATH = os.environ.get("PHYSIO_DB", os.path.join(os.path.dirname(__file__), "appointments.db"))

SERVICES = ("initial", "followup", "sports", "massage")
TIME_SLOTS = ("08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00")
STATUSES = ("pending", "approved", "declined")

EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")

app = Flask(__name__)
CORS(app)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                client_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                service TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                physio_note TEXT NOT NULL DEFAULT '',
                requested_at TEXT NOT NULL
            )
            """
        )


def to_json(row):
    return {
        "id": row["id"],
        "clientName": row["client_name"],
        "email": row["email"],
        "phone": row["phone"],
        "service": row["service"],
        "notes": row["notes"],
        "date": row["date"],
        "time": row["time"],
        "status": row["status"],
        "physioNote": row["physio_note"],
        "requestedAt": row["requested_at"],
    }


def validate_request(payload):
    errors = {}

    client_name = str(payload.get("clientName", "")).strip()
    email = str(payload.get("email", "")).strip()
    service = str(payload.get("service", "")).strip()
    date = str(payload.get("date", "")).strip()
    time = str(payload.get("time", "")).strip()

    if not client_name:
        errors["clientName"] = "Tell us your name"
    if not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email"
    if service not in SERVICES:
        errors["service"] = "Unknown treatment"
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        errors["date"] = "Pick a date"
    if time not in TIME_SLOTS:
        errors["time"] = "Pick a time slot"

    cleaned = {
        "clientName": client_name,
        "email": email,
        "phone": str(payload.get("phone", "")).strip(),
        "service": service,
        "notes": str(payload.get("notes", "")).strip(),
        "date": date,
        "time": time,
    }
    return cleaned, errors


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/appointments")
def list_appointments():
    db = get_db()
    rows = db.execute("SELECT * FROM appointments ORDER BY date, time").fetchall()
    return jsonify([to_json(row) for row in rows])


@app.post("/api/appointments")
def create_appointment():
    payload = request.get_json(silent=True) or {}
    cleaned, errors = validate_request(payload)
    if errors:
        return jsonify({"errors": errors}), 400

    db = get_db()
    taken = db.execute(
        "SELECT 1 FROM appointments WHERE date = ? AND time = ? AND status != 'declined'",
        (cleaned["date"], cleaned["time"]),
    ).fetchone()
    if taken:
        return jsonify({"errors": {"time": "That slot was just taken"}}), 409

    appointment = {
        **cleaned,
        "id": str(uuid.uuid4()),
        "status": "pending",
        "physioNote": "",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.execute(
        """
        INSERT INTO appointments
            (id, client_name, email, phone, service, notes, date, time, status, physio_note, requested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            appointment["id"],
            appointment["clientName"],
            appointment["email"],
            appointment["phone"],
            appointment["service"],
            appointment["notes"],
            appointment["date"],
            appointment["time"],
            appointment["status"],
            appointment["physioNote"],
            appointment["requestedAt"],
        ),
    )
    db.commit()
    return jsonify(appointment), 201


@app.patch("/api/appointments/<appointment_id>")
def decide_appointment(appointment_id):
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", "")).strip()
    if status not in STATUSES:
        return jsonify({"errors": {"status": f"Status must be one of {', '.join(STATUSES)}"}}), 400

    physio_note = str(payload.get("physioNote", "")).strip()

    db = get_db()
    updated = db.execute(
        "UPDATE appointments SET status = ?, physio_note = ? WHERE id = ?",
        (status, physio_note, appointment_id),
    )
    db.commit()
    if updated.rowcount == 0:
        return jsonify({"errors": {"id": "Appointment not found"}}), 404

    row = db.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
    return jsonify(to_json(row))


init_db()

if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5001)), debug=True)
