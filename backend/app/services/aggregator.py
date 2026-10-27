"""Aggregation services for dashboard, alerts, logistics and analytics."""

from __future__ import annotations

from typing import Any

from app.data.demo_data import CITIES, STATES
from app.services.store import get_store
from app.services.weather_service import get_weather, get_weather_alert_count

SEVERITY_ORDER = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}


def dashboard() -> dict[str, Any]:
    store = get_store()
    roads = store.roads()
    vehicles = store.vehicles()
    requests = store.supply_requests()
    active = store.active_incidents()

    blocked = [r for r in roads if r["status"] == "blocked"]
    high_risk = [r for r in roads if r["disruption_probability"] >= 60]
    avg_access = sum(r["accessibility"] for r in roads) // max(len(roads), 1)

    return {
        "active_disruptions": len(active),
        "blocked_roads": len(blocked),
        "high_risk_routes": len(high_risk),
        "critical_deliveries": sum(1 for v in vehicles if v["status"] == "en_route"),
        "average_accessibility": avg_access,
        "weather_alerts": get_weather_alert_count(),
        "overall_risk": _overall_risk(roads),
        "region": "North Eastern Region",
        "updated": "Just now",
    }


def _overall_risk(roads: list[dict]) -> str:
    avg = sum(r["disruption_probability"] for r in roads) / max(len(roads), 1)
    if avg >= 61:
        return "HIGH"
    if avg >= 31:
        return "MEDIUM"
    return "LOW"


def roads() -> list[dict]:
    return get_store().roads()


def road_detail(road_id: str) -> dict | None:
    return get_store().road_by_id(road_id)


def alerts() -> list[dict[str, Any]]:
    store = get_store()
    roads = store.roads()
    active = store.active_incidents()
    requests = store.supply_requests()
    out = []

    # Weather alerts
    for w in get_weather():
        if w.get("alert"):
            out.append({
                "id": f"alt-w-{w['location']}",
                "category": "Weather",
                "severity": "High",
                "location": w["location"],
                "state": w["state"],
                "time": w.get("updated", "Recently"),
                "title": f"{w['alert']} — {w['location']}",
                "description": f"{int(w['rainfall_mm'])} mm rainfall detected around {w['location']}.",
                "affected_routes": [],
                "affected_routes_count": 0,
                "predicted_disruption": 70,
                "recommendation": "Redirect non-essential traffic and monitor the corridor.",
            })

    # Road/flood/landslide/bridge alerts from incidents + affected roads
    for inc in active:
        cat = inc["type"]
        route_hits = _routes_for_incident(inc, roads)
        severity = "Critical" if inc["severity"] == "Critical" else inc["severity"]
        out.append({
            "id": f"alt-i-{inc['id']}",
            "category": cat,
            "severity": severity,
            "location": inc["location_name"],
            "state": inc["state"],
            "time": f"{inc['reported_minutes_ago']} min ago",
            "title": f"{cat} — {inc['location_name']}",
            "description": inc["description"],
            "affected_routes": route_hits,
            "affected_routes_count": len(route_hits),
            "predicted_disruption": inc.get("ai_risk", 60),
            "recommendation": _recommendation_for(inc["type"], inc["severity"]),
        })

    # Sort by severity
    out.sort(key=lambda a: SEVERITY_ORDER.get(a["severity"], 0), reverse=True)

    # Default logistics alert
    critical_log = [r for r in requests if r["priority"] == "CRITICAL"]
    if critical_log:
        out.insert(0, {
            "id": "alt-log-001",
            "category": "Logistics",
            "severity": "Critical",
            "location": critical_log[0]["destination"],
            "state": critical_log[0]["state"],
            "time": "10 min ago",
            "title": f"Critical supply request — {critical_log[0]['destination']}",
            "description": f"{critical_log[0]['cargo']} requested with CRITICAL priority.",
            "affected_routes": [],
            "affected_routes_count": 0,
            "predicted_disruption": 78,
            "recommendation": "Prioritise dispatch and secure a reliable route.",
        })

    return out


