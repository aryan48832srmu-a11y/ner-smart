# Go live on InfinityFree with FileZilla — step-by-step roadmap

**Time needed:** about 20 minutes, most of it waiting for uploads.
**What goes where:** the React site is uploaded to InfinityFree as static files;
the Python API, AI risk engine, real-road routing and live incident feeds stay on
Render. The build in `frontend/dist-ftp` already points at
`https://ner-smart-vujs.onrender.com/api`, so no server-side code is needed on
InfinityFree. Routing (OSRM) and live incidents (GDACS/USGS) are keyless and are
proxied through Render, so the browser needs no API token.

```
Visitor ──► yourname.infinityfreeapp.com   (HTML/CSS/JS uploaded by FileZilla)
                    │  fetch() calls
                    ▼
            ner-smart-vujs.onrender.com/api (FastAPI + SQLite + OSRM/GDACS/USGS proxy)
```

---

## Phase 0 — Collect these first

- [ ] InfinityFree account (free, no card): <https://www.infinityfree.com>
- [ ] A free subdomain chosen during signup, e.g. `ndrms.rf.gd`
- [ ] FileZilla Client: <https://filezilla-project.org/download.php?type=client>
- [ ] Access to <https://dashboard.render.com> (same GitHub account)
- [ ] This folder: `D:\SIH project\frontend\dist-ftp`
      (or the zip `D:\SIH project\ndrms-website.zip`)

---

## Phase 1 — Make the API accept your domain (Render, ~2 min)

From backend v1.2.1 onward the public demo allows cross-origin calls by
default (`CORS_ALLOW_ALL=true`), so this step is usually automatic. Do it only
if the site still shows an *"offline cached data"* banner after loading.

- [ ] Open <https://dashboard.render.com> → service **ner-smart** → **Environment**
- [ ] Add variable: key `CORS_ORIGINS`, value `*`
- [ ] Add variable: key `CORS_ALLOW_ALL`, value `true`
- [ ] Click **Save Changes** and wait for the service to restart (~1 min)
- [ ] **Manual Deploy → Deploy latest commit** — required after this update
      (ships v1.3.0 with NDRMS branding, real-road routing and live GDACS/USGS incidents)

Verify from PowerShell (replace the URL with your InfinityFree address):

```powershell
curl.exe -s -D - -o NUL -H "Origin: http://ndrms.rf.gd" `
  https://ner-smart-vujs.onrender.com/api/dashboard
```

Look for a line `access-control-allow-origin: ...`. If it is missing, the
environment variable was not saved — repeat the step.

---

## Phase 2 — Create the hosting account (~5 min)

- [ ] Sign in at <https://dash.infinityfree.com>
- [ ] **Create Account** → choose **Free Subdomain** (or use a domain you own)
- [ ] Pick a name, e.g. `ndrms` → your site becomes
      `http://ndrms.rf.gd` (availability varies by extension)
- [ ] Select the **free hosting** plan and create the account
- [ ] Wait until the account shows **Active** (usually instant, up to 15 min)

Write down the site URL: `http://__________________________`

---

## Phase 3 — Get the FTP details (~1 min)

In the InfinityFree client area, open **Control Panel (vPanel) → FTP Accounts**,
or the account's **FTP details** box.

| Field | Value |
| --- | --- |
| Host | `ftpupload.net` |
| Port | `21` |
| Protocol | FTP |
| Username | `if0_XXXXXXXX` (from vPanel) |
| Password | your InfinityFree / FTP password |
| Web root | **`htdocs`** |

---

## Phase 4 — Upload the site (~5 min)

- [ ] Install and open FileZilla
- [ ] **File → Site Manager → New site**
- [ ] Protocol **FTP**, Host `ftpupload.net`, Port `21`, enter username + password
- [ ] **Connect** (accept any certificate prompt)
- [ ] **Server → Force showing hidden files** (needed to see `.htaccess`)
- [ ] Right pane: open **`htdocs`**
- [ ] Delete the placeholder `index2.html` / `default.php` if present
      (do not delete `.well-known`)
- [ ] Left pane: open `D:\SIH project\frontend\dist-ftp`
- [ ] Select the four items and drag them into `htdocs`:
      - [ ] `index.html`
      - [ ] `favicon.svg`
      - [ ] `assets` folder (contains the JS + CSS)
      - [ ] `.htaccess`
- [ ] Check the transfer queue: **Failed transfers = 0**

Do **not** upload the whole project. Only these files belong on the web host.

---

## Phase 5 — Verify it is really live (~3 min)

- [ ] Open `http://your-site.rf.gd`
- [ ] First visit may show InfinityFree's "checking your browser" screen briefly
- [ ] The dashboard should show numbers from the API — **not** an "offline cached data" banner
- [ ] **Incidents → Live Incidents** shows real GDACS/USGS events with source links,
      source badges and a **REAL FEEDS** pill. An empty list is valid if the feeds are quiet —
      demo incidents are deliberately never substituted
- [ ] **Analytics** page shows all 7 charts with bars/lines. If an amber
      *"Offline demo data"* badge appears instead, repeat **Phase 1**
