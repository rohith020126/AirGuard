import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATABASE_PATH = Path(
    os.getenv(
        "AIRGUARD_DATABASE_PATH",
        str(Path(__file__).resolve().parent / "airguard.db"),
    )
).expanduser()

CITY_BASELINES = {
    "Hyderabad": (28.7, 39.3),
    "Delhi": (68.4, 112.6),
    "Bengaluru": (22.3, 35.8),
    "Chennai": (31.6, 48.2),
}


def _get_status(pm25):
    if pm25 <= 15:
        return "Low"
    if pm25 <= 35:
        return "Moderate"
    if pm25 <= 75:
        return "Elevated"
    return "High"


def init_db():
    """Create or safely migrate the readings table and seed demo history."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                pm25_ug_m3 REAL NOT NULL,
                pm10_ug_m3 REAL NOT NULL,
                status TEXT NOT NULL,
                data_source TEXT NOT NULL,
                city TEXT NOT NULL DEFAULT 'Hyderabad'
            )
        """)

        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(readings)"
            ).fetchall()
        }

        if "city" not in columns:
            connection.execute("""
                ALTER TABLE readings
                ADD COLUMN city TEXT NOT NULL DEFAULT 'Hyderabad'
            """)

        # Populate illustrative history only for cities with no saved readings.
        now = datetime.now(timezone.utc)

        for city, (base_pm25, base_pm10) in CITY_BASELINES.items():
            count = connection.execute(
                "SELECT COUNT(*) FROM readings WHERE city = ?",
                (city,),
            ).fetchone()[0]

            if count:
                continue

            for index in range(10):
                wave = __import__("math").sin(index * 1.15) * 7
                pm25 = round(max(5, base_pm25 + wave), 1)
                pm10 = round(max(pm25, base_pm10 + wave * 1.5), 1)
                timestamp = (
                    now - timedelta(hours=9 - index)
                ).isoformat()

                connection.execute("""
                    INSERT INTO readings (
                        timestamp, pm25_ug_m3, pm10_ug_m3,
                        status, data_source, city
                    )
                    VALUES (?, ?, ?, ?, 'simulated', ?)
                """, (
                    timestamp,
                    pm25,
                    pm10,
                    _get_status(pm25),
                    city,
                ))


def save_reading(
    timestamp,
    pm25,
    pm10,
    status,
    data_source,
    city="Hyderabad",
):
    """Persist one reading for a specific city."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            INSERT INTO readings (
                timestamp, pm25_ug_m3, pm10_ug_m3,
                status, data_source, city
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (timestamp, pm25, pm10, status, data_source, city))


def get_readings(limit=50, city=None):
    """Return recent readings, optionally filtered by city."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row

        if city:
            rows = connection.execute("""
                SELECT id, timestamp, pm25_ug_m3, pm10_ug_m3,
                       status, data_source, city
                FROM readings
                WHERE city = ?
                ORDER BY timestamp DESC, id DESC
                LIMIT ?
            """, (city, limit)).fetchall()
        else:
            rows = connection.execute("""
                SELECT id, timestamp, pm25_ug_m3, pm10_ug_m3,
                       status, data_source, city
                FROM readings
                ORDER BY timestamp DESC, id DESC
                LIMIT ?
            """, (limit,)).fetchall()

        return [dict(row) for row in rows]
