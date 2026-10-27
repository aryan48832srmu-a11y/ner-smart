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