- [ ] The map shows roads, city dots and incidents; try the **Map style** dropdown
      (Map, Streets, Satellite, Hybrid, World Topo, World Street, Terrain, Light, Dark, Humanitarian)
      at the top-right of the map
- [ ] **Route Planner → Plan route** returns real drivable roads with a **LIVE ROADS**
      badge, distance/ETA cards, incident overlay and directions. A **FALLBACK ROUTE** badge
      is acceptable (public OSRM timeout) but a route must still be returned
- [ ] Reload the page while on `/logistics` — it must still load (that proves
      `.htaccess` is working)
- [ ] Open the site on a phone with mobile data (not your Wi-Fi) to confirm it is
      genuinely public

If your plan offers **SSL/TLS** in vPanel, enable the free certificate and use
`https://`. The site works over `http://` too, because the API is `https://`.

---

## Phase 6 — Share it

- [ ] Render URL (everything on one origin):
      <https://ner-smart-vujs.onrender.com>
- [ ] InfinityFree URL (your domain, same app)
- [ ] Generate a QR code for judges:
      `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=<your-url>`
- [ ] Open the site once 10 minutes before the demo (Render free tier sleeps)

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Blank white page | Files uploaded to the wrong folder, or `assets` missing | Upload everything into `htdocs` itself, not a subfolder |
| Page loads, banner "Live API unreachable — offline cached data" | CORS not enabled, or Render is cold | Repeat **Phase 1**; wait 60 s and reload |
| 404 when refreshing `/logistics` or `/route-planner` | `.htaccess` missing/ignored | Re-upload `.htaccess`; enable "Force hidden files"; on nginx hosts use the SPA-fallback setting |
| Map area blank, rest of UI fine | Tile host blocked on your network | Satellite/Hybrid/World Topo/World Street retry on a backup Esri host, then fall back to **Streets**; the **Map style** dropdown also lets you switch sources manually |
| "This site can't be reached" | Account still pending or domain not added | Wait for **Active**, then reload |
| 530 / 403 on FTP login | Wrong username or password | Copy them again from vPanel → FTP Accounts |
| Upload stops at 0% repeatedly | Passive mode issue | FileZilla → Edit → Settings → Connection → FTP → Passive; or try port 21 with "Require explicit FTP over TLS" off |
| Live Incidents empty or shows an error | GDACS/USGS temporarily down, or the Render deploy is still old | Click **Refresh**; if it persists, run **Manual Deploy → Deploy latest commit** on Render |
| Route Planner shows **FALLBACK ROUTE** | Public OSRM timeout/rate limit | Expected safety net — the route is still usable; retry after a minute or use **Fastest/Shortest** |
| Edits disappear after a while | Render free tier resets its SQLite DB on restart | Expected for the demo; attach a Render Disk for persistence. Simulated roads/facilities are re-seeded, but seeded demo incidents are excluded from the incident list |
| First visit takes 30–60 s | Render free instance was asleep | Open the site before the demo; the keep-alive workflow helps but GitHub throttles it |

---

## Updating the site later

```powershell
cd "D:\SIH project\frontend"
$env:VITE_API_BASE_URL = "https://ner-smart-vujs.onrender.com/api"
npm run build:ftp
```

Then upload the new `index.html` and the new files in `assets` (the
`.htaccess` only needs uploading once). The old hashed asset files can be left
in place or removed; the new `index.html` points at the new filenames.

If backend code changed (routing, live feeds, CORS, models), also push the commit
and run **Render → Manual Deploy → Deploy latest commit**. Static-only changes
do not need a Render deploy.

---

## What lives where

| Part | Host | Notes |
| --- | --- | --- |
| React UI (`dist-ftp`) | InfinityFree | Static files, free, no Python needed |
| API + AI model + SQLite | Render | Free tier; sleeps when idle |
| Road geometry | Public OSRM | Fetched by Render; no key; graph fallback on failure |
| Live incidents | GDACS + USGS | Fetched/cached by Render; no key; no demo substitution |
| Map tiles | CARTO / OpenStreetMap | Loaded directly by the browser |
| Source code + docs | GitHub | <https://github.com/aryan48832srmu-a11y/ner-smart> |

## Limitations you should know (and can state openly)

- The backend cannot run on InfinityFree free hosting — it needs Python, which
  shared hosting does not provide. That is why the API stays on Render.
- Render free instances sleep after ~15 minutes of inactivity; the first request
  then takes 30–60 s. Open the site once before demoing.
- Render's free disk is ephemeral: reported incidents and warehouse edits reset
  when the service restarts. Simulated roads/facilities are re-seeded, but seeded
  demo incidents are excluded from the incident list and dashboard.
- Weather is simulated unless `OPENWEATHER_API_KEY` is set in Render.
- Public OSRM and feed services can rate-limit or fail; the UI shows a
  **FALLBACK ROUTE** or an empty live-incident list instead of fabricated data.

---

## Rollback

Keep a copy of the previous `dist-ftp` folder (or the previous zip) before
uploading a new build. To roll back, delete `index.html`/`assets` in `htdocs`
and upload the old set again. `.htaccess` does not need to change.
