# NDRMS

**AI-Powered Logistics & Accessibility Intelligence Platform for the North Eastern Region (NER)**

Internal **Smart India Hackathon 2026** prototype — demo-ready build.
Previously branded **NER-SMART**; the live URLs and repository keep their old names so existing links stay valid.

> [!TIP]
> **Live demo (mobile friendly):** https://ner-smart-vujs.onrender.com
> Free hosting, so the first visit after idle can take up to ~60 s to wake.

> [!IMPORTANT]
> The core message of the platform:
> **"We don't simply find the shortest route. We find the safest and most reliable route based on accessibility, weather, terrain, incidents and logistics priority."**

---

## Overview

NDRMS is a full-stack logistics & accessibility intelligence platform for India's North
Eastern Region (Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura).
It combines an interactive GIS map, an AI/ML disruption-risk engine, a real-road route planner,
live public incident feeds, incident reporting with simulated CV image analysis, a logistics command
dashboard and an analytics suite.

This is an **internal-round prototype**. It needs **no API keys**: routing uses public OSRM road
servers, live incidents come from GDACS and USGS public feeds, and maps use public raster tiles.
Roads, facilities and ML predictions are clearly labelled demo/simulated data. Seeded demo incidents
are excluded from the incident list and dashboard so real web events and field reports are never
mixed with fabricated incidents. Weather is simulated unless an optional OpenWeatherMap key is set.
It is **not** production-grade or government-certified — every AI prediction is clearly labelled
**"AI Prediction (Demo)"**.

---

## Features

- **Interactive GIS Map** of the NER (Leaflet + OpenStreetMap)
  - Ten basemaps — **Map, Streets, Satellite, Hybrid, World Topo, World Street, Terrain, Light, Dark, Humanitarian** — with retina tiles where supported, scale bar and saved preference. No map API key needed (public tile services). Satellite/Hybrid/Esri styles automatically retry on a backup tile host before falling back to Streets.
  - Road segments colored by status (green = accessible, yellow = risky, orange = severely risky, red = blocked)
  - City / capital / town markers, warehouse & hospital markers, incident markers
  - Click a road to open detailed **Road Details** (accessibility, weather/landslide/disruption risk, 12-hour AI forecast, alternatives)
- **Dashboard** with live stat cards, an **AI Situation Panel**, risky-route listing, weather warnings and an active-incidents table sourced from real feeds plus field reports
- **Real-Road Route Planner** — drivable OpenStreetMap road geometry from public **Valhalla** and **OSRM** servers, with **Safest / Fastest / Shortest** modes, cargo/priority weighting, natural Google-Maps-style turn-by-turn steps, full-route map framing, incidents-near-route and a clear recommendation rationale. A built-in graph and direct estimate keep route planning working when live providers fail.
- **AI Risk Engine** — Random Forest-style Gradient Boosting done in `scikit-learn`, trained on synthetic-but-realistic data (`POST /api/predict-risk`)
- **12-Hour Disruption Forecast** per road
- **Live Incidents** — real, keyless events from **GDACS** (floods, fires, cyclones, droughts, earthquakes) and **USGS** (earthquakes), cached for 10 minutes, with region filters, source links and a live map. No seeded demo incidents are shown.
- **Incident Reporting** — report form, map location picker, image upload and **simulated CV image analysis** (clearly marked as prototype). A persistent side button opens the form from any public page; all 28 states + 8 UTs are available. Reports auto-refresh on open, on tab focus and every 20 seconds.
- **Alert Center** — weather, road, flood, landslide, bridge & logistics alerts
- **Logistics Command** — warehouses, fleet, supply requests and smart delivery prioritisation
- **Analytics** — time-series and distribution charts (Recharts) with state-wise filtering
- **Keyless fallback mode** — everything works without API keys; simulated/demo labels are shown where data is not real

---

## Tech Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Frontend  | React, TypeScript, Vite, Tailwind CSS, Lucide icons, Recharts     |
| Mapping   | Leaflet, React Leaflet, OpenStreetMap tiles                        |
| Backend   | Python, FastAPI, Pydantic                                          |
| Database  | SQLite-compatible (in-memory store by default for the demo)        |
| AI/ML     | scikit-learn (Gradient Boosting), numpy                            |
| Routing   | Public Valhalla + OSRM road services, polyline decoding, built-in graph fallback, transparent scoring |
| Live data | GDACS RSS and USGS FDSN feeds (keyless, proxied by the backend)    |

---

## Project Structure

