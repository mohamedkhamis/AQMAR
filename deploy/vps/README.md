# AQMAR — VPS migration runbook

Move the whole AQMAR back end onto your Windows Server 2022 VPS:

- **SQL Server** database (`aqmar`) — restored from a backup
- **OCR pipeline** — ffmpeg + EasyOCR, run by the scheduled tasks
- **IIS admin portal** — `http://localhost:8082`, reached by RDP (not public)
- **2 scheduled tasks** — 2-hourly Telegram scrape · nightly verify → publish
- **Publish** — `git push origin master` from the VPS updates both public sites

The public sites (`https://aqmar.pages.dev`, `https://mohamedkhamis.github.io/AQMAR/`)
are unaffected — they build from `master` on every push, whichever machine pushes.

Everything here runs **on the VPS** unless a step says *(LOCAL machine)*.
The existing dev-box scripts (`scripts/iis_deploy.ps1`, `scripts/setup_*_trigger.ps1`)
are untouched and keep working on your dev machine.

---

## Decisions baked into these scripts

| Choice | Value |
|---|---|
| IIS exposure | **Local only** — `http://localhost:8082`, reached via RDP. No domain, no TLS, no inbound ports. |
| Database | **On the VPS**, restored from a `.bak` taken on the dev box |
| Tasks | **Both** — 2-hourly scrape (00,02,…,22) + nightly verify→publish→email at **22:15** |
| Task logon | **Headless** — runs as your existing VPS admin account, whether logged in or not (password stored by Task Scheduler), survives reboot |
| AI date-verify | **Kept** — the nightly runs headless `claude` to fix/fill card dates before publishing |
| Publish | `git push origin master` **is** the publish; the old redundant "second push" is skipped automatically |

