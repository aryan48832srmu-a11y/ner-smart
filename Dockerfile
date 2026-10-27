# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# NER-SMART single-service image: builds the Vite frontend, then serves the
# static bundle and the FastAPI API from one process on one port.
# ---------------------------------------------------------------------------

########## Frontend build ##########
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

########## Runtime ##########
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# libgomp1 is required by the scikit-learn / numpy wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist

WORKDIR /app/backend

EXPOSE 8000

# The API serves /api, /health and the built SPA (including client-side routes).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
