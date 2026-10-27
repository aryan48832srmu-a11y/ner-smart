from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import SessionLocal, init_db
from app.data.seed import seed_database
from app.api.routes import health as health_check
from app.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and seed reference data on first run.
    init_db()
    seed_database(SessionLocal)
    yield


app = FastAPI(
    title="NER-SMART — AI Logistics & Accessibility Intelligence Platform",
    description="Logistics and accessibility intelligence for India's North Eastern Region.",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ---------------------------------------------------------------------------
# Optional single-service hosting: serve the built Vite app (frontend/dist)
# from the same origin as the API. This lets `uvicorn app.main:app` host the
# whole product with one URL and no CORS configuration. In development the
# bundle usually does not exist, so the Vite dev server keeps handling the UI.
# ---------------------------------------------------------------------------
def _frontend_dist() -> Path:
    if settings.FRONTEND_DIST.strip():
        return Path(settings.FRONTEND_DIST).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()


FRONTEND_DIST = _frontend_dist()


@app.get("/health", include_in_schema=False)
def health():
    """Root-level alias for /api/health (used by uptime probes and tunnels)."""
    return health_check()


@app.get("/")
def root():
    # When the SPA bundle is present, "/" serves the app; otherwise this is an
    # API-only deployment and the JSON banner is returned.
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": "live",
        "weather": "live" if settings.live_weather_enabled else "simulated",
        "message": "NER-SMART API. See /docs for interactive documentation.",
    }


if (FRONTEND_DIST / "index.html").is_file():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Return built files when they exist, otherwise the SPA entry point."""
        if full_path.split("/", 1)[0] in {"api", "health", "docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404, detail="Not Found")

        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_relative_to(FRONTEND_DIST) and candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(
            FRONTEND_DIST / "index.html",
            headers={"Cache-Control": "no-cache"},
        )
