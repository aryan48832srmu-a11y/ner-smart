"""Real-world incidents from public alert feeds (no demo data, no API key).

Sources
-------
* **GDACS** (EU Commission / UN) — floods, forest fires, cyclones, droughts,
  earthquakes and other natural disasters, with coordinates and alert levels.
* **USGS** — live earthquake catalogue from the US Geological Survey.

Both feeds are public, keyless and CORS-free from the browser because the
backend proxies them. Results are cached for ten minutes so the app stays
inside fair-use limits.

The feed items are normalised into the same shape as field reports so the map,
dashboard, route risk overlay and incident list can all use real incidents.
User-submitted reports are merged in; the seeded demo incidents are excluded.
"""

from __future__ import annotations

import math
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from app.config import settings
from app.data.demo_data import CITIES, SEED_INCIDENTS
from app.services.store import get_store

GDACS_URL = "https://www.gdacs.org/xml/rss.xml"
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

# India + immediate neighbours. Narrower than the whole world so the section
# stays relevant to the North Eastern Region, but wide enough to have real data.
REGION_BBOX = {"south": 5.0, "north": 35.0, "west": 65.0, "east": 100.0}
NER_BBOX = {"south": 21.0, "north": 30.0, "west": 87.0, "east": 98.0}
COUNTRIES = {
    "india", "bangladesh", "nepal", "bhutan", "myanmar", "china",
    "pakistan", "sri lanka", "afghanistan", "laos", "vietnam", "thailand",
}

EVENT_TYPES = {
    "EQ": "Earthquake",
    "TC": "Cyclone",
    "FL": "Flood",
    "WF": "Forest Fire",
    "DR": "Drought",
    "LS": "Landslide",
    "VO": "Volcano",
    "TS": "Tsunami",
    "SM": "Storm",
}
ALERT_SEVERITY = {"Red": "Critical", "Orange": "High", "Yellow": "Medium", "Green": "Low"}
SEED_IDS = {i["id"] for i in SEED_INCIDENTS}

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _http_get(url: str, params: dict[str, Any] | None = None) -> Any:
    headers = {"User-Agent": "NDRMS/1.3 (live incident feed; demo)", "Accept": "*/*"}
    with httpx.Client(timeout=settings.LIVE_INCIDENTS_TIMEOUT_SECONDS, headers=headers) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.text if url == GDACS_URL else response.json()


def _in_box(lat: float, lng: float, box: dict[str, float]) -> bool:
    return box["south"] <= lat <= box["north"] and box["west"] <= lng <= box["east"]


def _nearest_state(lat: float, lng: float) -> str | None:
    best: tuple[float, str] | None = None
    for data in CITIES.values():
        distance = math.hypot(float(data["lat"]) - lat, float(data["lng"]) - lng)
        if best is None or distance < best[0]:
            best = (distance, str(data.get("state") or ""))
    if best and best[0] < 4.5 and best[1]:
        return best[1]
    return None


