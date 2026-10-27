"""SQLAlchemy ORM models for NER-SMART."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text

from app.db import Base, utcnow


class Road(Base):
    __tablename__ = "roads"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, index=True)
    from_city = Column("from_city", String)
    to_city = Column("to_city", String)
    state = Column(String, index=True)
    length_km = Column(Float)
    estimated_hours = Column(Float)
    status = Column(String)
    accessibility = Column(Integer)
    weather_risk = Column(String)
    landslide_risk = Column(Integer)
    disruption_probability = Column(Integer)
    updated_minutes_ago = Column(Integer)
    alternative_available = Column(Boolean)
    coordinates = Column(JSON)
    factors = Column(JSON)
    anchors = Column(JSON)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "from_": self.from_city,
            "to": self.to_city,
            "state": self.state,
            "length_km": self.length_km,
            "estimated_hours": self.estimated_hours,
            "status": self.status,
            "accessibility": self.accessibility,
            "weather_risk": self.weather_risk,
            "landslide_risk": self.landslide_risk,
            "disruption_probability": self.disruption_probability,
            "updated_minutes_ago": self.updated_minutes_ago,
            "alternative_available": self.alternative_available,
            "coordinates": self.coordinates or [],
            "factors": self.factors or [],
            "anchors": self.anchors or [],
        }


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True)
    type = Column(String, index=True)
    state = Column(String, index=True)
    location_name = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    severity = Column(String)
    description = Column(Text, default="")
    road = Column(String, nullable=True)
    status = Column(String, default="Active", index=True)
    ai_risk = Column(Integer, nullable=True)
    image_url = Column(String, nullable=True)
    ai_analysis = Column(JSON, nullable=True)
    reported_at = Column(DateTime, default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        reported_at = self.reported_at or utcnow()
        minutes = int((utcnow() - reported_at).total_seconds() // 60)
        return {
            "id": self.id,
            "type": self.type,
            "state": self.state,
            "location_name": self.location_name,
            "lat": self.lat,
            "lng": self.lng,
            "severity": self.severity,
            "description": self.description or "",
            "road": self.road,
            "reported_minutes_ago": max(minutes, 0),
            "reported_at": reported_at.isoformat(),
            "status": self.status,
            "ai_risk": self.ai_risk,
            "image_url": self.image_url,
            "ai_analysis": self.ai_analysis,
        }


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(String, primary_key=True)
    name = Column(String)
    city = Column(String)
    state = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    capacity_pct = Column(Integer)
    stock = Column(JSON)
    operational = Column(Boolean, default=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "city": self.city,
            "state": self.state,
            "lat": self.lat,
            "lng": self.lng,
            "capacity_pct": self.capacity_pct,
            "stock": self.stock or {},
            "operational": self.operational,
        }


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True)
    plate = Column(String)
    type = Column(String)
    status = Column(String)
    location = Column(String)
    cargo = Column(String)
    destination = Column(String)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "plate": self.plate,
            "type": self.type,
            "status": self.status,
            "location": self.location,
            "cargo": self.cargo,
            "destination": self.destination,
        }


class SupplyRequest(Base):
    __tablename__ = "supply_requests"

    id = Column(String, primary_key=True)
    destination = Column(String)
    state = Column(String)
    cargo = Column(String)
    priority = Column(String)
    quantity = Column(String)
    eta_days = Column(Integer)
    reason = Column(Text)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "destination": self.destination,
            "state": self.state,
            "cargo": self.cargo,
            "priority": self.priority,
            "quantity": self.quantity,
            "eta_days": self.eta_days,
            "reason": self.reason,
        }


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(String, primary_key=True)
    name = Column(String)
    city = Column(String)
    state = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    beds = Column(Integer)
    status = Column(String)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "city": self.city,
            "state": self.state,
            "lat": self.lat,
            "lng": self.lng,
            "beds": self.beds,
            "status": self.status,
        }


__all__ = ["Road", "Incident", "Warehouse", "Vehicle", "SupplyRequest", "Hospital"]
