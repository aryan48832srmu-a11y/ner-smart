"""Geocoding proxy (reverse lookup + place search).

The browser cannot call OpenStreetMap's Nominatim directly because the service
does not return CORS headers, so requests are proxied through the backend.
Results are cached to stay well inside Nominatim's usage policy (max ~1
request/second, bulk use discouraged).

The HTTP call is isolated in ``_http_get`` so tests can monkeypatch it without
network access.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "NER-SMART/1.1 (field incident reporting; demo)"

_CACHE_TTL_SECONDS = 3600.0
_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
_search_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _http_get(url: str, params: dict[str, Any], headers: dict[str, str]) -> Any:
    with httpx.Client(timeout=settings.GEOCODE_TIMEOUT_SECONDS) as client:
        response = client.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()


def clear_cache() -> None:
    _cache.clear()
    _search_cache.clear()


def map_nominatim(data: dict[str, Any]) -> dict[str, Any] | None:
    """Reduce a Nominatim payload to the fields the incident form needs."""
    address = data.get("address") or {}
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("suburb")
    )
    district = address.get("state_district") or address.get("county")
    state = address.get("state")

    parts = [part for part in (city, district if district != city else None) if part]
    label = ", ".join(parts)
    if not label:
        display = data.get("display_name") or ""
        label = ", ".join(part.strip() for part in display.split(",")[:2]).strip()

    if not label and not state:
        return None
    return {"label": label, "city": city, "district": district, "state": state}


def reverse(lat: float, lng: float) -> dict[str, Any] | None:
    """Return a place summary for a coordinate, or None when unavailable."""
    key = f"{lat:.4f},{lng:.4f}"
    now = time.time()
    cached = _cache.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        data = _http_get(
            NOMINATIM_URL,
            {
                "format": "jsonv2",
                "lat": lat,
                "lon": lng,
                "zoom": 12,
                "addressdetails": 1,
                "accept-language": "en",
            },
            {"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        result = map_nominatim(data)
    except Exception:
        result = None

    _cache[key] = (now, result)
    return result


def _search_label(address: dict[str, Any], display_name: str) -> str:
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("suburb")
        or address.get("county")
    )
    state = address.get("state")
    country = address.get("country")

    parts: list[str] = []
    for part in (city, state, country):
        if part and part not in parts:
            parts.append(part)
    if parts:
        return ", ".join(parts)
    return ", ".join(part.strip() for part in display_name.split(",")[:3]).strip()


def map_search_item(item: dict[str, Any]) -> dict[str, Any] | None:
    """Reduce one Nominatim search hit to a place suggestion."""
    try:
        lat = float(item["lat"])
        lng = float(item["lon"])
    except (KeyError, TypeError, ValueError):
        return None

    address = item.get("address") or {}
    display_name = item.get("display_name") or ""
    label = _search_label(address, display_name)
    if not label:
        return None

    return {
        "label": label,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "city": address.get("city") or address.get("town") or address.get("village"),
        "state": address.get("state"),
        "country": address.get("country"),
    }


def search(query: str, limit: int = 6) -> list[dict[str, Any]]:
    """Forward-geocode a free-text query into place suggestions."""
    q = query.strip()
    if len(q) < 2:
        return []

    key = f"{q.lower()}|{limit}"
    now = time.time()
    cached = _search_cache.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        data = _http_get(
            NOMINATIM_SEARCH_URL,
            {
                "format": "jsonv2",
                "q": q,
                "limit": limit,
                "addressdetails": 1,
                "accept-language": "en",
            },
            {"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
    except Exception:
        data = []

    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in data if isinstance(data, list) else []:
        mapped = map_search_item(item)
        if not mapped:
            continue
        marker = mapped["label"].lower()
        if marker in seen:
            continue
        seen.add(marker)
        results.append(mapped)
        if len(results) >= limit:
            break

    _search_cache[key] = (now, results)
    return results
