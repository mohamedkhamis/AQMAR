# AQMAR Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static-JSON + manual-overrides architecture with a Supabase backend (Postgres + Storage + Auth), so admin edits go live instantly and daily scraper runs push directly into the database.

**Architecture:** Supabase Postgres holds the canonical `martyrs` table. Supabase Storage holds the photo files. Supabase Auth replaces the SHA-256 admin password. SPA reads via the JS SDK on load (no more `martyrs.json`); admin writes go directly to Postgres via the SDK with auth. Python scraper writes via `supabase-py` using the service-role key.

**Tech Stack:** Supabase (Postgres + Storage + Auth) / `supabase-py` >= 2.0 (Python SDK) / `@supabase/supabase-js` >= 2 via CDN (browser SDK) / existing Alpine.js + Tailwind SPA / existing Telethon pipeline.

**Spec:** [docs/superpowers/specs/2026-05-14-supabase-migration-design.md](../specs/2026-05-14-supabase-migration-design.md)

---

## ⚠️ Conventions for this plan

- **Working directory:** `D:\Repo\01-Khamis-Projects\AQMAR` for all commands.
- **Shell:** PowerShell (or Bash via the harness).
- **Python venv:** `.venv\Scripts\python.exe` (Python 3.11.9).
- **Git:** User pre-approved per-task auto-commit ("yes-and-auto"). Each task ends with a `git commit`.
- **Branch:** stays on current branch (the user is on `feat/spa-ux-polish` — fine to keep going there; they can rename after).
- **`.env` keys are sensitive:** never echo `SUPABASE_SERVICE_ROLE_KEY` in commit messages or shared logs.
- **Tests:** Python uses pytest with `monkeypatch` to stub the supabase client. JS additions are smoke-tested by loading the updated tests.html and visually verifying in the browser at task 14.

---

## Task 1: Add `supabase-py` to requirements + install

**Files:**
- Modify: `requirements.txt`
- Modify: `.env.example`

- [ ] **Step 1.1: Add the Python SDK to requirements.txt**

Open `requirements.txt`. Find the existing pinned libraries (telethon, easyocr, openpyxl, etc.). Append a new line:

```
supabase>=2.0
```

Final file (the order of existing lines may vary):

```
telethon>=1.34
easyocr>=1.7
openpyxl>=3.1
python-dotenv>=1.0
ffmpeg-python>=0.2
Pillow>=10.0
pytest>=8.0
pytest-asyncio>=0.23
supabase>=2.0
```

- [ ] **Step 1.2: Install the new dependency**

```powershell
.venv\Scripts\activate
pip install -r requirements.txt
```

Expected output ends with: `Successfully installed supabase-2.X.Y ...` (plus its deps `gotrue`, `postgrest`, `realtime`, `storage3`).

- [ ] **Step 1.3: Verify import works**

```powershell
.venv\Scripts\python.exe -c "from supabase import create_client; print('supabase-py OK')"
```

Expected: prints `supabase-py OK` (no errors).

- [ ] **Step 1.4: Add the 4 new env vars to `.env.example`**

Append to `.env.example` (existing 7 lines stay unchanged):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=aqmar-photos
```

- [ ] **Step 1.5: Commit**

```powershell
git add requirements.txt .env.example
git commit -m "chore: add supabase-py dependency + 4 env vars in template

Adds 'supabase>=2.0' to requirements.txt so the Python pipeline can
read/write the new Supabase backend. The matching .env.example gets
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_STORAGE_BUCKET (defaulted to aqmar-photos).

Real values land in .env (gitignored) once the user creates the
Supabase project — see scripts/setup_supabase_schema.sql header."
```

---

## Task 2: User creates Supabase project + admin account + bucket

**Files:** none in this repo (Supabase Dashboard work). The user does this.

- [ ] **Step 2.1: Tell the user to follow the runbook in the spec**

Quote the user-facing portion of the spec section 14:

> 1. Sign up at supabase.com (email confirmation, ~1 min)
> 2. Create new project → "AqmarTofan", pick the region nearest you → wait ~2 min for provisioning
> 3. Go to **Project Settings → API** and copy:
>    - `URL` → put into `.env` as `SUPABASE_URL`
>    - `anon public` key → `.env` as `SUPABASE_ANON_KEY`
>    - `service_role` key → `.env` as `SUPABASE_SERVICE_ROLE_KEY`
> 4. Go to **Authentication → Users → Add user** → enter your email + password (this is the admin login)
> 5. Go to **Storage → New bucket** → name `aqmar-photos` → mark **Public bucket** → Save
> 6. Go to **SQL Editor → New query** — leave the SQL pane empty for now; we'll paste the schema in Task 4

- [ ] **Step 2.2: User confirms `.env` has the 3 keys + bucket name**

Verify:

```powershell
.venv\Scripts\python.exe -c "from dotenv import dotenv_values; v = dotenv_values('.env'); print({k: bool(v.get(k)) for k in ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET']})"
```

Expected: `{'SUPABASE_URL': True, 'SUPABASE_ANON_KEY': True, 'SUPABASE_SERVICE_ROLE_KEY': True, 'SUPABASE_STORAGE_BUCKET': True}` (all True).

- [ ] **Step 2.3: Test connection from Python**

```powershell
.venv\Scripts\python.exe -c "from supabase import create_client; from dotenv import dotenv_values; e=dotenv_values('.env'); c=create_client(e['SUPABASE_URL'], e['SUPABASE_SERVICE_ROLE_KEY']); print('Connected:', c.postgrest.session.base_url)"
```

Expected: prints `Connected: https://YOURPROJECT.supabase.co/rest/v1/`.

This task has no commit (user-side setup, no files changed in the repo).

---

## Task 3: Extend `src/config.py` to expose Supabase fields

**Files:**
- Modify: `src/config.py`
- Modify: `tests/test_config.py`

- [ ] **Step 3.1: Update the failing test**

Open `tests/test_config.py`. Add a new test below the existing `test_load_config_reads_env`:

```python
def test_load_config_reads_supabase_fields(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TELEGRAM_API_ID=12345\n"
        "TELEGRAM_API_HASH=abc\n"
        "TELEGRAM_PHONE=+20111\n"
        "TELEGRAM_2FA_PASSWORD=pw\n"
        "CHANNEL_USERNAME=TestCh\n"
        "SESSION_PATH=sess/foo\n"
        "DAILY_RUN_HOUR=7\n"
        "SUPABASE_URL=https://abc.supabase.co\n"
        "SUPABASE_ANON_KEY=anon-xyz\n"
        "SUPABASE_SERVICE_ROLE_KEY=srk-xyz\n"
        "SUPABASE_STORAGE_BUCKET=aqmar-photos\n"
    )
    cfg = load_config(env_path=str(env_file))
    assert cfg.supabase_url == "https://abc.supabase.co"
    assert cfg.supabase_anon_key == "anon-xyz"
    assert cfg.supabase_service_role_key == "srk-xyz"
    assert cfg.supabase_storage_bucket == "aqmar-photos"


def test_load_config_supabase_fields_default_to_empty(tmp_path):
    """Backwards compatible: missing Supabase env vars don't break old setups."""
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TELEGRAM_API_ID=12345\n"
        "TELEGRAM_API_HASH=abc\n"
        "TELEGRAM_PHONE=+20111\n"
        "TELEGRAM_2FA_PASSWORD=pw\n"
        "CHANNEL_USERNAME=TestCh\n"
        "SESSION_PATH=sess/foo\n"
        "DAILY_RUN_HOUR=7\n"
    )
    cfg = load_config(env_path=str(env_file))
    assert cfg.supabase_url == ""
    assert cfg.supabase_anon_key == ""
    assert cfg.supabase_service_role_key == ""
    assert cfg.supabase_storage_bucket == "aqmar-photos"  # has a sane default
```

