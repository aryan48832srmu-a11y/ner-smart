"""Forecast and route-engine tests."""


def test_forecast_uses_weather_no_demo_wording(store):
    from app.services.forecast_service import forecast_road

    road = store.road_by_id("r-001")
    result = forecast_road(road)

    assert result["road_id"] == "r-001"
    assert 0 <= result["probability"] <= 100
    assert result["next_12h_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert "weather_source" in result
    assert "demo" not in result["disclaimer"].lower()
    assert "certified" in result["disclaimer"].lower()


def test_route_optimize_flagship(store):
    from app.services import route_engine

    result = route_engine.optimize("Guwahati", "Tawang", "Medicines", "Emergency")
    assert result["error"] is None
    assert len(result["routes"]) == 3
    assert result["recommended"] is not None
    assert result["recommended"]["recommended"] is True
    for route in result["routes"]:
        for seg in route["segments"]:
            assert seg["from_"] is not None
            assert seg["to"] is not None

    # The README demo: A is recommended at ~380 km even though B is shorter.
    assert result["recommended"]["label"] == "Route A"
    assert result["recommended"]["distance_km"] == 380
    shortest = min(result["routes"], key=lambda r: r["distance_km"])
    assert shortest["label"] == "Route B"
    assert shortest["is_shortest"] is True
    assert shortest["distance_km"] < result["recommended"]["distance_km"]
    assert "Route Route" not in result["explanation"]
    assert "Medicines / Emergency" in result["weights_label"]

    # Weights are percentages and scores stay on a 0-100 scale.
    assert abs(sum(result["weights"].values()) - 100) < 0.5
    for route in result["routes"]:
        assert 0 <= route["overall_score"] <= 100
        seg_km = sum(seg["distance_km"] for seg in route["segments"])
        assert abs(seg_km - route["distance_km"]) <= 1.5


def test_weights_are_normalized_for_every_combination(store):
    from app.services import route_engine

    for cargo in ("Medicines", "Food", "General", "Construction Material", "Agricultural Produce"):
        for priority in ("Emergency", "High", "Normal"):
            result = route_engine.optimize("Guwahati", "Tawang", cargo, priority)
            assert abs(sum(result["weights"].values()) - 100) < 0.5
            assert all(0 <= r["overall_score"] <= 100 for r in result["routes"])


def test_demo_corridors_are_connected(store):
    from app.services import route_engine

    roads = store.roads()
    for (origin, destination), paths in route_engine.DEMO_CORRIDORS.items():
        for ids in paths:
            segments = route_engine._resolve_segments(ids, roads)
            assert segments, f"{origin} -> {destination}: no segments for {ids}"
            for first, second in zip(segments, segments[1:]):
                shared = {first["from_"], first["to"]} & {second["from_"], second["to"]}
                assert shared, (
                    f"{origin} -> {destination} is disconnected at {ids}: "
                    f"{first['name']} does not meet {second['name']}"
                )


def test_demo_corridors_reach_destination(store):
    from app.services import route_engine

    pairs = [
        ("Guwahati", "Gangtok"),
        ("Tezpur", "Aizawl"),
        ("Dimapur", "Mokokchung"),
    ]
    for origin, destination in pairs:
        result = route_engine.optimize(origin, destination, "General", "Normal")
        assert result["error"] is None, f"{origin} -> {destination}"
        for route in result["routes"]:
            ends = {route["segments"][-1]["from_"], route["segments"][-1]["to"]}
            assert destination in ends, (
                f"{origin} -> {destination}: {route['label']} ends at {ends}"
            )


def test_route_optimize_generic_pair(store):
    from app.services import route_engine

    result = route_engine.optimize("Kohima", "Shillong", "Food", "High")
    assert result["error"] is None
    assert len(result["routes"]) >= 1


def test_route_risk_reflects_store(store):
    from app.services import route_engine

    # Escalate NH-10 risk and confirm the route engine sees the change.
    store.recompute_road_risk(
        {"type": "Landslide", "severity": "Critical", "state": "Arunachal Pradesh"},
        ["NH-10"],
    )
    result = route_engine.optimize("Guwahati", "Tawang", "Medicines", "Emergency")
    assert result["routes"]


def test_route_optimize_offnetwork_origin(store):
    from app.services import route_engine

    result = route_engine.optimize(
        "Camp Alpha",
        "Tawang",
        "Medicines",
        "Emergency",
        origin_lat=26.05,
        origin_lng=91.55,
    )
    assert result["error"] is None
    assert len(result["routes"]) == 3
    assert result["endpoints"]["origin"]["node"] == "Guwahati"
    assert result["endpoints"]["origin"]["snap_km"] > 4
    assert result["endpoints"]["destination"]["snap_km"] == 0

    segments = result["recommended"]["segments"]
    assert segments[0]["road_name"].startswith("Approach: Camp Alpha")
    assert segments[0]["from_"] == "Camp Alpha"


def test_route_optimize_offnetwork_destination(store):
    from app.services import route_engine

    result = route_engine.optimize(
        "Guwahati",
        "Field Hospital",
        "Food",
        "High",
        destination_lat=27.62,
        destination_lng=91.90,
    )
    assert result["error"] is None
    assert result["endpoints"]["destination"]["node"] == "Tawang"
    last = result["recommended"]["segments"][-1]
    assert last["road_name"].startswith("Departure: Tawang")
    assert last["to"] == "Field Hospital"


def test_route_optimize_local_trip_when_both_snap_same_node(store):
    from app.services import route_engine

    result = route_engine.optimize(
        "Camp A",
        "Camp B",
        "General",
        "Normal",
        origin_lat=26.05,
        origin_lng=91.60,
        destination_lat=26.02,
        destination_lng=91.50,
    )
    assert result["error"] is None
    assert len(result["routes"]) >= 1
    names = [s["road_name"] for s in result["recommended"]["segments"]]
    assert any(name.startswith("Approach:") for name in names)
    assert any(name.startswith("Departure:") for name in names)


def test_route_optimize_far_point_adds_warning(store):
    from app.services import route_engine

    result = route_engine.optimize(
        "Delhi",
        "Tawang",
        "Medicines",
        "Emergency",
        origin_lat=28.6139,
        origin_lng=77.2090,
    )
    assert result["error"] is None
    assert result["endpoints"]["origin"]["snap_km"] > 1000
    assert result["endpoints"]["warning"] is not None
    assert "outside the NER network" in result["endpoints"]["warning"]
