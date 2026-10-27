"""Database-backed store for incidents, roads and logistics data.

The store is the single source of truth for mutable operational data. It is
persisted in SQLite (see ``app.db``), so field-reported incidents and the road
risk recomputation they trigger survive application restarts.

Public methods return plain dictionaries matching the API response shapes,
keeping the aggregation and routing layers decoupled from the ORM.
"""

from __future__ import annotations

from typing import Any, Callable

from sqlalchemy.orm import Session

from app.db import SessionLocal, utcnow
from app.models.db_models import (
    Hospital,
    Incident,
    Road,
    SupplyRequest,
    Vehicle,
    Warehouse,
)

SessionFactory = Callable[[], Session]

_STATUS_SEVERITY_INT = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}

_TYPE_RISK_ADD = {
    "Landslide": 14,
    "Bridge Damage": 12,
    "Flood": 10,
    "Heavy Snow": 8,
    "Road Damage": 6,
    "Accident": 4,
    "Other": 2,
}


class AppStore:
    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory
        self._seq = 1000

    # ------------------------------------------------------------------ roads
    def roads(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.query(Road).order_by(Road.id).all()
            return [r.to_dict() for r in rows]

    def road_by_id(self, road_id: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.get(Road, road_id)
            return row.to_dict() if row else None

    def recompute_road_risk(
        self, incident: dict[str, Any], affected_roads: list[str]
    ) -> dict[str, Any]:
        """Increase risk on affected roads after a new incident and persist it."""
        upgrades: list[dict[str, Any]] = []
        boost = _STATUS_SEVERITY_INT.get(incident.get("severity", "Medium"), 2) * 6
        with self._session_factory() as session:
            rows = (
                session.query(Road)
                .filter(Road.name.in_(affected_roads))
                .all()
            )
            for road in rows:
                road.disruption_probability = min(
                    98, (road.disruption_probability or 0) + boost
                )
                road.updated_minutes_ago = 0
                if road.disruption_probability >= 80:
                    road.status = "severely_risky"
                elif road.disruption_probability >= 60:
                    road.status = "risky"
                road.accessibility = max(5, (road.accessibility or 0) - boost // 2)
                upgrades.append(
                    {
                        "road": road.name,
                        "disruption_probability": road.disruption_probability,
                        "status": road.status,
                    }
                )
            session.commit()
        return {"recomputed_roads": upgrades}

    # -------------------------------------------------------------- incidents
    def incidents_all(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.query(Incident).order_by(Incident.reported_at.desc()).all()
            return [i.to_dict() for i in rows]

    def active_incidents(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.query(Incident)
                .filter(Incident.status == "Active")
                .order_by(Incident.reported_at.desc())
                .all()
            )
            return [i.to_dict() for i in rows]

    def _next_id(self) -> str:
        self._seq += 1
        return f"inc-{self._seq}"

    def add_incident(self, data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        incident = dict(data)
        incident["id"] = incident.get("id") or self._next_id()
        incident.pop("reported_minutes_ago", None)
        incident.setdefault("status", "Active")
        incident["ai_risk"] = incident.get("ai_risk") or self._estimate_ai_risk(incident)

        record = Incident(
            id=incident["id"],
            type=incident.get("type", "Other"),
            state=incident.get("state", "Assam"),
            location_name=incident.get("location_name", ""),
            lat=incident.get("lat", 0.0),
            lng=incident.get("lng", 0.0),
            severity=incident.get("severity", "Medium"),
            description=incident.get("description", ""),
            road=incident.get("road"),
            status=incident.get("status", "Active"),
            ai_risk=incident["ai_risk"],
            image_url=incident.get("image_url"),
            ai_analysis=incident.get("ai_analysis"),
            reported_at=utcnow(),
        )
        with self._session_factory() as session:
            session.add(record)
            session.commit()
            session.refresh(record)
            incident = record.to_dict()

        affected = self._roads_affected_by(incident)
        return incident, affected

    def set_incident_analysis(self, incident_id: str, analysis: dict[str, Any]) -> None:
        with self._session_factory() as session:
            row = session.get(Incident, incident_id)
            if row:
                row.ai_analysis = analysis
                session.commit()

    @staticmethod
    def _estimate_ai_risk(incident: dict[str, Any]) -> int:
        base = _STATUS_SEVERITY_INT.get(incident.get("severity", "Medium"), 2) * 22
        base += _TYPE_RISK_ADD.get(incident.get("type", "Other"), 5)
        return min(99, base)

    def _roads_affected_by(self, incident: dict[str, Any]) -> list[str]:
        name = (incident.get("road") or "").lower()
        location = (incident.get("location_name") or "").lower()
        hits: list[str] = []
        for r in self.roads():
            if name and name in r["name"].lower():
                hits.append(r["name"])
                continue
            for anchor in r.get("anchors", []):
                if location and anchor.lower() in location:
                    hits.append(r["name"])
                    break
        if hits:
            return list(dict.fromkeys(hits))
        fallback = "NH-10" if "Arunachal" in incident.get("state", "") else None
        return [fallback] if fallback else []

    # -------------------------------------------------------------- logistics
    def warehouses(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            return [w.to_dict() for w in session.query(Warehouse).order_by(Warehouse.id).all()]

    def _next_warehouse_id(self, session: Session) -> str:
        max_num = 0
        for (warehouse_id,) in session.query(Warehouse.id).all():
            try:
                max_num = max(max_num, int(str(warehouse_id).split("-")[-1]))
            except (TypeError, ValueError):
                continue
        return f"wh-{max_num + 1:03d}"

    def add_warehouse(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a depot and persist it; returns the stored record."""
        values = dict(data)
        with self._session_factory() as session:
            record = Warehouse(
                id=values.get("id") or self._next_warehouse_id(session),
                name=values["name"],
                city=values["city"],
                state=values["state"],
                lat=values["lat"],
                lng=values["lng"],
                capacity_pct=values.get("capacity_pct", 50),
                stock=values.get("stock") or {},
                operational=values.get("operational", True),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return record.to_dict()

    def update_warehouse(
        self, warehouse_id: str, data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Apply a partial update (including merged stock) to a depot."""
        values = dict(data)
        stock = values.pop("stock", None)
        with self._session_factory() as session:
            row = session.get(Warehouse, warehouse_id)
            if row is None:
                return None
            for field in ("name", "city", "state", "lat", "lng", "capacity_pct", "operational"):
                if values.get(field) is not None:
                    setattr(row, field, values[field])
            if stock is not None:
                # Merge so editing one supply line keeps the others intact.
                row.stock = {**(row.stock or {}), **stock}
            session.commit()
            session.refresh(row)
            return row.to_dict()

    def vehicles(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            return [v.to_dict() for v in session.query(Vehicle).order_by(Vehicle.id).all()]

    def supply_requests(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            return [
                r.to_dict()
                for r in session.query(SupplyRequest).order_by(SupplyRequest.id).all()
            ]

    def hospitals(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            return [h.to_dict() for h in session.query(Hospital).order_by(Hospital.id).all()]


_store: AppStore | None = None


def get_store() -> AppStore:
    global _store
    if _store is None:
        _store = AppStore(SessionLocal)
    return _store


def build_store(session_factory: SessionFactory) -> AppStore:
    """Create an independent store instance (used by tests)."""
    return AppStore(session_factory)


def reset_store() -> None:
    global _store
    _store = None