def _minutes_ago(moment: datetime) -> int:
    return max(0, int((datetime.now(timezone.utc) - moment).total_seconds() // 60))


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# GDACS
# ---------------------------------------------------------------------------
def parse_gdacs(xml_text: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text.lstrip("\ufeff"))
    results: list[dict[str, Any]] = []

    for element in root.iter():
        if _local(element.tag) != "item":
            continue
        fields: dict[str, str] = {}
        for child in element.iter():
            fields.setdefault(_local(child.tag), (child.text or "").strip())

        lat = lng = None
        point = fields.get("point", "")
        if point:
            pieces = point.replace(",", " ").split()
            if len(pieces) >= 2:
                try:
                    lat, lng = float(pieces[0]), float(pieces[1])
                except ValueError:
                    pass
        if lat is None:
            try:
                lat = float(fields["lat"])
                lng = float(fields["long"])
            except (KeyError, ValueError):
                continue
        if not _in_box(lat, lng, REGION_BBOX):
            continue

        country = fields.get("country", "") or "Unknown"
        event_type = fields.get("eventtype", "")
        kind = EVENT_TYPES.get(event_type.upper(), "Disaster")
        severity = ALERT_SEVERITY.get(fields.get("alertlevel", "").capitalize(), "Medium")
        title = fields.get("title") or f"{severity} {kind}"
        description = fields.get("description", "")
        link = fields.get("link", "") or f"https://www.gdacs.org/report.aspx?eventtype={event_type}&eventid={fields.get('eventid', '')}"

        try:
            reported = parsedate_to_datetime(fields.get("pubdate") or fields.get("dateadded") or "")
            if reported.tzinfo is None:
                reported = reported.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError, KeyError):
            reported = datetime.now(timezone.utc)

        results.append(
            {
                "id": f"gdacs-{fields.get('eventid') or abs(hash(title))}",
                "type": kind,
                "severity": severity,
                "title": title,
                "description": description,
                "location_name": title.split(" in ")[-1].split(",")[0].strip()[:120],
                "state": _nearest_state(lat, lng) or country,
                "country": country,
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "source": "GDACS",
                "source_url": link,
                "reported_at": _iso(reported),
                "reported_minutes_ago": _minutes_ago(reported),
                "status": "Active",
                "region": "NER" if _in_box(lat, lng, NER_BBOX) else "India & neighbours",
                "is_live": True,
                "alert_level": fields.get("alertlevel", ""),
            }
        )
    return results


# ---------------------------------------------------------------------------
# USGS
# ---------------------------------------------------------------------------
def parse_usgs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for feature in payload.get("features", []) or []:
        try:
            lng, lat = (float(v) for v in feature["geometry"]["coordinates"][:2])
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if not _in_box(lat, lng, REGION_BBOX):
            continue

        props = feature.get("properties") or {}
        try:
            magnitude = float(props.get("mag") or 0)
        except (TypeError, ValueError):
            magnitude = 0.0
        severity = (
            "Critical" if magnitude >= 6.5 else
            "High" if magnitude >= 5.5 else
            "Medium" if magnitude >= 4.5 else "Low"
        )
        try:
            reported = datetime.fromtimestamp(props["time"] / 1000, tz=timezone.utc)
        except (KeyError, TypeError, ValueError, OSError):
            reported = datetime.now(timezone.utc)

        place = props.get("place") or "Unlocated earthquake"
        results.append(
            {
                "id": f"usgs-{feature.get('id')}",
                "type": "Earthquake",
                "severity": severity,
                "title": f"M{magnitude:.1f} earthquake · {place}",
                "description": f"Magnitude {magnitude:.1f} earthquake reported by USGS.",
                "location_name": place,
                "state": _nearest_state(lat, lng) or place.split(",")[-1].strip(),
                "country": "India & neighbours",
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "source": "USGS",
                "source_url": props.get("url") or "https://earthquake.usgs.gov/",
                "reported_at": _iso(reported),
                "reported_minutes_ago": _minutes_ago(reported),
                "status": "Active",
                "region": "NER" if _in_box(lat, lng, NER_BBOX) else "India & neighbours",
                "is_live": True,
                "magnitude": magnitude,
                "alert_level": "",
            }
        )
    return results


# ---------------------------------------------------------------------------
# Fetch / merge
# ---------------------------------------------------------------------------
def live_incidents(force: bool = False) -> list[dict[str, Any]]:
    """Fetch and cache normalised incidents from the live public feeds."""
    if not settings.LIVE_INCIDENTS_ENABLED:
        return []

    key = "live-incidents"
    with _cache_lock:
        cached = _cache.get(key)
        if not force and cached and time.time() - cached[0] < settings.LIVE_INCIDENTS_CACHE_TTL_SECONDS:
            return cached[1]

    results: list[dict[str, Any]] = []

    # GDACS
    try:
        xml_text = _http_get(GDACS_URL)
        results.extend(parse_gdacs(xml_text))
    except Exception:
        # A failed feed must never show demo data — simply omit that source.
        pass

    # USGS (last 7 days, M3+ in the region)
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        payload = _http_get(
            USGS_URL,
            {
                "format": "geojson",
                "starttime": since,
                "minlatitude": REGION_BBOX["south"],
                "maxlatitude": REGION_BBOX["north"],
                "minlongitude": REGION_BBOX["west"],
                "maxlongitude": REGION_BBOX["east"],
                "minmagnitude": 3,
                "orderby": "time",
                "limit": 50,
            },
        )
        results.extend(parse_usgs(payload))
    except Exception:
        pass

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in results:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        unique.append(item)
    unique.sort(key=lambda i: i["reported_at"], reverse=True)

    with _cache_lock:
        _cache[key] = (time.time(), unique)
    return unique


def all_incidents() -> list[dict[str, Any]]:
    """Real incidents only: live web feeds + user field reports (no demos)."""
    reported = [
        i for i in get_store().incidents_all()
        if i.get("id") not in SEED_IDS
    ]
    combined = reported + live_incidents()
    # Prefer a live record when a source id appears twice.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in sorted(combined, key=lambda i: i.get("reported_at") or "", reverse=True):
        marker = item.get("id") or f"{item.get('lat')},{item.get('lng')}"
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(item)
    return unique


def active_incidents() -> list[dict[str, Any]]:
    return [i for i in all_incidents() if i.get("status") == "Active"]


def feed_status() -> dict[str, Any]:
    """Small status payload for the UI (which sources are live)."""
    items = live_incidents()
    sources = sorted({i.get("source", "Unknown") for i in items})
    return {
        "enabled": settings.LIVE_INCIDENTS_ENABLED,
        "sources": sources,
        "count": len(items),
        "cache_ttl_seconds": settings.LIVE_INCIDENTS_CACHE_TTL_SECONDS,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
