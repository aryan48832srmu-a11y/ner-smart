"""Prototype route optimization / scoring engine.

Computes route alternatives between NER locations and scores them using a
transparent weighted model. Structured so a real routing engine (OSRM /
GraphHopper) can be integrated later by replacing the route discovery step.

DEMO: 
  - The flagship Guwahati -> Tawang pair uses explicit corridor definitions so
    the demo reliably shows 3 plausible alternatives with different distances,
    ETA and risk (mirroring how a real road network with bypasses behaves).
  - Other pairs fall back to a generic graph traversal over road segments.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Any

from app.data.demo_data import CITIES
from app.services.store import get_store

# Base scoring weights (%). Sum = 100.
BASE_WEIGHTS = {
    "safety": 30,
    "accessibility": 25,
    "travel_time": 20,
    "weather": 15,
    "distance": 10,
}

PRIORITY_ADJUST = {
    "Emergency": {"safety": +8, "accessibility": +5, "travel_time": +4, "weather": +3, "distance": -20},
    "High": {"safety": +4, "accessibility": +2, "travel_time": +2, "weather": +1, "distance": -9},
    "Normal": {"safety": +0, "accessibility": +0, "travel_time": +0, "weather": +0, "distance": +0},
}

CARGO_ADJUST = {
    "Medicines": {"safety": +6, "accessibility": +4, "travel_time": +2, "weather": +2, "distance": -14},
    "Food": {"safety": +1, "accessibility": +1, "travel_time": +0, "weather": +0, "distance": -2},
    "Construction Material": {"safety": +1, "accessibility": +2, "travel_time": -3, "weather": -2, "distance": +2},
    "Agricultural Produce": {"safety": +0, "accessibility": +0, "travel_time": +0, "weather": +0, "distance": +1},
    "General": {"safety": +0, "accessibility": +0, "travel_time": +0, "weather": +0, "distance": +0},
}

_ROAD_STATUS_SAFETY = {
    "accessible": 88,
    "risky": 60,
    "severely_risky": 42,
    "blocked": 20,
}

# Flagship demo corridors: explicit route definitions.
# The main corridor is always listed first (base). For each pair we synthesize
# a faster/steeper "bypass" variant and a slower/gentler "alt" variant so the
# demo reliably exposes 3 real alternatives with different distance, ETA and
# risk — mirroring how a real road network with bypasses behaves.
DEMO_CORRIDORS: dict[tuple[str, str], list[list[str]]] = {
    # Meds shipment: Guwahati -> Tawang (NH-10 corridor).
    # Route A is the safe main corridor; B is the shorter but riskier bypass;
    # C is the longer, gentler alternate (matches the README demo script).
    ("guwahati", "tawang"): [
        ["r-001"],             # Route A - main NH-10 corridor (380 km)
        ["r-001_bypass"],      # Route B - shorter, steeper bypass (riskier)
        ["r-001_alt"],         # Route C - longer, gentler alternate
    ],
    # Ambulance meds: Guwahati -> Gangtok (Rangpo + NH-17 corridor).
    ("guwahati", "gangtok"): [
        ["r-036", "r-006"],            # Route A - Guwahati -> Rangpo -> Gangtok
        ["r-037"],                     # Route B - direct NH-127 (longer)
        ["r-036_alt", "r-006_alt"],    # Route C - gentler alternate
    ],
    # Construction: Tezpur -> Aizawl (via Guwahati + Silchar).
    ("tezpur", "aizawl"): [
        ["r-015", "r-016", "r-017"],                       # Route A - main corridor
        ["r-015_bypass", "r-016_bypass", "r-017_bypass"],  # Route B - risky shortcut
        ["r-015_alt", "r-016_alt", "r-017_alt"],           # Route C - gentle alternate
    ],
    # Food: Dimapur -> Mokokchung (direct NH-2 vs via Kohima).
    ("dimapur", "mokokchung"): [
        ["r-020"],              # Route A - direct NH-2
        ["r-003", "r-019"],     # Route B - via Kohima (longer, safer)
        ["r-020_alt"],          # Route C - gentle alternate
    ],
    # Supply corridor: Guwahati -> Dibrugarh (NH-37).
    ("guwahati", "dibrugarh"): [
        ["r-013"],            # Route A - main NH-37 corridor
        ["r-013_bypass"],     # Route B - steeper, shorter bypass (risky)
        ["r-013_alt"],        # Route C - longer, gentler alternate
    ],
    # Corridor: Shillong -> Guwahati (NH-6 vs NH-702).
    ("shillong", "guwahati"): [
        ["r-005"],            # Route A - main NH-6 corridor
        ["r-011"],            # Route B - NH-702 bypass (safer, faster)
        ["r-005_alt"],        # Route C - longer, gentler alternate
    ],
    # Corridor: Silchar -> Imphal (NH-27 via Jiribam).
    ("silchar", "imphal"): [
        ["r-010"],            # Route A - main NH-27 corridor
        ["r-010_bypass"],     # Route B - risky shortcut
        ["r-010_alt"],        # Route C - gentle alternate
    ],
    # Corridor: Dimapur -> Imphal (NH-29 vs NH-44).
    ("dimapur", "imphal"): [
        ["r-014"],            # Route A - main NH-29 corridor
        ["r-004"],            # Route B - NH-44 (longer, safer)
        ["r-014_alt"],        # Route C - gentle alternate
    ],
}


def _fmt_hours(h: float) -> str:
    hh = int(h)
    mm = int(round((h - hh) * 60))
    if mm == 60:
        hh += 1
        mm = 0
    return f"{hh}h {mm:02d}m"


# Average winding factor & speed used to estimate the off-network approach leg
# between an arbitrary map point and the nearest known road-network city.
APPROACH_ROAD_FACTOR = 1.28
APPROACH_SPEED_KMH = 32.0
APPROACH_FREE_KM = 4.0
COVERAGE_WARNING_KM = 150.0


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Great-circle distance between two coordinates, in kilometres."""
    radius = 6371.0
    d_lat = math.radians(b_lat - a_lat)
    d_lng = math.radians(b_lng - a_lng)
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def nearest_city(lat: float, lng: float) -> tuple[str, float]:
    """Return the closest known city name and its distance in km."""
    best_name = ""
    best_km = float("inf")
    for name, city in CITIES.items():
        km = haversine_km(lat, lng, city["lat"], city["lng"])
        if km < best_km:
            best_name, best_km = name, km
    return best_name, best_km


