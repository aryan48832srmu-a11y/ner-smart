"""Weather service.

When an ``OPENWEATHER_API_KEY`` is configured, live current conditions are
fetched from OpenWeatherMap for every NER location (cached with a short TTL).
If no key is configured — or a specific request fails — the service falls back
to a deterministic simulated reading so the platform keeps working offline.
Each reading is tagged with a ``source`` of ``"live"`` or ``"simulated"``.
"""

from __future__ import annotations

import random
from datetime import datetime
from typing import Any

from app.config import settings
from app.data.demo_data import CITIES
from app.services import owm_client

# Simulated per-location weather (used as fallback). Seeded deterministically
# so repeated calls are stable within a session.
_SIMULATED: dict[str, dict[str, Any]] = {}

_NER_RAIN_CORRIDOR = {"Tawang", "Bomdila", "Dirang", "Tezpur", "Itanagar"}


def _deterministic(seed: str) -> random.Random:
    return random.Random(seed)


def _now_label() -> str:
    return datetime.now().strftime("%H:%M")


def _simulated_reading(name: str, data: dict[str, Any]) -> dict[str, Any]:
    if name in _SIMULATED:
        return _SIMULATED[name]
    r = _deterministic(name)
    rainfall = round(r.uniform(0, 45), 1)
    condition = r.choice(
        ["Clear", "Light Rain", "Moderate Rain", "Heavy Rain", "Overcast", "Mist"]
    )
    if name in _NER_RAIN_CORRIDOR:
        rainfall = round(min(rainfall + r.uniform(10, 22), 60), 1)
        condition = r.choice(["Heavy Rain", "Moderate Rain"])
    reading = {
        "location": name,
        "state": data["state"],
        "lat": data["lat"],
        "lng": data["lng"],
        "temperature_c": round(r.uniform(12, 31), 1),
        "humidity_pct": int(r.uniform(45, 96)),
        "rainfall_mm": rainfall,
        "wind_kmh": round(r.uniform(3, 40), 1),
        "condition": condition,
        "alert": _alert_for(condition, rainfall, 0.0),
        "source": "simulated",
        "updated": _now_label(),
    }
    _SIMULATED[name] = reading
    return reading


def map_owm_to_reading(
    name: str, city: dict[str, Any], data: dict[str, Any]
) -> dict[str, Any]:
    """Map an OpenWeatherMap current-weather payload to a weather reading."""
    main = data.get("main", {}) or {}
    wind = data.get("wind", {}) or {}
    weather_list = data.get("weather") or [{}]
    condition = weather_list[0].get("main", "Unknown")

    rain = data.get("rain", {}) or {}
    rainfall = rain.get("1h")
    if rainfall is None and rain.get("3h") is not None:
        rainfall = rain["3h"] / 3.0
    rainfall = round(float(rainfall or 0.0), 1)

    wind_kmh = round(float(wind.get("speed", 0.0)) * 3.6, 1)
    temperature = round(float(main.get("temp", 0.0)), 1)
    humidity = round(float(main.get("humidity", 0.0)))

    return {
        "location": name,
        "state": city["state"],
        "lat": city["lat"],
        "lng": city["lng"],
        "temperature_c": temperature,
        "humidity_pct": humidity,
        "rainfall_mm": rainfall,
        "wind_kmh": wind_kmh,
        "condition": condition,
        "alert": _alert_for(condition, rainfall, wind_kmh),
        "source": "live",
        "updated": _now_label(),
    }


def _alert_for(condition: str, rainfall_mm: float, wind_kmh: float) -> str | None:
    if condition == "Thunderstorm":
        return "Thunderstorm alert"
    if rainfall_mm >= 20:
        return "Heavy rainfall alert"
    if wind_kmh >= 45:
        return "High wind advisory"
    if rainfall_mm >= 7.5:
        return "Moderate rainfall advisory"
    if condition == "Snow":
        return "Heavy snow advisory"
    return None


def _live_reading(name: str, data: dict[str, Any]) -> dict[str, Any] | None:
    try:
        payload = owm_client.fetch_current(data["lat"], data["lng"])
        return map_owm_to_reading(name, data, payload)
    except Exception:
        return None


def get_weather(location: str | None = None) -> list[dict[str, Any]]:
    """Return weather readings for all NER locations (or a single location)."""
    readings: list[dict[str, Any]] = []
    for name, data in CITIES.items():
        if location and name.lower() != location.lower():
            continue
        reading = None
        if settings.live_weather_enabled:
            reading = _live_reading(name, data)
        readings.append(reading or _simulated_reading(name, data))
    return readings


def weather_for_city(name: str) -> dict[str, Any] | None:
    city = next((c for c in CITIES if c.lower() == name.lower()), None)
    if not city:
        return None
    data = CITIES[city]
    reading = None
    if settings.live_weather_enabled:
        reading = _live_reading(city, data)
    return reading or _simulated_reading(city, data)


def get_weather_alert_count() -> int:
    return sum(1 for w in get_weather() if w.get("alert"))
