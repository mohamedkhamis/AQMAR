# AQMAR — VPS migration runbook

Move the AQMAR admin site (IIS) + the two scheduled tasks + the SQL Server
database onto your own Windows Server VPS, reachable publicly over HTTPS.

This folder is **self-contained** and does not change the existing local
scripts (`scripts/iis_deploy.ps1`, `scripts/setup_*_trigger.ps1`) — those keep
working on your dev machine. Everything here is run **on the VPS** unless a step
says *(run on your LOCAL machine)*.

---

## What moves where

```
YOUR DEV MACHINE                         YOUR VPS (Windows Server)
──────────────────                       ─────────────────────────
SQL Server  aqmar  ──backup .bak──▶      SQL Server  aqmar   (restored)
IIS admin :8082 (local)         ▶        IIS admin  https://<your-domain>
2-hourly scrape task            ▶        2-hourly scrape   (headless)
nightly verify+publish task     ▶        nightly verify+publish (headless)
.env / session / notify_settings ─copy─▶ same files (gitignored — hand-carried)
```

The **public site** (`https://aqmar.pages.dev`, GitHub Pages) is unaffected —
it still deploys from `master` on push. The VPS runs the *admin portal* (the
live-data FastAPI app), which also serves the SPA read-only to anonymous
visitors, so it can double as a public mirror if you ever drop Cloudflare.

## Decisions baked into these files

