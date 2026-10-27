"""Store persistence and risk-recomputation tests."""


def test_roads_seeded(store):
    roads = store.roads()
    assert len(roads) >= 30
    assert all("from_" in r and "to" in r for r in roads)


def test_incidents_seeded(store):
    incidents = store.incidents_all()
    assert len(incidents) == 8
    assert any(i["status"] == "Active" for i in incidents)
    assert all("reported_minutes_ago" in i for i in incidents)


def test_add_incident_persists(store, session_factory):
    incident, affected = store.add_incident(
        {
            "type": "Landslide",
            "state": "Sikkim",
            "location_name": "Chungthang",
            "lat": 27.6,
            "lng": 88.6,
            "severity": "Critical",
            "description": "test",
            "road": "NH-17",
            "reported_minutes_ago": 0,
            "status": "Active",
        }
    )
    assert incident["id"].startswith("inc-")
    assert incident["ai_risk"] > 0

    # A brand-new store on the same database must still see the incident.
    from app.services.store import build_store

    fresh = build_store(session_factory)
    ids = {i["id"] for i in fresh.incidents_all()}
    assert incident["id"] in ids


def test_recompute_road_risk_boosts(store):
    before = store.road_by_id("r-001")
    incident = {"type": "Landslide", "severity": "Critical", "state": "Arunachal Pradesh"}
    result = store.recompute_road_risk(incident, ["NH-10"])
    after = store.road_by_id("r-001")

    assert after["disruption_probability"] >= before["disruption_probability"]
    assert after["accessibility"] <= before["accessibility"]
    assert any(u["road"] == "NH-10" for u in result["recomputed_roads"])


def test_logistics_seeded(store):
    assert len(store.warehouses()) >= 4
    assert len(store.vehicles()) >= 5
    assert len(store.supply_requests()) >= 5
    assert len(store.hospitals()) >= 4


def test_incident_analysis_persisted(store, session_factory):
    incident, _ = store.add_incident(
        {
            "type": "Flood",
            "state": "Assam",
            "location_name": "Majuli",
            "lat": 26.9,
            "lng": 94.1,
            "severity": "High",
            "description": "flood",
            "status": "Active",
        }
    )
    store.set_incident_analysis(incident["id"], {"detected": "Possible Flooding"})
    from app.services.store import build_store

    fresh = build_store(session_factory)
    saved = next(i for i in fresh.incidents_all() if i["id"] == incident["id"])
    assert saved["ai_analysis"] == {"detected": "Possible Flooding"}