- [ ] **Step 3.2: Run tests (expect 2 failures)**

```powershell
.venv\Scripts\python.exe -m pytest tests/test_config.py -v
```

Expected: 1 passed (the original), 2 failed with `AttributeError: 'Config' object has no attribute 'supabase_url'`.

- [ ] **Step 3.3: Add the 4 fields to `Config` and `load_config`**

Open `src/config.py`. Replace the whole `Config` dataclass and `load_config` function:

```python
# src/config.py
from dataclasses import dataclass
from dotenv import dotenv_values

@dataclass(frozen=True)
class Config:
    api_id: int
    api_hash: str
    phone: str
    two_fa_password: str
    channel_username: str
    session_path: str
    daily_run_hour: int
    # Supabase — all four optional (empty string when not configured),
    # so the existing pipeline keeps running before migration is complete.
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str

def load_config(env_path: str = ".env") -> Config:
    raw = dotenv_values(env_path)
    return Config(
        api_id=int(raw["TELEGRAM_API_ID"]),
        api_hash=raw["TELEGRAM_API_HASH"],
        phone=raw["TELEGRAM_PHONE"],
        two_fa_password=raw.get("TELEGRAM_2FA_PASSWORD", ""),
        channel_username=raw["CHANNEL_USERNAME"],
        session_path=raw.get("SESSION_PATH", "session/aqmar"),
        daily_run_hour=int(raw.get("DAILY_RUN_HOUR", 9)),
        supabase_url=raw.get("SUPABASE_URL", ""),
        supabase_anon_key=raw.get("SUPABASE_ANON_KEY", ""),
        supabase_service_role_key=raw.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_storage_bucket=raw.get("SUPABASE_STORAGE_BUCKET", "aqmar-photos"),
    )
```

- [ ] **Step 3.4: Run tests (expect all 3 to pass)**

```powershell
.venv\Scripts\python.exe -m pytest tests/test_config.py -v
```

Expected: 3 passed.

- [ ] **Step 3.5: Commit**

```powershell
git add src/config.py tests/test_config.py
git commit -m "feat: Config exposes 4 Supabase fields (TDD)

Adds supabase_url, supabase_anon_key, supabase_service_role_key,
supabase_storage_bucket to the Config dataclass. All four default to
empty string (or 'aqmar-photos' for the bucket) so a .env that lacks
them still loads — pre-migration pipeline keeps running. 3/3 tests
passing."
```

---

## Task 4: `scripts/setup_supabase_schema.sql`

**Files:**
- Create: `scripts/setup_supabase_schema.sql`

This is a SQL script the user pastes into Supabase Dashboard → SQL Editor → Run. It's idempotent: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before re-creating, etc.

- [ ] **Step 4.1: Write the schema file**

Write to `scripts/setup_supabase_schema.sql`:

```sql
-- scripts/setup_supabase_schema.sql
--
-- AQMAR Supabase schema. Paste this into the Supabase Dashboard
-- SQL Editor and click "Run". Idempotent — safe to re-run.
--
-- After running:
--   1. martyrs table exists with RLS enabled
--   2. martyrs_duplicates table exists
--   3. Public can SELECT, only authenticated users can INSERT/UPDATE
--   4. updated_at auto-updates on row modification

-- =========================================================================
-- MAIN TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS martyrs (
  msg_id              integer PRIMARY KEY,
  name                text,
  name_normalized     text,
  birth_date          date,
  martyrdom_date      date,
  city                text,
  military_rank       text,
  weapon              text,
  battalion           text,
  brigade             text,
  photo_path          text,
  posted_date         timestamptz,
  message_link        text,
  extraction_status   text,
  duplicate_status    text,
  manual_edited_at    timestamptz,
  manual_edited_by    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS martyrs_updated_at ON martyrs;
CREATE TRIGGER martyrs_updated_at
  BEFORE UPDATE ON martyrs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for the SPA's filter/sort dimensions
CREATE INDEX IF NOT EXISTS idx_martyrs_birth     ON martyrs (birth_date);
CREATE INDEX IF NOT EXISTS idx_martyrs_martyrdom ON martyrs (martyrdom_date);
CREATE INDEX IF NOT EXISTS idx_martyrs_status    ON martyrs (extraction_status);

-- Row Level Security: public reads, only authenticated admin writes
ALTER TABLE martyrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read martyrs" ON martyrs;
CREATE POLICY "Anyone can read martyrs"
  ON martyrs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert martyrs" ON martyrs;
CREATE POLICY "Authenticated can insert martyrs"
  ON martyrs FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update martyrs" ON martyrs;
CREATE POLICY "Authenticated can update martyrs"
  ON martyrs FOR UPDATE
  TO authenticated
  USING (true);

-- =========================================================================
-- DUPLICATES TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS martyrs_duplicates (
  msg_id              integer PRIMARY KEY,
  name                text,
  reason              text,
  resolution          text,
  size_mb             numeric,
  kept_msg_id         integer,
  link                text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE martyrs_duplicates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read dupes" ON martyrs_duplicates;
CREATE POLICY "Anyone can read dupes"
  ON martyrs_duplicates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert dupes" ON martyrs_duplicates;
CREATE POLICY "Authenticated can insert dupes"
  ON martyrs_duplicates FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

- [ ] **Step 4.2: User runs the SQL in Supabase Dashboard**

Tell the user:

> Open the Supabase Dashboard → SQL Editor → New query → paste the contents of `scripts/setup_supabase_schema.sql` → click Run. You should see "Success. No rows returned."

Verify by checking Dashboard → Table editor → both `martyrs` and `martyrs_duplicates` tables should appear, empty.

- [ ] **Step 4.3: Commit**

```powershell
git add scripts/setup_supabase_schema.sql
git commit -m "feat: Supabase schema SQL (table + indexes + RLS + trigger)

