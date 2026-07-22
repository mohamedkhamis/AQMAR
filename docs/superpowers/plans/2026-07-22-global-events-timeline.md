# Global Events Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-editable global events in `data/settings.json`, rendered on every martyr's lifespan line with the person's age at each event's start, plus RTL/mobile fixes to the line and dates strip.

**Architecture:** A new `src/settings_store.py` (pure file+dict logic) backs two FastAPI routes (`GET/PUT /api/settings`) in `src/admin_app.py`. The SPA loads settings API-first with a static `../data/settings.json` fallback, computes in-lifetime events + calendar-accurate ages in `filter-logic.js`, and a rewritten `renderTimeline()` in `app.js` emits both a horizontal (desktop) and vertical (≤480px) layout styled from `styles.css`. A measured "dodge pass" slides colliding labels sideways with SVG leader lines. The admin section gets an Events CRUD card that PUTs `{version, events}`; the server merges over the existing file atomically.

**Tech Stack:** FastAPI + pytest (server), Alpine.js + vanilla JS IIFE modules + tests.html harness (SPA), no build step.

**Spec:** `docs/superpowers/specs/2026-07-22-global-events-timeline-design.md` — read it before starting.

## Global Constraints

- **Git (ABSOLUTE):** never run `git add`/`git commit`/`git push` without the user's explicit approval. At every "Commit" step below, STOP and ask *"Ready to commit?"* — proceed only on an explicit yes. Never push.
- **No build step.** Tailwind Play CDN + plain JS files. New JS goes into the existing files using their conventions (IIFE `(function (global) { "use strict"; … })(window)` for modules; free functions at the bottom of `app.js`).
- **Design tokens:** all new colors become `:root` custom properties in `webui/styles.css`; no hard-coded colors in rules; no `!important` (the documented exceptions don't apply here).
- **Digits:** dates and ages render Western digits (`formatDate` / `عمره 28 عاماً`); Arabic-Indic only via `toArDigits` for counts. Day totals use `toLocaleString('ar-EG')` (existing behavior).
- **Security:** every event name interpolated into `x-html` markup MUST pass through `esc()` (app.js free function). Admin panel uses `x-text` only.
- **Python:** snake_case + type hints; tests in `tests/test_<module>.py`; run with `.venv\Scripts\python.exe -m pytest -q` from the repo root (pytest.ini scopes collection). The suite has 92 passing tests before this plan — keep them green.
- **Cache-busting:** any modified `webui/*.js` / `styles.css` needs its `?v=` bumped in `webui/index.html` (use `?v=20260722`) and in `webui/tests.html` (bump the integer).
- The site is dark-only, Arabic/RTL primary with an `lang === 'ar' ? '…' : '…'` inline-ternary bilingual pattern.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/settings_store.py` | create | load/validate/merge/save settings JSON (no FastAPI/DB) |
| `tests/test_settings_store.py` | create | unit tests for the store |
| `src/admin_app.py` | modify | `SETTINGS_PATH` constant + `GET/PUT /api/settings` |
| `tests/test_admin_app_settings.py` | create | route tests (TestClient, tmp_path settings file) |
| `data/settings.json` | create | initial settings with the 7 October event |
| `scripts/publish.ps1` | modify | stage `data/settings.json` on publish |
| `sw.js` | modify | network-first cache for `data/settings.json` |
| `webui/filter-logic.js` | modify | `eventsForPerson`, `eventDisplayName`, `isoDayPrefix` |
| `webui/data-loader.js` | modify | `loadSettings()`, `adaptSettings()` |
| `webui/config.js` | modify | drop hardcoded demo `age` |
| `webui/app.js` | modify | events state, calendar `computeAge`, `renderTimeline` rewrite, `dodgeTimelineLabels`, `formatDateRange`, admin event methods |
| `webui/admin-edit.js` | modify | `saveSettingsViaApi` |
| `webui/index.html` | modify | timeline `x-effect` wiring, dates-strip cleanup, admin Events card, `?v=` bumps |
| `webui/styles.css` | modify | lifeline/vertical/list/strip rules + new tokens |
| `webui/tests.html` | modify | JS tests for the new pure functions |

---

### Task 1: Settings store (`src/settings_store.py`)

**Files:**
- Create: `src/settings_store.py`
- Test: `tests/test_settings_store.py`

**Interfaces:**
- Consumes: nothing (stdlib only).
- Produces (used by Task 2): `DEFAULT_SETTINGS: dict`, `MAX_BODY_BYTES: int`, `load_settings(path) -> dict` (missing → default copy; invalid JSON → `ValueError`), `validate_events(events) -> list[str]` (`[]` = valid), `assign_ids(events) -> list`, `merge_settings(existing: dict, incoming: dict) -> dict` (raises `ValueError` on bad version), `save_settings(path, data) -> None` (atomic).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_settings_store.py`:

```python
"""Tests for src/settings_store.py — pure file+dict logic, no FastAPI/DB."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.settings_store import (
    DEFAULT_SETTINGS,
    assign_ids,
    load_settings,
    merge_settings,
    save_settings,
    validate_events,
)


def _ev(**over):
    base = {"id": "evt-1", "name_ar": "معركة طوفان الأقصى",
            "name_en": "7 October War", "start_date": "2023-10-07",
            "end_date": None}
    base.update(over)
    return base


# ---- load_settings ----

def test_load_missing_file_returns_default(tmp_path):
    assert load_settings(tmp_path / "settings.json") == DEFAULT_SETTINGS


def test_load_returns_parsed_content_with_arabic(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text(json.dumps({"version": 2, "events": [_ev()]}, ensure_ascii=False),
                 encoding="utf-8")
    loaded = load_settings(p)
    assert loaded["version"] == 2
    assert loaded["events"][0]["name_ar"] == "معركة طوفان الأقصى"


def test_load_invalid_json_raises_value_error(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_settings(p)


def test_load_returns_fresh_copy_not_shared_default(tmp_path):
    a = load_settings(tmp_path / "settings.json")
    a["events"].append({"x": 1})
    assert load_settings(tmp_path / "settings.json") == DEFAULT_SETTINGS


# ---- validate_events ----

def test_valid_event_passes():
    assert validate_events([_ev()]) == []


def test_events_must_be_list():
    assert validate_events({"a": 1}) != []


def test_name_ar_required():
    assert any("name_ar" in e for e in validate_events([_ev(name_ar="  ")]))
    assert any("name_ar" in e for e in validate_events([_ev(name_ar=None)]))


def test_start_date_must_be_real_date():
    assert validate_events([_ev(start_date="2023-13-07")]) != []   # month 13
    assert validate_events([_ev(start_date="2023-02-30")]) != []   # Feb 30
    assert validate_events([_ev(start_date="07-10-2023")]) != []   # wrong format
    assert validate_events([_ev(start_date=None)]) != []


def test_end_date_optional_but_validated():
    assert validate_events([_ev(end_date=None)]) == []
    assert validate_events([_ev(end_date="2023-10-06")]) != []     # before start
    assert validate_events([_ev(end_date="2023-10-07")]) == []     # same day OK
    assert validate_events([_ev(end_date="nope")]) != []


def test_duplicate_ids_rejected():
    errs = validate_events([_ev(), _ev(name_ar="آخر")])
    assert any("duplicate" in e for e in errs)


# ---- assign_ids ----

def test_assign_ids_fills_missing_without_touching_existing():
    evs = [_ev(), _ev(id=None, name_ar="آخر"), _ev(id="", name_ar="ثالث")]
    out = assign_ids(evs)
    ids = [e["id"] for e in out]
    assert ids[0] == "evt-1"
    assert len(set(ids)) == 3
    assert all(ids)


def test_assign_ids_does_not_mutate_input():
    evs = [_ev(id=None)]
    assign_ids(evs)
    assert evs[0]["id"] is None


# ---- merge_settings ----

def test_merge_preserves_unknown_top_level_keys():
    existing = {"version": 1, "events": [], "theme": {"accent": "gold"}}
    merged = merge_settings(existing, {"version": 1, "events": [_ev()]})
    assert merged["theme"] == {"accent": "gold"}
    assert len(merged["events"]) == 1


def test_merge_defaults_version_and_rejects_non_int():
    assert merge_settings({}, {"events": []})["version"] == 1
    with pytest.raises(ValueError):
        merge_settings({}, {"version": "x", "events": []})
    with pytest.raises(ValueError):
        merge_settings({}, {"version": True, "events": []})


def test_merge_sorts_events_by_start_date():
    merged = merge_settings({}, {"events": [
        _ev(id="b", start_date="2025-01-19"),
        _ev(id="a", start_date="2023-10-07"),
    ]})
    assert [e["id"] for e in merged["events"]] == ["a", "b"]


# ---- save_settings ----

def test_save_round_trips_utf8_and_ends_with_newline(tmp_path):
    p = tmp_path / "settings.json"
    data = {"version": 1, "events": [_ev()]}
    save_settings(p, data)
    text = p.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert "معركة طوفان الأقصى" in text          # not \u-escaped
    assert json.loads(text) == data


def test_save_creates_parent_dir_and_leaves_no_temp_files(tmp_path):
    p = tmp_path / "sub" / "settings.json"
    save_settings(p, DEFAULT_SETTINGS)
    assert json.loads(p.read_text(encoding="utf-8")) == DEFAULT_SETTINGS
    leftovers = [f.name for f in p.parent.iterdir() if f.name != "settings.json"]
    assert leftovers == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_settings_store.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'src.settings_store'`

- [ ] **Step 3: Write the implementation**

Create `src/settings_store.py`:

```python
# src/settings_store.py
"""Load/validate/save the global settings JSON (data/settings.json).

The file is the source of truth for site-wide settings — currently the
global-events list rendered on every martyr's lifespan line. Pure file +
dict logic (no FastAPI, no DB) so it unit-tests in isolation.

Shape:
    {"version": 1, "events": [
        {"id": "evt-1", "name_ar": "معركة طوفان الأقصى",
         "name_en": "7 October War", "start_date": "2023-10-07",
         "end_date": null}]}
"""
import json
import os
import re
import tempfile
from datetime import date
from pathlib import Path

DEFAULT_SETTINGS = {"version": 1, "events": []}

# PUT payloads above this are rejected so the settings file (git-tracked and
# publicly served) can't be abused as a blob store.
MAX_BODY_BYTES = 256 * 1024

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _valid_iso_date(s) -> bool:
    if not isinstance(s, str) or not _DATE_RE.match(s):
        return False
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def load_settings(path) -> dict:
    """Parsed settings file, or a fresh DEFAULT_SETTINGS copy when missing.
    Invalid JSON raises ValueError — silently resetting the file would
    destroy hand-entered events, so the admin must see the error."""
    p = Path(path)
    if not p.exists():
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{p.name} is not valid JSON: {e}") from e


def validate_events(events) -> list[str]:
    """Human-readable validation errors; [] means valid."""
    if not isinstance(events, list):
        return ["'events' must be a list"]
    errors: list[str] = []
    seen_ids: set[str] = set()
    for i, ev in enumerate(events):
        label = f"event {i + 1}"
        if not isinstance(ev, dict):
            errors.append(f"{label}: must be an object")
            continue
        name_ar = ev.get("name_ar")
        if not isinstance(name_ar, str) or not name_ar.strip():
            errors.append(f"{label}: name_ar is required")
        name_en = ev.get("name_en")
        if name_en is not None and not isinstance(name_en, str):
            errors.append(f"{label}: name_en must be a string or null")
        start = ev.get("start_date")
        if not _valid_iso_date(start):
            errors.append(f"{label}: start_date must be a real YYYY-MM-DD date")
        end = ev.get("end_date")
        if end is not None:
            if not _valid_iso_date(end):
                errors.append(f"{label}: end_date must be null or a real YYYY-MM-DD date")
            elif _valid_iso_date(start) and end < start:
                errors.append(f"{label}: end_date must be on or after start_date")
        ev_id = ev.get("id")
        if ev_id is not None:
            if not isinstance(ev_id, str) or not ev_id.strip():
                errors.append(f"{label}: id must be a non-empty string")
            elif ev_id in seen_ids:
                errors.append(f"{label}: duplicate id '{ev_id}'")
            else:
                seen_ids.add(ev_id)
    return errors


def assign_ids(events) -> list:
    """Copies of the events with every missing/empty id replaced by a fresh
    'evt-<n>'. Never mutates the input."""
    used = {ev.get("id") for ev in events if ev.get("id")}
    out = []
    n = 1
    for ev in events:
        ev = dict(ev)
        if not ev.get("id"):
            while f"evt-{n}" in used:
                n += 1
            ev["id"] = f"evt-{n}"
            used.add(ev["id"])
        out.append(ev)
    return out


def merge_settings(existing: dict, incoming: dict) -> dict:
    """existing file content + incoming {version, events} → full settings.
    Unknown top-level keys already in the file survive untouched, so an
    events-only save can never wipe future settings keys. Events are id-
    assigned and stored sorted by start_date (stable git diffs)."""
    merged = dict(existing) if isinstance(existing, dict) else dict(DEFAULT_SETTINGS)
    version = incoming.get("version", 1)
    if not isinstance(version, int) or isinstance(version, bool):
        raise ValueError("'version' must be an integer")
    merged["version"] = version
    events = assign_ids(incoming.get("events") or [])
    merged["events"] = sorted(events, key=lambda e: e.get("start_date") or "")
    return merged


def save_settings(path, data: dict) -> None:
    """Atomic write: temp file in the same directory then os.replace, so a
    crash mid-write can never leave a half-written settings.json."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".settings-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_settings_store.py -q`
Expected: all pass (17 tests), 0 failures.

- [ ] **Step 5: Run the whole suite**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: 109 passed (92 existing + 17 new).

- [ ] **Step 6: Commit (ASK FIRST — see Global Constraints)**

```bash
git add src/settings_store.py tests/test_settings_store.py
git commit -m "feat(settings): settings_store — load/validate/merge/save data/settings.json"
```

---

### Task 2: API routes `GET/PUT /api/settings`

**Files:**
- Modify: `src/admin_app.py`
- Test: `tests/test_admin_app_settings.py`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces (used by Tasks 5/8): `GET /api/settings` (public, returns settings dict), `PUT /api/settings` (auth via `X-Admin-Token`, body `{version, events}`, returns saved dict, 422 on validation error), module constant `admin_app.SETTINGS_PATH: Path`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_admin_app_settings.py`:

```python
"""Tests for the /api/settings routes. No DB involved — the routes only
touch the settings file, which is monkeypatched to tmp_path so tests can
never overwrite the repo's real data/settings.json."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from src import admin_app
from src.config import Config

_test_cfg = Config(
    api_id=0, api_hash="", phone="", two_fa_password="",
    channel_username="", session_path="", daily_run_hour=9,
    sqlserver_conn_str="DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;Trusted_Connection=yes",
    admin_token="t3st-t0k3n",
)
admin_app.cfg = _test_cfg

VALID_TOKEN_HEADER = {"X-Admin-Token": "t3st-t0k3n"}

EV = {"name_ar": "معركة طوفان الأقصى", "name_en": "7 October War",
      "start_date": "2023-10-07", "end_date": None}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_app, "SETTINGS_PATH", tmp_path / "settings.json")
    return TestClient(admin_app.app)


def test_get_settings_returns_default_when_missing(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json() == {"version": 1, "events": []}


def test_get_settings_is_public_no_token(client):
    assert client.get("/api/settings").status_code == 200


def test_put_requires_admin_token(client):
    r = client.put("/api/settings", json={"version": 1, "events": []})
    assert r.status_code == 403


def test_put_rejects_wrong_token(client):
    r = client.put("/api/settings", json={"version": 1, "events": []},
                   headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 403


def test_put_then_get_round_trip(client):
    r = client.put("/api/settings", json={"version": 1, "events": [EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    saved = r.json()
    assert saved["events"][0]["name_ar"] == EV["name_ar"]
    assert saved["events"][0]["id"]            # server assigned an id
    assert client.get("/api/settings").json() == saved


def test_put_validation_error_is_422_with_detail(client):
    bad = dict(EV, start_date="2023-13-01")
    r = client.put("/api/settings", json={"version": 1, "events": [bad]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422
    assert "start_date" in r.json()["detail"]


def test_put_end_before_start_is_422(client):
    bad = dict(EV, end_date="2023-01-01")
    r = client.put("/api/settings", json={"version": 1, "events": [bad]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422


def test_put_preserves_unknown_top_level_keys(client):
    path = admin_app.SETTINGS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "events": [], "future_key": [1, 2]}),
                    encoding="utf-8")
    r = client.put("/api/settings", json={"version": 1, "events": [EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    assert r.json()["future_key"] == [1, 2]


def test_put_rejects_oversized_payload(client):
    huge = {"version": 1, "events": [], "blob": "x" * (300 * 1024)}
    r = client.put("/api/settings", json=huge, headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422
    assert "large" in r.json()["detail"].lower()


def test_put_non_integer_version_is_422(client):
    r = client.put("/api/settings", json={"version": "seven", "events": []},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422


def test_put_events_sorted_by_start_date(client):
    ev2 = dict(EV, name_ar="وقف إطلاق النار", start_date="2025-01-19")
    r = client.put("/api/settings", json={"version": 1, "events": [ev2, EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    starts = [e["start_date"] for e in r.json()["events"]]
    assert starts == ["2023-10-07", "2025-01-19"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_admin_app_settings.py -q`
Expected: FAIL — `AttributeError: ... has no attribute 'SETTINGS_PATH'` (fixture) and 404s.

- [ ] **Step 3: Implement the routes**

In `src/admin_app.py`:

3a. Add `import json` to the stdlib imports at the top (after `from pathlib import Path`).

3b. Add the store import after the exporter import (line ~40):

```python
from src.settings_store import (
    DEFAULT_SETTINGS,
    MAX_BODY_BYTES,
    load_settings,
    merge_settings,
    save_settings,
    validate_events,
)
```

3c. Directly after `cfg = load_config()` (line ~42), add the path constants (and DELETE the now-duplicate `_PROJECT_ROOT = Path(__file__).resolve().parent.parent` line down in the static-mounts section — the mounts keep using this one):

```python
# Resolved once from the repo layout — never CWD-relative, so the admin
# server and tests behave identically regardless of launch directory.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = _PROJECT_ROOT / "data" / "settings.json"
```

3d. Add the routes between `publish()` and the static-mounts section:

```python
# =============================================================================
# Global settings (data/settings.json) — events shown on every lifespan line
# =============================================================================

@app.get("/api/settings")
def get_settings():
    """Public: the SPA loads global events from here when running against the
    local admin server; static hosts read data/settings.json directly."""
    try:
        return load_settings(SETTINGS_PATH)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/settings")
def put_settings(
    body: dict = Body(...),
    _: None = Depends(require_admin),
):
    """Validate + merge {version, events} over the existing file and write it
    atomically. Unknown top-level keys already in the file are preserved so
    an events-only save can't wipe future settings."""
    if len(json.dumps(body, ensure_ascii=False).encode("utf-8")) > MAX_BODY_BYTES:
        raise HTTPException(status_code=422,
                            detail="Settings payload too large (max 256 KB)")
    errors = validate_events(body.get("events", []))
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    try:
        existing = load_settings(SETTINGS_PATH)
    except ValueError:
        existing = dict(DEFAULT_SETTINGS)   # corrupted file — this PUT repairs it
    try:
        merged = merge_settings(existing, body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    save_settings(SETTINGS_PATH, merged)
    return merged
```

3e. Update the module docstring's endpoint list: add `GET  /api/settings` under Public and `PUT  /api/settings` under Admin.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_admin_app_settings.py tests/test_admin_app.py -q`
Expected: all pass (11 new + 19 existing).

- [ ] **Step 5: Full suite**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: 120 passed.

- [ ] **Step 6: Commit (ASK FIRST)**

```bash
git add src/admin_app.py tests/test_admin_app_settings.py
git commit -m "feat(settings): GET/PUT /api/settings backed by settings_store"
```

---

### Task 3: Initial settings file + publish staging + offline cache

**Files:**
- Create: `data/settings.json`
- Modify: `scripts/publish.ps1` (after the `git add data/martyrs.json` line)
- Modify: `sw.js:68`

**Interfaces:**
- Produces: `data/settings.json` served at `/data/settings.json` on Pages/serve.ps1; publish flow stages it; offline reloads keep events.

- [ ] **Step 1: Create `data/settings.json`** (the event the user asked for):

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt-1",
      "name_ar": "معركة طوفان الأقصى",
      "name_en": "7 October War",
      "start_date": "2023-10-07",
      "end_date": null
    }
  ]
}
```

(UTF-8, LF, trailing newline — matches `save_settings` output so the first admin save produces no spurious diff.)

- [ ] **Step 2: Stage it in `scripts/publish.ps1`** — change:

```powershell
    git add data/martyrs.json
