# AQMAR — أقمار الطوفان

A fully-local, free pipeline that scrapes the public Telegram channel
[`@AqmarTofan`](https://t.me/AqmarTofan) — a memorial channel for شهداء كتائب القسام
in معركة طوفان الأقصى — extracts each post's details via OCR, stores them in
a local SQL Server database for human verification, and publishes verified
records to a static bilingual web UI.

> **Mandatory fields:** name + birth date + martyrdom date.
> **Optional fields:** city, military rank, weapon, battalion, brigade.

---

## What it does

```
@AqmarTofan (public channel)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Python pipeline (scripts/phase3_daily.py)                  │
│   1. Telethon → fetch new messages (MTProto, free)          │
│   2. Caption parser → name, battalion, brigade              │
│   3. ffmpeg + EasyOCR → birth + martyrdom dates from frames │
│   4. UPSERT into SQL Server  (verification_status='unverified') │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
   Local SQL Server (`aqmar` database)
        │   (admin reviews unverified rows in the SPA, edits
        │    OCR mistakes, clicks "Save & verify" or "Reject")
        ▼
   FastAPI admin server  ─►  Alpine.js + Tailwind SPA
   (scripts/admin_server.py — runs on localhost:8000)
        │
        ▼ click "📤 Publish" (or run scripts/publish.ps1)
        ▼
   data/martyrs.json  (versioned snapshot: {version, generated_at, ...})
        │
        ▼  git commit + push
        ▼
   GitHub Pages — public read-only view of the SPA
```

- **Local-first** — all data lives on your machine. Internet only needed
  for the Telegram scrape and the publish-to-GitHub-Pages step.
- **Verification workflow** — every scraped row starts `unverified`. The
  admin reviews OCR output side-by-side with the raw text (preserved in
  `ocr_*` columns) and corrects mistakes before publishing.
- **Versioned snapshots** — every publish bumps a version number and
  appends to `dbo.publish_versions` for audit. The git history of
  `data/martyrs.json` is effectively the publish history.
- **Idempotent + resumable** — `state.json` tracks every processed
  msg_id. SQL Server `MERGE`/upsert means re-running is safe. Incremental
  save after every successful message — a crash costs at most one
  message of OCR work.
- **Daily auto-run** — Windows Task Scheduler runs `phase3_daily.py`
  every morning (see `scripts/setup_daily_trigger.ps1`).

---

## Tech stack

| Layer | Tool |
|---|---|
| Telegram client | [Telethon](https://docs.telethon.dev/) (MTProto) |
| Video frames | `ffmpeg` + `ffmpeg-python` |
| OCR | [EasyOCR](https://github.com/JaidedAI/EasyOCR) (Arabic + English) |
| Data store | **SQL Server** (default instance, Windows Authentication) |
| DB driver | `pyodbc` + ODBC Driver 17 for SQL Server |
| Admin API | **FastAPI** + uvicorn |
| Web UI | Alpine.js + Tailwind CSS + Litepicker |
| Image preprocessing | Pillow |
| Config | python-dotenv |
| Scheduling | Windows Task Scheduler |
| Tests | pytest, pytest-asyncio, FastAPI TestClient |

---

## One-time setup (after `git clone`)

```powershell
# 1. Python venv + dependencies
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Telegram credentials — get TELEGRAM_API_ID + TELEGRAM_API_HASH from
#    https://my.telegram.org, paste into .env (copy from .env.example).
Copy-Item .env.example .env
notepad .env

# 3. SQL Server — install SQL Server Express or use an existing instance.
#    Default config assumes localhost + Windows Auth.
.venv\Scripts\python.exe -c "import pyodbc; pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;Trusted_Connection=yes;TrustServerCertificate=yes', autocommit=True).execute(`"IF DB_ID('aqmar') IS NULL CREATE DATABASE aqmar`")"

# 4. Run the schema script (paste into SSMS, OR via Python):
#    Tables: dbo.martyrs (with verification workflow), dbo.publish_versions
sqlcmd -S localhost -d aqmar -E -i scripts\setup_sqlserver_schema.sql

# 5. Generate an ADMIN_TOKEN and append to .env
$tok = (.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))").Trim()
Add-Content -Path '.env' -Value "ADMIN_TOKEN=$tok"

# 6. (Optional, if you have an old data/martyrs.xlsx to bring in)
python scripts\migrate_excel_to_sqlserver.py
```

### Project layout

```
AQMAR/
├── src/
│   ├── telegram_client.py · pipeline.py · parser_caption.py · parser_ocr.py
│   ├── frame_extractor.py · ocr_engine.py · name_normalizer.py
│   ├── sqlserver_client.py    · data layer (pyodbc wrapper)
│   ├── admin_app.py           · FastAPI admin API
│   ├── exporter.py            · SQL Server → versioned JSON
│   ├── excel_writer.py · state.py · config.py
├── scripts/
│   ├── phase3_daily.py        · daily scrape (Telegram → SQL Server)
│   ├── admin_server.py        · `python scripts/admin_server.py` → :8000
│   ├── export_to_json.py      · publish: SQL → data/martyrs.json
│   ├── publish.ps1            · one-command export + git push
│   ├── migrate_excel_to_sqlserver.py · one-shot Excel → SQL Server
│   ├── reprocess.py           · re-run one msg through OCR + upsert
│   ├── setup_sqlserver_schema.sql · DDL for the aqmar database
│   ├── setup_daily_trigger.ps1     · register Windows Task Scheduler
├── tests/                · pytest suite (103+ tests)
├── webui/                · static SPA (Alpine + Tailwind)
├── data/                 · martyrs.xlsx (legacy snapshot), martyrs.json, photos/
└── .env.example          · template for credentials + DB conn string
```

---

## Daily workflow

```powershell
.venv\Scripts\activate
python scripts\phase3_daily.py   # fetches new posts → SQL Server (unverified)

# Then in another shell (or after the scrape):
python scripts\admin_server.py   # → http://localhost:8000/
```

Open http://localhost:8000/ in a browser, click **"Editor login"**, paste
the `ADMIN_TOKEN` from your `.env`. Review the unverified queue, edit any
OCR mistakes, click **"Save & verify"** on each row.

When you're ready to publish a batch of newly-verified rows:

```powershell
# Option A — one command:
.\scripts\publish.ps1 -Note "weekly verification batch"

# Option B — manual:
python scripts\export_to_json.py --note "weekly verification batch"
git add data/martyrs.json
git commit -m "publish vN: weekly verification batch"
git push
```

The published `data/martyrs.json` is what GitHub Pages serves to public
visitors via the same SPA in read-only mode.

---

## Web UI

A single bilingual (Arabic / English) SPA with three modes:

- **Public view** (no login): Home page with verse + birthday-match
  card + on-this-day strip + stats. Registry page with Litepicker
  birthdate input, sort + filter dropdowns, advanced filters panel,
  grid/list toggle. Detail page with portrait + timeline + source link.
- **Admin view** (token login): Same registry view + verification queue
  with **Save & verify** and **Reject** buttons. **📤 Publish** button
  in the header writes a new versioned snapshot.
- **About**: project description and architecture.

### Running locally (full admin mode)

```powershell
python scripts\admin_server.py
# → http://localhost:8000/  (the SPA + live data via the API)
```

### Running locally (read-only preview)

If you don't need admin and just want to preview the SPA against the
published snapshot:

```powershell
.\scripts\serve.ps1
# → http://localhost:8000/webui/  (reads data/martyrs.json directly)
```

### Hosting (GitHub Pages)

Push only `webui/` + `data/martyrs.json` + `data/photos/` to your
`gh-pages` branch (or use the default branch + `/docs` source). The
SPA gracefully falls back to the static JSON when no API is reachable.

---

## Configuration

`.env` (copied from `.env.example`):

```ini
# Telegram (from https://my.telegram.org)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_2FA_PASSWORD=
CHANNEL_USERNAME=AqmarTofan
SESSION_PATH=session/aqmar
DAILY_RUN_HOUR=9

# SQL Server (local) — default instance + Windows Auth:
SQLSERVER_CONN_STR=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;Trusted_Connection=yes;TrustServerCertificate=yes

# Admin shared secret — generate with:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
ADMIN_TOKEN=
```

`.env` is gitignored — never commit credentials. `ADMIN_TOKEN` lives on
your machine only; you paste it into the SPA login modal once per
browser session.

---

## Tests

```powershell
.venv\Scripts\activate
pytest                        # Python suite (103+ tests)
```

Browser-side tests are in `webui/tests.html` — open in any browser to run
in-page tests for filter logic, search predicate, schema adapters, etc.

---

## Documentation

- [Scraper design](docs/superpowers/specs/2026-05-10-aqmar-tofan-scraper-design.md)
- [Scraper plan](docs/superpowers/plans/2026-05-10-aqmar-tofan-scraper.md)
- [SPA design](docs/superpowers/specs/2026-05-13-aqmar-spa-design.md)
- [SPA plan](docs/superpowers/plans/2026-05-13-aqmar-spa.md)

---

## License

Private project. All Telegram channel content is property of
[`@AqmarTofan`](https://t.me/AqmarTofan); this repository contains only
the extraction pipeline + verification workflow + viewing UI.
