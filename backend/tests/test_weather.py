"""Weather service tests (OpenWeatherMap mapping, alerts and fallback)."""

from app.config import settings
from app.services import owm_client, weather_service

SAMPLE_OWM = {
    "main": {"temp": 21.4, "humidity": 88},
    "weather": [{"id": 502, "main": "Rain", "description": "heavy intensity rain"}],
    "wind": {"speed": 6.0},
    "rain": {"1h": 24.5},
}


def test_map_owm_reading():
    city = {"state": "Meghalaya", "lat": 25.57, "lng": 91.88}
    reading = weather_service.map_owm_to_reading("Shillong", city, SAMPLE_OWM)
    assert reading["temperature_c"] == 21.4
    assert reading["humidity_pct"] == 88
    assert reading["rainfall_mm"] == 24.5
    assert round(reading["wind_kmh"]) == 22
    assert reading["condition"] == "Rain"
    assert reading["source"] == "live"
    assert reading["alert"] == "Heavy rainfall alert"


def test_rain_3h_is_averaged():
    city = {"state": "Assam", "lat": 26.1, "lng": 91.7}
    payload = {"main": {"temp": 30, "humidity": 60}, "weather": [{"main": "Clouds"}], "wind": {"speed": 1}, "rain": {"3h": 9}}
    reading = weather_service.map_owm_to_reading("Guwahati", city, payload)
    assert reading["rainfall_mm"] == 3.0
    assert reading["alert"] is None


def test_fallback_when_no_key():
    assert settings.live_weather_enabled is False
    reading = weather_service.weather_for_city("Guwahati")
    assert reading is not None
    assert reading["source"] == "simulated"
    assert reading["location"] == "Guwahati"


def test_live_reading_uses_client(monkeypatch):
    monkeypatch.setattr(settings, "OPENWEATHER_API_KEY", "dummy-key")
    monkeypatch.setattr(owm_client, "fetch_current", lambda lat, lng: SAMPLE_OWM)
    assert settings.live_weather_enabled is True

    reading = weather_service.weather_for_city("Tawang")
    assert reading["source"] == "live"
    assert reading["alert"] == "Heavy rainfall alert"


def test_live_failure_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "OPENWEATHER_API_KEY", "dummy-key")

    def boom(lat, lng):
        raise RuntimeError("network down")

    monkeypatch.setattr(owm_client, "fetch_current", boom)
    reading = weather_service.weather_for_city("Tawang")
    assert reading["source"] == "simulated"


def test_get_weather_all_locations():
    readings = weather_service.get_weather()
    assert len(readings) >= 20
    assert all("source" in r for r in readings)


def test_get_weather_single_location():
    readings = weather_service.get_weather("Guwahati")
    assert len(readings) == 1
    assert readings[0]["location"] == "Guwahati"
