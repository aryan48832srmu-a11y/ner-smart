"""Real-road route planning with layered fallbacks.

The planner never fails the user. It tries public OSRM routing servers first
(actual drivable roads, turn-by-turn steps), then the built-in NER road graph,
and finally a direct connection. Every response contains GeoJSON-style
coordinates the map can draw immediately.

Design goals
------------
* **Real roads** — primary source is OpenStreetMap routing via OSRM.
* **Always usable** — up to 4 independent sources; a route is always returned.
* **Fast** — successful provider results are cached in memory by endpoint pair.
* **Safe** — active incidents are overlaid on each geometry and used to rank
  the alternatives, so the "Safest" mode is more than a marketing label.
* **Keyless** — only public services; no paid API or map token required.

The HTTP call is isolated in ``_provider_get`` so tests can monkeypatch it.
"""

from __future__ import annotations

import math
import threading
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.data.demo_data import CITIES
from app.services import geocode_service, live_incident_service
from app.services.store import get_store

# OSRM-compatible public endpoints. ``profile`` is the part after /routed-/.
PROVIDERS: dict[str, dict[str, str]] = {
    "osrm-public": {
        "url": "https://router.project-osrm.org/route/v1/driving",
        "label": "OpenStreetMap (OSRM public)",
    },
    "osrm-de": {
        "url": "https://routing.openstreetmap.de/routed-car/route/v1/driving",
        "label": "OpenStreetMap (OSRM Germany)",
    },
    "osrm-de-truck": {
        "url": "https://routing.openstreetmap.de/routed-car/route/v1/driving",
        "label": "OpenStreetMap (backup)",
    },
}
PROVIDER_LABELS = {key: value["label"] for key, value in PROVIDERS.items()}

MODES = ("safest", "fastest", "shortest")
MODE_LABELS = {"safest": "Safest", "fastest": "Fastest", "shortest": "Shortest"}
SEVERITY_WEIGHT = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
INCIDENT_RADIUS_KM = 12.0
ROUTE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7"]

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_cache_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two (lat, lng) points."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))


def _distance_of(points: list[list[float]]) -> float:
    total = 0.0
    for a, b in zip(points, points[1:]):
        total += haversine_km((a[0], a[1]), (b[0], b[1]))
    return total


def _fmt_duration(minutes: float) -> str:
    minutes = int(round(minutes))
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _provider_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    headers = {"User-Agent": "NDRMS/1.3 (route planning; demo)", "Accept": "application/json"}
    with httpx.Client(timeout=settings.ROUTING_TIMEOUT_SECONDS, headers=headers) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def resolve_point(label: str, lat: float | None = None, lng: float | None = None) -> dict[str, Any]:
    """Turn a place label (and optional coordinates) into a routable point."""
    name = (label or "").strip()
    if lat is not None and lng is not None:
        return {"label": name or f"{lat:.4f}, {lng:.4f}", "lat": lat, "lng": lng, "geocoded": True}

    # 1. Known demo cities — instant, no network.
    for city_name, data in CITIES.items():
        if city_name.lower() == name.lower():
            return {"label": city_name, "lat": float(data["lat"]), "lng": float(data["lng"]), "geocoded": True}

    # 2. Forward geocoding via the existing Nominatim proxy.
    if len(name) >= 2:
        for hit in geocode_service.search(name, 1):
            return {
                "label": hit.get("label") or name,
                "lat": float(hit["lat"]),
                "lng": float(hit["lng"]),
                "geocoded": True,
            }

    # 3. Last resort: a rough centroid of the NER so the request still yields a
    #    route instead of an error the user has to debug.
    return {
        "label": name or "Unknown place",
        "lat": 26.2,
        "lng": 92.5,
        "geocoded": False,
    }


# ---------------------------------------------------------------------------
# Provider / fallback route discovery
# ---------------------------------------------------------------------------
def _cached(key: str) -> list[dict[str, Any]] | None:
    with _cache_lock:
        hit = _cache.get(key)
        if not hit:
            return None
        if time.time() - hit[0] > settings.ROUTING_CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return hit[1]


