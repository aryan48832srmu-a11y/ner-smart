"""Warehouse management: add depots and edit stored supplies."""

import re

from fastapi.testclient import TestClient

from app.main import app


def _warehouse_payload(**overrides):
    payload = {
        "name": "Kohima Forward Depot",
        "city": "Kohima",
        "state": "Nagaland",
        "lat": 25.6751,
        "lng": 94.1086,
        "capacity_pct": 40,
        "stock": {
            "medicines": 300,
            "food_kg": 900,
            "construction_tons": 3,
            "agricultural_tons": 2,
        },
        "operational": True,
    }
    payload.update(overrides)
    return payload


def test_add_warehouse_persists(store, session_factory):
    from app.services.aggregator import logistics
    from app.services.store import build_store

    created = store.add_warehouse(_warehouse_payload())

    assert re.fullmatch(r"wh-\d{3,}", created["id"])
    assert created["name"] == "Kohima Forward Depot"
    assert created["stock"]["medicines"] == 300

    fresh = build_store(session_factory)
    ids = {warehouse["id"] for warehouse in fresh.warehouses()}
    assert created["id"] in ids

    summary = logistics()
    added = next(w for w in summary["warehouses"] if w["id"] == created["id"])
    assert added["city"] == "Kohima"


def test_update_warehouse_merges_supplies(store):
    before = next(w for w in store.warehouses() if w["id"] == "wh-001")

    updated = store.update_warehouse(
        "wh-001",
        {"stock": {"medicines": 2000}, "capacity_pct": 91},
    )

    assert updated is not None
    assert updated["stock"]["medicines"] == 2000
    # Untouched supply lines are preserved.
    assert updated["stock"]["food_kg"] == before["stock"]["food_kg"]
    assert updated["capacity_pct"] == 91
    assert store.update_warehouse("wh-999", {"capacity_pct": 10}) is None


def test_warehouse_api_create_and_edit(store):
    with TestClient(app) as client:
        created = client.post("/api/warehouses", json=_warehouse_payload())
        assert created.status_code == 201
        warehouse = created.json()
        warehouse_id = warehouse["id"]

        edited = client.patch(
            f"/api/warehouses/{warehouse_id}",
            json={"stock": {"food_kg": 1750}, "operational": False},
        )
        assert edited.status_code == 200
        body = edited.json()
        assert body["stock"]["food_kg"] == 1750
        assert body["stock"]["medicines"] == 300
        assert body["operational"] is False

        summary = client.get("/api/logistics").json()
        stored = next(w for w in summary["warehouses"] if w["id"] == warehouse_id)
        assert stored["stock"]["food_kg"] == 1750

        missing = client.patch("/api/warehouses/wh-999", json={"capacity_pct": 10})
        assert missing.status_code == 404

        invalid_capacity = client.post(
            "/api/warehouses", json=_warehouse_payload(capacity_pct=150)
        )
        assert invalid_capacity.status_code == 422

        negative_stock = client.patch(
            f"/api/warehouses/{warehouse_id}", json={"stock": {"medicines": -5}}
        )
        assert negative_stock.status_code == 422
