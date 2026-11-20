"""Tests for the resilient real-road route planner."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import routing_service


def _osrm_payload():
    """Two real-looking OSRM routes in GeoJSON (lng, lat) order."""
    return {
        "code": "Ok",
        "routes": [
            {
                "distance": 280_600,
                "duration": 14_430,
                "geometry": {
                    "coordinates": [
                        [91.7362, 26.1445],
                        [91.90, 26.50],
                        [92.20, 26.90],
                        [92.60, 27.20],
                    ]
                },
                "legs": [
                    {
                        "steps": [
                            {
                                "name": "NH 27",
                                "distance": 12000,
                                "duration": 600,
                                "maneuver": {"type": "turn", "modifier": "left"},
                            }
                        ]
                    }
                ],
            },
            {
                "distance": 305_200,
                "duration": 15_600,
                "geometry": {
                    "coordinates": [
                        [91.7362, 26.1445],
                        [92.00, 26.30],
                        [92.60, 27.20],
                    ]
                },
                "legs": [],
            },
        ],
    }


@pytest.fixture(autouse=True)
def _clear_cache():
    routing_service.clear_cache()
    yield
    routing_service.clear_cache()


def test_plan_uses_osrm_and_returns_drawable_routes(store, monkeypatch):
    calls = {"count": 0}

    def fake_get(url, params):
        calls["count"] += 1
        assert "geojson" in params["geometries"]
        return _osrm_payload()

    monkeypatch.setattr(routing_service, "_provider_get", fake_get)

    result = routing_service.plan_route(
        "Guwahati", "Tawang", mode="safest",
        origin_lat=26.1445, origin_lng=91.7362,
        destination_lat=27.20, destination_lng=92.60,
    )

    assert result["error"] is None
    assert result["live"] is True
    assert result["source"] in routing_service.PROVIDERS
    assert len(result["routes"]) == 2
    assert result["recommended"] is not None
    for route in result["routes"]:
        assert len(route["coordinates"]) >= 2
        assert all(len(p) == 2 for p in route["coordinates"])
        assert route["distance_km"] > 0
        assert route["eta_display"]
        assert 0 <= route["risk_score"] <= 100
    assert result["routes"][0]["steps"]
    assert calls["count"] == 1  # one provider succeeded; no backup called


def test_cache_avoids_repeated_provider_calls(store, monkeypatch):
    calls = {"count": 0}

    def fake_get(url, params):
        calls["count"] += 1
        return _osrm_payload()

    monkeypatch.setattr(routing_service, "_provider_get", fake_get)
    kwargs = dict(
        origin_label="Guwahati", destination_label="Tawang",
        origin_lat=26.1445, origin_lng=91.7362,
        destination_lat=27.20, destination_lng=92.60,
    )
    routing_service.plan_route(**kwargs)
    routing_service.plan_route(**kwargs)
    assert calls["count"] == 1


def test_modes_change_the_recommendation(store, monkeypatch):
    monkeypatch.setattr(routing_service, "_provider_get", lambda url, params: _osrm_payload())
    kwargs = dict(
        origin_label="Guwahati", destination_label="Tawang",
        origin_lat=26.1445, origin_lng=91.7362,
        destination_lat=27.20, destination_lng=92.60,
    )
    fastest = routing_service.plan_route(mode="fastest", **kwargs)
    shortest = routing_service.plan_route(mode="shortest", **kwargs)

    assert fastest["recommended"]["distance_km"] == 280.6
    assert shortest["recommended"]["distance_km"] == 280.6
    assert fastest["mode_label"] == "Fastest"
    assert shortest["mode_label"] == "Shortest"


def test_falls_back_to_offline_graph_when_providers_fail(store, monkeypatch):
    def fake_get(url, params):
        raise ConnectionError("offline")

    monkeypatch.setattr(routing_service, "_provider_get", fake_get)
    result = routing_service.plan_route(
        "Guwahati", "Tawang",
        origin_lat=26.1445, origin_lng=91.7362,
        destination_lat=27.20, destination_lng=92.60,
    )
    assert result["source"] == "offline-graph"
    assert result["live"] is False
    assert len(result["routes"]) >= 1
    assert all(len(r["coordinates"]) >= 2 for r in result["routes"])


def test_always_returns_a_route_even_if_everything_fails(store, monkeypatch):
    monkeypatch.setattr(routing_service, "_provider_get", lambda url, params: (_ for _ in ()).throw(TimeoutError("nope")))
    monkeypatch.setattr(routing_service, "_offline_routes", lambda *args, **kwargs: ([], ["graph down"]))
    result = routing_service.plan_route(
        "Nowhere", "Somewhere",
        origin_lat=26.0, origin_lng=91.0,
        destination_lat=27.0, destination_lng=92.0,
    )
    assert result["source"] == "direct-line"
    assert result["live"] is False
    assert len(result["routes"]) == 1
    assert result["routes"][0]["coordinates"] == [[26.0, 91.0], [27.0, 92.0]]
    assert any("straight-line" in w for w in result["warnings"])


def test_api_endpoint_always_succeeds(store, monkeypatch):
    monkeypatch.setattr(routing_service, "_provider_get", lambda url, params: _osrm_payload())
    client = TestClient(app)
    response = client.post(
        "/api/routes/plan",
        json={
            "origin": "Guwahati", "destination": "Tawang", "mode": "safest",
            "origin_lat": 26.1445, "origin_lng": 91.7362,
            "destination_lat": 27.20, "destination_lng": 92.60,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["routes"]
    assert body["recommended"]["label"] == "Route A"