def _remember(key: str, routes: list[dict[str, Any]]) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), routes)


def _provider_routes(origin: dict[str, Any], destination: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None, list[str]]:
    """Return (raw routes, provider id, warnings)."""
    coord_text = f"{origin['lng']:.6f},{origin['lat']:.6f};{destination['lng']:.6f},{destination['lat']:.6f}"
    key = f"osrm|{coord_text}"
    cached = _cached(key)
    if cached is not None:
        return cached, "cache", []

    warnings: list[str] = []
    provider_ids = [p.strip() for p in settings.ROUTING_PROVIDERS.split(",") if p.strip()]
    for provider_id in provider_ids:
        provider = PROVIDERS.get(provider_id)
        if not provider:
            continue
        try:
            data = _provider_get(
                provider["url"] + "/" + coord_text,
                {
                    "overview": "full",
                    "geometries": "geojson",
                    "alternatives": "3",
                    "steps": "true",
                },
            )
            if data.get("code") != "Ok" or not data.get("routes"):
                raise ValueError(f"provider returned {data.get('code', 'no code')}")
            raw = data["routes"][:3]
            _remember(key, raw)
            return raw, provider_id, warnings
        except Exception as exc:  # network / timeout / bad payload — try next provider
            warnings.append(f"{provider['label']} unavailable ({type(exc).__name__}).")

    return [], None, warnings