| Choice | Value |
|---|---|
| Database | Installed **on the VPS**; current DB restored from a backup |
| Site access | **Public** — your domain, HTTPS via win-acme (Let's Encrypt) |
| Tasks | **Both** — 2-hourly scrape + nightly verify→publish→email |
| Task logon | **Headless** — a service account with a stored password (runs logged-out) |

---

## Prerequisites to install on the VPS (once)

Install these **before** running any script here. `01_prerequisites.ps1` checks
that they are all present and tells you what is missing.

1. **Windows Server** with the **Web Server (IIS)** role, plus these IIS
   features: *CGI is NOT needed*; you DO need the base IIS + the
   **HttpPlatformHandler** module (separate download).
   - IIS: `Install-WindowsFeature Web-Server, Web-Mgmt-Console`
   - HttpPlatformHandler: <https://www.iis.net/downloads/microsoft/httpplatformhandler>
2. **SQL Server** (Express is fine for this workload) with a default instance,
   plus **sqlcmd** (SQL Server command-line tools).
3. **Python 3.11+** (64-bit), on PATH.
4. **ODBC Driver 17 for SQL Server**
   (<https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server>).
5. **ffmpeg** on PATH (frame extraction for OCR).
6. **git** on PATH, with credentials that can `push` to your GitHub repo
   (needed by the nightly publish). A credential manager or a PAT.
7. **claude CLI** on PATH, **already authenticated** as the service account
   (needed by the nightly AI-verify phase). Run `claude` once interactively as
   that account to log in. *If you don't want AI verification on the VPS, you
   can skip this — the nightly logs "claude CLI not found — skipping verify"
   and still publishes already-verified rows.*
8. **win-acme** (`wacs.exe`) for the TLS certificate
   (<https://www.win-acme.com/>).

A **domain name** whose A record points at the VPS's public IP, and firewall
access to ports **80** and **443** from the internet (ACME + HTTPS).

---

## The service account

Both scheduled tasks run **headless with stored credentials**, so they need a
Windows account whose password you'll store in Task Scheduler. The simplest and
recommended choice is to do the entire setup **while logged in as that account**
so that its user profile holds everything the tasks rely on:

- the `.env`, `session/`, and `data/notify_settings.json` files (under the repo),
- the **git** credentials (in the account's credential store),
- the **claude CLI** login (in the account's home dir).

Use a dedicated local account (e.g. `AqmarSvc`) or your normal VPS admin
account. Whatever you pick, log in as it for every step below and pass the same
account to `05_setup_tasks_vps.ps1`.

---

## Steps (in order)

> Open an **elevated** PowerShell (Run as administrator) on the VPS for the IIS,
> firewall, and SQL steps.

### 0. Get the code onto the VPS

```powershell
git clone https://github.com/mohamedkhamis/AQMAR.git C:\AQMAR
cd C:\AQMAR
```

Any path works — the scripts resolve it. This runbook assumes `C:\AQMAR`.

### 1. Check prerequisites

```powershell
.\deploy\vps\01_prerequisites.ps1
```

Fix anything it reports as **MISSING** before continuing.

### 2. Back up the database *(run on your LOCAL machine)*

```powershell
.\deploy\vps\02_backup_db_local.ps1
```

This writes `aqmar_YYYYMMDD_HHMMSS.bak`. Copy that file to the VPS (RDP
clipboard, a file share, or `scp`). Note the path where you drop it.

### 3. Restore the database on the VPS

```powershell
.\deploy\vps\03_restore_db_vps.ps1 -BakFile C:\path\to\aqmar_20260101_030405.bak
```

Verifies the row count afterwards so you can confirm the data made it.

### 4. Carry over the secrets (gitignored — not in the clone)

Copy these from your local repo to the **same relative paths** on the VPS:

| File / dir | What it is |
|---|---|
| `.env` | Telegram creds, DB conn string, `ADMIN_TOKEN` |
| `session/` (and any `*.session`) | Authenticated Telegram session |
| `data/notify_settings.json` | Gmail app password + report recipients |

Then edit `.env` on the VPS from `deploy\vps\.env.vps.example` as a guide —
the DB line stays `SERVER=localhost;...;Trusted_Connection=yes` because the DB
now lives on the VPS.

### 5. Build the Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# Warm up EasyOCR's model download (first run pulls ~100 MB):
.\.venv\Scripts\python.exe -c "import easyocr; easyocr.Reader(['ar','en'])"
# Smoke-test the DB connection:
.\.venv\Scripts\python.exe scripts\status.py
```

### 6. Deploy IIS with your domain

```powershell
.\deploy\vps\04_iis_deploy_vps.ps1 -Domain admin.yourdomain.com
```

This generates a correct `web.config` for this machine's path, creates the app
pool + site bound to your domain on port 80, opens the firewall for 80/443,
and grants the IIS app-pool identity access to the `aqmar` DB. After it
finishes, issue the certificate:

```powershell
# win-acme: pick "N" (new cert), the AQMAR site, http-01 validation.
C:\path\to\win-acme\wacs.exe
```

win-acme adds the HTTPS (443) binding and a daily auto-renew task. Test:
`https://admin.yourdomain.com/api/health`.

### 7. Register the scheduled tasks (headless)

```powershell
.\deploy\vps\05_setup_tasks_vps.ps1 -RunAsUser "VPSNAME\AqmarSvc"
# prompts for the account password (stored encrypted by Task Scheduler)
```

Registers **both** tasks to run whether logged on or not, and grants that
service account its own SQL login + `db_owner` (the tasks connect with Windows
auth as this account). Verify:

```powershell
schtasks /query /tn "AqmarTofan 2-Hourly Scrape" /v /fo LIST | findstr "Next Run"
schtasks /query /tn "AqmarTofan Nightly Verify+Publish" /v /fo LIST | findstr "Next Run"
```

### 8. End-to-end verification

```powershell
# scrape once, watch the log
Start-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape"
Get-Content .\logs\scrape_2hourly.log -Wait -Tail 30

# admin site loads over HTTPS
Invoke-WebRequest https://admin.yourdomain.com/api/health

# nightly dry-run (no publish, no email) if the script supports -DryRun
.\scripts\nightly_verify_publish.ps1 -DryRun
```

---

## Security notes (public admin portal)

- The admin portal is a **write-capable** interface. Every write endpoint is
  gated by `ADMIN_TOKEN`, so make it long and random
  (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) and keep it
  only in the VPS `.env` and your browser session.
- HTTPS is mandatory here (chosen) — the token must never travel in clear text.
- Even public, consider adding an IIS IP allow-list rule for the write routes,
  or front the site with Cloudflare, if only you use the editor.
- Keep the VPS patched; the box now holds the Telegram session, the Gmail app
  password, and git push credentials.

## Rollback

Nothing here is destructive to your local machine. To undo on the VPS:

```powershell
Unregister-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape" -Confirm:$false
Unregister-ScheduledTask -TaskName "AqmarTofan Nightly Verify+Publish" -Confirm:$false
& $env:windir\System32\inetsrv\appcmd.exe delete site AqmarAdmin
& $env:windir\System32\inetsrv\appcmd.exe delete apppool AqmarAdmin
# DB: DROP DATABASE aqmar   (only if abandoning the VPS entirely)
```

## Known caveat carried from the main repo

`publish.ps1` / the nightly publish currently **abort at the public-site sync**
because `SITE_REPO_URL` equals `origin`'s push URL (the two-repo split in
`docs/superpowers/plans/2026-07-22-…` Task 12 was never done). Until that split
is finished, the nightly will scrape + AI-verify + commit the private backup but
stop before pushing the public site. See the main `CLAUDE.md` "Publish" note.
That is a pre-existing condition, not something this migration introduces.