One-time DDL the user pastes into the Supabase SQL Editor. Idempotent
(IF NOT EXISTS, DROP POLICY before CREATE). Creates martyrs and
martyrs_duplicates tables with public-read / authenticated-write RLS
policies, indexes on the filtered/sorted columns, and an updated_at
trigger."
```

---

## Task 5: `src/supabase_client.py` — Python wrapper (TDD)

**Files:**
- Create: `src/supabase_client.py`
- Create: `tests/test_supabase_client.py`

This module wraps `supabase-py` with project-specific helpers: `upsert_martyr(row)`, `upload_photo(msg_id, local_path)`, `delete_photo(msg_id)`, `public_photo_url(msg_id)`. Used by the migration script and `phase3_daily.py`.

- [ ] **Step 5.1: Write failing tests**

Write to `tests/test_supabase_client.py`:

```python
"""Tests for src/supabase_client.py. The real Supabase calls are stubbed
via monkeypatch so the tests don't need a live project."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.supabase_client import SupabaseSync, martyr_row_to_db_dict


def test_martyr_row_to_db_dict_maps_all_fields():
    """All 16 MartyrRow fields land in the DB payload with correct names."""
    from src.excel_writer import MartyrRow
    row = MartyrRow(
        msg_id=20, name="فلان", name_normalized="فلان",
        birth_date="1980-02-12", martyrdom_date="2024-05-17",
        city="غزة", military_rank="قائد", weapon="مدفعية",
        battalion="كتيبة", brigade="لواء",
        photo_path="data/photos/20.jpg",
        frame_paths="data/frames/20_28.jpg;data/frames/20_30.jpg",
        posted_date="2024-05-18 12:00", message_link="https://t.me/x/20",
        extraction_status="complete", duplicate_status="unique",
    )
    payload = martyr_row_to_db_dict(row, photo_url="https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg")
    assert payload["msg_id"] == 20
    assert payload["name"] == "فلان"
    assert payload["birth_date"] == "1980-02-12"
    assert payload["martyrdom_date"] == "2024-05-17"
    assert payload["photo_path"] == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg"
    assert payload["extraction_status"] == "complete"
    # frame_paths is NOT pushed (local-only artifact)
    assert "frame_paths" not in payload


def test_martyr_row_to_db_dict_empty_birth_becomes_none():
    """Postgres date columns prefer NULL over empty string."""
    from src.excel_writer import MartyrRow
    row = MartyrRow(
        msg_id=99, name="x", name_normalized="x",
        birth_date="", martyrdom_date="",
        city="", military_rank="", weapon="",
        battalion="", brigade="",
        photo_path="", frame_paths="",
        posted_date="", message_link="",
        extraction_status="missing_critical", duplicate_status="unique",
    )
    payload = martyr_row_to_db_dict(row, photo_url="")
    assert payload["birth_date"] is None
    assert payload["martyrdom_date"] is None
    assert payload["posted_date"] is None
    assert payload["photo_path"] is None  # empty url also coerced to None


def test_upsert_martyr_calls_table_upsert(monkeypatch):
    """upsert_martyr forwards to client.table('martyrs').upsert(...).execute()."""
    fake_execute = MagicMock(return_value=MagicMock(data=[{"msg_id": 20}], error=None))
    fake_upsert = MagicMock(return_value=MagicMock(execute=fake_execute))
    fake_table = MagicMock(return_value=MagicMock(upsert=fake_upsert))
    fake_client = MagicMock(table=fake_table)

    sync = SupabaseSync(fake_client, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    sync.upsert_martyr_dict({"msg_id": 20, "name": "x"})

    fake_table.assert_called_once_with("martyrs")
    fake_upsert.assert_called_once_with({"msg_id": 20, "name": "x"})
    fake_execute.assert_called_once()


def test_public_photo_url_builds_correct_pattern():
    sync = SupabaseSync(client=None, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    assert sync.public_photo_url(20) == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg"
    assert sync.public_photo_url(999) == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/999.jpg"


def test_upload_photo_calls_storage_upload(monkeypatch, tmp_path):
    photo = tmp_path / "20.jpg"
    photo.write_bytes(b"\xff\xd8\xffFAKEJPEG")
    fake_upload = MagicMock(return_value=None)
    fake_bucket = MagicMock(upload=fake_upload)
    fake_storage = MagicMock(from_=MagicMock(return_value=fake_bucket))
    fake_client = MagicMock(storage=fake_storage)

    sync = SupabaseSync(fake_client, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    sync.upload_photo(20, str(photo))

    fake_storage.from_.assert_called_with("aqmar-photos")
    args, kwargs = fake_upload.call_args
    assert args[0] == "20.jpg"            # path inside bucket
    assert args[1] == b"\xff\xd8\xffFAKEJPEG"
    # upsert=True so re-runs overwrite
    assert kwargs.get("file_options", {}).get("upsert") in ("true", True)
```

- [ ] **Step 5.2: Run tests (expect FAIL — module doesn't exist)**

```powershell
.venv\Scripts\python.exe -m pytest tests/test_supabase_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.supabase_client'`.

- [ ] **Step 5.3: Implement `src/supabase_client.py`**

Write to `src/supabase_client.py`:

```python
# src/supabase_client.py
"""Thin wrapper around supabase-py for the AQMAR pipeline.

Used by:
  - scripts/migrate_to_supabase.py (one-time bulk push)
  - scripts/phase3_daily.py (daily upserts of new posts)

All write methods use the service_role key (passed in via the supabase
client at construction time) — this BYPASSES row-level security so the
pipeline can write freely.
"""
import os
from dataclasses import asdict
from typing import Optional


def _str_or_none(v):
    """Postgres date/text columns prefer NULL to empty string."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def martyr_row_to_db_dict(row, photo_url: str) -> dict:
    """Convert a MartyrRow dataclass into a Postgres-ready dict.

    `photo_url` is the public Supabase Storage URL (or "" if no photo).
    The local frame_paths column is dropped — it's a runtime artifact.
    """
    d = asdict(row)
    d["photo_path"] = _str_or_none(photo_url)
    # Coerce empty strings on nullable columns to None
    for k in ("birth_date", "martyrdom_date", "city", "military_rank",
              "weapon", "battalion", "brigade", "posted_date",
              "message_link", "extraction_status", "duplicate_status"):
        d[k] = _str_or_none(d.get(k))
    # Drop local-only field
    d.pop("frame_paths", None)
    return d


