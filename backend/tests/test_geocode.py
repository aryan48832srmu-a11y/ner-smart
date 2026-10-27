"""Reverse-geocoding proxy tests (mapping, caching and failure fallback)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import geocode_service

SAMPLE_NOMINATIM = {
    "display_name": "Bomdila, Bomdila HQ, West Kameng, Arunachal Pradesh, India",
    "address": {
        "city": "Bomdila",
        "county": "Bomdila HQ",
        "state_district": "West Kameng",
        "state": "Arunachal Pradesh",
    },
}


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_map_nominatim_prefers_city_and_district():
    place = geocode_service.map_nominatim(SAMPLE_NOMINATIM)
    assert place == {
        "label": "Bomdila, West Kameng",
        "city": "Bomdila",
        "district": "West Kameng",
        "state": "Arunachal Pradesh",
    }


def test_map_nominatim_falls_back_to_display_name():
    payload = {"display_name": "Somewhere, Assam, India", "address": {}}
    place = geocode_service.map_nominatim(payload)
    assert place is not None
    assert place["label"] == "Somewhere, Assam"


def test_map_nominatim_empty_payload():
    assert geocode_service.map_nominatim({}) is None


def test_reverse_uses_http_and_caches(monkeypatch):
    geocode_service.clear_cache()
    calls = []

    def fake_get(url, params, headers):
        calls.append((url, params, headers))
        return SAMPLE_NOMINATIM

    monkeypatch.setattr(geocode_service, "_http_get", fake_get)
    first = geocode_service.reverse(27.264, 92.423)
    second = geocode_service.reverse(27.264, 92.423)

    assert first is not None and first["label"] == "Bomdila, West Kameng"
    assert second == first
    assert len(calls) == 1  # second call served from cache
    assert calls[0][2]["User-Agent"].startswith("NER-SMART")


def test_reverse_failure_returns_none(monkeypatch):
    geocode_service.clear_cache()

    def boom(url, params, headers):
        raise RuntimeError("network down")

    monkeypatch.setattr(geocode_service, "_http_get", boom)
    assert geocode_service.reverse(10.0, 76.0) is None


def test_geocode_route(client, monkeypatch):
    geocode_service.clear_cache()
    monkeypatch.setattr(geocode_service, "_http_get", lambda url, params, headers: SAMPLE_NOMINATIM)
    place = client.get("/api/geocode/reverse", params={"lat": 27.264, "lng": 92.423})
    assert place.status_code == 200
    body = place.json()
    assert body["label"] == "Bomdila, West Kameng"
    assert body["state"] == "Arunachal Pradesh"


def test_geocode_route_reports_unavailable(client, monkeypatch):
    geocode_service.clear_cache()

    def boom(url, params, headers):
        raise RuntimeError("network down")

    monkeypatch.setattr(geocode_service, "_http_get", boom)
    place = client.get("/api/geocode/reverse", params={"lat": 10.0, "lng": 76.0})
    assert place.status_code == 200
    assert "error" in place.json()


def test_geocode_route_validates_bounds(client):
    bad = client.get("/api/geocode/reverse", params={"lat": 999, "lng": 0})
    assert bad.status_code == 422


SAMPLE_SEARCH = [
    {
        "lat": "27.2640",
        "lon": "92.4230",
        "display_name": "Bomdila, Bomdila HQ, West Kameng, Arunachal Pradesh, India",
        "address": {"city": "Bomdila", "state": "Arunachal Pradesh", "country": "India"},
    },
    {
        "lat": "27.2640",
        "lon": "92.4230",
        "display_name": "Duplicate Bomdila, Arunachal Pradesh, India",
        "address": {"city": "Bomdila", "state": "Arunachal Pradesh", "country": "India"},
    },
]


def test_search_maps_and_dedupes(monkeypatch):
    geocode_service.clear_cache()
    monkeypatch.setattr(geocode_service, "_http_get", lambda url, params, headers: SAMPLE_SEARCH)
    results = geocode_service.search("bomdila")
    assert len(results) == 1
    assert results[0]["label"] == "Bomdila, Arunachal Pradesh, India"
    assert results[0]["lat"] == 27.264
    assert results[0]["lng"] == 92.423


def test_search_short_query_skips_network(monkeypatch):
    geocode_service.clear_cache()
    monkeypatch.setattr(
        geocode_service, "_http_get", lambda *args, **kwargs: pytest.fail("should not call network")
    )
    assert geocode_service.search("b") == []


def test_search_route(client, monkeypatch):
    geocode_service.clear_cache()
    monkeypatch.setattr(geocode_service, "_http_get", lambda url, params, headers: SAMPLE_SEARCH)
    res = client.get("/api/geocode/search", params={"q": "bomdila"})
    assert res.status_code == 200
    body = res.json()
    assert body["results"][0]["label"] == "Bomdila, Arunachal Pradesh, India"


def test_search_route_requires_query(client):
    assert client.get("/api/geocode/search").status_code == 422
