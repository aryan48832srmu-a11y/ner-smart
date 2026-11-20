"""Tests for real-world incident feeds (parsed from sample public payloads)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import live_incident_service as live


GDACS_XML = """<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"
     xmlns:gdacs="http://www.gdacs.org" xmlns:dc="http://purl.org/dc/elements/1.1/">
 <channel>
  <item>
   <title>Orange flood notification in Assam, India</title>
   <description>River flooding affecting low-lying areas.</description>
   <link>https://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=9001</link>
   <pubDate>Fri, 20 Nov 2026 08:00:00 GMT</pubDate>
   <dc:subject>FL1</dc:subject>
   <guid isPermaLink="false">FL9001</guid>
   <geo:Point><geo:lat>26.1445</geo:lat><geo:long>91.7362</geo:long></geo:Point>
   <gdacs:eventtype>FL</gdacs:eventtype>
   <gdacs:eventid>9001</gdacs:eventid>
   <gdacs:alertlevel>Orange</gdacs:alertlevel>
   <gdacs:country>India</gdacs:country>
  </item>
  <item>
   <title>Green forest fire notification in Brazil</title>
   <description>Outside the region.</description>
   <pubDate>Fri, 20 Nov 2026 08:00:00 GMT</pubDate>
   <geo:Point><geo:lat>-10.0</geo:lat><geo:long>-55.0</geo:long></geo:Point>
   <gdacs:eventtype>WF</gdacs:eventtype>
   <gdacs:alertlevel>Green</gdacs:alertlevel>
  </item>
 </channel>
</rss>"""

USGS_JSON = {
    "features": [
        {
            "id": "nc123",
            "geometry": {"coordinates": [92.6, 27.2, 10.0]},
            "properties": {
                "mag": 5.8,
                "place": "30 km NE of Tawang, India",
                "time": 1795152650000,
                "url": "https://earthquake.usgs.gov/earthquakes/eventpage/nc123",
            },
        },
        {
            "id": "nc999",
            "geometry": {"coordinates": [-120.0, 35.0, 5.0]},
            "properties": {"mag": 6.2, "place": "California", "time": 1795152650000},
        },
    ]
}


@pytest.fixture(autouse=True)
def _clear(monkeypatch):
    # conftest disables feeds for the rest of the suite; enable them here.
    monkeypatch.setattr(live.settings, "LIVE_INCIDENTS_ENABLED", True)
    live.clear_cache()
    yield
    live.clear_cache()


def test_gdacs_parsing_filters_region_and_maps_severity():
    items = live.parse_gdacs(GDACS_XML)
    assert len(items) == 1
    item = items[0]
    assert item["type"] == "Flood"
    assert item["severity"] == "High"
    assert item["source"] == "GDACS"
    assert item["region"] == "NER"
    assert (item["lat"], item["lng"]) == (26.1445, 91.7362)
    assert "gdacs.org" in item["source_url"]


def test_usgs_parsing_filters_region_and_sets_magnitude():
    items = live.parse_usgs(USGS_JSON)
    assert len(items) == 1
    item = items[0]
    assert item["type"] == "Earthquake"
    assert item["severity"] == "High"
    assert item["magnitude"] == 5.8
    assert item["source"] == "USGS"
    assert item["region"] == "NER"


def test_live_incidents_uses_both_feeds(monkeypatch):
    def fake_get(url, params=None):
        return GDACS_XML if url == live.GDACS_URL else USGS_JSON

    monkeypatch.setattr(live, "_http_get", fake_get)
    items = live.live_incidents()
    sources = {i["source"] for i in items}
    assert sources == {"GDACS", "USGS"}
    assert len(items) == 2


def test_live_incidents_failure_returns_empty_not_demo(monkeypatch):
    def fake_get(url, params=None):
        raise ConnectionError("feed down")

    monkeypatch.setattr(live, "_http_get", fake_get)
    assert live.live_incidents() == []


def test_all_incidents_excludes_seeded_demo_ids(store, monkeypatch):
    monkeypatch.setattr(live, "_http_get", lambda url, params=None: GDACS_XML if url == live.GDACS_URL else {"features": []})
    items = live.all_incidents()
    assert items
    assert all(i["id"] not in live.SEED_IDS for i in items)
    assert all(i.get("is_live") for i in items)


def test_live_api_endpoint(store, monkeypatch):
    monkeypatch.setattr(live, "_http_get", lambda url, params=None: GDACS_XML if url == live.GDACS_URL else USGS_JSON)
    client = TestClient(app)
    response = client.get("/api/incidents/live")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 2
    assert set(body["sources"]) == {"GDACS", "USGS"}
    assert body["incidents"][0]["source"] in {"GDACS", "USGS"}

    ner = client.get("/api/incidents/live?region=ner").json()
    assert ner["count"] == 2