def _routes_for_incident(inc: dict, roads: list[dict]) -> list[str]:
    hits = []
    for r in roads:
        if inc.get("road") and inc["road"].lower() in r["name"].lower():
            hits.append(r["name"])
        elif any(a.lower() in inc["location_name"].lower() for a in r.get("anchors", [])):
            hits.append(r["name"])
    return list(dict.fromkeys(hits))


def _recommendation_for(inc_type: str, severity: str) -> str:
    if inc_type == "Landslide":
        return "Restrict heavy vehicles and inspect ground stability immediately."
    if inc_type == "Flood":
        return "Divert traffic from low-lying section; monitor river level."
    if inc_type == "Bridge Damage":
        return "Enforce load limit; arrange alternate crossing."
    if inc_type == "Road Damage":
        return "Carry out emergency repair; partial lane closure."
    if inc_type == "Accident":
        return "Clear site and restore partial movement."
    if inc_type == "Heavy Snow":
        return "Deploy snow clearance; advise chains for vehicles."
    return "Inspect and update status."


def logistics() -> dict[str, Any]:
    store = get_store()
    vehicles = store.vehicles()
    requests = store.supply_requests()
    warehouses = store.warehouses()

    active_deliveries = [v for v in vehicles if v["status"] == "en_route"]
    critical_dest = []
    for req in requests:
        if req["priority"] in ("CRITICAL", "HIGH"):
            critical_dest.append({
                "destination": req["destination"],
                "cargo": req["cargo"],
                "priority": req["priority"],
                "det": req,
            })

    return {
        "warehouses": warehouses,
        "vehicles": vehicles,
        "requests": requests,
        "deliveries_active": len(active_deliveries),
        "critical_destinations": critical_dest,
        "hospitals": store.hospitals(),
        "readiness_pct": _readiness(warehouses),
    }


def _readiness(warehouses: list[dict]) -> int:
    avg = sum(w["capacity_pct"] for w in warehouses) // max(len(warehouses), 1)
    return max(5, avg)


def analytics() -> dict[str, Any]:
    store = get_store()
    active = store.active_incidents()
    roads = store.roads()
    requests = store.supply_requests()

    # Disruption trend derived from persisted incident history.
    disruptions = _disruptions_over_time(store.incidents_all())

    # Delivery success rate per month, derived from resolved vs total incidents.
    delivery = _delivery_success(store.incidents_all())

    travel_time = [
        {"label": "Guwahati", "value": 6.8},
        {"label": "Shillong", "value": 5.2},
        {"label": "Aizawl", "value": 8.4},
        {"label": "Imphal", "value": 7.1},
        {"label": "Gangtok", "value": 9.2},
        {"label": "Kohima", "value": 6.5},
    ]

    # Weather risk by state derived from live/simulated weather readings.
    weather_risk = _weather_risk_by_state()

    # Risk distribution from roads
    buckets = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for r in roads:
        if r["disruption_probability"] <= 30:
            buckets["Low"] += 1
        elif r["disruption_probability"] <= 60:
            buckets["Medium"] += 1
        elif r["disruption_probability"] <= 80:
            buckets["High"] += 1
        else:
            buckets["Critical"] += 1
    risk_dist = [{"name": k, "value": v} for k, v in buckets.items()]

    # Incident types
    type_counts: dict[str, int] = {}
    for inc in store.incidents_all():
        type_counts[inc["type"]] = type_counts.get(inc["type"], 0) + 1
    incident_types = [
        {"name": k, "value": v}
        for k, v in sorted(type_counts.items(), key=lambda kv: -kv[1])
    ]

    critical = [
        {
            "destination": r["destination"],
            "cargo": r["cargo"],
            "priority": r["priority"],
            "eta": r["eta_days"],
        }
        for r in requests
    ]

    return {
        "disruptions_over_time": disruptions,
        "state_accessibility": _state_accessibility(roads, active, requests),
        "weather_risk_by_state": weather_risk,
        "delivery_success_rate": delivery,
        "average_travel_time": travel_time,
        "risk_distribution": risk_dist,
        "incident_types": incident_types,
        "critical_supply_requests": critical,
        "active_incidents": len(active),
    }


