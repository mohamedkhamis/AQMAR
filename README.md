# AQMAR — AqmarTofan Channel Scraper

Scrapes the public Telegram channel `@AqmarTofan` and outputs an Excel sheet of martyrs.

## Quick start
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Fill in .env (copy from .env.example, get credentials from https://my.telegram.org)
# Then:
python scripts\phase0_sample.py    # download 5 sample frames
python scripts\phase1_test.py      # test pipeline on 5 samples
python scripts\phase2_backfill.py  # full backfill
.\scripts\setup_daily_trigger.ps1  # daily auto-run
```

See [design doc](docs/superpowers/specs/2026-05-10-aqmar-tofan-scraper-design.md).

## Web UI

A static Alpine.js + Tailwind SPA that browses and edits the martyr data,
with two views:

- **Public:** enter your birthdate + a window (1 week / 1 month / 2 months /
  custom days) → see martyrs born within ±N days of you, sorted by closeness.
- **Admin** (login required): same grid but each card has an "✏️ تحرير"
  button to fix wrong / missing fields. Edits accumulate in `localStorage`;
  click "💾 تصدير" to download `overrides.json`, then save it into
  `data/overrides.json`. Edits survive pipeline re-runs.

### Run locally

```powershell
.venv\Scripts\activate
python scripts\excel_to_json.py    # generate data/martyrs.json from xlsx
cd webui
python -m http.server 8000
start http://localhost:8000
```

### Default admin login

- Username: `admin`
- Password: `aqmar2026`

To change the password, edit `webui/config.js` and replace `adminPasswordHash`
with the SHA-256 hex of your new password:

```powershell
.venv\Scripts\python.exe -c "import hashlib; print(hashlib.sha256(b'YOUR_NEW_PASSWORD').hexdigest())"
```

### Tests

Open `http://localhost:8000/tests.html` while the server is running.
Tests run on page load — all 23 should pass.

### Daily workflow

```powershell
.venv\Scripts\activate
python scripts\phase3_daily.py     # fetch new posts from the channel
python scripts\excel_to_json.py    # regenerate JSON for the SPA
# Reload the browser tab — the SPA picks up new rows.
```

### Future hosting

`webui/` + `data/martyrs.json` + `data/overrides.json` + `data/photos/`
can be copied to any static host (GitHub Pages, Netlify, Cloudflare Pages).
The relative `../data/photos/N.jpg` paths preserve the on-disk structure.
