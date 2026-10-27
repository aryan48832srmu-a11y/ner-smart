# NER-SMART

**AI-Powered Logistics & Accessibility Intelligence Platform for the North Eastern Region (NER)**

Internal **Smart India Hackathon 2026** prototype — demo-ready build.

> [!IMPORTANT]
> The core message of the platform:
> **"We don't simply find the shortest route. We find the safest and most reliable route based on accessibility, weather, terrain, incidents and logistics priority."**

---

## Overview

NER-SMART is a full-stack logistics & accessibility intelligence platform for India's North
Eastern Region (Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura).
It combines an interactive GIS map, an AI/ML disruption-risk engine, a transparent route-scoring
planner, incident reporting with simulated CV image analysis, a logistics command dashboard and an
analytics suite.

This is an **internal-round prototype**. It runs entirely locally, needs **no external API keys**,
and uses **simulated / demo data** for reliability. It is **not** production-grade and **not**
government-certified — every AI prediction is clearly labelled **"AI Prediction (Demo)"**.

---

## Features

- **Interactive GIS Map** of the NER (Leaflet + OpenStreetMap)
  - Road segments colored by status (green = accessible, yellow = risky, orange = severely risky, red = blocked)
  - City / capital / town markers, warehouse & hospital markers, incident markers
  - Click a road to open detailed **Road Details** (accessibility, weather/landslide/disruption risk, 12-hour AI forecast, alternatives)
- **Dashboard** with live stat cards, an **AI Situation Panel**, risky-route listing, weather warnings and an active-incidents table
- **Route Intelligence** — transparent route scoring across 3 alternatives with cargo/priority-weighted weights and a clear recommendation rationale
- **AI Risk Engine** — Random Forest-style Gradient Boosting done in `scikit-learn`, trained on synthetic-but-realistic data (`POST /api/predict-risk`)
- **12-Hour Disruption Forecast** per road
- **Incident Reporting** — report form, map location picker, image upload and **simulated CV image analysis** (clearly marked as prototype)
- **Alert Center** — weather, road, flood, landslide, bridge & logistics alerts
- **Logistics Command** — warehouses, fleet, supply requests and smart delivery prioritisation
- **Analytics** — time-series and distribution charts (Recharts) with state-wise filtering
- **Demo Mode** — everything works without external keys; a **DEMO MODE** badge is shown throughout

---

## Tech Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Frontend  | React, TypeScript, Vite, Tailwind CSS, Lucide icons, Recharts     |
| Mapping   | Leaflet, React Leaflet, OpenStreetMap tiles                        |
| Backend   | Python, FastAPI, Pydantic                                          |
| Database  | SQLite-compatible (in-memory store by default for the demo)        |
| AI/ML     | scikit-learn (Gradient Boosting), numpy                            |
| Routing   | Custom transparent scoring engine (OSRM/GraphHopper-ready)         |

---

## Project Structure

```
NER-SMART/
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
│   │   ├── services/          # weather, routing, forecasting, aggregator, store, image analyzer
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
- No external API keys required (Demo Mode)

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

# Optional: copy .env.example to .env to customise (Demo Mode is default)
copy .env.example .env        # Windows
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

> The app also has an **offline fallback** with bundled demo data — screens will still render
> (with a "Demo / simulated data (offline fallback)" notice) even if the backend isn't running.

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
docker build -t ner-smart .
docker run --rm -p 8000:8000 -e OPENWEATHER_API_KEY=... ner-smart
```

The multi-stage build compiles the frontend with Node and ships only the
bundle + Python runtime.

### Deploy on Render (free)

1. Push the project to GitHub. The included `.gitignore` keeps `.env`, the
   SQLite database and `node_modules` out of the repo.
2. In Render choose **New → Blueprint** and select the repo. `render.yaml`
   defines a free Docker web service with `/health` as the health check.
3. Optionally set `OPENWEATHER_API_KEY` when prompted; leave it empty to use
   simulated weather. **Never commit `backend/.env`** — it holds a real key.
4. Render returns a URL like `https://ner-smart-xxxx.onrender.com`.

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
2. Click **NH-10** on the map → Road Details shows accessibility ~64%, high weather/landslide risk,
   disruption probability **~78%** and the 12-hour AI forecast.
3. Go to **Route Planner** → select From **Guwahati**, To **Tawang**, Cargo **Medicines**,
   Priority **Emergency** → click **Find Safest Route**.
4. Three alternatives appear — the AI **recommends Route A** (~380 km) even though Route B is shorter,
   because A has better accessibility and lower disruption probability. The scoring weights are shown.
5. Go to **Incidents** → **Report Incident** → submit a simulated **Landslide** (optionally upload an
   image to see the simulated CV analysis).
6. The map adds the marker, road risk is recomputed, the dashboard statistics update, and a
   success toast confirms it.
7. Explore **Alert Center**, **Logistics** and **Analytics** for the full picture.
8. In **Logistics**, click **Add Warehouse** to register a depot with initial stock, or **Edit Supplies**
   on any depot to update stock levels, capacity and operational status. Changes persist to the database.

All of this runs without any external API.

---

## API Endpoints

| Method | Endpoint                 | Description                                        |
| ------ | ------------------------ | -------------------------------------------------- |
| GET    | `/health`                | Health probe (alias: `/api/health`)                |
| GET    | `/api/dashboard`         | Dashboard summary stats                            |
| GET    | `/api/roads`             | All road segments                                  |
| GET    | `/api/roads/{id}`        | Single road detail                                 |
| GET    | `/api/incidents`         | All field incidents                                |
| POST   | `/api/incidents`         | Report a new incident (recomputes road risk)       |
| GET    | `/api/weather`           | Weather readings                                   |
| GET    | `/api/routes`            | Road + city data for the map/inputs                |
| POST   | `/api/routes/optimize`   | Score route alternatives (origin/destination/cargo)|
| POST   | `/api/predict-risk`      | ML disruption-risk prediction                      |
| GET    | `/api/forecast/{roadId}` | 12-hour disruption forecast for a road             |
| GET    | `/api/alerts`            | Alerts by category & severity                      |
| GET    | `/api/logistics`         | Warehouses, fleet, supply requests                 |
| GET    | `/api/warehouses`        | All warehouses and current stock                   |
| POST   | `/api/warehouses`        | Add a warehouse with initial supplies              |
| PATCH  | `/api/warehouses/{id}`   | Edit supplies, capacity or status of a warehouse   |
| GET    | `/api/analytics`         | Chart data, state-wise stats                       |
| GET    | `/api/meta`              | Cities, states, enums used by forms                |

---

## Honesty & Labelling

- All data is **simulated demo data** — it is not real government or operational data.
- ML predictions are **"AI Prediction (Demo)"**; the CV module is explicitly a *prototype* and
  **not** government-certified detection.
- The app displays **DEMO MODE** / **Demo data** badges to make this clear.
- No API keys are exposed in frontend code; the frontend talks to the backend only.

---

## Configuration

`.env.example` files define demo defaults:

- `backend/.env.example` → `DEMO_MODE=true`, database URL, optional `OPENWEATHER_API_KEY` placeholder
- `frontend/.env.example` → `VITE_API_BASE_URL` (defaults to `/api` via the Vite proxy)

Set `DEMO_MODE=false` and provide a real weather key if you later integrate a live weather source.

---

## License

Prototype code for the Smart India Hackathon 2026 internal round.