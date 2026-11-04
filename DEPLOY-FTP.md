# Publishing NER-SMART with FileZilla (FTP / SFTP)

FileZilla is a file-transfer client: it copies files to a web host you already
own. It cannot host the site by itself, and **shared hosting cannot run the
Python/FastAPI backend**.

So the working arrangement is:

| Part | Where it runs | How it gets there |
| --- | --- | --- |
| React frontend (static files) | Your own domain / shared hosting | Upload with FileZilla |
| API, AI risk engine, database | Render (already live) | Automatic from GitHub |

The frontend build in this package already points at the live API at
`https://ner-smart-vujs.onrender.com/api`, so the two halves work together
with no server-side code on your hosting.

---

## What you need from your hosting provider

Look in your host's control panel (cPanel, Plesk, Hostinger hPanel, etc.) for
**FTP Accounts** / **FTP Access**. You need four values:

| Field | Typical value |
| --- | --- |
| Host | `ftp.yourdomain.com` (or an IP address) |
| Username | `user@yourdomain.com` |
| Password | the FTP password you set |
| Port | `21` for FTP, `22` for SFTP |

If your host offers SFTP (port 22), prefer it — the password is encrypted in
transit. If not, plain FTP on port 21 is fine for static files.

You also need to know the **web root** folder. On cPanel it is usually
`public_html`; on some hosts it is `httpdocs` or `www`. Files placed there are
served at `https://yourdomain.com/`.

---

## InfinityFree specifically

InfinityFree gives you free hosting on a free subdomain such as
`yourname.infinityfreeapp.com` (or `.rf.gd`, `.wuaze.com`, `.42web.io`).
Everything below applies to it.

| Setting | Value |
| --- | --- |
| Control panel | <https://dash.infinityfree.com> → **Control Panel** (vPanel) |
| FTP host | `ftpupload.net` |
| FTP port | `21` (plain FTP; SFTP is not offered) |
| FTP username | `if0_XXXXXXXX` — shown under **FTP Accounts** |
| FTP password | the password you set for that FTP account |
| Web root | **`htdocs`** |
| Site URL | `http://yourname.infinityfreeapp.com` |

Steps:

1. In vPanel, open **FTP Accounts** and note the username (`if0_...`). If there
   is no FTP account yet, create one and copy its password.
2. In FileZilla connect to `ftpupload.net` port `21` with that username and
   password.
3. Open **`htdocs`** on the server side and delete InfinityFree's placeholder
   files (`index2.html`, `default.php`) if present.
4. Upload the contents of `D:\SIH project\frontend\dist-ftp` (everything, not
   the folder itself): `index.html`, `favicon.svg`, the `assets` folder and
   `.htaccess`. Enable **Server → Force showing hidden files** so `.htaccess`
   is visible.
5. Visit `http://yourname.infinityfreeapp.com`. The first visit may show
   InfinityFree's "checking your browser" screen briefly — that is their
   anti-bot protection, not the app.

Two InfinityFree quirks worth knowing:

- **No SSL on free subdomains (usually).** The site then loads over `http://`.
  That is fine: the API is `https://`, and an HTTP page may call an HTTPS API.
  If your plan offers a free certificate under **SSL/TLS**, install it anyway.
- **The API must allow your domain.** The backend code in this repo already
  defaults to `CORS_ORIGINS="*"`, but the live Render service still runs an
  older build. Until it is redeployed, set `CORS_ORIGINS` to `*` in the Render
  dashboard (see below), otherwise the page loads but every data request is
  blocked by the browser.

### Enable the API for your domain on Render

1. Open <https://dashboard.render.com> → **ner-smart** → **Environment**.
2. Add a variable: key `CORS_ORIGINS`, value `*`.
3. Click **Save Changes**. Render restarts the service in ~1 minute.
4. Reload your InfinityFree URL — the dashboard should fill with live data.

(Alternatively, click **Manual Deploy → Deploy latest commit** on the Render
service. That ships version 1.2.0, which enables wildcard CORS by default.)

---

## Upload steps (FileZilla)

1. Install FileZilla Client: <https://filezilla-project.org/download.php?type=client>
2. Open **File → Site Manager → New site** and fill in:
   - **Protocol:** SFTP if available, otherwise FTP
   - **Host / Port / User / Password** from the table above
   - Click **Connect** (accept the host key if SFTP asks)
3. On the left pane, open `D:\SIH project\frontend\dist-ftp`.
4. On the right pane, open your web root (e.g. `public_html`).
5. **Delete old files first** if the folder has a previous site (keep
   `.well-known` if it exists — it is used for SSL certificates).
6. Select everything in the left pane — `index.html`, `favicon.svg`, the
   `assets` folder **and** `.htaccess` — then right-click → **Upload**.
   - `.htaccess` is hidden on some systems. In FileZilla use
     **Server → Force showing hidden files** so you can see it.
7. Wait for the queue to finish, then open `https://yourdomain.com/`.

The zip `ner-smart-website.zip` in the project root contains the same files if
you prefer to upload one archive and extract it in cPanel's File Manager.

---

## Important details

- **Upload to the domain root, not a subfolder.** The build references
  `/assets/...` with absolute paths. If you must use a subfolder, rebuild with
  `npx vite build --base=/subfolder/`.
- **`.htaccess` is required** for deep links like `/route-planner` and
  `/logistics` on Apache/LiteSpeed hosts. Without it those URLs return 404.
  If your host runs nginx or IIS, `.htaccess` is ignored — use the host's
  "SPA fallback / rewrite to index.html" setting instead.
- **HTTPS:** enable the free SSL certificate in your hosting panel so the site
  loads over `https://`. The API is HTTPS, and browsers block mixed content.
- **Updating the site:** rebuild and re-upload. From the project root:

  ```powershell
  cd frontend
  $env:VITE_API_BASE_URL = "https://ner-smart-vujs.onrender.com/api"
  npx tsc -b
  npx vite build --outDir dist-ftp --emptyOutDir
  ```

  Then upload the new `index.html` and `assets` folder. Replacing old hashed
  assets is optional — the new entry point references the new filenames. The
  frontend is also served directly by Render, so the API URL above always
  stays valid.

---

## If you do not actually have shared hosting

FileZilla has nothing to connect to without an FTP account. Easier free
alternatives that need no FTP at all:

- **Render** — already hosting the whole app at
  <https://ner-smart-vujs.onrender.com>. Add a custom domain under
  *Settings → Custom Domains*.
- **Netlify Drop** — <https://app.netlify.com/drop>: drag the
  `frontend/dist-ftp` folder onto the page and you get a public HTTPS URL in
  seconds.
- **Cloudflare Pages** — connect the GitHub repo, build command
  `npm run build`, output directory `dist`, and set
  `VITE_API_BASE_URL=https://ner-smart-vujs.onrender.com/api`.

Those options are faster and give you HTTPS automatically, but they will not
use FileZilla.
