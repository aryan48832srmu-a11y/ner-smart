# Test configuration.
#
# The DATABASE_URL is forced to an in-memory SQLite instance *before* the app
# package is imported, so tests never touch the real nersmart.db file.
import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["OPENWEATHER_API_KEY"] = ""

import pytest

from app.db import Base, SessionLocal, engine, init_db
from app.data.seed import seed_database
from app.services import store as store_module


@pytest.fixture(autouse=True)
def _reset_store():
    store_module.reset_store()
    yield
    store_module.reset_store()


@pytest.fixture()
def session_factory():
    Base.metadata.drop_all(bind=engine)
    init_db(engine)
    seed_database(SessionLocal)
    return SessionLocal


@pytest.fixture()
def store(session_factory):
    s = store_module.build_store(session_factory)
    store_module._store = s
    return s
