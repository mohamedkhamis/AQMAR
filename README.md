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

A static single-page app to browse martyrs and let an admin fix data manually.

```powershell
# After the scraper runs (or you manually edited Excel):
python scripts\excel_to_json.py

# Serve the UI locally:
cd webui
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

Admin login: see `webui/config.js` for the username and password hash.
