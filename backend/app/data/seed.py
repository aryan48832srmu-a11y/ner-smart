"""Database seeding.

Populates the SQLite database with the reference road network, logistics
facilities and an initial set of field incidents the first time the
application starts (or whenever a table is empty). Subsequent runs keep the
persisted data untouched.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Callable

from sqlalchemy.orm import Session

from app.data import demo_data
from app.db import utcnow
from app.models.db_models import (
    Hospital,
    Incident,
    Road,
    SupplyRequest,
    Vehicle,
    Warehouse,
)

SessionFactory = Callable[[], Session]


def _seed_roads(session: Session) -> None:
    if session.query(Road).count() > 0:
        return
    for r in demo_data.ROADS:
        session.add(
            Road(
                id=r["id"],
                name=r["name"],
                from_city=r["from"],
                to_city=r["to"],
                state=r["state"],
                length_km=r["length_km"],
                estimated_hours=r["estimated_hours"],
                status=r["status"],
                accessibility=r["accessibility"],
                weather_risk=r["weather_risk"],
                landslide_risk=r["landslide_risk"],
                disruption_probability=r["disruption_probability"],
                updated_minutes_ago=r["updated_minutes_ago"],
                alternative_available=r["alternative_available"],
                coordinates=r["coordinates"],
                factors=r["factors"],
                anchors=r["anchors"],
            )
        )


def _seed_incidents(session: Session) -> None:
    if session.query(Incident).count() > 0:
        return
    now = utcnow()
    for i in demo_data.SEED_INCIDENTS:
        session.add(
            Incident(
                id=i["id"],
                type=i["type"],
                state=i["state"],
                location_name=i["location_name"],
                lat=i["lat"],
                lng=i["lng"],
                severity=i["severity"],
                description=i["description"],
                road=i.get("road"),
                status=i.get("status", "Active"),
                ai_risk=i.get("ai_risk"),
                reported_at=now - timedelta(minutes=i.get("reported_minutes_ago", 0)),
            )
        )


def _seed_logistics(session: Session) -> None:
    if session.query(Warehouse).count() == 0:
        for w in demo_data.WAREHOUSES:
            session.add(Warehouse(**w))
    if session.query(Vehicle).count() == 0:
        for v in demo_data.VEHICLES:
            session.add(Vehicle(**v))
    if session.query(SupplyRequest).count() == 0:
        for r in demo_data.SUPPLY_REQUESTS:
            session.add(SupplyRequest(**r))
    if session.query(Hospital).count() == 0:
        for h in demo_data.HOSPITALS:
            session.add(Hospital(**h))


def seed_database(session_factory: SessionFactory) -> None:
    with session_factory() as session:
        _seed_roads(session)
        _seed_incidents(session)
        _seed_logistics(session)
        session.commit()
