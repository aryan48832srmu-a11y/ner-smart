"""12-hour disruption forecast service.

Combines live/simulated weather data + road profile + ML risk model to produce
a forecast for a given road segment. Clearly labelled as an AI estimate.
"""

from __future__ import annotations

from typing import Any

from app.ml.risk_model import get_predictor
from app.services.weather_service import weather_for_city


def forecast_road(road: dict[str, Any]) -> dict[str, Any]:
    """Produce a 12-hour disruption forecast for a road."""
    weather = weather_for_city(road.get("to", "")) or weather_for_city(
        road.get("from_", "")
    )

    if weather:
        rainfall = float(weather.get("rainfall_mm", 0.0))
        temperature = float(weather.get("temperature_c", 24.0))
        humidity = float(weather.get("humidity_pct", 85.0))
    else:
        rainfall = _road_rainfall(road)
        temperature = 24.0
        humidity = 85.0

    slope = _road_slope(road)
    hist = _road_history(road)

    features = {
        "rainfall": rainfall,
        "temperature": temperature,
        "humidity": humidity,
        "road_condition": max(1, 5 - (road.get("disruption_probability", 30) // 25)),
        "road_slope": slope,
        "elevation": _road_elevation(road),
        "distance_from_river": _road_river_dist(road),
        "historical_incidents": hist,
        "current_incidents": road.get("disruption_probability", 30) // 15,
        "traffic_level": 3,
        "weather_alert": 1 if road.get("weather_risk") in ("High", "Critical") else 0,
        "previous_disruptions": road.get("disruption_probability", 30) // 7,
    }

    predictor = get_predictor()
    pred = predictor.predict(features)

    current_level = _level_from_prob(road.get("disruption_probability", 30))
    factors = predictor.explain(features, pred)

    return {
        "road_id": road["id"],
        "road_name": road["name"],
        "current_level": current_level,
        "next_12h_level": pred["risk_level"],
        "probability": pred["risk_probability"],
        "factors": factors,
        "weather_source": weather.get("source") if weather else "estimated",
        "disclaimer": "AI-generated estimate — not a certified forecast.",
    }


def _road_rainfall(road: dict) -> float:
    return 8 + road["disruption_probability"] * 0.45


def _road_slope(road: dict) -> int:
    if road.get("name") in ("NH-10", "PAS-234", "NH-17"):
        return 5
    return 2 + (road.get("landslide_risk", 30) // 25)


def _road_history(road: dict) -> int:
    return max(1, road.get("disruption_probability", 30) // 8)


def _road_elevation(road: dict) -> int:
    if road.get("name") == "NH-10":
        return 1800
    if road.get("state") == "Arunachal Pradesh":
        return 1400
    return 800


def _road_river_dist(road: dict) -> int:
    return 100 if road.get("disruption_probability", 30) >= 60 else 700


def _level_from_prob(prob: int) -> str:
    if prob <= 30:
        return "LOW"
    if prob <= 60:
        return "MEDIUM"
    if prob <= 80:
        return "HIGH"
    return "CRITICAL"
