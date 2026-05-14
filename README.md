# AQMAR — أقمار الطوفان

A fully-local, free pipeline that scrapes the public Telegram channel
[`@AqmarTofan`](https://t.me/AqmarTofan) — a memorial channel for شهداء كتائب القسام
in معركة طوفان الأقصى — and turns each post into a structured Excel row, then
serves the dataset through a bilingual web UI.

> **Mandatory fields:** name + birth date + martyrdom date.
> **Optional fields:** city, military rank, weapon, battalion, brigade.

---

## What it does

```
@AqmarTofan (public channel)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  Python pipeline                                          │
│   1. Telethon  → fetch all messages (MTProto, free)       │
│   2. Caption parser → name, battalion, brigade            │
│   3. Dedup by name → keep the HD copy                     │
│   4. ffmpeg    → extract 6 frames per video               │
│   5. EasyOCR   → birth date · martyrdom date · city ·     │
│                  weapon · rank   (Arabic + English)       │
│   6. openpyxl  → append to data/martyrs.xlsx              │
└───────────────────────────────────────────────────────────┘
        │
        ▼
data/martyrs.xlsx · data/photos/ · data/state.json
        │
        ▼
   scripts/migrate_to_supabase.py  (one-shot)
   scripts/phase3_daily.py         (incremental, every day)
        │
        ▼
   Supabase Postgres + Storage  ─►  Web UI (Alpine + Tailwind SPA)
```

- **Idempotent** — re-running on the same messages yields the same Excel.
- **Resumable** — `state.json` lets a crashed run pick up where it stopped.
- **Birth date is sacred** — special-cased retry logic on extra frames + photo OCR.
- **Daily auto-run** — Windows Task Scheduler appends new posts only.

---

## Tech stack

| Layer | Library |
|---|---|
| Telegram client | [Telethon](https://docs.telethon.dev/) (MTProto) |
| Video frames | `ffmpeg` + `ffmpeg-python` |
| OCR | [EasyOCR](https://github.com/JaidedAI/EasyOCR) (Arabic + English) |
| Excel I/O | [openpyxl](https://openpyxl.readthedocs.io/) |
| Image preprocessing | Pillow |
| Config | python-dotenv |
| Scheduling | Windows Task Scheduler |
| Web UI | Alpine.js + Tailwind CSS + Litepicker |
| Data layer | Supabase (Postgres + Storage + Auth) |
| Tests | pytest, pytest-asyncio |

---

## Quick start

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Fill in .env (copy from .env.example).
# Get TELEGRAM_API_ID + TELEGRAM_API_HASH from https://my.telegram.org
Copy-Item .env.example .env
notepad .env

# Run phases:
python scripts\phase0_sample.py     # download 5 sample frames
python scripts\phase1_test.py       # test pipeline on 5 samples
python scripts\phase2_backfill.py   # full historical backfill
.\scripts\setup_daily_trigger.ps1   # register Windows daily task
```

### Project layout

```
AQMAR/
├── src/                  # pipeline modules (one responsibility each)
│   ├── telegram_client.py  · pipeline.py · dedup.py
│   ├── frame_extractor.py  · ocr_engine.py
│   ├── parser_caption.py   · parser_ocr.py · name_normalizer.py
│   ├── excel_writer.py     · state.py · config.py
├── scripts/              # entry points (phase0 / phase1 / phase2 / phase3)
├── tests/                # pytest suite for parsers, dedup, state, excel
├── webui/                # static Alpine + Tailwind SPA
├── data/                 # local pipeline outputs (xlsx + photos + state)
├── docs/superpowers/     # design docs + plans
└── .env.example          # template for Telegram credentials
```

### Daily workflow

```powershell
.venv\Scripts\activate
python scripts\phase3_daily.py     # fetch new posts; writes to Supabase
# Reload http://localhost:8000/webui/ — new rows appear (no JSON rebuild step).
```

---

## Web UI

A static Alpine.js + Tailwind SPA backed by Supabase Postgres + Storage:

- **Public view:** filter martyrs by birthdate proximity, martyrdom date,
  age, free-text search; sort by various fields; click any card to open
  a photo modal with full details.
- **Admin view** (Supabase Auth login required): same grid, plus an
  "✏️ تحرير" button on each card to fix any field. Edits go live
  instantly for all visitors (no more JSON export step).

### One-time setup (after `git clone`)

1. Sign up at supabase.com and create a project ("AqmarTofan" or similar).
2. Authentication → Users → Add user → your email + password.
3. Storage → New bucket → `aqmar-photos` → Public.
4. SQL Editor → paste `scripts/setup_supabase_schema.sql` → Run.
5. Project Settings → API → copy URL + anon key + service_role key into
   `.env` (see `.env.example`).
6. Paste URL + anon key into `webui/config.js` (the public values).
7. Run the migration: `python scripts/migrate_to_supabase.py`.

### Run locally

```powershell
.\scripts\serve.ps1     # starts http://localhost:8000/webui/
```

### Daily flow

```powershell
.venv\Scripts\activate
python scripts\phase3_daily.py     # fetches new posts, writes to Supabase
# (or run via Windows Task Scheduler — scripts/setup_daily_trigger.ps1)
```

### Tests

Open `http://localhost:8000/webui/tests.html` — Litepicker / Alpine /
filter logic / merge logic tests all run on page load.

### Hosting (GitHub Pages)

Push only `webui/` to a `gh-pages` branch — that's it. No data directory
needed; the SPA reads from Supabase, not from disk.

---

## Configuration

`.env` (copied from `.env.example`):

```ini
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_2FA_PASSWORD=
CHANNEL_USERNAME=AqmarTofan
SESSION_PATH=session/aqmar
DAILY_RUN_HOUR=9
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=aqmar-photos
```

Telegram credentials are obtained from <https://my.telegram.org>; Supabase
values come from Project Settings → API in your Supabase dashboard. The
`.env` file and Telethon session are gitignored — never commit them. The
`SUPABASE_SERVICE_ROLE_KEY` is server-only — only the URL + anon key go
into the public `webui/config.js`.

---

## Tests

```powershell
.venv\Scripts\activate
pytest                              # Python pipeline tests
# Then in the browser:
start http://localhost:8000/webui/tests.html   # JS / UI tests
```

---

## Documentation

- [Scraper design](docs/superpowers/specs/2026-05-10-aqmar-tofan-scraper-design.md)
- [Scraper plan](docs/superpowers/plans/2026-05-10-aqmar-tofan-scraper.md)
- [SPA design](docs/superpowers/specs/2026-05-13-aqmar-spa-design.md)
- [SPA plan](docs/superpowers/plans/2026-05-13-aqmar-spa.md)

---

## License

Private project. All Telegram channel content is property of
[`@AqmarTofan`](https://t.me/AqmarTofan); this repository contains only the
extraction pipeline and viewing UI.