def _resolve_endpoint(
    name: str, lat: float | None, lng: float | None
) -> tuple[str, str, float]:
    """Resolve a free-text/coordinate endpoint to a road-network node.

    Returns ``(node, label, snap_km)`` where ``node`` is the city used by the
    graph engine and ``snap_km`` is how far the requested point is from it.
    """
    label = (name or "").strip()
    if lat is None or lng is None:
        return label, label or "Unknown", 0.0

    city_name, snap_km = nearest_city(lat, lng)
    if not label:
        label = city_name
    return city_name, label, snap_km


def _approach_road(label: str, node: str, km: float, *, inbound: bool) -> dict[str, Any]:
    """Synthetic road segment connecting an arbitrary point to the network."""
    distance = max(0.5, km * APPROACH_ROAD_FACTOR)
    name = (
        f"Approach: {label} → {node}" if inbound else f"Departure: {node} → {label}"
    )
    return {
        "id": f"approach-{abs(hash((label, node, inbound))) % 100000:05d}",
        "name": name,
        "from_": label if inbound else node,
        "to": node if inbound else label,
        "length_km": round(distance, 1),
        "estimated_hours": distance / APPROACH_SPEED_KMH,
        "status": "accessible",
        "accessibility": 90,
        "weather_risk": "Low",
        "landslide_risk": 18,
        "disruption_probability": 15,
        "_variant": "base",
        "_approach": True,
    }


