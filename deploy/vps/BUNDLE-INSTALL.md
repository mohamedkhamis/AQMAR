# AQMAR — install on the VPS (from this bundle)

> **You are using the git-clone flow — see [`README.md`](README.md), not this file.**
> This bundle path is the alternative for a VPS with **no** GitHub access: it
> carries the whole app + data + a `.bak` + secrets in one folder. The numbered
> scripts it runs are the same ones `README.md` documents.

This folder is a complete copy of the AQMAR admin site: the app, your data, a
fresh database backup, your secrets, and the deploy scripts. **No git needed.**

```
this-folder\
  INSTALL.md            <- you are here
  app\                  <- the whole application (copy to C:\AQMAR)
  database\
    aqmar_<stamp>.bak    <- the database backup to restore
```

> ⚠️ This bundle contains secrets — your `.env`, the Telegram `session\`, and the
> Gmail app password in `data\notify_settings.json`. Keep it private and
> **delete it from the VPS once everything works.**

---

## What you're setting up

| Piece | Where it ends up |
|---|---|
| Admin site (FastAPI) | IIS → `https://<your-domain>` |
| Database | SQL Server on the VPS (restored from the `.bak`) |
| 2-hourly Telegram scrape | Scheduled task (headless) |
| Nightly verify → publish → email | Scheduled task (headless) |

The public site (`aqmar.pages.dev` / GitHub Pages) is unaffected.

---

## Before you start — install these on the VPS (once)

`app\deploy\vps\01_prerequisites.ps1` checks all of these and tells you what's
missing:

1. **Windows Server** with **IIS** (`Install-WindowsFeature Web-Server, Web-Mgmt-Console`)
   and the **HttpPlatformHandler** module (<https://www.iis.net/downloads/microsoft/httpplatformhandler>).
2. **SQL Server** (Express is fine) with a default instance, plus **sqlcmd**.
3. **Python 3.11+** (64-bit) on PATH.
4. **ODBC Driver 17 for SQL Server**.
5. **ffmpeg** on PATH.
6. **git** on PATH with push credentials (nightly publish).
7. **claude CLI** on PATH, logged in as the service account (nightly AI verify) —
   *optional; skip it and the nightly just publishes already-verified rows.*
8. **win-acme** (`wacs.exe`) for the HTTPS certificate.

Plus: a **domain** pointing at the VPS IP, ports **80/443** open, and a
**service account** (e.g. `AqmarSvc`) you'll run everything as — its profile
holds git + claude logins, so **log in as that account for every step below.**

---

## Steps

Run these in an **elevated PowerShell** on the VPS.

### 1. Put the app in place

Copy this bundle's `app\` folder to **`C:\AQMAR`** (any path works; the scripts
adapt). Then:

```powershell
cd C:\AQMAR
.\deploy\vps\01_prerequisites.ps1        # fix any [MISS] before continuing
```

Your `.env`, `session\`, and `data\notify_settings.json` are already inside —
you do **not** need to hand-copy secrets. Open `.env` and set a **fresh strong**
`ADMIN_TOKEN` for the public box:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Restore the database

```powershell
.\deploy\vps\03_restore_db_vps.ps1 -BakFile <this-bundle>\database\aqmar_<stamp>.bak
```

It remaps the file paths to the VPS and prints the `dbo.martyrs` row count —
check it matches your local machine.

### 3. Build the Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -c "import easyocr; easyocr.Reader(['ar','en'])"   # ~100 MB model download
.\.venv\Scripts\python.exe scripts\status.py                                  # DB smoke test
```

### 4. Deploy IIS + HTTPS

```powershell
.\deploy\vps\04_iis_deploy_vps.ps1 -Domain admin.yourdomain.com
C:\path\to\win-acme\wacs.exe        # new cert -> AqmarAdmin site -> http-01
Invoke-WebRequest https://admin.yourdomain.com/api/health
```

### 5. Register the scheduled tasks (headless)

```powershell
.\deploy\vps\05_setup_tasks_vps.ps1 -RunAsUser "VPSNAME\AqmarSvc"
# prompts for the account password (stored encrypted by Task Scheduler)
```

### 6. Verify end-to-end

```powershell
Start-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape"
Get-Content .\logs\scrape_2hourly.log -Wait -Tail 30
Invoke-WebRequest https://admin.yourdomain.com/api/health
.\scripts\nightly_verify_publish.ps1 -DryRun
```

### 7. Clean up

Delete this bundle from the VPS (it holds secrets). Keep the copy at `C:\AQMAR`.

---

## Notes

- **Media:** all portrait photos are included. Raw OCR frames were **excluded**
  except the ~958 published covers (to keep the bundle small). New rows scraped
  on the VPS generate their own frames; only the admin "re-pick a cover" carousel
  for *pre-migration* rows needs the old raw frames. Re-run
  `build_bundle.ps1 -IncludeAllFrames` if you want them.
- **State:** `data\state.json` (scraper cursor) and
  `data\ai_batches\noted_ids.json` are included — without `state.json` the VPS
  would re-scrape from message 1 and overwrite corrected dates.
- **Full reference:** `app\deploy\vps\README.md` is the authoritative runbook;
  the scripts it names are identical to the ones you're running here.
- **Publish:** `git push origin master` updates both public sites; the old
  redundant "second push" is skipped automatically (`publish_core.ps1`). But the
  bundle flow assumes **no GitHub access** — if this VPS genuinely can't push,
  the nightly still verifies + commits locally; run `git push` when it can.
