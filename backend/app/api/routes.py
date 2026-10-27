"""API routes for NER-SMART backend."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.schemas.incident import IncidentCreate, IncidentCreateResponse
from app.services import aggregator, geocode_service, route_engine
from app.services.forecast_service import forecast_road
from app.services.image_analyzer import get_analyzer
from app.services.store import get_store
from app.services.weather_service import get_weather
from app.ml.risk_model import get_predictor
from app.models.schemas import RiskPredictionRequest
from app.models.schemas import RouteOptimizeRequest
from app.models.schemas import WarehouseCreate, WarehouseUpdate

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": "NER-SMART",
        "mode": "live",
        "weather": "live" if settings.live_weather_enabled else "simulated",
    }


@router.get("/dashboard")
def dashboard():
    return aggregator.dashboard()


@router.get("/roads")
def roads():
    return aggregator.roads()


@router.get("/roads/{road_id}")
def road_detail(road_id: str):
    r = aggregator.road_detail(road_id)
    if not r:
        return {"error": "Road not found"}
    return r


@router.get("/incidents")
def incidents():
    store = get_store()
    return store.incidents_all()


@router.post("/incidents")
def create_incident(payload: IncidentCreate):
    store = get_store()
    incident, affected = store.add_incident(payload.model_dump())
    recomputed = store.recompute_road_risk(incident, affected)

    if payload.type:
        ai_analysis = get_analyzer().analyze(payload.type)
        store.set_incident_analysis(incident["id"], ai_analysis)
        incident["ai_analysis"] = ai_analysis

    updated_dashboard = aggregator.dashboard()

    return IncidentCreateResponse(
        id=incident["id"],
        message="Incident reported. Map and risk updated.",
        incident=incident,
        affected_roads=affected,
        recomputed_risk=recomputed,
        updated_dashboard=updated_dashboard,
    )


@router.get("/weather")
def weather(location: str | None = None):
    return get_weather(location)


@router.get("/geocode/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """Resolve a coordinate to a place name for the incident-report form."""
    place = geocode_service.reverse(lat, lng)
    if not place:
        return {"error": "Reverse geocoding unavailable."}
    return place


@router.get("/geocode/search")
def search_places(
    q: str = Query(..., min_length=2, max_length=120),
    limit: int = Query(6, ge=1, le=10),
):
    """Search any place on the map (used by the route planner endpoints)."""
    return {"results": geocode_service.search(q, limit)}


@router.get("/routes")
def routes():
    from app.data.demo_data import CITIES

    cities = [{"name": k, **v} for k, v in CITIES.items()]
    return {"roads": aggregator.roads(), "cities": cities}


@router.post("/routes/optimize")
def optimize_route(payload: RouteOptimizeRequest):
    result = route_engine.optimize(
        origin=payload.origin,
        destination=payload.destination,
        cargo_type=payload.cargo_type,
        priority=payload.priority,
        origin_lat=payload.origin_lat,
        origin_lng=payload.origin_lng,
        destination_lat=payload.destination_lat,
        destination_lng=payload.destination_lng,
    )
    return result


@router.post("/predict-risk")
def predict_risk(payload: RiskPredictionRequest):
    predictor = get_predictor()
    features = payload.model_dump()
    pred = predictor.predict(features)
    explainer = predictor.explain(features, pred)
    return {**pred, "explainer": explainer, "disclaimer": "AI-generated estimate — not certified."}


@router.get("/forecast/{road_id}")
def forecast(road_id: str):
    r = aggregator.road_detail(road_id)
    if not r:
        return {"error": "Road not found"}
    return forecast_road(r)


@router.get("/alerts")
def alerts():
    return aggregator.alerts()


@router.get("/logistics")
def logistics():
    return aggregator.logistics()


@router.get("/warehouses")
def warehouses():
    return get_store().warehouses()


@router.post("/warehouses", status_code=201)
def create_warehouse(payload: WarehouseCreate):
    return get_store().add_warehouse(payload.model_dump())


@router.patch("/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: str, payload: WarehouseUpdate):
    updated = get_store().update_warehouse(
        warehouse_id, payload.model_dump(exclude_unset=True)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return updated


@router.get("/analytics")
def analytics():
    return aggregator.analytics()


@router.get("/meta")
def meta():
    from app.data.demo_data import (
        CITIES,
        CARGO_TYPES,
        PRIORITIES,
        VEHICLE_TYPES,
        INCIDENT_TYPES,
        SEVERITIES,
        STATES,
    )

    return {
        "cities": [{"name": k, **v} for k, v in CITIES.items()],
        "states": STATES,
        "cargo_types": CARGO_TYPES,
        "priorities": PRIORITIES,
        "vehicle_types": VEHICLE_TYPES,
        "incident_types": INCIDENT_TYPES,
        "severities": SEVERITIES,
    }