To publish the admin portal on the internet later, see **[If you go public later](#if-you-go-public-later)**.

---

## Prerequisites — install on the VPS once

`01_prerequisites.ps1` checks every item below and prints `PASS` / `MISS`.
Install the `MISS` items, then re-run it until it's all green.

| # | Item | Install (elevated PowerShell) |
|---|---|---|
| 1 | **IIS** + management console | `Install-WindowsFeature Web-Server, Web-Mgmt-Console` |
| 2 | **HttpPlatformHandler** module | Download the x64 installer from <https://www.iis.net/downloads/microsoft/httpplatformhandler> (needs IIS first) |
| 3 | **SQL Server 2022 Express**, default instance | Download from Microsoft. In setup: *Database Engine* only, instance name **`MSSQLSERVER`** (default), Windows auth. Add your admin account as **sysadmin**. |
| 4 | **sqlcmd** (classic) | "Microsoft Command Line Utilities 15 for SQL Server" MSI (or tick the tools in SQL Server setup) |
| 5 | **ODBC Driver 17 for SQL Server** (x64) | MSI from Microsoft. *(Driver 18 also works if you change the `DRIVER={…}` token in `.env` to match.)* |
| 6 | **Python 3.11** (x64), on PATH | `winget install -e --id Python.Python.3.11` — matches the dev-box venv exactly |
| 7 | **ffmpeg**, on PATH | `winget install -e --id Gyan.FFmpeg` |
| 8 | **git**, on PATH, with push creds | You already have this ("my github work there"). Confirm with step 7 below. |
| 9 | **Node.js LTS + claude CLI** | `winget install -e --id OpenJS.NodeJS.LTS` then `npm i -g @anthropic-ai/claude-code` |

No domain, no DNS, no firewall change, no win-acme — this is a local-only portal.

---

## The run-as account

Both tasks and the publish run **headless as one Windows account** whose profile holds:

- your **git** push credentials (Credential Manager),
- the **claude CLI** login (`%USERPROFILE%\.claude`),
- the `.env`, `session\`, `data\notify_settings.json`, `data\state.json` files under the repo.

Use the **existing VPS admin account** you already log in with and that already
does `git push`. **Log in as that account for every step below.**
`05_setup_tasks_vps.ps1` defaults its `-RunAsUser` to whoever runs it.

---

## Steps (in order)

Open an **elevated PowerShell** (Run as administrator) on the VPS. If scripts are
blocked: `Set-ExecutionPolicy -Scope Process Bypass`.

### 0. The code is already on the VPS

You've cloned it. Confirm and prep:

```powershell
cd C:\AQMAR                    # wherever your clone is; scripts resolve the path
git checkout master
git pull
New-Item -ItemType Directory -Force logs | Out-Null

# The nightly runs `git commit`, so a git identity must be set on the VPS.
git config user.email          # if this prints nothing, set both:
#   git config --global user.name  "Your Name"
#   git config --global user.email "you@example.com"
```

### 1. Check prerequisites

```powershell
.\deploy\vps\01_prerequisites.ps1
```

Fix every `MISS` before continuing.

### 2. Back up the database *(LOCAL machine)*

```powershell
.\deploy\vps\02_backup_db_local.ps1        # -> deploy\vps\aqmar_<stamp>.bak
.\deploy\vps\00_gather_secrets_local.ps1   # -> ..\AQMAR-secrets\  (the 5 gitignored files)
```

A fresh `.bak` may already be sitting in `deploy\vps\` (shipped with this
runbook). Take a new one if your local data has moved on since.

Copy **both** the `.bak` and the `AQMAR-secrets` folder to the VPS (RDP drive
redirection, a private file share, or `scp`). Treat them as secret.

### 3. Restore the database on the VPS

```powershell
.\deploy\vps\03_restore_db_vps.ps1 -BakFile C:\path\to\aqmar_<stamp>.bak
```

It remaps the data/log file paths to this machine and prints the `dbo.martyrs`
row count — **cross-check it against the dev box** before trusting it.

### 4. Drop in the gitignored files + set a fresh token

Copy the **contents** of the `AQMAR-secrets` folder into `C:\AQMAR\` (merge,
keep the relative structure). That lands:

| Path | What |
|---|---|
| `.env` | Telegram creds, DB conn string, `ADMIN_TOKEN` |
| `session\` (+ any `*.session`) | authenticated Telegram login |
| `data\notify_settings.json` | Gmail app password + report recipients |
| `data\state.json` | **scraper cursor — without it the VPS re-scrapes from msg 1 and overwrites corrected dates** |
| `data\ai_batches\noted_ids.json` | nightly "reviewed, unverifiable" skip list |

Then edit `.env` (use `deploy\vps\.env.vps.example` as the guide) and set a
**fresh** `ADMIN_TOKEN` for this box:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

The DB line stays `SERVER=localhost;…;Trusted_Connection=yes` — the database is
local to the VPS now. Leave `SITE_REPO_URL` unset.

### 5. Build the Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# Warm EasyOCR's model download (~100 MB, one time):
.\.venv\Scripts\python.exe -c "import easyocr; easyocr.Reader(['ar','en'])"
# Smoke test — prints the SQL Server row counts (no traceback) AND
# "Last processed msg_id: <N>" which confirms data\state.json landed:
.\.venv\Scripts\python.exe scripts\status.py
```

EasyOCR runs on **CPU** here (no GPU needed) — fine for ~5–10 new videos/day.

### 6. Log the claude CLI in as this account

```powershell
claude          # complete the browser/device login, then exit
```

Needed for the nightly AI-verify phase. If you skip it, the nightly logs
"claude CLI not found — skipping verify" and still publishes already-verified rows.

### 7. Confirm git push works non-interactively

```powershell
git ls-remote origin -h refs/heads/master   # must succeed WITHOUT prompting
```

If it prompts, run `git push` once interactively so Git Credential Manager
stores the credential for this account, then re-test.

### 8. Deploy IIS (local-only)

```powershell
.\deploy\vps\04_iis_deploy_vps.ps1
Invoke-WebRequest http://localhost:8082/api/health -UseBasicParsing   # -> {"ok": true, ...}
```

Generates `web.config` for this path, creates the `AqmarAdmin` app pool + site
on **:8082**, and grants the pool identity `db_owner` on `aqmar`. Opens no ports.

### 9. Register the two scheduled tasks (headless)

```powershell
.\deploy\vps\05_setup_tasks_vps.ps1
# prompts for THIS account's password (stored encrypted by Task Scheduler)
```

Registers both tasks to run whether logged on or not, and grants this account
its own SQL login + `db_owner` (the tasks connect as this account). Verify:

```powershell
schtasks /query /tn "AqmarTofan 2-Hourly Scrape"        /v /fo LIST | findstr "Next Run"
schtasks /query /tn "AqmarTofan Nightly Verify+Publish"  /v /fo LIST | findstr "Next Run"
```

### 10. End-to-end smoke test

```powershell
# a) one scrape, watch it
Start-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape"
Get-Content .\logs\scrape_2hourly.log -Wait -Tail 30      # Ctrl+C to stop watching

# b) portal + live data
Invoke-WebRequest http://localhost:8082/api/health -UseBasicParsing
Start-Process http://localhost:8082/                       # log in with the new ADMIN_TOKEN

# c) nightly WITHOUT publishing or emailing
.\scripts\nightly_verify_publish.ps1 -DryRun
```

A real (non-dry) nightly should end with `PUBLISH_RESULT: published=… version=…`
and no `errors`. The dead "second push" no longer appears.

### 11. Cut over — stop the dev box from also publishing

Once the VPS runs clean, **on the DEV BOX**:

```powershell
Disable-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape"
Disable-ScheduledTask -TaskName "AqmarTofan Nightly Verify+Publish"
```

Then **on the VPS** `git pull` once more (pick up any last dev-box publish), and
let the VPS tasks take it from there. The dev box stays fully usable for
development; just don't run `publish.ps1` there while the VPS owns publishing.

---

## Daily operation on the VPS

- **Review / verify rows:** RDP in → `http://localhost:8082/` → *Editor login* →
  paste the VPS `ADMIN_TOKEN` → work the unverified queue.
- **Logs** (`C:\AQMAR\logs\`): `scrape_2hourly.log`, `nightly_publish.log`,
  `daily.log`, `iis_stdout*`.
- **Manual publish:** `.\scripts\publish.ps1 -Note "…"`.
- **DB backups:** re-run `deploy\vps\02_backup_db_local.ps1` on the VPS on a
  schedule if you want point-in-time copies (Express has no SQL Agent — use a
  third scheduled task calling that script).

---

## If you go public later

```powershell
.\deploy\vps\04_iis_deploy_vps.ps1 -Domain admin.yourdomain.com
```

Adds the host-header binding on :80, opens the firewall for 80/443, and prints
the win-acme step for the HTTPS cert. Then also:

- point the domain's **A record** at the VPS public IP,
- issue the cert: `wacs.exe` → new cert → `AqmarAdmin` site → http-01,
- the portal is **write-capable** — keep `ADMIN_TOKEN` long/random, consider an
  IIS IP allow-list on the write routes or front it with Cloudflare Access.

---

## Rollback

Nothing here touches the dev box (until you choose to in step 11). On the VPS:

```powershell
Unregister-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape" -Confirm:$false
Unregister-ScheduledTask -TaskName "AqmarTofan Nightly Verify+Publish" -Confirm:$false
& $env:windir\System32\inetsrv\appcmd.exe delete site AqmarAdmin
& $env:windir\System32\inetsrv\appcmd.exe delete apppool AqmarAdmin
# DROP DATABASE aqmar   # only if abandoning the VPS entirely
```

Re-enable the dev-box tasks: `Enable-ScheduledTask -TaskName "AqmarTofan …"`.

---

## What changed from the earlier (2026-08-06) kit

- **Local-only IIS** is the default (`04_iis_deploy_vps.ps1` with no args →
  `localhost:8082`). The public/domain path is now the opt-in `-Domain` flag.
- **Tasks run as the current account** by default (was: a mandatory `-RunAsUser`).
- **Nightly at 22:15** (was 22:30) — clear of the 22:00 scrape slot.
- **`data\state.json` + `noted_ids.json`** added to the carry-over list and to
  `00_gather_secrets_local.ps1` / `build_bundle.ps1`. Missing `state.json` was
  the one gap that could corrupt data on first run.
- **Publish simplified** (`scripts/publish_core.ps1`): the redundant second push
  to a non-existent site repo is skipped cleanly instead of aborting every run.
  `git push origin master` alone updates both public sites.
