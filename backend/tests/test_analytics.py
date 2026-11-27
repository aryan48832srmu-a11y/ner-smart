"""Analytics tests: mixed naive/aware incident timestamps must not crash."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.services import aggregator, live_incident_service


def _mixed_incidents() -> list[dict]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "field-1",
            "type": "Landslide",
            "state": "Assam",
            "reported_at": now.replace(tzinfo=None).isoformat(),  # SQLite: naive
            "status": "Resolved",
        },
        {
            "id": "usgs-1",
            "type": "Earthquake",
            "state": "Arunachal Pradesh",
            "reported_at": (now - timedelta(days=3)).isoformat(),  # feed: aware
            "status": "Active",
        },
        {
            "id": "gdacs-1",
            "type": "Flood",
            "state": "Assam",
            "reported_at": (now - timedelta(days=30)).isoformat(),
            "status": "Active",
        },
    ]


def test_analytics_normalises_naive_and_aware_timestamps(store, monkeypatch):
    incidents = _mixed_incidents()
    monkeypatch.setattr(live_incident_service, "all_incidents", lambda: incidents)
    monkeypatch.setattr(live_incident_service, "active_incidents", lambda: [incidents[1]])

    result = aggregator.analytics()

    trend = result["disruptions_over_time"]
    assert len(trend) == 8
    assert sum(point["value"] for point in trend) == 3
    assert all(isinstance(point["value"], int) for point in trend)
    assert result["active_incidents"] == 1


def test_analytics_endpoint_returns_200_with_live_timestamps(store, monkeypatch):
    incidents = _mixed_incidents()
    monkeypatch.setattr(live_incident_service, "all_incidents", lambda: incidents)
    monkeypatch.setattr(live_incident_service, "active_incidents", lambda: incidents)

    response = TestClient(app).get("/api/analytics")

    assert response.status_code == 200
    assert len(response.json()["disruptions_over_time"]) == 8


def test_analytics_tolerates_future_and_invalid_timestamps(store, monkeypatch):
    now = datetime.now(timezone.utc)
    incidents = [
        {
            "id": "future",
            "type": "Flood",
            "reported_at": (now + timedelta(days=2)).isoformat(),
        },
        {"id": "bad", "type": "Flood", "reported_at": "not-a-date"},
        {"id": "missing", "type": "Flood"},
    ]
    monkeypatch.setattr(live_incident_service, "all_incidents", lambda: incidents)
    monkeypatch.setattr(live_incident_service, "active_incidents", lambda: [])

    result = aggregator.analytics()

    trend = result["disruptions_over_time"]
    assert trend[-1]["value"] == 1  # future event clamped into "This week"
    assert sum(point["value"] for point in trend) == 1