def _state_accessibility(
    roads: list[dict], active_incidents: list[dict], requests: list[dict]
) -> list[dict[str, Any]]:
    out = []
    for state in STATES:
        state_roads = [r for r in roads if r["state"] == state]
        state_incidents = [i for i in active_incidents if i["state"] == state]
        avg_access = (
            round(sum(r["accessibility"] for r in state_roads) / len(state_roads))
            if state_roads
            else 50
        )
        avg_disruption = (
            sum(r["disruption_probability"] for r in state_roads) / len(state_roads)
            if state_roads
            else 40
        )
        high_risk = len([r for r in state_roads if r["disruption_probability"] >= 60])
        deliveries = len([r for r in requests if r["state"] == state])
        out.append({
            "state": state,
            "accessibility": avg_access,
            "incidents": len(state_incidents),
            "high_risk_routes": high_risk,
            "deliveries": deliveries,
            "risk": _risk_from_disruption(avg_disruption),
        })
    return out


def _risk_from_disruption(avg: float) -> str:
    if avg >= 61:
        return "High"
    if avg >= 31:
        return "Medium"
    return "Low"


def _disruptions_over_time(incidents: list[dict]) -> list[dict[str, Any]]:
    """Bucket persisted incidents into the last 8 weeks (oldest first)."""
    from datetime import datetime

    from app.db import utcnow

    now = utcnow()
    buckets = [0] * 8
    for inc in incidents:
        raw = inc.get("reported_at")
        if not raw:
            continue
        try:
            when = datetime.fromisoformat(raw)
        except ValueError:
            continue
        weeks_ago = int((now - when).total_seconds() // (7 * 24 * 3600))
        idx = 7 - min(weeks_ago, 7)
        buckets[idx] += 1
    labels = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "This week"]
    return [{"label": labels[i], "value": buckets[i]} for i in range(8)]


def _delivery_success(incidents: list[dict]) -> list[dict[str, Any]]:
    """Share of incidents that are no longer Active, per month label."""
    from datetime import datetime

    from app.db import utcnow

    now = utcnow()
    labels = []
    totals = [0] * 6
    resolved = [0] * 6
    for m in range(5, -1, -1):
        month_index = (now.month - 1 - m) % 12
        labels.append(datetime(2000, month_index + 1, 1).strftime("%b"))
    for inc in incidents:
        raw = inc.get("reported_at")
        if not raw:
            continue
        try:
            when = datetime.fromisoformat(raw)
        except ValueError:
            continue
        months_ago = (now.year - when.year) * 12 + (now.month - when.month)
        if 0 <= months_ago <= 5:
            idx = 5 - months_ago
            totals[idx] += 1
            if inc.get("status") != "Active":
                resolved[idx] += 1
    out = []
    for i, label in enumerate(labels):
        success = round(resolved[i] / totals[i] * 100) if totals[i] else 100
        out.append({"label": label, "value": success})
    return out


def _weather_risk_by_state() -> list[dict[str, Any]]:
    readings = get_weather()
    out = []
    for state in STATES:
        state_readings = [w for w in readings if w.get("state") == state]
        if not state_readings:
            out.append({"state": state, "risk": 40})
            continue
        avg_rain = sum(w["rainfall_mm"] for w in state_readings) / len(state_readings)
        max_wind = max(w["wind_kmh"] for w in state_readings)
        risk = int(min(100, avg_rain * 2.2 + max_wind * 0.3))
        out.append({"state": state, "risk": risk})
    return out