class SupabaseSync:
    """Thin facade over supabase-py."""

    def __init__(self, client, bucket: str, project_url: str):
        self.client = client
        self.bucket = bucket
        self.project_url = project_url.rstrip("/")

    def public_photo_url(self, msg_id: int) -> str:
        return f"{self.project_url}/storage/v1/object/public/{self.bucket}/{msg_id}.jpg"

    def upsert_martyr_dict(self, payload: dict):
        """UPSERT a single martyr row (ON CONFLICT on msg_id → UPDATE)."""
        return self.client.table("martyrs").upsert(payload).execute()

    def upsert_martyr_row(self, row, photo_url: str = ""):
        """Convenience: convert MartyrRow → dict and upsert."""
        return self.upsert_martyr_dict(martyr_row_to_db_dict(row, photo_url))

    def upsert_duplicate(self, payload: dict):
        return self.client.table("martyrs_duplicates").upsert(payload).execute()

    def upload_photo(self, msg_id: int, local_path: str):
        """Upload a JPEG to <bucket>/<msg_id>.jpg. Idempotent (upsert)."""
        if not os.path.exists(local_path):
            return None
        with open(local_path, "rb") as f:
            data = f.read()
        return self.client.storage.from_(self.bucket).upload(
            f"{msg_id}.jpg",
            data,
            file_options={"contentType": "image/jpeg", "upsert": "true"},
        )

    def delete_photo(self, msg_id: int):
        return self.client.storage.from_(self.bucket).remove([f"{msg_id}.jpg"])


def make_sync_from_config(cfg) -> SupabaseSync:
    """Factory: build a SupabaseSync from a Config, using the
    SERVICE ROLE key (pipeline-side, bypasses RLS)."""
    from supabase import create_client
    if not cfg.supabase_url or not cfg.supabase_service_role_key:
        raise RuntimeError("Supabase not configured — fill in .env first.")
    client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    return SupabaseSync(client, cfg.supabase_storage_bucket, cfg.supabase_url)
```

- [ ] **Step 5.4: Run tests (expect PASS — 5 tests)**

```powershell
.venv\Scripts\python.exe -m pytest tests/test_supabase_client.py -v
```

Expected: 5 passed.

- [ ] **Step 5.5: Commit**

```powershell
git add src/supabase_client.py tests/test_supabase_client.py
git commit -m "feat: src/supabase_client.py — pipeline wrapper for Supabase (TDD)

Provides three helpers used by the migration script and the daily
pipeline:
  - martyr_row_to_db_dict(MartyrRow, photo_url): converts the Excel
    writer's dataclass into a Postgres-shaped dict, coerces empty
    strings to NULL on nullable columns, drops the local frame_paths
    field.
  - SupabaseSync.upsert_martyr_dict / upsert_martyr_row: UPSERTs by
    msg_id (ON CONFLICT → UPDATE).
  - SupabaseSync.public_photo_url(msg_id): builds the canonical
    https://<project>.supabase.co/storage/v1/object/public/<bucket>/<id>.jpg URL.
  - SupabaseSync.upload_photo / delete_photo: storage helpers.
  - make_sync_from_config(cfg): factory using the SERVICE ROLE key
    (bypasses RLS so the pipeline can write).