def _offline_routes(
    origin: dict[str, Any],
    destination: dict[str, Any],
    cargo_type: str,
    priority: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Convert the built-in demo graph into drawable road geometries."""
    from app.services import route_engine

    warnings: list[str] = []
    try:
        result = route_engine.optimize(
            origin["label"],
            destination["label"],
            cargo_type,
            priority,
            origin_lat=origin["lat"],
            origin_lng=origin["lng"],
            destination_lat=destination["lat"],
            destination_lng=destination["lng"],
        )
    except Exception as exc:
        return [], [f"Offline road graph unavailable ({type(exc).__name__})."]

    roads_by_name = {r["name"]: r for r in get_store().roads()}
    raw: list[dict[str, Any]] = []
    for variant in result.get("routes", [])[:3]:
        coordinates: list[list[float]] = []
        for segment in variant.get("segments", []):
            road = roads_by_name.get(segment.get("road_name"))
            points = road.get("coordinates") or [] if road else []
            for point in points:
                pair = [float(point[0]), float(point[1])]
                if not coordinates or coordinates[-1] != pair:
                    coordinates.append(pair)
        # Ensure the geometry actually meets the requested endpoints.
        if coordinates:
            coordinates[0] = [origin["lat"], origin["lng"]]
            coordinates[-1] = [destination["lat"], destination["lng"]]
        if len(coordinates) >= 2:
            distance_m = variant.get("distance_km", 0) * 1000
            raw.append(
                {
                    "distance": distance_m,
                    "duration": variant.get("eta_hours", 0) * 3600,
                    "geometry": {"coordinates": coordinates},
                    "legs": [],
                }
            )
    if not raw:
        warnings.append("Offline road graph had no usable segments.")
    return raw, warnings


def _direct_route(origin: dict[str, Any], destination: dict[str, Any]) -> list[dict[str, Any]]:
    """Absolute last resort: a labelled straight line with sane estimates."""
    km = haversine_km((origin["lat"], origin["lng"]), (destination["lat"], destination["lng"]))
    road_km = km * 1.25  # approximate road factor
    return [
        {
            "distance": road_km * 1000,
            "duration": (road_km / 45.0) * 3600,  # 45 km/h average
            "geometry": {
                "coordinates": [
                    [origin["lng"], origin["lat"]],
                    [destination["lng"], destination["lat"]],
                ]
            },
            "legs": [],
        }
    ]


# ---------------------------------------------------------------------------
# Risk overlay & scoring
# ---------------------------------------------------------------------------
def _nearby_incidents(coordinates: list[list[float]], incidents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not incidents or not coordinates:
        return []
    step = max(1, len(coordinates) // 100)
    sampled = coordinates[::step]
    hits: dict[str, dict[str, Any]] = {}
    for incident in incidents:
        try:
            point = (float(incident["lat"]), float(incident["lng"]))
        except (KeyError, TypeError, ValueError):
            continue
        if not any(haversine_km((lat, lng), point) <= INCIDENT_RADIUS_KM for lat, lng in sampled):
            continue
        hits[str(incident.get("id", point))] = {
            "id": incident.get("id"),
            "lat": point[0],
            "lng": point[1],
            "label": incident.get("location_name") or incident.get("type") or "Incident",
            "type": incident.get("type", "Incident"),
            "severity": incident.get("severity", "Medium"),
        }
    return list(hits.values())


def _risk_score(nearby: list[dict[str, Any]]) -> tuple[int, str]:
    if not nearby:
        return 5, "Low"
    raw = sum(SEVERITY_WEIGHT.get(str(i.get("severity", "Medium")), 2) for i in nearby)
    score = min(100, 10 + raw * 8)
    level = "Low" if score <= 25 else "Moderate" if score <= 50 else "High" if score <= 75 else "Critical"
    return score, level


def _steps_from_legs(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for leg in legs:
        for step in leg.get("steps", []) or []:
            maneuver = step.get("maneuver") or {}
            kind = str(maneuver.get("type") or "").replace(" ", " ").capitalize()
            modifier = str(maneuver.get("modifier") or "").replace(" ", " ").capitalize()
            name = step.get("name") or "road"
            if modifier:
                instruction = f"{kind} {modifier} onto {name}" if kind else f"{modifier} onto {name}"
            elif kind == "Depart":
                instruction = f"Head out on {name}"
            elif kind == "Arrive":
                instruction = "Arrive at destination"
            else:
                instruction = f"{kind or 'Continue'} on {name}"
            steps.append(
                {
                    "instruction": instruction,
                    "road": name,
                    "distance_km": round(step.get("distance", 0) / 1000, 2),
                    "duration_min": round(step.get("duration", 0) / 60, 1),
                }
            )
    return steps[:30]


def _build_route(raw: dict[str, Any], index: int, incidents: list[dict[str, Any]]) -> dict[str, Any]:
    coords_lng_lat = (raw.get("geometry") or {}).get("coordinates") or []
    coordinates = [[float(p[1]), float(p[0])] for p in coords_lng_lat if len(p) >= 2]
    if len(coordinates) < 2:
        coordinates = [[0.0, 0.0], [0.0, 0.0]]  # never let the UI crash

    distance_km = round(float(raw.get("distance", 0)) / 1000, 1)
    if distance_km <= 0:
        distance_km = round(_distance_of(coordinates), 1)
    duration_min = round(float(raw.get("duration", 0)) / 60, 1)
    if duration_min <= 0:
        duration_min = round(distance_km / 45.0 * 60, 1)

    nearby = _nearby_incidents(coordinates, incidents)
    risk_score, risk_level = _risk_score(nearby)

    return {
        "id": f"route-{chr(65 + index)}",
        "label": f"Route {chr(65 + index)}",
        "coordinates": coordinates,
        "distance_km": distance_km,
        "duration_min": duration_min,
        "eta_display": _fmt_duration(duration_min),
        "risk_score": risk_score,
        "safety_score": 100 - risk_score,
        "risk_level": risk_level,
        "incidents_nearby": len(nearby),
        "nearby_incidents": nearby,
        "steps": _steps_from_legs(raw.get("legs") or []),
        "recommended": False,
        "tag": "",
        "reason": "",
    }


def _rank(routes: list[dict[str, Any]], mode: str) -> None:
    """Sort alternatives for the chosen mode and mark the recommended one."""
    if not routes:
        return
    min_km = min(r["distance_km"] for r in routes)
    min_min = min(r["duration_min"] for r in routes)
    max_km = max(r["distance_km"] for r in routes)
    max_min = max(r["duration_min"] for r in routes)

    def norm(value: float, lo: float, hi: float) -> float:
        return 100.0 if hi <= lo else (value - lo) / (hi - lo) * 100.0

    if mode == "fastest":
        key = lambda r: (r["duration_min"], r["distance_km"])
    elif mode == "shortest":
        key = lambda r: (r["distance_km"], r["duration_min"])
    else:  # safest — risk first, then a light time/distance tie-break
        key = lambda r: (
            -(r["safety_score"] * 0.70
              + (100 - norm(r["duration_min"], min_min, max_min)) * 0.18
              + (100 - norm(r["distance_km"], min_km, max_km)) * 0.12),
            r["duration_min"],
        )

    routes.sort(key=key)
    for i, route in enumerate(routes):
        route["id"] = f"route-{chr(65 + i)}"
        route["label"] = f"Route {chr(65 + i)}"
        tags: list[str] = []
        if route["distance_km"] == min_km:
            tags.append("Shortest")
        if route["duration_min"] == min_min:
            tags.append("Fastest")
        if route["risk_score"] == min(r["risk_score"] for r in routes):
            tags.append("Safest")
        route["tag"] = " · ".join(tags) if tags else MODE_LABELS.get(mode, "Option")

    best = routes[0]
    best["recommended"] = True
    best["reason"] = (
        f"Recommended as the {MODE_LABELS.get(mode, mode).lower()} option: "
        f"{best['distance_km']} km, about {best['eta_display']}, "
        f"{best['risk_level'].lower()} incident risk"
        + (f" ({best['incidents_nearby']} nearby reports)." if best["incidents_nearby"] else ".")
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def plan_route(
    origin_label: str,
    destination_label: str,
    mode: str = "safest",
    origin_lat: float | None = None,
    origin_lng: float | None = None,
    destination_lat: float | None = None,
    destination_lng: float | None = None,
    cargo_type: str = "General",
    priority: str = "Normal",
    vehicle: str = "Heavy Truck",
) -> dict[str, Any]:
    """Plan a real-road trip. Always returns at least one usable route."""
    mode = mode if mode in MODES else "safest"
    origin = resolve_point(origin_label, origin_lat, origin_lng)
    destination = resolve_point(destination_label, destination_lat, destination_lng)
    warnings: list[str] = []

    if not origin["geocoded"]:
        warnings.append(f"Could not locate '{origin['label']}'; using a regional centre.")
    if not destination["geocoded"]:
        warnings.append(f"Could not locate '{destination['label']}'; using a regional centre.")

    raw, provider_id, provider_warnings = _provider_routes(origin, destination)
    warnings.extend(provider_warnings)
    source = provider_id or "offline-graph"
    source_label = PROVIDER_LABELS.get(provider_id, "Built-in NER road graph") if provider_id else "Built-in NER road graph"
    live = provider_id in PROVIDERS

    if not raw:
        raw, offline_warnings = _offline_routes(origin, destination, cargo_type, priority)
        warnings.extend(offline_warnings)
    if not raw:
        raw = _direct_route(origin, destination)
        source = "direct-line"
        source_label = "Estimated direct connection"
        live = False
        warnings.append("Live routing and the offline graph were unavailable; showing a straight-line estimate.")

    incidents = live_incident_service.active_incidents()
    routes = [_build_route(item, i, incidents) for i, item in enumerate(raw)]
    _rank(routes, mode)

    explanation = routes[0]["reason"] if routes else ""
    if source == "direct-line":
        explanation += " Live road geometry could not be retrieved, so treat this as a rough estimate."

    return {
        "origin": {"label": origin["label"], "lat": origin["lat"], "lng": origin["lng"]},
        "destination": {"label": destination["label"], "lat": destination["lat"], "lng": destination["lng"]},
        "mode": mode,
        "mode_label": MODE_LABELS[mode],
        "source": source,
        "source_label": source_label,
        "live": live,
        "routes": routes,
        "recommended": routes[0] if routes else None,
        "explanation": explanation,
        "risk_overlay": {
            "incidents": [i for route in routes for i in route["nearby_incidents"]],
            "radius_km": INCIDENT_RADIUS_KM,
        },
        "cargo_type": cargo_type,
        "priority": priority,
        "vehicle": vehicle,
        "warnings": warnings,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
    }
