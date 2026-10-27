"""Root-level health probe (used by uptime checks and public tunnels)."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_available_at_root_and_api():
    with TestClient(app) as client:
        root = client.get("/health")
        api = client.get("/api/health")

    assert root.status_code == 200
    assert api.status_code == 200
    assert root.json()["status"] == "ok"
    assert root.json() == api.json()
