from contextlib import asynccontextmanager
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import json
import os
import random
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, save_reading, get_readings


SUPPORTED_CITIES = ("Hyderabad", "Delhi", "Bengaluru", "Chennai")
CITY_PATTERN = "^(Hyderabad|Delhi|Bengaluru|Chennai)$"

# Coordinates used to request city-level external model estimates.
CITY_COORDINATES = {
    "Hyderabad": (17.3850, 78.4867),
    "Delhi": (28.6139, 77.2090),
    "Bengaluru": (12.9716, 77.5946),
    "Chennai": (13.0827, 80.2707),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create or migrate the SQLite database at startup.
    init_db()
    yield


app = FastAPI(
    title="AirGuard API",
    description="Air Pollution Monitoring and Prediction System",
    version="0.6.0",
    lifespan=lifespan,
)

# Keep local development origins and allow configured deployment origins.
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
if frontend_url:
    allowed_origins.append(frontend_url)

extra_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins.extend(
    origin.strip().rstrip("/")
    for origin in extra_origins.split(",")
    if origin.strip()
)

# Remove duplicates while preserving order.
allowed_origins = list(dict.fromkeys(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "project": "AirGuard",
        "status": "running",
        "message": "Air pollution monitoring API is ready",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/readings/demo")
def create_demo_reading(
    city: str = Query(default="Hyderabad", pattern=CITY_PATTERN),
):
    # Generate simulated values for demonstration only.
    pm25 = round(random.uniform(8.0, 85.0), 1)
    pm10 = round(random.uniform(pm25, pm25 * 2.0 + 15.0), 1)
    timestamp = datetime.now(timezone.utc).isoformat()

    # This is a preliminary demo classification, not official AQI.
    if pm25 <= 15:
        status = "Low"
    elif pm25 <= 35:
        status = "Moderate"
    elif pm25 <= 75:
        status = "Elevated"
    else:
        status = "High"

    save_reading(
        timestamp=timestamp,
        pm25=pm25,
        pm10=pm10,
        status=status,
        data_source="simulated",
        city=city,
    )

    return {
        "timestamp": timestamp,
        "pm25_ug_m3": pm25,
        "pm10_ug_m3": pm10,
        "status": status,
        "data_source": "simulated",
        "city": city,
        "saved": True,
    }


@app.post("/readings/external/refresh")
def refresh_external_reading(
    city: str = Query(default="Hyderabad", pattern=CITY_PATTERN),
):
    """Fetch and save the latest Open-Meteo particulate estimates."""
    latitude, longitude = CITY_COORDINATES[city]
    params = urlencode({
        "latitude": latitude,
        "longitude": longitude,
        "current": "pm2_5,pm10",
        "timezone": "Asia/Kolkata",
    })
    url = f"https://air-quality-api.open-meteo.com/v1/air-quality?{params}"
    request = Request(
        url,
        headers={"User-Agent": "AirGuard-Prototype/1.0"},
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)

        current = payload["current"]
        pm25 = float(current["pm2_5"])
        pm10 = float(current["pm10"])
        observed_at = datetime.fromisoformat(current["time"]).replace(
            tzinfo=ZoneInfo("Asia/Kolkata")
        ).isoformat()

        if pm25 < 0 or pm10 < 0:
            raise ValueError("The API returned negative particulate values.")

    except (HTTPError, URLError, TimeoutError, OSError,
            json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve valid air-quality estimates from Open-Meteo.",
        ) from exc

    # This is a preliminary PM2.5 classification, not official AQI.
    if pm25 <= 15:
        status = "Low"
    elif pm25 <= 35:
        status = "Moderate"
    elif pm25 <= 75:
        status = "Elevated"
    else:
        status = "High"

    # Avoid storing the same city/source/observation twice.
    existing = get_readings(limit=500, city=city)
    duplicate = any(
        row["data_source"] == "open_meteo"
        and row["timestamp"] == observed_at
        for row in existing
    )

    if not duplicate:
        save_reading(
            timestamp=observed_at,
            pm25=pm25,
            pm10=pm10,
            status=status,
            data_source="open_meteo",
            city=city,
        )

    return {
        "city": city,
        "timestamp": observed_at,
        "pm25_ug_m3": pm25,
        "pm10_ug_m3": pm10,
        "status": status,
        "data_source": "open_meteo",
        "data_description": "External model-based estimate; not a physical sensor reading.",
        "saved": not duplicate,
        "already_saved": duplicate,
    }


@app.get("/readings")
def read_saved_readings(
    limit: int = Query(default=50, ge=1, le=500),
    city: str = Query(default="Hyderabad", pattern=CITY_PATTERN),
):
    readings = get_readings(limit=limit, city=city)

    return {
        "city": city,
        "count": len(readings),
        "readings": readings,
    }