5/5 unit tests passing with the supabase-py client mocked via MagicMock."
```

---

## Task 6: `scripts/migrate_to_supabase.py` — one-shot bulk push

**Files:**
- Create: `scripts/migrate_to_supabase.py`

This script reads `data/martyrs.xlsx`, pushes every row into the Supabase `martyrs` table, and uploads every photo from `data/photos/` into the storage bucket. Idempotent.

- [ ] **Step 6.1: Write the migration script**

Write to `scripts/migrate_to_supabase.py`:

```python
# scripts/migrate_to_supabase.py
"""One-shot push of data/martyrs.xlsx + data/photos/ → Supabase.

Run after:
  1. Filling .env with SUPABASE_* keys
  2. Running scripts/setup_supabase_schema.sql in the Dashboard
  3. Creating the aqmar-photos bucket (Public)

Idempotent — re-running will UPSERT rows and re-upload photos
(overwrites existing). Safe to re-run after partial failures.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openpyxl import load_workbook
from src.config import load_config
from src.supabase_client import make_sync_from_config

EXCEL_PATH = "data/martyrs.xlsx"
PHOTOS_DIR = "data/photos"
CHUNK = 50

# Excel columns (1-indexed) per scripts/excel_to_json.py
COLUMNS = [
    ("msg_id",            1,  int),
    ("name",              2,  str),
    ("name_normalized",   3,  str),
    ("birth_date",        4,  str),
    ("martyrdom_date",    5,  str),
    ("city",              6,  str),
    ("military_rank",     7,  str),
    ("weapon",            8,  str),
    ("battalion",         9,  str),
    ("brigade",          10,  str),
    ("photo_path",       11,  str),   # local path, will be rewritten
    ("posted_date",      13,  str),
    ("message_link",     14,  str),
    ("extraction_status",15,  str),
    ("duplicate_status", 16,  str),
]
DUPLICATE_COLUMNS = [
    ("msg_id",        1,  int),
    ("name",          2,  str),
    ("reason",        3,  str),
    ("resolution",    4,  str),
    ("size_mb",       5,  float),
    ("kept_msg_id",   6,  int),
    ("link",          7,  str),
]


def cell_to(value, caster):
    if value is None or value == "":
        return None if caster is str else 0
    try:
        return caster(value)
    except (TypeError, ValueError):
        return None if caster is str else 0


def build_main_rows(ws):
    rows = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        if row[0] is None:
            continue
        record = {}
        for key, col, caster in COLUMNS:
            v = row[col - 1] if col - 1 < len(row) else None
            record[key] = cell_to(v, caster)
        rows.append(record)
    return rows


def build_duplicate_rows(ws):
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        record = {}
        for key, col, caster in DUPLICATE_COLUMNS:
            v = row[col - 1] if col - 1 < len(row) else None
            record[key] = cell_to(v, caster)
        rows.append(record)
    return rows


def main():
    cfg = load_config()
    sync = make_sync_from_config(cfg)
    wb = load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    main_rows = build_main_rows(wb["الشهداء"])
    dup_rows = build_duplicate_rows(wb["النسخ_المكررة"]) if "النسخ_المكررة" in wb.sheetnames else []

    print(f"Excel: {len(main_rows)} martyrs + {len(dup_rows)} duplicates")
    print(f"Photos dir: {PHOTOS_DIR}")

    # Step 1: Upload photos
    photo_count = 0
    photo_fail = 0
    for r in main_rows:
        msg_id = r["msg_id"]
        local = os.path.join(PHOTOS_DIR, f"{msg_id}.jpg")
        if os.path.exists(local) and os.path.getsize(local) > 0:
            try:
                sync.upload_photo(msg_id, local)
                r["photo_path"] = sync.public_photo_url(msg_id)
                photo_count += 1
                if photo_count % 50 == 0:
                    print(f"  uploaded {photo_count} photos...")
            except Exception as e:
                print(f"  photo upload failed for msg {msg_id}: {e}")
                r["photo_path"] = None
                photo_fail += 1
        else:
            r["photo_path"] = None
    print(f"Photos: {photo_count} uploaded, {photo_fail} failed")

    # Step 2: Upsert martyr rows in chunks
    for i in range(0, len(main_rows), CHUNK):
        chunk = main_rows[i:i + CHUNK]
        try:
            sync.client.table("martyrs").upsert(chunk).execute()
            print(f"  upserted martyrs {i + 1}..{i + len(chunk)} / {len(main_rows)}")
        except Exception as e:
            print(f"  ERROR upserting chunk {i}: {e}")

    # Step 3: Upsert duplicates
    if dup_rows:
        for i in range(0, len(dup_rows), CHUNK):
            chunk = dup_rows[i:i + CHUNK]
            try:
                sync.client.table("martyrs_duplicates").upsert(chunk).execute()
                print(f"  upserted dupes {i + 1}..{i + len(chunk)} / {len(dup_rows)}")
            except Exception as e:
                print(f"  ERROR upserting dupes chunk {i}: {e}")

    print(f"\nDone. Migrated {len(main_rows)} martyrs ({photo_count} photos) + {len(dup_rows)} duplicates.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6.2: Syntax check**

```powershell
.venv\Scripts\python.exe -c "import ast; ast.parse(open('scripts/migrate_to_supabase.py', encoding='utf-8').read()); print('Syntax OK')"
```

Expected: `Syntax OK`.

- [ ] **Step 6.3: Run the migration (real network call, may take 5-10 min)**

```powershell
.venv\Scripts\python.exe scripts\migrate_to_supabase.py
```

Expected output (numbers vary based on current data):

```
Excel: 388 martyrs + 44 duplicates
Photos dir: data/photos
  uploaded 50 photos...
  uploaded 100 photos...
  ...
Photos: 352 uploaded, 0 failed
  upserted martyrs 1..50 / 388
  upserted martyrs 51..100 / 388
  ...
  upserted dupes 1..44 / 44

Done. Migrated 388 martyrs (352 photos) + 44 duplicates.
```

- [ ] **Step 6.4: Verify in Supabase Dashboard**

Open the project in browser:
- Table editor → `martyrs` → should show ~388 rows
- Table editor → `martyrs_duplicates` → should show ~44 rows
- Storage → `aqmar-photos` → click bucket → should show ~352 `<msg_id>.jpg` files
- Pick one photo → "Get URL" → opens the public URL → image renders

- [ ] **Step 6.5: Commit**

```powershell
git add scripts/migrate_to_supabase.py
git commit -m "feat: scripts/migrate_to_supabase.py — one-shot bulk push

Reads data/martyrs.xlsx + data/photos/ and pushes everything into
Supabase. Idempotent — re-running upserts rows by msg_id and
overwrites photos.

Pipeline:
  1. Read all martyr rows from the main sheet
  2. For each row with a local photo, upload it to aqmar-photos/<id>.jpg
     and rewrite that row's photo_path to the public Supabase URL
  3. UPSERT martyrs in chunks of 50 (one network round-trip per chunk)
  4. UPSERT martyrs_duplicates the same way

Runtime: ~5-10 min for 388 rows + 352 photos."
```

---

## Task 7: Modify `scripts/phase3_daily.py` to also write to Supabase

**Files:**
- Modify: `scripts/phase3_daily.py`

- [ ] **Step 7.1: Add Supabase write inside the loop**

Open `scripts/phase3_daily.py`. After the existing line that says `writer.append_row(row)` and `state.mark_processed(...)`, insert the Supabase write.

Locate this block in the file:

```python
            row = await process_message(
                tg, fetcher, cfg.channel_username,
                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                paired_photo_msg=paired,
            )
            writer.append_row(row)
            state.mark_processed(tg.msg_id, row.extraction_status)
            print(f"  msg {tg.msg_id}: {row.extraction_status} | "
                  f"birth={row.birth_date} | mart={row.martyrdom_date}")
```

Replace with:

```python
            row = await process_message(
                tg, fetcher, cfg.channel_username,
                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                paired_photo_msg=paired,
            )
            writer.append_row(row)
            state.mark_processed(tg.msg_id, row.extraction_status)

            # NEW: push to Supabase (if configured). Errors don't abort the run —
            # Excel is still the local backup.
            if supabase_sync:
                try:
                    photo_url = ""
                    if row.photo_path and os.path.exists(row.photo_path):
                        supabase_sync.upload_photo(row.msg_id, row.photo_path)
                        photo_url = supabase_sync.public_photo_url(row.msg_id)
                    supabase_sync.upsert_martyr_row(row, photo_url=photo_url)
                except Exception as e:
                    logging.warning(f"Supabase write failed for msg {tg.msg_id}: {e}")

            print(f"  msg {tg.msg_id}: {row.extraction_status} | "
                  f"birth={row.birth_date} | mart={row.martyrdom_date}")
```

- [ ] **Step 7.2: Wire up the supabase_sync at the top of `main()`**

Find the line in `main()` that says:

```python
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
```

Just **before** that block, add:

```python
    # Supabase sync is optional — only built if .env is configured.
    from src.supabase_client import make_sync_from_config
    supabase_sync = None
    if cfg.supabase_url and cfg.supabase_service_role_key:
        try:
            supabase_sync = make_sync_from_config(cfg)
            print(f"Supabase: writing to {cfg.supabase_url}")
        except Exception as e:
            logging.warning(f"Supabase init failed (writes will be skipped): {e}")
```

Also, at the top of the file (with other imports), make sure `os` is imported (it likely already is for path operations).

- [ ] **Step 7.3: Smoke run (with 0 new messages — should just confirm Supabase connects)**

```powershell
.venv\Scripts\python.exe scripts\phase3_daily.py
```

Expected: prints `Supabase: writing to https://...supabase.co` and then `new since msg N: 0 videos, 0 photos`. Exit cleanly.

- [ ] **Step 7.4: Commit**

```powershell
git add scripts/phase3_daily.py
git commit -m "feat: phase3_daily.py also writes new posts to Supabase

For each new message the daily run processes, after the existing
Excel append + state update, also:
  - Upload the photo to Supabase Storage (if a local copy exists)
  - UPSERT the martyr row into the Supabase 'martyrs' table

Supabase writes are guarded with a try/except so a network failure
doesn't abort the run — the Excel local backup still gets updated.
Supabase sync is auto-disabled when SUPABASE_URL or
SUPABASE_SERVICE_ROLE_KEY are empty in .env (pre-migration mode)."
```

---

## Task 8: `webui/supabase-client.js` — initialize JS client

**Files:**
- Create: `webui/supabase-client.js`
- Modify: `webui/index.html` (load the JS SDK + the new client file)
- Modify: `webui/config.js` (add `supabaseUrl` + `supabaseAnonKey`)

- [ ] **Step 8.1: Write `webui/supabase-client.js`**

Write to `webui/supabase-client.js`:

```javascript
// webui/supabase-client.js
// Initializes the @supabase/supabase-js client and exposes it on window.

(function (global) {
  "use strict";
  if (!global.supabase || typeof global.supabase.createClient !== "function") {
    console.warn("Supabase SDK not loaded yet — webui/supabase-client.js sees no `supabase` global.");
    return;
  }
  const cfg = global.AQMAR_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.warn("AQMAR_CONFIG.supabaseUrl / supabaseAnonKey missing — running in offline mode.");
    return;
  }
  global.AQMAR_SB = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "aqmar.sb",   // namespaced localStorage key
    },
  });
})(window);
```

- [ ] **Step 8.2: Update `webui/config.js`** to add Supabase fields and remove the now-deprecated `adminPasswordHash`

Replace the entire contents of `webui/config.js`:

```javascript
// webui/config.js
// Static configuration for the SPA.
//
// supabaseAnonKey is PUBLIC by design — Row Level Security on the
// Postgres tables enforces who-can-do-what server-side. Don't put the
// service_role key here; that one is server-only (Python pipeline .env).

window.AQMAR_CONFIG = {
  appName: "أقمار الطوفان — قاعدة بيانات الشهداء",
  appNameEn: "AqmarTofan — Martyrs Database",
  channel: "AqmarTofan",

  // Supabase config — fill these in after creating the project
  supabaseUrl:     "https://YOURPROJECT.supabase.co",
  supabaseAnonKey: "PASTE_YOUR_ANON_KEY_HERE",

  // Filter defaults
  filterDefaultWindow: "1month",  // '1week' | '1month' | '2months' | 'custom'
  filterCustomDaysMin: 1,
  filterCustomDaysMax: 365,

  // localStorage keys
  storage: {
    auth:     "aqmar.auth",
    pending:  "aqmar.pending_overrides",   // legacy — kept for cleanup on load
    viewMode: "aqmar.viewMode",            // 'grid' | 'list'
  },
};
```

Then **manually edit the file** to paste the real values from your Supabase project:
- Replace `https://YOURPROJECT.supabase.co` with your project URL
- Replace `PASTE_YOUR_ANON_KEY_HERE` with the anon public key

Verify via DevTools: open the page, in Console run `AQMAR_CONFIG.supabaseUrl` — should print the real URL.

- [ ] **Step 8.3: Update `webui/index.html`** to load the SDK + the new client file

Open `webui/index.html`. Find the `<head>` section, just **before** the existing line `<script src="config.js"></script>`. Add **two new lines** (SDK from CDN, then our wrapper):

```html
  <!-- Supabase JS SDK (browser, ~50 KB minified+gzipped) -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Then **after** the existing `<script src="config.js"></script>` line, add:

```html
  <script src="supabase-client.js"></script>
```

So the load order becomes:

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="supabase-client.js"></script>
  <script src="filter-logic.js"></script>
  <script src="data-loader.js"></script>
  <script src="admin-edit.js"></script>
  <script src="app.js"></script>
```

- [ ] **Step 8.4: Verify in browser**

Run `.\scripts\serve.ps1`. Open `http://localhost:8000/webui/`. In the DevTools Console run:

```javascript
typeof AQMAR_SB    // should print "object"
AQMAR_SB.auth     // should print "[object Object]" — not undefined
```

- [ ] **Step 8.5: Commit**

```powershell
git add webui/supabase-client.js webui/config.js webui/index.html
git commit -m "feat: load Supabase JS SDK + initialize client

Adds webui/supabase-client.js that does createClient(url, anonKey)
once at load and exposes it as window.AQMAR_SB. Pulls config from
AQMAR_CONFIG.supabaseUrl / supabaseAnonKey (anon key is public by
design — RLS enforces auth on the Postgres side).

config.js: replaces the now-deprecated adminPasswordHash with the
supabaseUrl and supabaseAnonKey fields. Login becomes a real
Supabase Auth call in a later task.

index.html: loads @supabase/supabase-js@2 via CDN before config.js
+ our wrapper. No build step."
```

---

## Task 9: Rewrite `webui/data-loader.js` to fetch from Supabase

**Files:**
- Modify: `webui/data-loader.js`
- Modify: `webui/tests.html` (update affected tests — the merge logic stays for compat but most tests still apply)

- [ ] **Step 9.1: Replace the file contents**

Write to `webui/data-loader.js`:

```javascript
// webui/data-loader.js
// Loads martyrs from Supabase. Replaces the old fetch-from-JSON path.

(function (global) {
  "use strict";

  function mergeOverrides(baseMartyrs, overridesEdits) {
    // Kept for backward compat with any leftover overrides.json files.
    // In the Supabase world, baseMartyrs are already the canonical merged rows,
    // so callers typically pass overridesEdits={} and this is a near-no-op.
    const norm = {};
    for (const k of Object.keys(overridesEdits || {})) norm[String(k)] = overridesEdits[k];
    return baseMartyrs.map(row => {
      const ov = norm[String(row.msg_id)];
      if (!ov) return { ...row, _overridden_fields: [] };
      const merged = { ...row, ...ov };
      const overriddenFields = Object.keys(ov).filter(k => !k.startsWith("_"));
      merged._overridden_fields = overriddenFields;
      return merged;
    });
  }

  // Mark rows that were manually edited (the manual_edited_at column is set
  // by the admin UI) so the existing ✏️ badge in the cards keeps working.
  function annotateManualEdits(rows) {
    return rows.map(r => ({
      ...r,
      _overridden_fields: r.manual_edited_at ? ["manual_edit"] : [],
    }));
  }

  async function loadData() {
    if (!global.AQMAR_SB) {
      throw new Error("Supabase client not initialized. Check webui/config.js " +
        "for valid supabaseUrl + supabaseAnonKey.");
    }
    const { data, error } = await global.AQMAR_SB
      .from("martyrs")
      .select("*")
      .order("posted_date", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    const rows = annotateManualEdits(data || []);
    return {
      generated_at: new Date().toISOString(),
      channel: "AqmarTofan",
      martyrs: data || [],
      overrides: {},      // no longer used; kept for compat with callers
      allRows: rows,
    };
  }

  global.mergeOverrides = mergeOverrides;
  global.loadData = loadData;
})(window);
```

- [ ] **Step 9.2: Update browser tests**

The old mergeOverrides tests still pass (we kept the function). Just add **one new test** for `annotateManualEdits` behavior — but since it's not exported, the easiest verification is end-to-end in task 14. Skip new unit tests for this file.

- [ ] **Step 9.3: Smoke-load the page**

Run `.\scripts\serve.ps1`. Open `http://localhost:8000/webui/`. The grid should populate with rows fetched **from Supabase** (you can verify by opening DevTools → Network tab → look for a request to `*.supabase.co/rest/v1/martyrs?select=...` returning 200).

If you see the old "Cannot load ../data/martyrs.json" error, your `webui/config.js` still has placeholder values — fix that and refresh.

- [ ] **Step 9.4: Commit**

```powershell
git add webui/data-loader.js
git commit -m "feat: data-loader.js fetches from Supabase

Replaces the dual-file fetch (martyrs.json + overrides.json + merge)
with a single supabase.from('martyrs').select('*') call. Sorts by
posted_date desc so the newest channel posts appear first when the
user opens the page without a filter active.

The legacy mergeOverrides function is kept (callable but rarely
triggered) for backwards compatibility — anyone with leftover
overrides.json can still load them via the old path.

annotateManualEdits sets _overridden_fields=['manual_edit'] on any
row that has a non-null manual_edited_at column, so the ✏️ badge
keeps working without referencing the old in-browser pendingOverrides
state."
```

---

## Task 10: Rewrite `webui/admin-edit.js` to update Supabase directly

**Files:**
- Modify: `webui/admin-edit.js`
- Modify: `webui/app.js` (use the new async save flow)

- [ ] **Step 10.1: Replace `webui/admin-edit.js`**

Write to `webui/admin-edit.js`:

```javascript
// webui/admin-edit.js
// Admin edit logic — writes directly to Supabase via the SDK.

(function (global) {
  "use strict";

  function buildEditDiff(original, edited) {
    const diff = {};
    const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
    for (const k of keys) {
      if (k.startsWith("_")) continue;     // skip internal/meta
      if (k === "msg_id") continue;        // never overwrite primary key
      if (original[k] !== edited[k]) diff[k] = edited[k];
    }
    return diff;
  }

  // Save a diff to the martyrs table via supabase.update().
  // Returns the updated row on success, or throws on failure.
  async function saveEditToSupabase(msgId, diff) {
    if (!global.AQMAR_SB) throw new Error("Supabase client not initialized.");
    if (Object.keys(diff).length === 0) return null;
    const payload = {
      ...diff,
      manual_edited_at: new Date().toISOString(),
      manual_edited_by: "admin",
    };
    const { data, error } = await global.AQMAR_SB
      .from("martyrs")
      .update(payload)
      .eq("msg_id", msgId)
      .select()
      .single();
    if (error) throw new Error(`Supabase update: ${error.message}`);
    return data;
  }

  global.buildEditDiff = buildEditDiff;
  global.saveEditToSupabase = saveEditToSupabase;
})(window);
```

- [ ] **Step 10.2: Update `webui/app.js` saveEdit/exportOverrides**

Open `webui/app.js`. Replace the existing `saveEdit()` method:

```javascript
    async saveEdit() {
      const original = this.allRows.find(r => r.msg_id === this.editingMsgId);
      if (!original) return;
      const diff = buildEditDiff(original, this.editForm);
      if (Object.keys(diff).length === 0) {
        this.closeEditModal();
        return;
      }
      try {
        const updated = await saveEditToSupabase(this.editingMsgId, diff);
        if (updated) {
          // Optimistic local update: patch the in-memory row + re-filter.
          const i = this.allRows.findIndex(r => r.msg_id === this.editingMsgId);
          if (i >= 0) {
            this.allRows[i] = { ...this.allRows[i], ...updated, _overridden_fields: ["manual_edit"] };
            // Mirror into martyrs[] so refreshAllRows from elsewhere keeps the edit.
            const j = this.martyrs.findIndex(r => r.msg_id === this.editingMsgId);
            if (j >= 0) this.martyrs[j] = { ...this.martyrs[j], ...updated };
          }
          this.applyFilter();
        }
        this.closeEditModal();
      } catch (e) {
        alert("تعذّر الحفظ في Supabase: " + e.message);
      }
    },
```

Also **remove** the old `exportOverrides()` method (lines previously beginning `exportOverrides() { ... }`) — overrides no longer get exported, they're live in the DB.

And remove the `pendingOverrides` / `effectiveOverrides` / `pendingEditCount` state lines:

```javascript
    // (Delete these lines from app.js)
    pendingOverrides: {},
    get pendingEditCount() { ... },
    get effectiveOverrides() { ... },
```

Replace usage of `pendingEditCount` in templates with `0` (in the admin header — see task 11).

- [ ] **Step 10.3: Smoke-test in browser**

Open `http://localhost:8000/webui/` → login (we'll wire up real auth in the next task; for now the SHA-256 still works) → switch to admin view → click "✏️ تحرير" on a row → change the name → click حفظ.

You should see an error in the Console for now: "Supabase: new row violates row-level security policy" — that's because the SHA-256 login doesn't tell Supabase the user is authenticated. **This is expected**; task 11 fixes it by switching login to Supabase Auth.

- [ ] **Step 10.4: Commit**

```powershell
git add webui/admin-edit.js webui/app.js
git commit -m "feat: admin edits write directly to Supabase (no overrides export)

webui/admin-edit.js: drops the localStorage + downloadOverridesJson
flow. New saveEditToSupabase(msgId, diff) calls
supabase.from('martyrs').update(diff).eq('msg_id', msgId), stamps
manual_edited_at + manual_edited_by columns, returns the updated row.

webui/app.js: saveEdit() now awaits the Supabase update, optimistically
patches the in-memory row on success, shows an alert on failure.
Removes the pendingOverrides / effectiveOverrides / pendingEditCount
state — no longer relevant.

Editing without an active Supabase session will fail with an RLS
denial — that's expected, the next task wires up Supabase Auth so
admins are properly authenticated when they save."
```

---

## Task 11: Replace SHA-256 login with Supabase Auth

**Files:**
- Modify: `webui/app.js`
- Modify: `webui/index.html` (login modal — email input instead of username)

- [ ] **Step 11.1: Update `webui/app.js` login flow**

Open `webui/app.js`. Replace the `login()` method, `_recordFailedAttempt`, and `logout()` methods with:

```javascript
    async login() {
      this.loginError = "";
      if (!global.AQMAR_SB) {
        this.loginError = "Supabase غير مهيأ";
        return;
      }
      const { data, error } = await window.AQMAR_SB.auth.signInWithPassword({
        email: this.loginUser,
        password: this.loginPass,
      });
      if (error) {
        this.loginError = "خطأ في البريد أو كلمة المرور";
        return;
      }
      this.loggedIn = true;
      this.view = "admin";
      this.showLoginModal = false;
      this.loginPass = "";
    },

    async logout() {
      if (global.AQMAR_SB) await window.AQMAR_SB.auth.signOut();
      this.loggedIn = false;
      this.view = "public";
    },
```

Update the `loggedIn` initial state — replace this line:

```javascript
    loggedIn: localStorage.getItem(AQMAR_CONFIG.storage.auth) === "yes",
```

with:

```javascript
    loggedIn: false,   // hydrated by checkSession() inside init()
```

Then add a `checkSession()` method and call it at the start of `init()`:

```javascript
    async checkSession() {
      if (!window.AQMAR_SB) return;
      const { data: { session } } = await window.AQMAR_SB.auth.getSession();
      this.loggedIn = !!session;
    },
```

Inside `async init()`, **before** the existing `loadData(...)` call, add:

```javascript
      await this.checkSession();
```

Also remove the `failedAttempts` / `lockedUntil` state (Supabase has its own rate limiting), and remove `_recordFailedAttempt()`.

- [ ] **Step 11.2: Update the login modal in `webui/index.html`**

Find the login modal (`<div x-show="showLoginModal" ...>`). Change the **username** input to an **email** input. Replace:

```html
      <input type="text" x-model="loginUser" placeholder="اسم المستخدم"
        class="w-full bg-bgdark border border-border rounded px-2 py-2 ltr">
```

with:

```html
      <input type="email" x-model="loginUser" placeholder="البريد الإلكتروني"
        class="w-full bg-bgdark border border-border rounded px-2 py-2 ltr"
        autocomplete="email">
```

Update the password input to add `autocomplete`:

```html
      <input type="password" x-model="loginPass" placeholder="كلمة المرور"
        class="w-full bg-bgdark border border-border rounded px-2 py-2 ltr"
        autocomplete="current-password">
```

- [ ] **Step 11.3: Smoke-test in browser**

Hard-refresh `http://localhost:8000/webui/`. Click "دخول الإدارة". The modal should show **البريد الإلكتروني** as the first field. Type the admin email + password you set up in Task 2. Click دخول. You should land in admin view; the edit you tried at Task 10 should now succeed (no RLS denial).

Verify in DevTools → Application → Local Storage: there should be an entry under key `aqmar.sb` containing the auth session JWT.

- [ ] **Step 11.4: Commit**

```powershell
git add webui/app.js webui/index.html
git commit -m "feat: login uses Supabase Auth (email + password)

Drops the SHA-256-of-password client-side check + 3-strike lockout
in favor of real Supabase Auth:
  - login() → supabase.auth.signInWithPassword({ email, password })
  - logout() → supabase.auth.signOut()
  - init() → checkSession() restores loggedIn from the persisted JWT
  - failedAttempts / lockedUntil state removed (Supabase rate-limits
    server-side)

Login modal: 'اسم المستخدم' (username) input → 'البريد الإلكتروني'
(email) with type=email + autocomplete=email. Password gains
autocomplete=current-password so browsers offer to save it.

The admin's email + password are set up once in the Supabase Dashboard
under Authentication → Users. No signup flow in the SPA."
```

---

## Task 12: End-to-end manual verification

**Files:** none modified — this is a checklist you walk through in a real browser.

- [ ] **Step 12.1: Start the server**

```powershell
.\scripts\serve.ps1
```

Open `http://localhost:8000/webui/`.

- [ ] **Step 12.2: Public view loads from Supabase**

1. Open DevTools → Network → reload the page.
2. You should see exactly one `*.supabase.co/rest/v1/martyrs?...` request returning 200.
3. **No** request for `../data/martyrs.json` (that path is gone).
4. The grid populates with ~388 photos sorted by posted_date desc.

- [ ] **Step 12.3: Photos load from Supabase Storage**

In Network tab filter to `Img`. Each photo request should be to `*.supabase.co/storage/v1/object/public/aqmar-photos/<id>.jpg` and return 200.

- [ ] **Step 12.4: Filter + sort still work**

Enter a birthdate in the picker → grid filters to ≤30 days range. Try different sort modes from the dropdown. All client-side, no extra network calls.

- [ ] **Step 12.5: Login**

Click "دخول الإدارة" → enter your admin email + password → log in. View switches to admin.

- [ ] **Step 12.6: Edit a row**

Pick any row, click "✏️ تحرير", change the name to something obviously test-like (e.g., append " (TEST)" to the name). Click حفظ. The card updates immediately (✏️ badge appears).

Open the Supabase Dashboard → Table editor → `martyrs` → search for the msg_id you edited → confirm the name has the " (TEST)" suffix and `manual_edited_at` is set to a recent timestamp.

- [ ] **Step 12.7: Open another browser tab to verify live**

Open `http://localhost:8000/webui/` in an incognito window. Find the same msg_id row (no login required). It should show the test edit you just made.

- [ ] **Step 12.8: Logout**

Click "خروج" → view returns to public. Reload — still public. Local storage `aqmar.sb` entry should be cleared.

- [ ] **Step 12.9: Undo the test edit**

Log back in, find the row, click تحرير, remove " (TEST)" from the name, save.

- [ ] **Step 12.10: Daily run produces new rows in Supabase**

Run a fresh daily fetch (this may or may not find new messages depending on channel activity):

```powershell
.venv\Scripts\python.exe scripts\phase3_daily.py
```

If there are new posts, watch the output for `msg N: complete | ...` lines. Then check the Supabase Dashboard → `martyrs` table → those msg_ids should appear.

If no new posts today: that's fine — the script prints `0 videos, 0 photos` and exits cleanly. You can verify the script connected to Supabase by checking it printed the `Supabase: writing to ...` line at the top.

- [ ] **Step 12.11: If all green, commit a no-op marker (or skip)**

```powershell
git status
# If clean, no commit needed.
```

---

## Task 13: Update README + spec doc with the new setup

**Files:**
- Modify: `README.md`

- [ ] **Step 13.1: Rewrite the Web UI section of `README.md`**

Open `README.md`. Find the "## Web UI" section. Replace its contents with:

```markdown
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
```

- [ ] **Step 13.2: Commit**

```powershell
git add README.md
git commit -m "docs: README — Supabase setup steps + new daily flow

7-step setup runbook (sign up, create user, create bucket, run SQL,
copy keys into .env + config.js, run migration). Removes the obsolete
'change the password by re-hashing' section — that's now Supabase
Dashboard work. Adds the GitHub Pages deployment note: only push webui/."
```

---

## Self-review (performed after writing this plan)

| Check | Result |
|---|---|
| **Spec coverage** | All 15 spec sections map to tasks: §3 architecture → T5,T7,T8 ; §4 stack additions → T1,T8 ; §5 schema → T4 ; §6 storage → T5 (uploads), T9 (URLs) ; §7 env vars → T1,T3 ; §8 files → T4..T11 ; §9 pipeline change → T7 ; §10 SPA data flow → T9 ; §11 auth → T11 ; §12 migration plan → T6 ; §13 errors → T7 (try/except), T10 (alert), T11 (loginError) ; §14 runbook → T2,T13 ; §15 acceptance → T12. |
| **Placeholder scan** | Two intentional placeholders inside `webui/config.js` template (`YOURPROJECT.supabase.co`, `PASTE_YOUR_ANON_KEY_HERE`) are explicitly replaced in Step 8.2. No `TBD`/`TODO`/`fill in` left elsewhere. |
| **Type consistency** | `SupabaseSync` constructor signature `(client, bucket, project_url)` matches both tests and `make_sync_from_config`. `martyr_row_to_db_dict(row, photo_url)` signature consistent between tests and `upsert_martyr_row`. Postgres column names in T4 schema, T5 dict mapping, T6 migration COLUMNS list, T9 select query, and T10 update payload all use the same names. JS `AQMAR_SB`, `AQMAR_CONFIG.supabaseUrl`, `AQMAR_CONFIG.supabaseAnonKey` are consistently referenced. |
| **Git** | Each task commits at the end. User has pre-approved auto-commit ("yes-and-auto") so no per-commit prompt. |
