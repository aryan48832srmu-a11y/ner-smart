from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class Coordinates(BaseModel):
    lat: float
    lng: float


class Road(BaseModel):
    id: str
    name: str
    from_: str
    to: str
    state: str
    length_km: float
    estimated_hours: float
    status: str
    accessibility: int
    weather_risk: str
    landslide_risk: int
    disruption_probability: int
    updated_minutes_ago: int
    alternative_available: bool
    coordinates: list[list[float]]
    factors: list[str] = []
    anchors: list[str] = []


class Incident(BaseModel):
    id: str
    type: str
    state: str
    location_name: str
    lat: float
    lng: float
    severity: str
    description: str
    road: Optional[str] = None
    reported_minutes_ago: int
    status: str = "Active"
    ai_risk: Optional[int] = None
    image_url: Optional[str] = None
    ai_analysis: Optional[dict[str, Any]] = None


class WeatherReading(BaseModel):
    location: str
    state: str
    lat: float
    lng: float
    temperature_c: float
    humidity_pct: float
    rainfall_mm: float
    wind_kmh: float
    condition: str
    alert: Optional[str] = None
    updated: str


class RouteSegment(BaseModel):
    road_id: str
    road_name: str
    from_: str
    to: str
    distance_km: float
    hours: float
    safety: int


class Route(BaseModel):
    id: str
    name: str
    label: str
    distance_km: float
    eta_hours: float
    accessibility: int
    safety: int
    weather_risk: str
    flood_risk: int
    landslide_risk: int
    incident_risk: int
    road_condition: int
    disruption_probability: int
    overall_score: float
    segments: list[RouteSegment]
    recommended: bool = False
    is_shortest: bool = False


class RouteOptimizeRequest(BaseModel):
    origin: str
    destination: str
    # Optional coordinates let the planner support arbitrary points on the map.
    # When omitted, the origin/destination names are matched against the road
    # network directly. When provided, the point is snapped to the nearest
    # network node and an approach leg is added.
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    cargo_type: str = "General"
    priority: str = "Normal"
    vehicle: str = "Heavy Truck"


class RiskPrediction(BaseModel):
    risk_probability: float
    risk_level: str
    explainer: list[str] = Field(default_factory=list)


class RiskPredictionRequest(BaseModel):
    rainfall: float = 0
    temperature: float = 25
    humidity: float = 70
    road_condition: int = 3
    road_slope: int = 2
    elevation: int = 400
    distance_from_river: int = 500
    historical_incidents: int = 0
    current_incidents: int = 0
    traffic_level: int = 2
    weather_alert: int = 0
    previous_disruptions: int = 0


class Alert(BaseModel):
    id: str
    category: str
    severity: str
    location: str
    state: str
    time: str
    title: str
    description: str
    affected_routes: list[str] = []
    affected_routes_count: int = 0
    predicted_disruption: Optional[int] = None
    recommendation: str


class LogisticsSummary(BaseModel):
    warehouses: list[dict[str, Any]]
    vehicles: list[dict[str, Any]]
    requests: list[dict[str, Any]]
    deliveries_active: int
    critical_destinations: list[dict[str, Any]]
    readiness_pct: int


class WarehouseCreate(BaseModel):
    """Payload for adding a depot to the logistics network."""

    name: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=1, max_length=80)
    state: str = Field(min_length=1, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    capacity_pct: int = Field(default=50, ge=0, le=100)
    stock: dict[str, int] = Field(default_factory=dict)
    operational: bool = True

    @field_validator("stock")
    @classmethod
    def _stock_non_negative(cls, value: dict[str, int]) -> dict[str, int]:
        if any(v < 0 for v in value.values()):
            raise ValueError("stock values must be non-negative")
        return value


class WarehouseUpdate(BaseModel):
    """Partial update for a depot (supplies, capacity, status, details)."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    city: str | None = Field(default=None, min_length=1, max_length=80)
    state: str | None = Field(default=None, min_length=1, max_length=80)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    capacity_pct: int | None = Field(default=None, ge=0, le=100)
    stock: dict[str, int] | None = None
    operational: bool | None = None

    @field_validator("stock")
    @classmethod
    def _stock_non_negative(cls, value: dict[str, int] | None) -> dict[str, int] | None:
        if value is not None and any(v < 0 for v in value.values()):
            raise ValueError("stock values must be non-negative")
        return value


class DashboardSummary(BaseModel):
    active_disruptions: int
    blocked_roads: int
    high_risk_routes: int
    critical_deliveries: int
    average_accessibility: int
    weather_alerts: int
    overall_risk: str
    region: str
    updated: str


class TrendPoint(BaseModel):
    label: str
    value: float


class AnalyticsSummary(BaseModel):
    disruptions_over_time: list[TrendPoint]
    state_accessibility: list[dict[str, Any]]
    weather_risk_by_state: list[dict[str, Any]]
    delivery_success_rate: list[TrendPoint]
    average_travel_time: list[TrendPoint]
    risk_distribution: list[dict[str, Any]]
    incident_types: list[dict[str, Any]]
    critical_supply_requests: list[dict[str, Any]]