```

to:

```powershell
    git add data/martyrs.json
    git add data/settings.json
```

- [ ] **Step 3: Cache it in `sw.js`** — change line 68:

```js
  } else if (/\/data\/martyrs\.json$/.test(path)) {
```

to:

```js
  } else if (/\/data\/(martyrs|settings)\.json$/.test(path)) {
```

Also update the comment block at the top of `sw.js` (the `· data/martyrs.json → network-first` line) to `· data/{martyrs,settings}.json → network-first (fresh data online, cached snapshot offline)`.

- [ ] **Step 4: Verify**

Run: `.venv\Scripts\python.exe -c "import json; print(json.load(open('data/settings.json', encoding='utf-8'))['events'][0]['name_en'])"`
Expected: `7 October War`

- [ ] **Step 5: Commit (ASK FIRST)**

```bash
git add data/settings.json scripts/publish.ps1 sw.js
git commit -m "feat(settings): initial data/settings.json + publish staging + offline cache"
```

---

### Task 4: JS pure logic — events + calendar-accurate ages

**Files:**
- Modify: `webui/filter-logic.js` (add functions + exports)
- Modify: `webui/app.js:1099-1110` (Alpine `computeAge`)
- Modify: `webui/config.js:61` (drop demo `age`)
- Test: `webui/tests.html` (new tests + `?v=` bumps)

**Interfaces:**
- Consumes: `computeAge(birthDate, deathDate)` already in filter-logic.js (calendar-accurate, returns null on bad input).
- Produces (used by Task 6): `window.eventsForPerson(events, birthIso, martyrdomIso) -> [{...event, age_at_start: number|null}]` (sorted ascending, [] on missing/malformed person dates), `window.eventDisplayName(event, lang) -> string`, `window.isoDayPrefix(s) -> string|null`.

- [ ] **Step 1: Write failing tests in `webui/tests.html`**

Append inside the test `<script>` block (after the existing filter-logic tests):

```js
    // ===== global events (filter-logic.js) =====

    const EVS = [
      { id: "evt-1", name_ar: "أ", start_date: "2023-10-07", end_date: null },
      { id: "evt-2", name_ar: "ب", start_date: "2023-11-24", end_date: "2023-11-30" },
      { id: "evt-3", name_ar: "ج", start_date: "2025-01-19", end_date: "2025-03-18" },
    ];

    test("eventsForPerson keeps only events inside the lifetime", () => {
      const r = eventsForPerson(EVS, "1995-08-17", "2024-01-01");
      assertEq(r.map(e => e.id), ["evt-1", "evt-2"]);
    });

    test("eventsForPerson boundary dates are inclusive", () => {
      const r = eventsForPerson(EVS, "2023-10-07", "2023-11-24");
      assertEq(r.map(e => e.id), ["evt-1", "evt-2"]);
    });

    test("eventsForPerson returns [] when person dates missing or malformed", () => {
      assertEq(eventsForPerson(EVS, "", "2024-01-01"), []);
      assertEq(eventsForPerson(EVS, "1995-08-17", ""), []);
      assertEq(eventsForPerson(EVS, "1995-08-17", "فبرايسر"), []);
    });

    test("eventsForPerson annotates calendar-accurate age_at_start", () => {
      const r = eventsForPerson(EVS, "1995-12-01", "2024-01-01");
      assertEq(r[0].age_at_start, 27);   // Dec birthday not reached on 7 Oct
      const r2 = eventsForPerson(EVS, "1995-08-17", "2024-01-01");
      assertEq(r2[0].age_at_start, 28);  // Aug birthday already passed
    });

    test("eventsForPerson sorts ascending by start_date", () => {
      const shuffled = [EVS[2], EVS[0], EVS[1]];
      const r = eventsForPerson(shuffled, "1995-08-17", "2025-04-22");
      assertEq(r.map(e => e.id), ["evt-1", "evt-2", "evt-3"]);
    });

    test("eventDisplayName prefers English only when set", () => {
      assertEq(eventDisplayName({ name_ar: "حدث", name_en: "" }, "en"), "حدث");
      assertEq(eventDisplayName({ name_ar: "حدث", name_en: "Event" }, "en"), "Event");
      assertEq(eventDisplayName({ name_ar: "حدث", name_en: "Event" }, "ar"), "حدث");
      assertEq(eventDisplayName(null, "ar"), "");
    });

    test("computeAge stays calendar-accurate at the event-day boundary", () => {
      assertEq(computeAge("1995-10-07", "2023-10-07"), 28);  // birthday that day
      assertEq(computeAge("1995-10-08", "2023-10-07"), 27);  // one day short
    });
```

- [ ] **Step 2: Run to verify failure**

Serve the repo (`.\scripts\serve.ps1` or `python -m http.server 8000`), open `http://localhost:8000/webui/tests.html`.
Expected: the new tests FAIL with `eventsForPerson is not defined`.

- [ ] **Step 3: Implement in `webui/filter-logic.js`**

Insert before the `global.daysBetween = daysBetween;` export block:

```js
  // ---- Global events (2026-07-22) ----
  // Events come from data/settings.json (see data-loader.js loadSettings).

  // First 10 chars when the string starts with YYYY-MM-DD, else null. The
  // martyr dates can carry OCR garbage — mirror formatDate's prefix rule.
  function isoDayPrefix(s) {
    return (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)) ? s.slice(0, 10) : null;
  }

  // Events whose start_date falls inside [birth, martyrdom] (inclusive),
  // sorted ascending, each annotated with age_at_start (calendar-accurate
  // computeAge). Missing or malformed person dates → [] — no events can be
  // placed on a line that can't be drawn.
  function eventsForPerson(events, birthIso, martyrdomIso) {
    const birth = isoDayPrefix(birthIso);
    const mart = isoDayPrefix(martyrdomIso);
    if (!birth || !mart) return [];
    return (events || [])
      .filter(e => {
        const s = isoDayPrefix(e && e.start_date);
        return s && s >= birth && s <= mart;
      })
      .map(e => ({ ...e, age_at_start: computeAge(birth, e.start_date.slice(0, 10)) }))
      .sort((a, b) => a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0);
  }

  // Display name for the active language. Arabic is the required source
  // field; English is optional and falls back to Arabic when empty.
  function eventDisplayName(event, lang) {
    if (!event) return "";
    if (lang === "en" && typeof event.name_en === "string" && event.name_en.trim()) {
      return event.name_en;
    }
    return event.name_ar || "";
  }
```

Add to the export block:

```js
  global.isoDayPrefix = isoDayPrefix;
  global.eventsForPerson = eventsForPerson;
  global.eventDisplayName = eventDisplayName;
```

- [ ] **Step 4: Unify the Alpine `computeAge`** — replace `webui/app.js:1099-1110` (the year-only method) with:

```js
    computeAge(birth, martyrdom) {
      // Calendar-accurate age (delegates to filter-logic.js's computeAge)
      // with the 0–120 OCR sanity bound. Year-subtraction until 2026-07-22 —
      // that showed 28 for a martyr who died two months before his 28th
      // birthday, and would contradict the event ages on the lifespan line.
      const age = window.computeAge(birth, martyrdom);
      if (age == null || age < 0 || age > 120) return null;
      return age;
    },
```

(Keep the wrapper comment about '—' rendering if you like, but the body above is complete. `window.computeAge` is explicit so the method never recurses into itself.)

- [ ] **Step 5: Drop the demo hardcoded age** — in `webui/config.js` delete the line:

```js
      age: my - by,
```

(The `age: m.age != null ? m.age : this.computeAge(...)` guard at app.js:266 otherwise preserves the stale year-only value in `?demo` mode.)

- [ ] **Step 6: Bump script versions**

- `webui/tests.html`: `filter-logic.js?v=5` → `?v=6`, `config.js?v=4` → `?v=5`, `app.js?v=4` → `?v=5`.
- `webui/index.html`: `filter-logic.js?v=20260617c` → `?v=20260722`, `config.js?v=20260615` → `?v=20260722`, `app.js?v=20260617c` → `?v=20260722`.

- [ ] **Step 7: Run tests**

Reload `http://localhost:8000/webui/tests.html`.
Expected: all tests pass, `0 failed` (including the pre-existing computeAge suite — the global function itself did not change).

- [ ] **Step 8: Commit (ASK FIRST)**

```bash
git add webui/filter-logic.js webui/app.js webui/config.js webui/tests.html webui/index.html
git commit -m "feat(events): eventsForPerson + eventDisplayName; calendar-accurate ages site-wide"
```

---

### Task 5: Settings loading in the SPA

**Files:**
- Modify: `webui/data-loader.js` (add `loadSettings` + `adaptSettings` + exports)
- Modify: `webui/app.js` (state + init wiring)
- Test: `webui/tests.html`

**Interfaces:**
- Consumes: `AQMAR_API.get('/settings')` (Task 2), `localApiPossible` (existing).
- Produces (used by Tasks 6/8): `window.loadSettings() -> Promise<{version, events}>` (never rejects), `window.adaptSettings(raw) -> {version, events}` (sorted), Alpine state `this.events: []`, `this.settingsVersion: 1`.

- [ ] **Step 1: Failing tests** — append to `webui/tests.html`:

```js
    // ===== settings loading (data-loader.js) =====

    test("adaptSettings sorts events and defaults version", () => {
      const s = adaptSettings({ events: [
        { start_date: "2025-01-01" }, { start_date: "2023-10-07" }] });
      assertEq(s.version, 1);
      assertEq(s.events.map(e => e.start_date), ["2023-10-07", "2025-01-01"]);
    });

    test("adaptSettings tolerates null and garbage", () => {
      assertEq(adaptSettings(null), { version: 1, events: [] });
      assertEq(adaptSettings({}), { version: 1, events: [] });
      assertEq(adaptSettings({ version: 3, events: "nope" }), { version: 3, events: [] });
    });
```

- [ ] **Step 2: Verify failure** — reload tests.html → `adaptSettings is not defined`.

- [ ] **Step 3: Implement in `webui/data-loader.js`** — insert after `loadData()`:

```js
  // Normalize a raw settings payload: default the version, keep only a real
  // events array, and sort ascending by start_date so every consumer gets
  // lower→higher date order for free.
  function adaptSettings(raw) {
    const events = raw && Array.isArray(raw.events) ? raw.events : [];
    const sorted = [...events].sort((a, b) =>
      String(a.start_date || "").localeCompare(String(b.start_date || "")));
    return { version: (raw && raw.version) || 1, events: sorted };
  }

  // Global settings (events). Same API-first strategy as loadData(), but any
  // failure resolves to the empty default — settings must NEVER block or
  // break the site.
  async function loadSettings() {
    const host = (global.location && global.location.hostname) || "";
    if (global.AQMAR_API && localApiPossible(host)) {
      try {
        return adaptSettings(await global.AQMAR_API.get("/settings"));
      } catch (e) {
        console.warn("Settings API load failed, falling back to data/settings.json:", e.message);
      }
    }
    try {
      const res = await fetch("../data/settings.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return adaptSettings(await res.json());
    } catch (e) {
      console.warn("Settings unavailable, continuing without events:", e.message);
      return { version: 1, events: [] };
    }
  }
```

Add to the export block at the bottom:

```js
  global.loadSettings = loadSettings;
  global.adaptSettings = adaptSettings;
```

- [ ] **Step 4: Wire into `webui/app.js`**

4a. State — after `publishedVersion: null,` (line ~47) add:

```js
    // ----- global settings (data/settings.json) -----
    events: [],            // global events, sorted ascending by start_date
    settingsVersion: 1,
```

4b. Method — after `retryLoad()` add:

```js
    // Load global settings (events). Failures leave events empty — the
    // lifespan line just renders without event markers.
    async loadGlobalSettings() {
      const s = await loadSettings();
      this.events = s.events;
      this.settingsVersion = s.version;
    },
```

4c. In `init()`, directly after `await this.loadMartyrs();` add:

```js
      await this.loadGlobalSettings();
```

- [ ] **Step 5: Bump versions** — tests.html `data-loader.js?v=7` → `?v=8`; index.html `data-loader.js?v=20260617b` → `?v=20260722`.

- [ ] **Step 6: Run tests** — reload tests.html → `0 failed`.

- [ ] **Step 7: Commit (ASK FIRST)**

```bash
git add webui/data-loader.js webui/app.js webui/tests.html webui/index.html
git commit -m "feat(events): loadSettings with API-first + static fallback; events on Alpine state"
```

---

### Task 6: Lifespan line rewrite (events, RTL fix, mobile vertical)

**Files:**
- Modify: `webui/app.js` (replace `renderTimeline` at 1329-1390; add free functions `formatDateRange`, `dodgeTimelineLabels`; resize listener in `init()`)
- Modify: `webui/styles.css` (tokens + lifeline rules + 480px swap)
- Modify: `webui/index.html:768-771` (x-effect wiring)

**Interfaces:**
- Consumes: `eventsForPerson`, `eventDisplayName` (Task 4), `this.events` (Task 5), `esc`, `formatDate`, `pad` (existing free functions).
- Produces: `renderTimeline(m) -> string` (both layouts), `window.dodgeTimelineLabels(rootEl)` (positions `.ev-label`s + draws SVG leaders; no-op when the horizontal layout is hidden), `window.formatDateRange(startIso, endIso, locale) -> string`.
- Geometry contract: the horizontal line sits at **y = 112px** inside `.lifeline` — the CSS `top` values and the JS `LIFELINE_TOP` constant must stay in sync.

- [ ] **Step 1: Add design tokens** — in `webui/styles.css` `:root`, after `--ai-dim`:

```css
  /* Global-events accents on the lifespan line (2026-07-22): translucent
     gold for event-period bands + age pills, translucent olive for the
     "ongoing" tag. */
  --gold-dim:    rgba(251, 191, 36, 0.12);
  --gold-dim-2:  rgba(251, 191, 36, 0.24);
  --olive-dim:   rgba(184, 146, 74, 0.12);
  --olive-dim-2: rgba(184, 146, 74, 0.30);
```

- [ ] **Step 2: Add the lifeline CSS** — in `webui/styles.css`, insert after the `.ai-note-panel` block (before the responsive section):

```css
/* ===== Lifespan line + global events (2026-07-22) =====
   Markup emitted by renderTimeline() in app.js. The horizontal layout
   (.lifeline + .ev-list) renders above 480px; the vertical layout
   (.lifeline-v) replaces it at ≤480px (swap lives in the 480 media query).
   Positions along the line are inline `left` percentages (data-driven,
   PHYSICAL — RTL is converted in JS); all other geometry lives here.
   The line's y inside .lifeline is 112px — keep in sync with LIFELINE_TOP
   in app.js (the SVG leader-line pass needs it as a number). */
.lifeline-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 26px; }
.lifeline-kicker { font-family: var(--font-latin-sans); font-size: 11px; letter-spacing: 0.2em; color: var(--olive); text-transform: uppercase; }
.lifeline-lived { font-family: var(--font-display); font-size: 22px; font-weight: 500; margin-top: 4px; }
.lifeline-lived b { color: var(--forest); }
.lifeline-lived .days { color: var(--muted); font-size: 16px; }
.lifeline-legend { display: flex; gap: 18px; font-size: 12px; color: var(--muted); flex-wrap: wrap; align-items: center; }
.lifeline-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.sw { flex: none; display: inline-block; }
.sw-birth { width: 10px; height: 10px; border-radius: 50%; background: var(--olive); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--olive); }
.sw-mart  { width: 10px; height: 10px; background: var(--forest); transform: rotate(45deg); }
.sw-event { width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); }
.sw-band  { width: 18px; height: 8px; border-radius: 4px; background: var(--gold-dim); border: 1px solid var(--gold-dim-2); }

.lifeline { position: relative; height: 210px; margin-inline: 12px; }
.lifeline-leaders { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.lifeline-base { position: absolute; inset-inline: 0; top: 112px; height: 2px; background: var(--divider); }
.lifeline-life {
  position: absolute; top: 110px; height: 6px; border-radius: 999px;
  background: linear-gradient(to right, var(--olive), var(--forest));
}
/* linear-gradient has no logical directions — flip it per document dir so
   olive always sits on the birth side. */
html[dir="rtl"] .lifeline-life { background: linear-gradient(to left, var(--olive), var(--forest)); }
.lifeline-band {
  position: absolute; top: 107px; height: 12px; border-radius: 6px;
  background: var(--gold-dim); border: 1px solid var(--gold-dim-2);
}
.lifeline-tick { position: absolute; top: 109px; width: 1px; height: 8px; background: var(--faint); transform: translateX(-50%); }
.lifeline-tick span {
  position: absolute; top: 11px; left: 50%; transform: translateX(-50%);
  font-family: var(--font-latin-sans); font-size: 10px; color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.lifeline .mk { position: absolute; transform: translateX(-50%); }
.lifeline .mk-birth { top: 104px; width: 16px; height: 16px; border-radius: 50%; background: var(--olive); border: 3px solid var(--paper); box-shadow: 0 0 0 1px var(--olive); }
.lifeline .mk-mart  { top: 105px; width: 14px; height: 14px; background: var(--forest); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--forest); transform: translateX(-50%) rotate(45deg); }
.lifeline .mk-event { top: 106px; width: 12px; height: 12px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); box-shadow: 0 0 0 2px var(--paper); }
.mk-year { position: absolute; transform: translateX(-50%); white-space: nowrap; font-family: var(--font-naskh); font-size: 12px; font-weight: 700; }
.mk-year-birth { top: 80px; color: var(--olive); }
.mk-year-mart  { top: 128px; color: var(--forest); }
.lifeline .ev-label { position: absolute; text-align: center; white-space: nowrap; visibility: hidden; }
.lifeline .ev-label[data-side="above"] { top: 40px; }
.lifeline .ev-label[data-side="below"] { top: 142px; }
.lifeline .ev-label .n { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.lifeline .ev-label .a { font-size: 11px; color: var(--forest); margin-top: 1px; }

.ev-list { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
.ev-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ev-row .bullet { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); }
.ev-row .n { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.ev-row .d { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.age-pill {
  font-size: 12px; color: var(--forest); background: var(--gold-dim);
  border: 1px solid var(--gold-dim-2); border-radius: 999px; padding: 1px 10px 2px;
}
.tag-ongoing {
  font-size: 11px; color: var(--olive-2); background: var(--olive-dim);
  border: 1px solid var(--olive-dim-2); border-radius: 999px; padding: 1px 9px 2px;
}

/* Vertical (≤480px) layout — birth at top, events in order, martyrdom last. */
.lifeline-v { display: none; position: relative; padding-inline-start: 34px; }
.lifeline-v::before { content: ""; position: absolute; inset-block: 8px; inset-inline-start: 10px; width: 2px; background: var(--divider); }
.lifeline-v .v-entry { position: relative; padding-block: 10px 14px; }
.lifeline-v .v-mk { position: absolute; inset-inline-start: -30px; top: 16px; }
.lifeline-v .v-year { font-family: var(--font-naskh); font-size: 15px; font-weight: 700; }
.lifeline-v .v-year-birth { color: var(--olive); }
.lifeline-v .v-year-mart { color: var(--forest); }
.lifeline-v .v-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.lifeline-v .v-date { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 1px; }
.lifeline-v .v-meta { margin-top: 5px; display: flex; gap: 8px; flex-wrap: wrap; }
```

And inside the existing `@media (max-width: 480px)` block add:

```css
  .lifeline, .ev-list { display: none; }
  .lifeline-v { display: block; }
```

- [ ] **Step 3: Replace `renderTimeline`** — replace the whole method at `webui/app.js:1329-1390` with:

```js
    // Lifespan line — day-precision axis from birth to today, with the
    // global events (data/settings.json) that fall inside this person's
    // lifetime. Emits BOTH the horizontal desktop layout and the vertical
    // ≤480px layout; CSS swaps them. All positions are PHYSICAL left
    // percentages computed here — the old inset-inline-start +
    // translateX(-50%) mix sat markers off-center by half their width in
    // Arabic, and the 90deg gradient ran backwards in RTL (now CSS per-dir).
    // Every event name passes through esc(): settings.json is admin-authored
    // content entering x-html markup.
    renderTimeline(m) {
      if (!m.birth || !m.martyrdom) return '';
      const ar = this.lang === 'ar';
      const t0 = new Date(String(m.birth).slice(0, 10) + 'T00:00:00').getTime();
      const tMart = new Date(String(m.martyrdom).slice(0, 10) + 'T00:00:00').getTime();
      if (!Number.isFinite(t0) || !Number.isFinite(tMart) || tMart <= t0) return '';
      const t1 = Math.max(Date.now(), tMart);
      const span = Math.max(t1 - t0, 86400000);
      const pct = (iso) => {
        const t = new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
        return Math.min(Math.max(((t - t0) / span) * 100, 0), 100);
      };
      const phys = (p) => (ar ? 100 - p : p);
      const pBirth = pct(m.birth), pMart = pct(m.martyrdom);
      const birthY = String(m.birth).slice(0, 4);
      const martY = String(m.martyrdom).slice(0, 4);
      const days = Math.floor((tMart - t0) / 86400000);
      const ageStr = Number.isFinite(m.age) ? m.age : '—';
      const evs = eventsForPerson(this.events, m.birth, m.martyrdom);
      const ageLine = (n) => n == null ? '' : (ar ? `عمره ${n} عاماً` : `Age ${n}`);

      // ---- header: lived line + legend ----
      let h = `
        <div class="lifeline-head">
          <div>
            <div class="lifeline-kicker">${ar ? 'خطّ الحياة' : 'Lifespan'}</div>
            <div class="lifeline-lived">
              ${ar
                ? `عاشَ <b>${ageStr}</b> عاماً <span class="days">(${days.toLocaleString('ar-EG')} يوماً)</span>`
                : `Lived <b>${ageStr}</b> years <span class="days">(${days.toLocaleString()} days)</span>`}
            </div>
          </div>
          <div class="lifeline-legend">
            <span><span class="sw sw-birth"></span>${ar ? 'الميلاد' : 'Birth'}</span>
            <span><span class="sw sw-mart"></span>${ar ? 'الاستشهاد' : 'Martyrdom'}</span>
            ${evs.length ? `
            <span><span class="sw sw-event"></span>${ar ? 'حدث' : 'Event'}</span>
            <span><span class="sw sw-band"></span>${ar ? 'فترة حدث' : 'Event period'}</span>` : ''}
          </div>
        </div>`;

      // ---- horizontal layout (hidden ≤480px) ----
      h += `<div class="lifeline"><svg class="lifeline-leaders" aria-hidden="true"></svg>`;
      h += `<div class="lifeline-base"></div>`;
      h += `<div class="lifeline-life" style="left:${Math.min(phys(pBirth), phys(pMart))}%; width:${pMart - pBirth}%;"></div>`;
      evs.forEach((e) => {
        const ps = pct(e.start_date);
        const pe = Math.min(pct(e.end_date || m.martyrdom), pMart); // ongoing/overrunning → clamp
        h += `<div class="lifeline-band" style="left:${Math.min(phys(ps), phys(pe))}%; width:${Math.abs(pe - ps)}%;"></div>`;
      });
      const markerPcts = [pBirth, pMart, ...evs.map(e => pct(e.start_date))];
      const yStart = Math.ceil(parseInt(birthY, 10) / 5) * 5;
      const yEnd = new Date().getFullYear();
      for (let y = yStart; y <= yEnd; y += 5) {
        const tp = pct(`${y}-01-01`);
        if (markerPcts.some(mp => Math.abs(mp - tp) < 3)) continue; // don't collide
        h += `<div class="lifeline-tick" style="left:${phys(tp)}%;"><span>${y}</span></div>`;
      }
      h += `<div class="mk mk-birth" style="left:${phys(pBirth)}%;"></div>
            <div class="mk-year mk-year-birth" style="left:${phys(pBirth)}%;">${birthY}</div>
            <div class="mk mk-mart" style="left:${phys(pMart)}%;"></div>
            <div class="mk-year mk-year-mart" style="left:${phys(pMart)}%;">${martY}</div>`;
      evs.forEach((e, i) => {
        const x = phys(pct(e.start_date));
        const side = i % 2 === 0 ? 'above' : 'below';
        h += `<div class="mk mk-event" style="left:${x}%;"></div>
              <div class="ev-label" data-x="${x}" data-side="${side}">
                <div class="n">${esc(eventDisplayName(e, this.lang))}</div>
                ${e.age_at_start != null ? `<div class="a">${ageLine(e.age_at_start)}</div>` : ''}
              </div>`;
      });
      h += `</div>`;

      // ---- event detail list (hidden ≤480px with the line) ----
      if (evs.length) {
        h += `<div class="ev-list">` + evs.map((e) => `
          <div class="ev-row">
            <span class="bullet"></span>
            <span class="n">${esc(eventDisplayName(e, this.lang))}</span>
            <span class="d">${e.end_date
              ? formatDateRange(e.start_date, e.end_date, this.lang)
              : `${formatDate(e.start_date, this.lang)} — ${ar ? 'مستمر' : 'ongoing'}`}</span>
            ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
          </div>`).join('') + `</div>`;
      }

      // ---- vertical layout (shown ≤480px) ----
      h += `<div class="lifeline-v">
        <div class="v-entry">
          <span class="v-mk"><span class="sw sw-birth"></span></span>
          <div class="v-year v-year-birth">${birthY}</div>
          <div class="v-date">${ar ? 'وُلد في' : 'Born'} ${formatDate(m.birth, this.lang)}</div>
        </div>`;
      evs.forEach((e) => {
        h += `<div class="v-entry">
          <span class="v-mk"><span class="sw sw-event"></span></span>
          <div class="v-name">${esc(eventDisplayName(e, this.lang))}</div>
          <div class="v-date">${e.end_date
            ? formatDateRange(e.start_date, e.end_date, this.lang)
            : formatDate(e.start_date, this.lang)}</div>
          <div class="v-meta">
            ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
            ${!e.end_date ? `<span class="tag-ongoing">${ar ? 'استمرّ حتى استشهاده' : 'Ongoing at his martyrdom'}</span>` : ''}
          </div>
        </div>`;
      });
      h += `<div class="v-entry">
          <span class="v-mk"><span class="sw sw-mart"></span></span>
          <div class="v-year v-year-mart">${martY}</div>
          <div class="v-date">${ar ? 'استُشهد في' : 'Martyred'} ${formatDate(m.martyrdom, this.lang)}</div>
          ${Number.isFinite(m.age) ? `<div class="v-meta"><span class="age-pill">${ar ? `عن عمر ${m.age} عاماً` : `Aged ${m.age}`}</span></div>` : ''}
        </div>
      </div>`;
      return h;
    },
```

- [ ] **Step 4: Add the free functions** — at the bottom of `webui/app.js` in the `// ===== Free functions` section, after `formatDate`:

```js
// Date-range display for events: same-month ranges compact to
// "24 – 30 نوفمبر 2023"; cross-month ranges join both full dates with an
// arrow matching the reading direction. Falls back to whichever date is
// valid when one side is malformed.
function formatDateRange(startIso, endIso, locale = 'ar') {
  const fs = formatDate(startIso, locale);
  const fe = formatDate(endIso, locale);
  if (fs === '—' || fe === '—') return fs !== '—' ? fs : fe;
  if (String(startIso).slice(0, 7) === String(endIso).slice(0, 7)) {
    const startDay = parseInt(String(startIso).slice(8, 10), 10);
    return `${startDay} – ${fe}`;
  }
  return locale === 'en' ? `${fs} → ${fe}` : `${fs} ← ${fe}`;
}

// Y of the horizontal line inside .lifeline, in px. MUST match the CSS tops
// in the "Lifespan line + global events" block of styles.css.
const LIFELINE_TOP = 112;

// Post-render label layout for the lifespan line. Event labels keep their
// side (above/below) but may slide horizontally so they never overlap; an
// SVG leader line connects each label back to its true marker position.
// Runs after every renderTimeline() insertion (x-effect + $nextTick in
// index.html) and on window resize. No-op while the horizontal layout is
// hidden (≤480px shows the vertical layout instead).
function dodgeTimelineLabels(root) {
  if (!root) return;
  const tl = root.querySelector('.lifeline');
  if (!tl || tl.offsetParent === null) return;
  const svg = tl.querySelector('.lifeline-leaders');
  const labels = Array.from(tl.querySelectorAll('.ev-label'));
  if (!svg || labels.length === 0) return;
  const W = tl.clientWidth;
  svg.setAttribute('viewBox', `0 0 ${W} ${tl.clientHeight}`);
  svg.innerHTML = '';
  const GAP = 14;
  ['above', 'below'].forEach((side) => {
    const group = labels
      .filter((l) => l.dataset.side === side)
      .map((l) => ({ el: l, target: (parseFloat(l.dataset.x) / 100) * W, w: l.offsetWidth }))
      .sort((a, b) => a.target - b.target);
    // Two sweeps: push right off earlier labels, then clamp back from the
    // container edge — labels end up as close to their true x as fits.
    let prevRight = 0;
    group.forEach((g) => {
      g.c = Math.max(g.target, prevRight + g.w / 2);
      prevRight = g.c + g.w / 2 + GAP;
    });
    let nextLeft = W;
    for (let i = group.length - 1; i >= 0; i--) {
      const g = group[i];
      g.c = Math.min(g.c, nextLeft - g.w / 2);
      nextLeft = g.c - g.w / 2 - GAP;
    }
    group.forEach((g) => {
      g.el.style.left = `${g.c - g.w / 2}px`;
      g.el.style.visibility = 'visible';
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', g.target);
      line.setAttribute('y1', side === 'above' ? LIFELINE_TOP - 12 : LIFELINE_TOP + 12);
      line.setAttribute('x2', g.c);
      line.setAttribute('y2', side === 'above' ? LIFELINE_TOP - 34 : LIFELINE_TOP + 28);
      line.setAttribute('stroke', 'var(--faint)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    });
  });
}
```

- [ ] **Step 5: Wire the x-effect** — replace `webui/index.html:768-771`:

```html
        <!-- Lifespan timeline — global events from data/settings.json render
             on this line. x-effect re-runs on current/lang/events changes;
             the dodge pass then positions the labels (needs measured
             widths, hence $nextTick). Hidden entirely when either date is
             missing (renderTimeline would return '' and leave an empty box). -->
        <section class="mt-7 bg-paper border border-divider rounded-lg" style="padding: 28px 36px;"
                 x-show="current.birth && current.martyrdom">
          <div id="lifeline-root"
               x-effect="$el.innerHTML = (view === 'detail' && current) ? renderTimeline(current) : '';
                         $nextTick(() => dodgeTimelineLabels($el))"></div>
        </section>
```

- [ ] **Step 6: Resize listener** — in `init()` (after the `carouselIdx` watcher at the end):

```js
      // Lifespan line: label positions are pixel-measured, so re-run the
      // dodge pass when the viewport resizes (no re-render needed).
      window.addEventListener('resize', () => {
        const el = document.getElementById('lifeline-root');
        if (el) dodgeTimelineLabels(el);
      });
```

- [ ] **Step 7: Bump `styles.css` version** — index.html `styles.css?v=20260617b` → `?v=20260722` (app.js/index.html already bumped in Task 4).

- [ ] **Step 8: Verify in the browser**

Serve statically (`.\scripts\serve.ps1`), open `http://localhost:8000/webui/`, open any martyr whose lifetime contains 2023-10-07:
- Expected: line renders with the معركة طوفان الأقصى marker + label + عمره N عاماً, gold band from 2023-10-07 to martyrdom, event list below, no console errors.
- Toggle EN: label switches to "7 October War", positions mirror correctly (markers centered on the line in both languages).
- Narrow the window below 480px: vertical timeline replaces the line.
- Open a martyr martyred before 2023-10-07: no event marker, no legend event chips, no list.
- tests.html still `0 failed`.

- [ ] **Step 9: Commit (ASK FIRST)**

```bash
git add webui/app.js webui/styles.css webui/index.html
git commit -m "feat(events): lifespan line with global events, dodged labels, RTL fix, vertical mobile layout"
```

---

### Task 7: Dates-strip responsive fixes

**Files:**
- Modify: `webui/index.html:734-750`
- Modify: `webui/styles.css` (`.dates-strip` rules + 768/480 media queries)

**Interfaces:** none (pure presentation).

- [ ] **Step 1: Strip the inline styles** — replace `webui/index.html:734-750` with (only the wrapper/cell attributes change; labels/values are identical):

```html
              <div class="dates-strip grid mt-7">
                <div class="py-4 text-center px-2">
                  <div class="font-body text-[11px] tracking-[0.15em] text-muted uppercase"
                       x-text="lang === 'ar' ? 'تاريخ الميلاد' : 'Birth date'"></div>
                  <div class="font-body text-[18px] font-bold text-ink mt-1.5" x-text="formatDate(current.birth)"></div>
                </div>
                <div class="py-4 text-center px-2">
                  <div class="font-body text-[11px] tracking-[0.15em] text-muted uppercase"
                       x-text="lang === 'ar' ? 'تاريخ الاستشهاد' : 'Martyrdom date'"></div>
                  <div class="font-body text-[18px] font-bold text-forest mt-1.5" x-text="formatDate(current.martyrdom)"></div>
                </div>
                <div class="py-4 text-center px-2">
                  <div class="font-body text-[11px] tracking-[0.15em] text-muted uppercase"
                       x-text="lang === 'ar' ? 'العمر عند الاستشهاد' : 'Age'"></div>
                  <div class="font-body text-[18px] font-bold text-ink mt-1.5" x-text="ageLabel(current)"></div>
                </div>
              </div>
```

- [ ] **Step 2: Move separators into CSS** — replace the `.dates-strip` rule in `webui/styles.css` (lines 410-414) with:

```css
.dates-strip {
  grid-template-columns: 1fr 1fr 1fr;
  border-top: 1px solid var(--divider);
  border-bottom: 1px solid var(--divider);
}
/* Cell separators live here (not inline) so the wrap breakpoints below can
   restyle them — copies the .ai-stats-strip pattern. */
.dates-strip > div { border-inline-start: 1px solid var(--divider); }
.dates-strip > div:first-child { border-inline-start: none; }
```

- [ ] **Step 3: Fix the 768px wrap** — in `@media (max-width: 768px)` replace `.dates-strip { grid-template-columns: 1fr 1fr; }` with:

```css
  .dates-strip { grid-template-columns: 1fr 1fr; }
  /* 2-col wrap: the age cell starts a new full-width row — no stray start
     border, and a top border separates the rows. */
  .dates-strip > div:nth-child(3) {
    grid-column: 1 / -1;
    border-inline-start: none;
    border-top: 1px solid var(--divider);
  }
```

- [ ] **Step 4: Add the 480px single column** — in `@media (max-width: 480px)` add:

```css
  .dates-strip { grid-template-columns: 1fr; }
  .dates-strip > div { border-inline-start: none; }
  .dates-strip > div + div { border-top: 1px solid var(--divider); }
```

- [ ] **Step 5: Verify** — reload the detail page at full width (3 cells, one divider between each, no doubled outer border), at 700px (2 + full-width age row, clean borders), at 400px (3 stacked rows). Check Arabic and English.

- [ ] **Step 6: Commit (ASK FIRST)**

```bash
git add webui/index.html webui/styles.css
git commit -m "fix(ui): dates-strip separators in CSS with clean 768/480 wraps"
```

---

### Task 8: Admin Events panel

**Files:**
- Modify: `webui/admin-edit.js` (add `saveSettingsViaApi`)
- Modify: `webui/app.js` (event form state + methods)
- Modify: `webui/index.html` (Events card after the admin banner; bump `admin-edit.js` to `admin-edit.js?v=20260722`)
- Test: `webui/tests.html` (bump `admin-edit.js?v=4` → `?v=5`)

**Interfaces:**
- Consumes: `AQMAR_API.put` (existing), `PUT /api/settings` (Task 2), `adaptSettings` (Task 5), `this.events` / `this.settingsVersion` (Task 5).
- Produces: `window.saveSettingsViaApi(settings) -> Promise<savedSettings>`; Alpine `eventForm`, `eventError`, `eventSaving`, `newEvent()`, `editEvent(ev)`, `cancelEventForm()`, `saveEventForm()`, `deleteEvent(ev)`.

- [ ] **Step 1: API helper** — in `webui/admin-edit.js`, after `rejectViaApi`:

```js
  // Save the global settings (events list). PUT /api/settings with
  // {version, events}; the server validates, merges over the existing
  // data/settings.json (preserving unknown top-level keys) and returns the
  // saved document. Throws on auth / validation / network errors.
  async function saveSettingsViaApi(settings) {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.put("/settings", settings);
  }
```

and add `global.saveSettingsViaApi = saveSettingsViaApi;` to the export block.

- [ ] **Step 2: Alpine state** — in `webui/app.js`, after the `settingsVersion: 1,` line (Task 5):

```js
    // Admin events editor. eventForm null = closed; otherwise a working copy
    // {id, name_ar, name_en, start_date, end_date} (empty strings for blank).
    eventForm: null,
    eventError: '',
    eventSaving: false,
```

- [ ] **Step 3: Alpine methods** — add after `loadGlobalSettings()`:

```js
    // ---- Global events admin (settings.json) ----
    newEvent() {
      this.eventError = '';
      this.eventForm = { id: null, name_ar: '', name_en: '', start_date: '', end_date: '' };
    },
    editEvent(ev) {
      this.eventError = '';
      this.eventForm = { id: ev.id, name_ar: ev.name_ar, name_en: ev.name_en || '',
                         start_date: ev.start_date, end_date: ev.end_date || '' };
    },
    cancelEventForm() {
      this.eventForm = null;
      this.eventError = '';
    },
    async saveEventForm() {
      const f = this.eventForm;
      if (!f || this.eventSaving) return;
      // Client-side mirror of the server validation → friendlier errors.
      if (!f.name_ar.trim()) {
        this.eventError = this.lang === 'ar' ? 'الاسم بالعربية مطلوب' : 'Arabic name is required';
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start_date)) {
        this.eventError = this.lang === 'ar' ? 'تاريخ البداية مطلوب' : 'Start date is required';
        return;
      }
      if (f.end_date && f.end_date < f.start_date) {
        this.eventError = this.lang === 'ar' ? 'تاريخ النهاية قبل تاريخ البداية' : 'End date is before start date';
        return;
      }
      const next = this.events.filter(e => e.id !== f.id);
      next.push({
        id: f.id,                       // null → server assigns evt-<n>
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim() || null,
        start_date: f.start_date,
        end_date: f.end_date || null,
      });
      await this._putEvents(next, true);
    },
    async deleteEvent(ev) {
      const q = this.lang === 'ar' ? `حذف حدث «${ev.name_ar}»؟` : `Delete event "${ev.name_ar}"?`;
      if (!confirm(q)) return;
      await this._putEvents(this.events.filter(e => e.id !== ev.id), false);
    },
    // Shared save path: await the PUT, replace state from the server's
    // response on success (NOT optimistic — same as saveEdit); any failure
    // (422 validation, 403 token, network) shows inline and changes nothing.
    async _putEvents(nextEvents, closeForm) {
      this.eventSaving = true;
      this.eventError = '';
      try {
        const saved = await saveSettingsViaApi({ version: this.settingsVersion, events: nextEvents });
        const s = adaptSettings(saved);
        this.events = s.events;
        this.settingsVersion = s.version;
        if (closeForm) this.eventForm = null;
      } catch (e) {
        this.eventError = e.message || (this.lang === 'ar' ? 'فشل الحفظ' : 'Save failed');
      } finally {
        this.eventSaving = false;
      }
    },
```

- [ ] **Step 4: The card markup** — in `webui/index.html`, insert directly after the admin banner `</div>` (line 956, before `<!-- Edit form -->`):

```html
    <!-- ===== Global events (data/settings.json) — rendered on every
         lifespan line with the person's age at each event's start.
         All names display via x-text (never x-html). ===== -->
    <div x-show="!editingId" class="bg-paper border border-divider rounded-lg mb-7" style="padding: 22px 26px;">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div class="font-latin-sans text-[11px] tracking-[0.2em] text-olive uppercase"
               x-text="lang === 'ar' ? 'الأحداث العامة' : 'Global events'"></div>
          <div class="font-body text-[13px] text-muted mt-1"
               x-text="lang === 'ar'
                 ? 'تظهر على خطّ الحياة في صفحة كل شهيد، مع عمره عند بداية كل حدث. تُنشر مع أول Publish قادم.'
                 : 'Shown on every martyr\'s lifespan line with their age at each event. Published with the next Publish.'"></div>
        </div>
        <button x-show="!eventForm" @click="newEvent()" class="btn btn-primary"
                x-text="lang === 'ar' ? '+ إضافة حدث' : '+ Add event'"></button>
      </div>

      <template x-if="events.length === 0 && !eventForm">
        <div class="text-muted text-[14px] mt-4"
             x-text="lang === 'ar' ? 'لا توجد أحداث بعد.' : 'No events yet.'"></div>
      </template>

      <div class="mt-4 flex flex-col">
        <template x-for="ev in events" :key="ev.id">
          <div class="flex items-center gap-4 flex-wrap py-2.5" style="border-bottom: 1px solid var(--divider);">
            <span class="font-body font-bold text-ink text-[15px]" x-text="ev.name_ar"></span>
            <span class="text-muted text-[13px] font-latin-sans" x-text="ev.name_en || ''"></span>
            <span class="text-muted text-[13px]" style="font-variant-numeric: tabular-nums;"
                  x-text="ev.end_date
                    ? `${formatDate(ev.start_date)} ← ${formatDate(ev.end_date)}`
                    : `${formatDate(ev.start_date)} — ${lang === 'ar' ? 'مستمر' : 'ongoing'}`"></span>
            <span class="flex gap-2" style="margin-inline-start: auto;">
              <button @click="editEvent(ev)" class="btn btn-ghost"
                      x-text="lang === 'ar' ? 'تحرير' : 'Edit'"></button>
              <button @click="deleteEvent(ev)" class="btn btn-ghost" style="color: var(--crimson);"
                      x-text="lang === 'ar' ? 'حذف' : 'Delete'"></button>
            </span>
          </div>
        </template>
      </div>

      <template x-if="eventForm">
        <div class="mt-5 grid-pair grid gap-x-6">
          <label class="block mb-4">
            <div class="field-label" x-text="lang === 'ar' ? 'الاسم بالعربية (مطلوب)' : 'Arabic name (required)'"></div>
            <input class="input" dir="rtl" x-model="eventForm.name_ar">
          </label>
          <label class="block mb-4">
            <div class="field-label" x-text="lang === 'ar' ? 'الاسم بالإنجليزية (اختياري)' : 'English name (optional)'"></div>
            <input class="input" dir="ltr" x-model="eventForm.name_en">
          </label>
          <label class="block mb-4">
            <div class="field-label" x-text="lang === 'ar' ? 'تاريخ البداية (مطلوب)' : 'Start date (required)'"></div>
            <input class="input" dir="ltr" type="date" x-model="eventForm.start_date">
          </label>
          <label class="block mb-4">
            <div class="field-label" x-text="lang === 'ar' ? 'تاريخ النهاية (اختياري)' : 'End date (optional)'"></div>
            <input class="input" dir="ltr" type="date" x-model="eventForm.end_date">
          </label>
          <div class="flex items-center gap-3 flex-wrap" style="grid-column: 1 / -1;">
            <button @click="saveEventForm()" class="btn btn-primary" :disabled="eventSaving"
                    x-text="eventSaving ? '…' : (lang === 'ar' ? 'حفظ الحدث' : 'Save event')"></button>
            <button @click="cancelEventForm()" class="btn btn-ghost"
                    x-text="lang === 'ar' ? 'إلغاء' : 'Cancel'"></button>
            <span class="text-[13px]" style="color: var(--crimson);" x-text="eventError"></span>
          </div>
        </div>
      </template>
    </div>
```

- [ ] **Step 5: Version bumps** — index.html: `admin-edit.js` → `admin-edit.js?v=20260722`. tests.html: `admin-edit.js?v=4` → `?v=5`.

- [ ] **Step 6: Verify end-to-end** — start `python scripts\admin_server.py`, log in as editor:
- The Events card lists «معركة طوفان الأقصى» from the initial file.
- Add a second event (e.g. الهدنة الإنسانية, 2023-11-24 → 2023-11-30) → row appears sorted; `data/settings.json` on disk contains it with a fresh `evt-` id.
- Validation: empty Arabic name → inline error, no request; end before start → inline error.
- Edit + save updates the row; delete asks for confirmation and removes it.
- Open a martyr profile → the line reflects the change immediately (no reload).
- tests.html still `0 failed`.

- [ ] **Step 7: Commit (ASK FIRST)**

```bash
git add webui/admin-edit.js webui/app.js webui/index.html webui/tests.html
git commit -m "feat(admin): global events panel — add/edit/delete via PUT /api/settings"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Python suite** — `.venv\Scripts\python.exe -m pytest -q` → 120 passed, 0 failed.
- [ ] **Step 2: JS suite** — open `http://localhost:8000/webui/tests.html` → `0 failed`.
- [ ] **Step 3: Static-mode check** (Pages simulation) — `.\scripts\serve.ps1`, open `http://localhost:8000/webui/`: events load from `../data/settings.json` (no API), line renders, console clean.
- [ ] **Step 4: Responsive + bilingual sweep** — with browser devtools (or Playwright): detail page at 1280px, 800px, 700px, 400px; both Arabic and English; verify markers centered, labels dodge without overlap, dates strip borders clean at every width, vertical timeline at 400px, ages consistent between the strip, the lived header, and the event labels.
- [ ] **Step 5: Regression spot-checks** — home page loads; browse grid ages render; age filter buckets still work (they read `m.age`); admin verify flow unaffected (`saveEdit` untouched); `?demo` mode renders ages.
- [ ] **Step 6: Report** — summarize results to the user, then ask *"Ready to commit?"* for anything still unstaged, and remind them the public site updates on the next approved publish/push.

## Execution notes

- Tasks 1→5 are strictly ordered. Task 7 is independent of 4-6 (can run any time after Task 3). Task 8 needs 2 + 5. Task 6 needs 4 + 5.
- If `webui/index.html` line numbers have drifted, anchor by the quoted markup, not the numbers.
- The preview page that validated the dodge algorithm and visual design: https://claude.ai/code/artifact/903239be-81b0-4f3b-8fc3-8cb79a34410e (same geometry: line y, label tops, gap 14px).