def _risk_to_100(label: str) -> int:
    return {"Low": 10, "Medium": 45, "High": 70, "Critical": 90}.get(label, 40)


def _resolve_segments(route_ids: list[str], roads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Resolve a list of road ids / synthetic corridor ids into road segment dicts.
    Synthetic ids like "r-001_fast" create a variant clone of the base road.
    """
    by_id = {r["id"]: r for r in roads}
    out = []
    for rid in route_ids:
        base = rid.split("_")[0]
        road = by_id.get(base)
        if not road:
            continue
        variant = dict(road)
        if "_bypass" in rid or "_fast" in rid:
            variant["_variant"] = "bypass"
        elif "_alt" in rid or "_slow" in rid:
            variant["_variant"] = "alt"
        else:
            variant["_variant"] = "base"
        out.append(variant)
    return out


def _road_score(road: dict[str, Any]) -> dict[str, Any]:
    v = road.get("_variant", "base")
    safety = _ROAD_STATUS_SAFETY.get(road["status"], 60)
    accessibility = road["accessibility"]
    disruption = road["disruption_probability"]
    landslide = road["landslide_risk"]

    # Apply variant modifiers for the synthesized bypass/alternate corridors.
    if v == "bypass":
        # Steep shortcut: ~8% shorter but elevated landslide/flood risk.
        safety = int(safety * 0.62)
        accessibility = int(accessibility * 0.66)
        disruption = min(95, int(disruption * 1.08) + 6)
        landslide = min(98, landslide + 30)
    elif v == "alt":
        # Gentler alternate: ~8% longer but lower risk.
        safety = int(safety * 0.9)
        accessibility = int(accessibility * 0.88)
        disruption = max(5, int(disruption * 0.75))
        landslide = max(0, landslide - 15)

    return {
        "safety": safety,
        "accessibility": accessibility,
        "weather": 100 - _risk_to_100(road["weather_risk"]),
        "disruption": disruption,
        "landslide": landslide,
        "incident": disruption,
        "condition": accessibility,
        "_variant": v,
        "_len_km": road["length_km"],
        "_hours": road["estimated_hours"],
    }


def _variant_factors(variant: str) -> tuple[float, float]:
    """Length/hour multipliers applied to synthesized corridor variants."""
    if variant == "bypass":
        return 0.92, 0.88  # steep shortcut: slightly shorter, a bit faster
    if variant == "alt":
        return 1.08, 1.06  # gentler alternate: longer, a little slower
    return 1.0, 1.0


def _corridor_length(segments: list[dict]) -> tuple[float, float]:
    total = 0.0
    hours = 0.0
    for s in segments:
        len_factor, hour_factor = _variant_factors(s.get("_variant", "base"))
        total += s["length_km"] * len_factor
        hours += s["estimated_hours"] * hour_factor
    return total, hours


def build_route_variant(
    label: str,
    road_segments: list[dict[str, Any]],
    weights: dict[str, float],
    recommended: bool,
    is_shortest: bool,
) -> dict[str, Any] | None:
    if not road_segments:
        return None

    total_dist, total_hours = _corridor_length(road_segments)
    if total_dist <= 0:
        return None

    scores = [_road_score(r) for r in road_segments]
    seg_lengths = [
        max(0.1, r["length_km"] * _variant_factors(s["_variant"])[0])
        for r, s in zip(road_segments, scores)
    ]
    total_segment_km = sum(seg_lengths) or 1.0

    def weighted_mean(key: str) -> float:
        """Distance-weighted mean, so short connectors can't mask long corridors."""
        return sum(s[key] * km for s, km in zip(scores, seg_lengths)) / total_segment_km

    safety = int(round(weighted_mean("safety")))
    accessibility = int(round(weighted_mean("accessibility")))
    weather_score = int(round(weighted_mean("weather")))
    weather_risk_label = _score_to_weather(weather_score)
    flood = int(round(_flood_risk(scores, seg_lengths)))
    landslide = int(round(weighted_mean("landslide")))
    disruption = int(round(weighted_mean("disruption")))
    road_condition = int(round(weighted_mean("condition")))
    incident_risk = disruption

    time_score = _normalize(total_hours, 12)
    dist_score = _normalize_distance(total_dist, 100, 550)

    weight_total = sum(weights.values()) or 1.0
    overall = (
        weights["safety"] * safety
        + weights["accessibility"] * accessibility
        + weights["travel_time"] * time_score
        + weights["weather"] * weather_score
        + weights["distance"] * dist_score
    ) / weight_total

    segments = []
    for road, score, length in zip(road_segments, scores, seg_lengths):
        _, hour_factor = _variant_factors(score["_variant"])
        segments.append(
            {
                "road_id": road["id"],
                "road_name": road["name"],
                "from_": road["from_"],
                "to": road["to"],
                "distance_km": round(length, 1),
                "hours": round(road["estimated_hours"] * hour_factor, 2),
                "safety": score["safety"],
            }
        )

    return {
        "id": label.lower().replace(" ", "-"),
        "name": label,
        "label": label,
        "distance_km": round(total_dist),
        "eta_hours": round(total_hours, 2),
        "eta_display": _fmt_hours(total_hours),
        "accessibility": accessibility,
        "safety": safety,
        "weather_risk": weather_risk_label,
        "flood_risk": flood,
        "landslide_risk": landslide,
        "incident_risk": incident_risk,
        "road_condition": road_condition,
        "disruption_probability": disruption,
        "overall_score": round(min(100.0, max(0.0, overall)), 1),
        "segments": segments,
        "recommended": recommended,
        "is_shortest": is_shortest,
        "reason": None,
    }


def _score_to_weather(weather_score: int) -> str:
    if weather_score >= 80:
        return "Low"
    if weather_score >= 60:
        return "Medium"
    if weather_score >= 45:
        return "High"
    return "Critical"


def _normalize(hour: float, max_hour: float = 12) -> float:
    x = (max_hour - hour) / (max_hour - 1)
    return max(0.0, min(100.0, x * 100))


def _normalize_distance(d: float, min_d: float, max_d: float) -> float:
    x = (max_d - d) / (max_d - min_d)
    return max(0.0, min(100.0, x * 100))


def _flood_risk(scores: list[dict], lengths: list[float] | None = None) -> float:
    if not scores:
        return 50.0
    weights = lengths or [1.0] * len(scores)
    total_weight = sum(weights) or 1.0
    weather_avg = sum(s.get("weather", 50) * w for s, w in zip(scores, weights)) / total_weight
    return min(100.0, 100.0 - weather_avg)


def _generic_discover(
    origin: str, destination: str, roads: list[dict[str, Any]], k: int = 3
) -> list[list[dict[str, Any]]]:
    """Find up to `k` distinct simple paths between origin and destination using
    a bounded BFS (returns several plausible corridors so real network
    alternatives are surfaced)."""

    def starts(loc: str) -> str:
        return next((k for k in CITIES if k.lower() == loc.lower()), loc)

    start = starts(origin)
    target = starts(destination)
    if start.lower() == target.lower():
        return []

    adjacent: dict[str, list[dict]] = {}
    for r in roads:
        adjacent.setdefault(r["from_"], []).append(r)
        adjacent.setdefault(r["to"], []).append(r)

    paths: list[list[dict]] = []
    queue: deque = deque()
    queue.append((start, []))
    seen_sofar: dict[str, int] = {}

    while queue:
        node, path = queue.popleft()
        # Bound the search to keep the response responsive on the connected graph.
        if len(path) > 7:
            continue
        if len(paths) >= 40:
            break
        if node in seen_sofar and seen_sofar[node] < len(path):
            continue
        seen_sofar[node] = len(path)
        if node.lower() == target.lower():
            paths.append(path)
            continue
        for r in adjacent.get(node, []):
            nxt = r["to"] if r["from_"] == node else r["from_"]
            # Avoid trivial loops within a single path.
            if any(p is r for p in path):
                continue
            queue.append((nxt, path + [r]))

    unique: dict[tuple, list] = {}
    for p in paths:
        key = tuple(x["id"] for x in p)
        if key not in unique:
            unique[key] = p
    all_paths = sorted(unique.values(), key=lambda p: sum(x["length_km"] for x in p))
    return all_paths[:k]


def _clone_variant(path: list[dict], variant: str) -> list[dict]:
    out = []
    for road in path:
        clone = dict(road)
        clone["_variant"] = variant
        out.append(clone)
    return out


def _expand_generic_variants(found_paths: list[list[dict]], k: int = 3) -> list[list[dict]]:
    """Build up to `k` comparable alternatives from BFS-discovered paths.

    Real distinct corridors are kept first; if the network yields fewer than
    `k` paths, synthesize base/alt variants of the shortest one so every pair
    still shows a meaningful comparison.
    """
    if not found_paths:
        return []

    variants: list[list[dict]] = []
    seen: set[tuple[str, ...]] = set()

    for path in found_paths:
        key = tuple(road["id"] for road in path)
        if key in seen:
            continue
        seen.add(key)
        variants.append(_clone_variant(path, "base"))
        if len(variants) >= k:
            return variants

    shortest = sorted(found_paths, key=lambda p: sum(x["length_km"] for x in p))[0]
    for variant in ("alt", "bypass"):
        if len(variants) >= k:
            break
        variants.append(_clone_variant(shortest, variant))

    return variants[:k]


def optimize(
    origin: str,
    destination: str,
    cargo_type: str,
    priority: str,
    origin_lat: float | None = None,
    origin_lng: float | None = None,
    destination_lat: float | None = None,
    destination_lng: float | None = None,
) -> dict[str, Any]:
    origin_node, origin_label, origin_snap = _resolve_endpoint(origin, origin_lat, origin_lng)
    destination_node, destination_label, destination_snap = _resolve_endpoint(
        destination, destination_lat, destination_lng
    )

    weights = dict(BASE_WEIGHTS)
    for key, delta in PRIORITY_ADJUST.get(priority, {}).items():
        weights[key] += delta
    for key, delta in CARGO_ADJUST.get(cargo_type, {}).items():
        weights[key] += delta
    weights = {k: max(v, 0) for k, v in weights.items()}
    # Normalize to 100% so the weights the UI shows are real percentages and
    # the overall score stays on a 0-100 scale.
    weight_total = sum(weights.values()) or 1.0
    weights = {k: round(v * 100.0 / weight_total, 1) for k, v in weights.items()}

    key = (origin_node.lower(), destination_node.lower())
    labels = ["Route A", "Route B", "Route C"]

    roads = get_store().roads()

    if key in DEMO_CORRIDORS:
        base_paths = [_resolve_segments(ids, roads) for ids in DEMO_CORRIDORS[key]]
    else:
        generic = _generic_discover(origin_node, destination_node, roads)
        if generic:
            # Always surface 3 alternatives by synthesizing base/bypass/alt
            # variants from the discovered path(s), so any pair in the network
            # yields a comparable set of routes.
            base_paths = _expand_generic_variants(generic)
        else:
            base_paths = generic

    # Off-network endpoints: attach a clearly-labelled approach/departure leg
    # between the requested point and the nearest road-network city.
    origin_leg = (
        _approach_road(origin_label, origin_node, origin_snap, inbound=True)
        if origin_snap > APPROACH_FREE_KM
        else None
    )
    destination_leg = (
        _approach_road(destination_label, destination_node, destination_snap, inbound=False)
        if destination_snap > APPROACH_FREE_KM
        else None
    )

    raw_paths: list[list[dict[str, Any]]] = []
    for path in base_paths:
        combined = ([origin_leg] if origin_leg else []) + list(path) + ([destination_leg] if destination_leg else [])
        if combined:
            raw_paths.append(combined)

    # Two arbitrary points that snap to the same road node form a local trip
    # made up of just the approach/departure legs.
    if not raw_paths and (origin_leg or destination_leg):
        local = [leg for leg in (origin_leg, destination_leg) if leg]
        if local:
            raw_paths = [local]

    warnings: list[str] = []
    if origin_snap > COVERAGE_WARNING_KM:
        warnings.append(
            f"Origin is {round(origin_snap)} km from the nearest supported road node ({origin_node}); "
            "its approach leg is an estimate outside the NER network."
        )
    if destination_snap > COVERAGE_WARNING_KM:
        warnings.append(
            f"Destination is {round(destination_snap)} km from the nearest supported road node ({destination_node}); "
            "its approach leg is an estimate outside the NER network."
        )

    endpoints = {
        "origin": {
            "label": origin_label,
            "node": origin_node,
            "lat": origin_lat,
            "lng": origin_lng,
            "snap_km": round(origin_snap, 1),
        },
        "destination": {
            "label": destination_label,
            "node": destination_node,
            "lat": destination_lat,
            "lng": destination_lng,
            "snap_km": round(destination_snap, 1),
        },
        "warning": " ".join(warnings) or None,
    }

    if not raw_paths:
        return {
            "routes": [],
            "recommended": None,
            "explanation": "",
            "weights": weights,
            "weights_label": "",
            "cargo_type": cargo_type,
            "priority": priority,
            "endpoints": endpoints,
            "error": f"No route found between {origin_label} and {destination_label} in the road network.",
        }

    is_shortest_idx = 0
    best_km = None
    for i, path in enumerate(raw_paths):
        d, _ = _corridor_length(path)
        if best_km is None or d < best_km:
            best_km = d
            is_shortest_idx = i

    variants = []
    for i, path in enumerate(raw_paths[:3]):
        v = build_route_variant(labels[i] if i < len(labels) else f"Route {chr(65+i)}", path, weights, False, i == is_shortest_idx)
        if v:
            variants.append(v)

    if not variants:
        return {"routes": [], "recommended": None, "explanation": "", "weights": weights, "weights_label": "", "cargo_type": cargo_type, "priority": priority, "endpoints": endpoints, "error": "No routable segments."}

    best = max(variants, key=lambda v: v["overall_score"])
    best["recommended"] = True
    shortest = min(variants, key=lambda v: v["distance_km"])

    if best["label"] != shortest["label"]:
        explanation = (
            f"{best['label']} is recommended. Although {shortest['label']} is shorter "
            f"({shortest['distance_km']} km), {best['label']} has significantly better "
            f"accessibility ({best['accessibility']}%) and lower disruption probability "
            f"({best['disruption_probability']}%), making it far more reliable for "
            f"{cargo_type.lower()} with {priority.lower()} priority."
        )
    else:
        explanation = (
            f"{best['label']} is recommended — the shortest option with "
            f"{best['accessibility']}% accessibility and {best['safety']}% safety score."
        )
    best["reason"] = explanation

    weight_names = {
        "safety": "Safety",
        "accessibility": "Accessibility",
        "travel_time": "Travel Time",
        "weather": "Weather",
        "distance": "Distance",
    }
    weight_parts = [
        f"{weights[key]:.0f}% {weight_names[key]}"
        for key in weight_names
        if weights.get(key, 0) > 0
    ]
    weight_label = (
        "Overall Score = "
        + " + ".join(weight_parts)
        + f" (adjusted for {cargo_type} / {priority} priority)."
    )

    return {
        "routes": variants,
        "recommended": best,
        "explanation": explanation,
        "weights": weights,
        "weights_label": weight_label,
        "cargo_type": cargo_type,
        "priority": priority,
        "endpoints": endpoints,
        "error": None,
    }
