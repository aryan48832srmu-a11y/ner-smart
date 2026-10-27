"""Database engine, session factory and declarative base.

Uses SQLAlchemy 2.0 with SQLite by default. The database is the source of
truth for roads, incidents and logistics data, so reported incidents and
recomputed road risk survive application restarts.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def utcnow() -> datetime:
    """Current UTC time as a naive datetime (SQLite stores naive datetimes)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


def create_session_factory(database_url: str) -> tuple[Engine, sessionmaker]:
    """Create an engine + session factory for the given URL.

    In-memory SQLite databases use a StaticPool so the same connection is
    shared across sessions (required for tests).
    """
    connect_args: dict = {}
    engine_kwargs: dict = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if database_url in ("sqlite://", "sqlite:///:memory:"):
            from sqlalchemy.pool import StaticPool

            engine_kwargs["poolclass"] = StaticPool

    engine = create_engine(database_url, connect_args=connect_args, future=True, **engine_kwargs)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    return engine, factory


engine, SessionLocal = create_session_factory(settings.DATABASE_URL)


def init_db(target_engine: Engine | None = None) -> None:
    """Create all tables if they do not exist."""
    from app.models import db_models  # noqa: F401  (register models on Base.metadata)

    Base.metadata.create_all(bind=target_engine or engine)
