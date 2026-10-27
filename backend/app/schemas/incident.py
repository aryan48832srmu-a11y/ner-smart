from typing import Any, Optional

from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    type: str
    state: str
    location_name: str
    lat: float
    lng: float
    severity: str
    description: str = ""
    road: Optional[str] = None
    reported_minutes_ago: int = 0
    status: str = "Active"


class IncidentCreateResponse(BaseModel):
    id: str
    message: str
    incident: dict[str, Any]
    affected_roads: list[str] = []
    recomputed_risk: Optional[dict[str, Any]] = None
    updated_dashboard: dict[str, Any] = Field(default_factory=dict)