```
NDRMS/
├── frontend/                  # React + Vite + TypeScript app
│   ├── src/
│   │   ├── components/        # reusable UI + map components
│   │   ├── pages/             # Dashboard, RoutePlanner, Incidents, Alerts, Logistics, Analytics
│   │   ├── layouts/           # App shell (sidebar + header)
│   │   ├── services/          # API client
│   │   ├── hooks/             # data-fetching hooks
│   │   ├── types/             # TypeScript interfaces
│   │   ├── data/              # demo fallback data
│   │   ├── utils/             # formatting helpers
│   │   └── state/             # global app context (toasts, demo mode)
│   ├── .env.example
│   └── vite.config.ts         # dev proxy /api -> localhost:8000
├── backend/                   # FastAPI + ML service
│   ├── app/
│   │   ├── main.py            # FastAPI app + CORS
│   │   ├── config.py          # settings (demo mode, DB url...)
│   │   ├── api/routes.py      # REST endpoints
│   │   ├── models/schemas.py  # domain models
│   │   ├── schemas/incident.py# request/response models
│   │   ├── services/          # weather, routing, live incidents, forecasting, aggregator, store, image analyzer
│   │   ├── ml/risk_model.py   # Gradient Boosting disruption predictor
│   │   └── data/demo_data.py  # realistic seeded NER data
│   ├── requirements.txt
│   └── .env.example
├── .env.example
└── README.md
```

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ (3.12/3.13 recommended; scikit-learn wheels for 3.14 are available)
- No external API keys required (public OSRM, GDACS, USGS and map tiles are keyless)

---

## Setup & Run

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
# source venv/bin/activate

pip install -r requirements.txt

# Optional: copy .env.example to .env to customise (keyless defaults)
copy ..\.env.example .env     # Windows
# cp .env.example .env        # macOS/Linux

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API docs are available at `http://127.0.0.1:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. The Vite dev server proxies `/api` to the backend, so no CORS configuration is needed.

> The app also has an **offline fallback** with bundled demo data for roads, facilities and map
> inputs — screens will still render (with a "Demo / simulated data (offline fallback)" notice)
> even if the backend isn't running. Live incidents and real-road routing need the backend.

### 3. Production-style build check (optional)

```bash
cd frontend
npm run build       # runs tsc + vite build, outputs to dist/
```

### 4. Single-service production run (publish-ready)

The API can serve the built frontend itself, so the whole product runs on one
URL with no CORS configuration:

```bash
cd frontend && npm run build
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

The backend auto-detects `frontend/dist`; set `FRONTEND_DIST=/absolute/path`
if the bundle lives elsewhere. `/api`, `/health` and `/docs` keep working, and
any other path falls back to the SPA (deep links like `/route-planner` work).

### Docker

```bash
docker build -t ndrms .
docker run --rm -p 8000:8000 -e OPENWEATHER_API_KEY=... ndrms
```

The multi-stage build compiles the frontend with Node and ships only the
bundle + Python runtime.

### Deploy on Render (free)

The public instance is running at **https://ner-smart-vujs.onrender.com**.

1. Push the project to GitHub. The included `.gitignore` keeps `.env`, the
   SQLite database and `node_modules` out of the repo.
2. In Render choose **New → Blueprint** and select the repo. `render.yaml`
   defines a free Docker web service with `/health` as the health check.
3. Optionally set `OPENWEATHER_API_KEY` when prompted; leave it empty to use
   simulated weather. **Never commit `backend/.env`** — it holds a real key.
4. Render returns a URL like `https://ner-smart-xxxx.onrender.com`.

`.github/workflows/keepalive.yml` pings `/health` every 10 minutes so the free
instance does not spin down before a demo. Update the URL inside that file if
you deploy to a different hostname. GitHub may delay scheduled runs, so open
the site once yourself before going on stage.

To host the frontend on shared hosting (InfinityFree, cPanel, Hostinger…) and
upload it with FileZilla, follow the step-by-step
**[DEPLOY-FTP.md — InfinityFree + FileZilla roadmap](DEPLOY-FTP.md)**. That
build keeps the API on Render and sets `VITE_API_BASE_URL` accordingly.

Free-plan notes:

- Instances sleep after ~15 minutes idle; the next request takes ~30–60 s.
- Free instances have ephemeral disk. Reported incidents and warehouse edits
  reset when the service restarts, then the demo seed data is recreated.
  Attach a Render Disk and set
  `DATABASE_URL=sqlite:////var/data/nersmart.db` to persist changes.
- Deploying the SPA and API separately (e.g. Cloudflare Pages + Render) also
  works: build the frontend with
  `VITE_API_BASE_URL=https://your-api.example.com/api` and add the frontend
  origin to the backend's `CORS_ORIGINS`.

---

## The Demo Flow

Follow this scripted journey end-to-end:

1. Open the **Dashboard** → see the NER map with active incidents and the AI Situation Panel.
2. Click **NH-10** on the map → Road Details shows accessibility, weather/landslide risk,
   disruption probability and the 12-hour AI forecast.
3. Go to **Route Planner** → choose From **Guwahati**, To **Tawang** (or GPS / map pin / global
   search), pick **Safest**, optionally set cargo/priority/vehicle → click **Plan route**.
4. Real drivable road alternatives appear on the map, with distance, ETA, safety score, incidents
   nearby and turn-by-turn directions. The **LIVE ROADS** badge confirms OSRM geometry; a
   **FALLBACK ROUTE** badge means the public providers were unavailable and the built-in graph
   was used instead. The planner still returns a route either way.
