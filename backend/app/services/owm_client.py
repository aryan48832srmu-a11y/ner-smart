"""OpenWeatherMap client with a TTL cache.

Fetches current conditions for a coordinate from the OpenWeatherMap free tier
(Current Weather API). Raw responses are cached briefly so that refreshing the
dashboard does not exhaust the free quota (~10 NER cities per refresh, cache
10 minutes by default).

The HTTP call is isolated in ``_http_get`` so tests can monkeypatch it without
network access.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings

OWM_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _http_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    with httpx.Client(timeout=settings.WEATHER_TIMEOUT_SECONDS) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def clear_cache() -> None:
    _cache.clear()


def fetch_current(lat: float, lng: float) -> dict[str, Any]:
    """Fetch current weather for a coordinate, using a TTL cache."""
    cache_key = f"{lat:.4f},{lng:.4f}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[0]) < settings.WEATHER_CACHE_TTL_SECONDS:
        return cached[1]

    data = _http_get(
        OWM_BASE_URL,
        {
            "lat": lat,
            "lon": lng,
            "appid": settings.OPENWEATHER_API_KEY,
            "units": "metric",
        },
    )
    _cache[cache_key] = (now, data)
    return data
