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
   scripts/excel_to_json.py
        │
        ▼
   data/martyrs.json  ─►  Web UI (Alpine + Tailwind SPA)
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
├── data/                 # outputs (gitignored except overrides.json)
├── docs/superpowers/     # design docs + plans
└── .env.example          # template for Telegram credentials
```

### Daily workflow

```powershell
.venv\Scripts\activate
python scripts\phase3_daily.py     # fetch new posts only
python scripts\excel_to_json.py    # regenerate JSON for the SPA
# Reload http://localhost:8000/webui/ — new rows appear.
```

---

## Web UI

A static Alpine.js + Tailwind SPA (no build step) with an editorial multi-view
design. Bilingual Arabic / English (toggle in the header). Warm earth-tone
palette with Reem Kufi, Amiri, and Tajawal display fonts; light theme by default,
dark theme pre-wired via `html[data-theme="dark"]`.

### Views

| | |
|---|---|
| **Home (`view: 'home'`)** | Verse, birthday-match hero with live preview, "On this day" anniversaries strip, stats (names recorded, days since Oct 7, battalions, openness). |
| **Registry (`view: 'browse'`)** | Card grid with Arabic-aware text search (name + city + battalion + brigade), filter dropdowns for city / rank / battalion / age, and three sort modes. |
| **Detail (`view: 'detail'`)** | Portrait, lifespan timeline, personal + military panels, source link back to the original Telegram post, "from the same battalion" rail. |
| **Admin (`view: 'admin'`, login required)** | Editable table of every martyr; each row exposes a "تحرير" button. Edits accumulate in `localStorage` and survive pipeline re-runs once exported. |
| **About (`view: 'about'`)** | Project description (collection / extraction / editing / publication phases). |

### Admin edit flow

- Click "تحرير" on any row → modal with editable fields.
- Save → diff (only changed fields) is merged into the per-id override in `localStorage` under `aqmar.edits`.
- Click "تصدير overrides.json" → downloads the override file.
- Save the downloaded file at `data/overrides.json` and commit it; the UI auto-merges it on next load, and pipeline re-runs won't overwrite the corrections.

The admin flow stays backward-compatible with the v1 SPA's `aqmar.pending_overrides` localStorage key — existing unexported edits migrate on first load.

#### Default admin credentials

| | |
|---|---|
| Username | `admin` |
| Password | `aqmar2026` |

To change the password, replace `adminPasswordHash` in `webui/config.js` with
the SHA-256 hex of your new password:

```powershell
.venv\Scripts\python.exe -c "import hashlib; print(hashlib.sha256(b'YOUR_NEW_PASSWORD').hexdigest())"
```

### Run the UI locally

```powershell
.venv\Scripts\activate
python scripts\excel_to_json.py    # generate data/martyrs.json from xlsx

# Serve from the PROJECT ROOT so ../data/ paths resolve from webui/:
python -m http.server 8000
start http://localhost:8000/webui/
```

### UI tests

Open <http://localhost:8000/webui/tests.html> — 45 tests run on page load (filter logic, search predicate, Arabic normalization, override-merge, admin edit-diff, and the v1↔editorial schema adapters).

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
```

Credentials are obtained from <https://my.telegram.org>. The `.env` file and
Telethon session are gitignored — never commit them.

---

## Hosting the SPA

`webui/` + `data/martyrs.json` + `data/overrides.json` + `data/photos/` can be
copied verbatim to any static host (GitHub Pages, Netlify, Cloudflare Pages).
The relative `../data/photos/N.jpg` paths preserve the on-disk structure.

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