5. Go to **Incidents** → **Live Incidents** at the top shows real GDACS/USGS events with source
   links, filters and a map. Seeded demo incidents are not shown.
6. From the persistent side **Report Incident** button (or the page button), submit a field report —
   optionally upload an image to see the simulated CV analysis.
7. The marker appears in **Field Incident Reports**, road risk is recomputed, dashboard statistics
   update and a success toast confirms it.
8. Explore **Alert Center**, **Logistics** and **Analytics** for the full picture.
9. In **Logistics**, click **Add Warehouse** to register a depot with initial stock, or **Edit Supplies**
   on any depot to update stock levels, capacity and operational status.

No paid API or map token is needed. Live routing and live incidents use public services with the
backend as a keyless proxy.

---

## API Endpoints

| Method | Endpoint                        | Description                                                       |
| ------ | ------------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                       | Health probe (alias: `/api/health`)                               |
| GET    | `/api/dashboard`                | Dashboard summary stats (real + field incidents only)             |
| GET    | `/api/roads`                    | All road segments                                                 |
| GET    | `/api/roads/{id}`               | Single road detail                                                |
| GET    | `/api/incidents`                | Real live incidents + user field reports (no seeded demo incidents) |
| GET    | `/api/incidents/live`           | GDACS/USGS feed with `region=all|ner|india`, `limit`, `refresh`    |
| GET    | `/api/incidents/feed-status`    | Feed health, enabled sources and cache info                       |
| POST   | `/api/incidents`                | Report a new incident (recomputes road risk)                      |
| GET    | `/api/weather`                  | Weather readings                                                  |
| GET    | `/api/geocode/reverse`          | Reverse geocode a map pin via OSM Nominatim                       |
| GET    | `/api/geocode/search`           | Search for a place by name                                        |
| GET    | `/api/routes`                   | Road + city data for the map/inputs                               |
| POST   | `/api/routes/plan`              | Real-road planner: Valhalla + OSRM with graph/direct fallbacks, incident overlay |
| POST   | `/api/routes/optimize`          | Score existing road alternatives (origin/destination/cargo)       |
| POST   | `/api/predict-risk`             | ML disruption-risk prediction                                     |
| GET    | `/api/forecast/{roadId}`        | 12-hour disruption forecast for a road                            |
| GET    | `/api/alerts`                   | Alerts by category & severity                                     |
| GET    | `/api/logistics`                | Warehouses, fleet, supply requests                                |
| GET    | `/api/warehouses`               | All warehouses and current stock                                  |
| POST   | `/api/warehouses`               | Add a warehouse with initial supplies                             |
| PATCH  | `/api/warehouses/{id}`          | Edit supplies, capacity or status of a warehouse                  |
| GET    | `/api/analytics`                | Chart data, state-wise stats                                      |
| GET    | `/api/meta`                     | Cities, states, enums used by forms                               |

---

## Honesty & Labelling

- **Real:** live incidents from GDACS/USGS, drivable road geometry from public Valhalla and OSRM
  servers, OSM place search/reverse geocoding and public raster map tiles.
- **Simulated / demo:** road network, warehouses, hospitals, supply requests, weather fallback,
  image analysis, disruption forecasts and ML risk scores. This is not government or operational data.
- Seeded demo incidents `inc-001`–`inc-008` are excluded everywhere; the incident list, dashboard,
  alerts, analytics and route risk overlay use only live feed events and real user reports.
- ML predictions are **"AI Prediction (Demo)"**; the CV module is explicitly a *prototype* and
  **not** government-certified detection.
- The app labels demo/simulated and live content separately. No API keys are exposed in frontend
  code; the frontend talks to the backend only.

---

## Configuration

`.env.example` files define keyless defaults:

- `backend/.env.example` → app name/version, database URL, optional `OPENWEATHER_API_KEY`, routing
  and live-feed timeouts
- `frontend/.env.example` → `VITE_API_BASE_URL` (defaults to `/api` via the Vite proxy)

Useful backend settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_NAME` / `APP_VERSION` | `NDRMS` / `1.3.0` | Branding and health response |
| `ROUTING_TIMEOUT_SECONDS` | `8.0` | Per-provider OSRM timeout |
| `ROUTING_CACHE_TTL_SECONDS` | `600` | Route cache duration |
| `ROUTING_PROVIDERS` | `valhalla,osrm-public,osrm-de` | Ordered keyless road-routing providers |
| `LIVE_INCIDENTS_ENABLED` | `true` | Enable GDACS/USGS live incident feeds |
| `LIVE_INCIDENTS_CACHE_TTL_SECONDS` | `600` | Feed cache duration (fair use) |
| `LIVE_INCIDENTS_TIMEOUT_SECONDS` | `10.0` | Feed request timeout |
| `OPENWEATHER_API_KEY` | empty | Optional live weather; empty uses simulated weather |

Never commit `backend/.env` — it may contain a real weather key.

---

## License

Prototype code for the Smart India Hackathon 2026 internal round.