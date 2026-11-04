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


def test_cors_allows_separately_hosted_frontend():
    """The FTP-hosted UI calls this API cross-origin; the public demo must allow it."""
    with TestClient(app) as client:
        res = client.get("/api/health", headers={"Origin": "http://ner-smart.rf.gd"})

    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "*"
    assert res.headers.get("access-control-allow-credentials") is None
