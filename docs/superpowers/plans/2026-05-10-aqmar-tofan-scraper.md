# AqmarTofan Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, fully-local Python pipeline that scrapes the public Telegram channel `@AqmarTofan`, extracts structured fields (name, dates, city, rank, weapon, battalion, brigade) from message captions and video frames using Telethon + ffmpeg + EasyOCR, dedupes, and writes a bilingual Arabic/English Excel sheet — with a daily Windows-scheduled trigger.

**Architecture:** Modular Python package (`src/`) with one responsibility per file, wrapped by 4 phase scripts (`scripts/phase0..3`). Pipeline is idempotent (state.json), resumable (state saved after every message), and observable (per-message logging). All credentials in `.env` (gitignored).

**Tech Stack:** Python 3.11+ / Telethon (MTProto) / ffmpeg / EasyOCR (Arabic+English) / openpyxl / Pillow / python-dotenv / Windows Task Scheduler / pytest.

**Spec:** [docs/superpowers/specs/2026-05-10-aqmar-tofan-scraper-design.md](../specs/2026-05-10-aqmar-tofan-scraper-design.md)

---

## ⚠️ Important conventions for this plan

- **Git:** Per user's CLAUDE.md, **NO git operations run without explicit user approval.** This plan uses "**Checkpoint**" instead of "Commit" — at each checkpoint, **pause and ask the user** whether to commit (only if a git repo exists) and proceed. If the user prefers no git for this project, just continue without committing.
- **TDD:** Used for pure-logic modules (parsers, normalizers, dedup, state). IO-heavy modules (Telethon, ffmpeg, EasyOCR) are tested via integration scripts because mocking them adds little value.
- **Tests live in `tests/`** mirroring `src/` structure.
- **Working directory:** all commands assume `D:\Repo\01-Khamis-Projects\AQMAR` is the cwd.
- **Powershell:** activate the venv before each session: `.venv\Scripts\activate`

---

## Setup tasks (run these first)

### Task 1: Project scaffolding

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `requirements.txt`
- Create: `src/__init__.py`
- Create: `tests/__init__.py`
- Create empty folders: `scripts/`, `data/photos/`, `data/frames/`, `logs/`, `session/`

- [ ] **Step 1.1: Create `.gitignore`**

```
.env
session/
data/
logs/
__pycache__/
*.pyc
.venv/
.playwright-mcp/
*.session
.pytest_cache/
*.egg-info/
```

- [ ] **Step 1.2: Create `.env.example`**

```
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_2FA_PASSWORD=
CHANNEL_USERNAME=AqmarTofan
SESSION_PATH=session/aqmar
DAILY_RUN_HOUR=9
```

- [ ] **Step 1.3: Create `requirements.txt`**

```
telethon>=1.34
easyocr>=1.7
openpyxl>=3.1
python-dotenv>=1.0
ffmpeg-python>=0.2
Pillow>=10.0
pytest>=8.0
pytest-asyncio>=0.23
```

- [ ] **Step 1.4: Create `README.md`** (minimal)

````markdown
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
````

- [ ] **Step 1.5: Create empty Python package files**

Create `src/__init__.py` (empty) and `tests/__init__.py` (empty).

- [ ] **Step 1.6: Create empty data/log folders**

```powershell
New-Item -ItemType Directory -Force -Path data\photos, data\frames, logs, session, scripts | Out-Null
```

- [ ] **Step 1.7: Verify the layout**

```powershell
Get-ChildItem -Recurse -Directory | Select-Object FullName
```

Expected output includes: `src`, `tests`, `scripts`, `data\photos`, `data\frames`, `logs`, `session`, `docs\superpowers\specs`, `docs\superpowers\plans`.

- [ ] **Step 1.8: Checkpoint — ask user whether to git init + commit scaffolding** (skip if user says no git)

---

### Task 2: Python venv + dependencies + ffmpeg verification

**Files:** none modified

- [ ] **Step 2.1: Create venv**

```powershell
python --version
# Expected: Python 3.11.x or higher. If less, install from python.org first.

python -m venv .venv
.venv\Scripts\activate
```

- [ ] **Step 2.2: Install dependencies**

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

Expected: all packages install without error. EasyOCR will download Arabic + English models on first import (~250 MB, one-time).

- [ ] **Step 2.3: Verify ffmpeg binary is on PATH**

```powershell
ffmpeg -version
```

Expected: prints `ffmpeg version N.N.N` and library list. **If "command not found": install ffmpeg from https://www.gyan.dev/ffmpeg/builds/ → extract → add `bin\` folder to PATH → restart PowerShell.**

- [ ] **Step 2.4: Verify pytest works**

```powershell
pytest --version
```

Expected: prints `pytest 8.x.x`.

---

### Task 3: User creates `.env` file with real credentials

**Files:**
- Create: `.env` (manually by user, NOT by Claude)

- [ ] **Step 3.1: Ask user to create `.env`**

Tell user: "Copy `.env.example` to `.env` and fill in your real values from this conversation. The api_id is `35682179`, api_hash is the 32-char hex you shared, phone is `+201100759088`, 2FA is the password you shared. Save and tell me when done."

- [ ] **Step 3.2: Verify `.env` exists and is gitignored**

```powershell
Test-Path .env
# Expected: True

git check-ignore .env  # only if git initialized
# Expected: outputs ".env" (means it IS ignored)
```

---

## Core utility modules (TDD — pure logic, easy to test)

### Task 4: `src/config.py` — load `.env`

**Files:**
- Create: `src/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 4.1: Write failing test**

```python
# tests/test_config.py
import os
from src.config import load_config

def test_load_config_reads_env(tmp_path, monkeypatch):
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
    assert cfg.api_id == 12345
    assert cfg.api_hash == "abc"
    assert cfg.phone == "+20111"
    assert cfg.two_fa_password == "pw"
    assert cfg.channel_username == "TestCh"
    assert cfg.session_path == "sess/foo"
    assert cfg.daily_run_hour == 7
```

- [ ] **Step 4.2: Run test (expect FAIL — module doesn't exist)**

```powershell
pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.config'`

- [ ] **Step 4.3: Implement `src/config.py`**

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
    )
```

- [ ] **Step 4.4: Run test (expect PASS)**

```powershell
pytest tests/test_config.py -v
```

Expected: 1 passed.

- [ ] **Step 4.5: Checkpoint**

---

### Task 5: `src/name_normalizer.py` — Arabic name normalization

**Files:**
- Create: `src/name_normalizer.py`
- Test: `tests/test_name_normalizer.py`

- [ ] **Step 5.1: Write failing tests**

```python
# tests/test_name_normalizer.py
from src.name_normalizer import normalize_arabic_name

def test_normalize_alef_variants():
    assert normalize_arabic_name("أحمد") == "احمد"
    assert normalize_arabic_name("إبراهيم") == "ابراهيم"
    assert normalize_arabic_name("آدم") == "ادم"

def test_normalize_ta_marbuta():
    assert normalize_arabic_name("الصوالحة") == "الصوالحه"

def test_normalize_ya():
    assert normalize_arabic_name("على") == "علي"

def test_remove_diacritics():
    assert normalize_arabic_name("مُحَمَّد") == "محمد"

def test_collapse_whitespace():
    assert normalize_arabic_name("محمد   إسماعيل") == "محمد اسماعيل"

def test_remove_tatweel():
    assert normalize_arabic_name("مـحـمـد") == "محمد"

def test_combined():
    assert normalize_arabic_name("مُحَمَّد إسماعيل الصوالحة") == "محمد اسماعيل الصوالحه"
```

- [ ] **Step 5.2: Run tests (expect FAIL)**

```powershell
pytest tests/test_name_normalizer.py -v
```

- [ ] **Step 5.3: Implement `src/name_normalizer.py`**

```python
# src/name_normalizer.py
import re

DIACRITICS = "ًٌٍَُِّْ"
TATWEEL = "ـ"
ALEF_VARIANTS = "أإآ"
YA_VARIANTS = "ى"
TA_MARBUTA = "ة"

def normalize_arabic_name(text: str) -> str:
    if not text:
        return ""
    s = text
    s = re.sub(f"[{DIACRITICS}]", "", s)
    s = s.replace(TATWEEL, "")
    s = re.sub(f"[{ALEF_VARIANTS}]", "ا", s)
    s = s.replace(TA_MARBUTA, "ه")
    s = re.sub(f"[{YA_VARIANTS}]", "ي", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
```

- [ ] **Step 5.4: Run tests (expect PASS)**

```powershell
pytest tests/test_name_normalizer.py -v
```

Expected: 7 passed.

- [ ] **Step 5.5: Checkpoint**

---

### Task 6: `src/state.py` — read/write state.json

**Files:**
- Create: `src/state.py`
- Test: `tests/test_state.py`

- [ ] **Step 6.1: Write failing tests**

```python
# tests/test_state.py
from src.state import State

def test_create_load_save(tmp_path):
    p = tmp_path / "state.json"
    s = State.load(str(p))
    assert s.processed_msg_ids == set()
    assert s.last_processed_msg_id is None

    s.mark_processed(100, status="complete")
    s.mark_processed(102, status="failed")
    s.save(str(p))

    s2 = State.load(str(p))
    assert s2.processed_msg_ids == {100, 102}
    assert s2.last_processed_msg_id == 102
    assert s2.statuses == {100: "complete", 102: "failed"}

def test_is_processed(tmp_path):
    p = tmp_path / "state.json"
    s = State.load(str(p))
    s.mark_processed(50, status="complete")
    assert s.is_processed(50) is True
    assert s.is_processed(51) is False
```

- [ ] **Step 6.2: Run tests (expect FAIL)**

- [ ] **Step 6.3: Implement `src/state.py`**

```python
# src/state.py
import json
import os
from dataclasses import dataclass, field

@dataclass
class State:
    processed_msg_ids: set = field(default_factory=set)
    statuses: dict = field(default_factory=dict)
    last_processed_msg_id: int = None

    @classmethod
    def load(cls, path: str) -> "State":
        if not os.path.exists(path):
            return cls()
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(
            processed_msg_ids=set(data.get("processed_msg_ids", [])),
            statuses={int(k): v for k, v in data.get("statuses", {}).items()},
            last_processed_msg_id=data.get("last_processed_msg_id"),
        )

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = {
            "processed_msg_ids": sorted(self.processed_msg_ids),
            "statuses": {str(k): v for k, v in self.statuses.items()},
            "last_processed_msg_id": self.last_processed_msg_id,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def mark_processed(self, msg_id: int, status: str) -> None:
        self.processed_msg_ids.add(msg_id)
        self.statuses[msg_id] = status
        if self.last_processed_msg_id is None or msg_id > self.last_processed_msg_id:
            self.last_processed_msg_id = msg_id

    def is_processed(self, msg_id: int) -> bool:
        return msg_id in self.processed_msg_ids
```

- [ ] **Step 6.4: Run tests (expect PASS)**

- [ ] **Step 6.5: Checkpoint**

---

### Task 7: `src/parser_caption.py` — extract from caption text

**Files:**
- Create: `src/parser_caption.py`
- Test: `tests/test_parser_caption.py`

- [ ] **Step 7.1: Write failing tests**

```python
# tests/test_parser_caption.py
from src.parser_caption import parse_caption

CAPTION_1 = (
    "أَقمَارُ الطُّوْفَانْ\n"
    "الشهيد القائد الميداني/ محمد إسماعيل الصوالحة\n"
    "▫️كتيبة الشهيد رائد العطار (يبنا) - لواء رفح\n"
    "#طوفان_الأقصى"
)

def test_extract_name():
    r = parse_caption(CAPTION_1)
    assert r["name"] == "محمد إسماعيل الصوالحة"

def test_extract_battalion():
    r = parse_caption(CAPTION_1)
    assert r["battalion"] == "كتيبة الشهيد رائد العطار"

def test_extract_brigade():
    r = parse_caption(CAPTION_1)
    assert r["brigade"] == "لواء رفح"

def test_qassami_mujahid_honorific():
    cap = "الشهيد القسامي المجاهد/ أحمد محمد مقداد\nكتيبة X - لواء Y"
    r = parse_caption(cap)
    assert r["name"] == "أحمد محمد مقداد"

def test_missing_battalion():
    cap = "الشهيد القائد الميداني/ فلان الفلاني\n#طوفان_الأقصى"
    r = parse_caption(cap)
    assert r["name"] == "فلان الفلاني"
    assert r["battalion"] == ""
    assert r["brigade"] == ""

def test_empty_caption():
    r = parse_caption("")
    assert r == {"name": "", "battalion": "", "brigade": ""}
```

- [ ] **Step 7.2: Run tests (expect FAIL)**

- [ ] **Step 7.3: Implement `src/parser_caption.py`**

```python
# src/parser_caption.py
import re

NAME_RE = re.compile(r'الشهيد\s+[^/\n]*?/\s*([^\n]+)', re.UNICODE)
BATTALION_RE = re.compile(r'كتيبة\s+([^()\-\n]+?)(?:\s*[\(\-]|\n|$)', re.UNICODE)
BRIGADE_RE = re.compile(r'لواء\s+([^\n#]+?)(?:\s*[\n#]|$)', re.UNICODE)

def parse_caption(text: str) -> dict:
    if not text:
        return {"name": "", "battalion": "", "brigade": ""}

    def grab(rx):
        m = rx.search(text)
        return m.group(1).strip() if m else ""

    return {
        "name": grab(NAME_RE),
        "battalion": ("كتيبة " + grab(BATTALION_RE)) if grab(BATTALION_RE) else "",
        "brigade": ("لواء " + grab(BRIGADE_RE)) if grab(BRIGADE_RE) else "",
    }
```

- [ ] **Step 7.4: Run tests (expect PASS)**

- [ ] **Step 7.5: Checkpoint**

---

### Task 8: `src/parser_ocr.py` — extract from OCR text + date normalizer

**Files:**
- Create: `src/parser_ocr.py`
- Test: `tests/test_parser_ocr.py`

- [ ] **Step 8.1: Write failing tests**

```python
# tests/test_parser_ocr.py
from src.parser_ocr import parse_ocr_text, normalize_date, merge_extractions

OCR_CLEAN = (
    "الرتبة العسكرية: نائب قائد سرية\n"
    "تاريخ الميلاد: 1980-02-12\n"
    "تاريخ الاستشهاد: 2024-05-17\n"
    "المدينة: غزة\n"
    "السلاح: المدفعية\n"
)

def test_parse_clean_ocr():
    r = parse_ocr_text(OCR_CLEAN)
    assert r["birth_date"] == "1980-02-12"
    assert r["martyrdom_date"] == "2024-05-17"
    assert r["city"] == "غزة"
    assert r["weapon"] == "المدفعية"
    assert r["military_rank"] == "نائب قائد سرية"

def test_ignore_field_commander_rank():
    text = "الرتبة العسكرية: القائد الميداني\nتاريخ الميلاد: 1990-01-01"
    r = parse_ocr_text(text)
    assert r["military_rank"] == ""
    assert r["birth_date"] == "1990-01-01"

def test_letter_variations():
    text = "تاريخ الميلاد: 1980-02-12\nالمدينه: غزه\nالرتبه العسكريه: نائب قائد سريه"
    r = parse_ocr_text(text)
    assert r["birth_date"] == "1980-02-12"
    assert r["city"] == "غزه"
    assert r["military_rank"] == "نائب قائد سريه"

def test_normalize_date_iso():
    assert normalize_date("2026-05-08") == "2026-05-08"

def test_normalize_date_slash():
    assert normalize_date("8/5/2026") == "2026-05-08"

def test_normalize_date_arabic_numerals():
    assert normalize_date("٢٠٢٦-٠٥-٠٨") == "2026-05-08"

def test_normalize_date_year_only():
    assert normalize_date("1945") == "1945"

def test_normalize_date_garbage_returns_original():
    assert normalize_date("???") == "???"

def test_merge_extractions_majority_vote():
    extractions = [
        {"birth_date": "1980-02-12", "city": "غزة", "weapon": ""},
        {"birth_date": "1980-02-12", "city": "غزة", "weapon": "المدفعية"},
        {"birth_date": "1880-02-12", "city": "غزة", "weapon": ""},  # OCR error
    ]
    merged = merge_extractions(extractions)
    assert merged["birth_date"] == "1980-02-12"  # majority
    assert merged["city"] == "غزة"  # all agree
    assert merged["weapon"] == "المدفعية"  # only non-empty

def test_merge_extractions_all_empty():
    extractions = [{"birth_date": ""}, {"birth_date": ""}]
    merged = merge_extractions(extractions)
    assert merged["birth_date"] == ""
```

- [ ] **Step 8.2: Run tests (expect FAIL)**

- [ ] **Step 8.3: Implement `src/parser_ocr.py`**

```python
# src/parser_ocr.py
import re
from collections import Counter

PATTERNS = {
    "birth_date":     re.compile(r'تاريخ\s*ال?ميلاد\s*[:：\-]?\s*([0-9٠-٩\s\-/.]+)', re.UNICODE),
    "martyrdom_date": re.compile(r'تاريخ\s*ال?ا?ستشهاد\s*[:：\-]?\s*([0-9٠-٩\s\-/.]+)', re.UNICODE),
    "city":           re.compile(r'ال?مدين[ةه]\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
    "weapon":         re.compile(r'ال?سلاح\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
    "military_rank":  re.compile(r'ال?رتب[ةه]\s*ال?عسكري[ةه]\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
}

RANK_IGNORE = {"القائد الميداني"}
ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

def normalize_date(raw: str) -> str:
    if not raw:
        return ""
    s = raw.translate(ARABIC_INDIC_DIGITS).strip()
    s = re.sub(r"\s+", "", s)
    m = re.match(r"^(\d{4})[\-/.](\d{1,2})[\-/.](\d{1,2})$", s)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4})$", s)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    if re.match(r"^\d{4}$", s):
        return s
    return raw.strip()

def parse_ocr_text(text: str) -> dict:
    if not text:
        return {k: "" for k in PATTERNS.keys()}
    out = {}
    for field, rx in PATTERNS.items():
        m = rx.search(text)
        if not m:
            out[field] = ""
            continue
        val = m.group(1).strip()
        if field in ("birth_date", "martyrdom_date"):
            val = normalize_date(val)
        if field == "military_rank" and val in RANK_IGNORE:
            val = ""
        out[field] = val
    return out

def merge_extractions(extractions: list) -> dict:
    if not extractions:
        return {k: "" for k in PATTERNS.keys()}
    fields = extractions[0].keys()
    merged = {}
    for f in fields:
        values = [e.get(f, "") for e in extractions if e.get(f, "")]
        if not values:
            merged[f] = ""
        else:
            counts = Counter(values)
            merged[f] = counts.most_common(1)[0][0]
    return merged
```

- [ ] **Step 8.4: Run tests (expect PASS)**

- [ ] **Step 8.5: Checkpoint**

---

### Task 9: `src/dedup.py` — group by name, pick HD

**Files:**
- Create: `src/dedup.py`
- Test: `tests/test_dedup.py`

- [ ] **Step 9.1: Write failing tests**

```python
# tests/test_dedup.py
from src.dedup import dedup_by_name, VideoMeta

def test_no_duplicates_keeps_all():
    items = [
        VideoMeta(msg_id=1, name="فلان أ", w=1080, h=1920, size_bytes=1000),
        VideoMeta(msg_id=2, name="فلان ب", w=720, h=1280, size_bytes=500),
    ]
    keep, dupes = dedup_by_name(items)
    assert len(keep) == 2
    assert len(dupes) == 0

def test_pick_highest_resolution():
    items = [
        VideoMeta(msg_id=1, name="فلان أ", w=720, h=1280, size_bytes=500),
        VideoMeta(msg_id=2, name="فلان أ", w=1080, h=1920, size_bytes=900),
        VideoMeta(msg_id=3, name="فلان أ", w=480, h=854, size_bytes=300),
    ]
    keep, dupes = dedup_by_name(items)
    assert len(keep) == 1
    assert keep[0].msg_id == 2
    dupe_ids = {d.duplicate.msg_id for d in dupes}
    assert dupe_ids == {1, 3}
    for d in dupes:
        assert d.kept_msg_id == 2

def test_tie_break_by_size():
    items = [
        VideoMeta(msg_id=1, name="x", w=1080, h=1920, size_bytes=500),
        VideoMeta(msg_id=2, name="x", w=1080, h=1920, size_bytes=900),
    ]
    keep, dupes = dedup_by_name(items)
    assert keep[0].msg_id == 2
```

- [ ] **Step 9.2: Run tests (expect FAIL)**

- [ ] **Step 9.3: Implement `src/dedup.py`**

```python
# src/dedup.py
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class VideoMeta:
    msg_id: int
    name: str
    w: int
    h: int
    size_bytes: int

@dataclass
class DuplicateRecord:
    duplicate: VideoMeta
    kept_msg_id: int
    reason: str

def dedup_by_name(items: list) -> tuple:
    groups = defaultdict(list)
    for it in items:
        groups[it.name].append(it)
    keep = []
    dupes = []
    for name, group in groups.items():
        if len(group) == 1 or not name:
            keep.extend(group)
            continue
        winner = max(group, key=lambda v: (v.w * v.h, v.size_bytes))
        keep.append(winner)
        for it in group:
            if it.msg_id == winner.msg_id:
                continue
            reason = "lower_resolution" if it.w * it.h < winner.w * winner.h else "smaller_file_size"
            dupes.append(DuplicateRecord(duplicate=it, kept_msg_id=winner.msg_id, reason=reason))
    return keep, dupes
```

- [ ] **Step 9.4: Run tests (expect PASS)**

- [ ] **Step 9.5: Checkpoint**

---

### Task 10: `src/excel_writer.py` — openpyxl, RTL, bilingual headers

**Files:**
- Create: `src/excel_writer.py`
- Test: `tests/test_excel_writer.py`

- [ ] **Step 10.1: Write failing tests**

```python
# tests/test_excel_writer.py
from openpyxl import load_workbook
from src.excel_writer import ExcelWriter, MartyrRow, DuplicateRow

def test_writes_bilingual_headers(tmp_path):
    p = tmp_path / "out.xlsx"
    w = ExcelWriter(str(p))
    w.ensure_initialized()
    w.save()
    wb = load_workbook(p)
    ws = wb["الشهداء"]
    assert ws["A1"].value == "المعرف"
    assert ws["A2"].value == "Msg ID"
    assert ws["B1"].value == "الاسم"
    assert ws["D1"].value == "تاريخ الميلاد"
    assert ws.sheet_view.rightToLeft is True

def test_appends_row_and_skips_duplicate_msg_id(tmp_path):
    p = tmp_path / "out.xlsx"
    w = ExcelWriter(str(p))
    w.ensure_initialized()
    row = MartyrRow(
        msg_id=808, name="فلان", name_normalized="فلان",
        birth_date="1980-02-12", martyrdom_date="2024-05-17",
        city="غزة", military_rank="نائب قائد سرية", weapon="المدفعية",
        battalion="كتيبة X", brigade="لواء Y",
        photo_path="data/photos/808.jpg", frame_paths="data/frames/808_*.jpg",
        posted_date="2026-05-09 11:50", message_link="https://t.me/AqmarTofan/808",
        extraction_status="complete", duplicate_status="unique",
    )
    assert w.append_row(row) is True   # first time → True
    assert w.append_row(row) is False  # duplicate msg_id → False (skipped)
    w.save()
    wb = load_workbook(p)
    ws = wb["الشهداء"]
    assert ws.max_row == 3  # 2 header rows + 1 data row

def test_writes_duplicates_sheet(tmp_path):
    p = tmp_path / "out.xlsx"
    w = ExcelWriter(str(p))
    w.ensure_initialized()
    w.append_duplicate(DuplicateRow(
        msg_id=807, name="فلان", reason="lower_resolution",
        resolution="854x480", size_mb=12.3, kept_msg_id=808,
        link="https://t.me/AqmarTofan/807",
    ))
    w.save()
    wb = load_workbook(p)
    assert "النسخ_المكررة" in wb.sheetnames
    ws = wb["النسخ_المكررة"]
    assert ws["A2"].value == 807
```

- [ ] **Step 10.2: Run tests (expect FAIL)**

- [ ] **Step 10.3: Implement `src/excel_writer.py`**

```python
# src/excel_writer.py
import os
from dataclasses import dataclass, asdict
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment

MAIN_SHEET = "الشهداء"
DUPES_SHEET = "النسخ_المكررة"

HEADERS_AR = [
    "المعرف", "الاسم", "الاسم المُطَبَّع", "تاريخ الميلاد", "تاريخ الاستشهاد",
    "المدينة", "الرتبة العسكرية", "السلاح", "الكتيبة", "اللواء",
    "مسار الصورة", "مسار اللقطات", "تاريخ النشر", "رابط الرسالة",
    "حالة الاستخراج", "الحالة",
]
HEADERS_EN = [
    "Msg ID", "Name", "Name Normalized", "Birth Date", "Martyrdom Date",
    "City", "Military Rank", "Weapon", "Battalion", "Brigade",
    "Photo Path", "Frame Paths", "Posted Date", "Message Link",
    "Extraction Status", "Duplicate Status",
]
DUPES_HEADERS_AR = ["المعرف", "الاسم", "السبب", "الدقة", "الحجم", "معرف النسخة المعتمدة", "الرابط"]
DUPES_HEADERS_EN = ["Msg ID", "Name", "Reason", "Resolution", "Size MB", "Kept Msg ID", "Link"]

@dataclass
class MartyrRow:
    msg_id: int
    name: str
    name_normalized: str
    birth_date: str
    martyrdom_date: str
    city: str
    military_rank: str
    weapon: str
    battalion: str
    brigade: str
    photo_path: str
    frame_paths: str
    posted_date: str
    message_link: str
    extraction_status: str
    duplicate_status: str

@dataclass
class DuplicateRow:
    msg_id: int
    name: str
    reason: str
    resolution: str
    size_mb: float
    kept_msg_id: int
    link: str

class ExcelWriter:
    def __init__(self, path: str):
        self.path = path
        self.wb = None

    def ensure_initialized(self) -> None:
        if os.path.exists(self.path):
            self.wb = load_workbook(self.path)
            return
        self.wb = Workbook()
        ws = self.wb.active
        ws.title = MAIN_SHEET
        ws.sheet_view.rightToLeft = True
        for col, (ar, en) in enumerate(zip(HEADERS_AR, HEADERS_EN), start=1):
            ws.cell(row=1, column=col, value=ar).font = Font(bold=True)
            ws.cell(row=2, column=col, value=en).font = Font(italic=True, size=10)
        ws.freeze_panes = "A3"
        # Highlight birth_date (col 4) and martyrdom_date (col 5)
        ws.cell(row=1, column=4).fill = PatternFill("solid", fgColor="FFF2CC")
        ws.cell(row=1, column=5).fill = PatternFill("solid", fgColor="FCE4D6")
        # Duplicates sheet
        ws2 = self.wb.create_sheet(DUPES_SHEET)
        ws2.sheet_view.rightToLeft = True
        for col, (ar, en) in enumerate(zip(DUPES_HEADERS_AR, DUPES_HEADERS_EN), start=1):
            ws2.cell(row=1, column=col, value=ar).font = Font(bold=True)
            ws2.cell(row=2, column=col, value=en).font = Font(italic=True, size=10)
        ws2.freeze_panes = "A3"

    def _existing_msg_ids(self, sheet_name: str) -> set:
        ws = self.wb[sheet_name]
        ids = set()
        for row in ws.iter_rows(min_row=3, max_col=1, values_only=True):
            if row[0] is not None:
                ids.add(int(row[0]))
        return ids

    def append_row(self, row: MartyrRow) -> bool:
        ws = self.wb[MAIN_SHEET]
        if row.msg_id in self._existing_msg_ids(MAIN_SHEET):
            return False
        values = [
            row.msg_id, row.name, row.name_normalized, row.birth_date, row.martyrdom_date,
            row.city, row.military_rank, row.weapon, row.battalion, row.brigade,
            row.photo_path, row.frame_paths, row.posted_date, row.message_link,
            row.extraction_status, row.duplicate_status,
        ]
        ws.append(values)
        # Bold birth + martyrdom date cells
        last = ws.max_row
        ws.cell(row=last, column=4).font = Font(bold=True)
        ws.cell(row=last, column=5).font = Font(bold=True)
        return True

    def append_duplicate(self, row: DuplicateRow) -> None:
        ws = self.wb[DUPES_SHEET]
        ws.append([row.msg_id, row.name, row.reason, row.resolution,
                   row.size_mb, row.kept_msg_id, row.link])

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self.wb.save(self.path)
```

- [ ] **Step 10.4: Run tests (expect PASS)**

```powershell
pytest tests/test_excel_writer.py -v
```

- [ ] **Step 10.5: Checkpoint**

---

## IO modules (integration-tested via phase scripts)

### Task 11: `src/telegram_client.py` — Telethon wrapper

**Files:**
- Create: `src/telegram_client.py`

- [ ] **Step 11.1: Implement Telethon wrapper**

```python
# src/telegram_client.py
import os
import asyncio
from dataclasses import dataclass
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument, DocumentAttributeVideo
from telethon.errors import FloodWaitError, SessionPasswordNeededError

@dataclass
class TgMessage:
    msg_id: int
    posted_date: str
    caption: str
    has_photo: bool
    has_video: bool
    video_w: int
    video_h: int
    video_size: int
    video_duration: float
    raw: object  # Telethon Message

class TelegramFetcher:
    def __init__(self, api_id: int, api_hash: str, phone: str,
                 two_fa: str, session_path: str, channel: str):
        os.makedirs(os.path.dirname(session_path) or ".", exist_ok=True)
        self.client = TelegramClient(session_path, api_id, api_hash)
        self.phone = phone
        self.two_fa = two_fa
        self.channel = channel

    async def connect(self) -> None:
        await self.client.connect()
        if not await self.client.is_user_authorized():
            await self.client.send_code_request(self.phone)
            code = input("Enter the Telegram code sent to your app: ")
            try:
                await self.client.sign_in(self.phone, code)
            except SessionPasswordNeededError:
                await self.client.sign_in(password=self.two_fa)

    async def disconnect(self) -> None:
        await self.client.disconnect()

    async def fetch_all_messages(self, min_id: int = 0) -> list:
        out = []
        async for msg in self.client.iter_messages(self.channel, reverse=True, min_id=min_id):
            out.append(self._to_tg_message(msg))
        return out

    def _to_tg_message(self, msg) -> TgMessage:
        caption = msg.message or ""
        has_photo = isinstance(msg.media, MessageMediaPhoto)
        has_video = False
        w = h = 0
        size = 0
        duration = 0.0
        if isinstance(msg.media, MessageMediaDocument) and msg.media.document:
            doc = msg.media.document
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    has_video = True
                    w = attr.w or 0
                    h = attr.h or 0
                    duration = attr.duration or 0.0
            size = doc.size or 0
        return TgMessage(
            msg_id=msg.id,
            posted_date=msg.date.strftime("%Y-%m-%d %H:%M"),
            caption=caption,
            has_photo=has_photo,
            has_video=has_video,
            video_w=w, video_h=h, video_size=size, video_duration=duration,
            raw=msg,
        )

    async def download_photo(self, tg_msg: TgMessage, out_path: str) -> str:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        return await self.client.download_media(tg_msg.raw, file=out_path)

    async def download_video(self, tg_msg: TgMessage, out_path: str) -> str:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        async def with_retry():
            for attempt in range(3):
                try:
                    return await self.client.download_media(tg_msg.raw, file=out_path)
                except FloodWaitError as e:
                    await asyncio.sleep(e.seconds)
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
        return await with_retry()
```

- [ ] **Step 11.2: Smoke import test**

```powershell
python -c "from src.telegram_client import TelegramFetcher; print('OK')"
```

Expected: prints `OK` without import errors.

- [ ] **Step 11.3: Checkpoint**

---

### Task 12: `src/frame_extractor.py` — ffmpeg frame extraction

**Files:**
- Create: `src/frame_extractor.py`
- Test: `tests/test_frame_extractor.py`

- [ ] **Step 12.1: Write integration test (uses real ffmpeg)**

```python
# tests/test_frame_extractor.py
import subprocess
import os
from src.frame_extractor import extract_frames, DEFAULT_TIMESTAMPS

def test_extracts_frames_from_generated_video(tmp_path):
    # Generate a 35-second test video with ffmpeg (color bars + timestamp)
    video = tmp_path / "test.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=35:size=320x240:rate=10",
        "-vcodec", "libx264", "-pix_fmt", "yuv420p", str(video)
    ], check=True)
    out_dir = tmp_path / "frames"
    paths = extract_frames(str(video), str(out_dir), msg_id=99,
                           timestamps=DEFAULT_TIMESTAMPS)
    assert len(paths) == 6
    for p in paths:
        assert os.path.exists(p)
        assert os.path.getsize(p) > 0
```

- [ ] **Step 12.2: Run test (expect FAIL — module doesn't exist)**

- [ ] **Step 12.3: Implement `src/frame_extractor.py`**

```python
# src/frame_extractor.py
import os
import subprocess

DEFAULT_TIMESTAMPS = [5, 10, 15, 20, 25, 30]

def extract_frames(video_path: str, out_dir: str, msg_id: int,
                   timestamps=None) -> list:
    if timestamps is None:
        timestamps = DEFAULT_TIMESTAMPS
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for sec in timestamps:
        out_path = os.path.join(out_dir, f"{msg_id}_{sec:02d}.jpg")
        try:
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(sec), "-i", video_path,
                "-frames:v", "1", "-q:v", "2", out_path
            ], check=True, timeout=30)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                paths.append(out_path)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    return paths
```

- [ ] **Step 12.4: Run test (expect PASS)**

```powershell
pytest tests/test_frame_extractor.py -v
```

Note: Test takes ~5 seconds (ffmpeg encoding). If it fails with "ffmpeg not found", install ffmpeg and add to PATH.

- [ ] **Step 12.5: Checkpoint**

---

### Task 13: `src/ocr_engine.py` — EasyOCR wrapper

**Files:**
- Create: `src/ocr_engine.py`

- [ ] **Step 13.1: Implement OCR wrapper**

```python
# src/ocr_engine.py
import easyocr

_reader = None

def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        # First call downloads ~250 MB of models. CPU mode (no GPU required).
        _reader = easyocr.Reader(["ar", "en"], gpu=False, verbose=False)
    return _reader

def ocr_image(image_path: str) -> str:
    reader = get_reader()
    results = reader.readtext(image_path, detail=0, paragraph=True)
    return "\n".join(results)
```

- [ ] **Step 13.2: Smoke test (manual — first run downloads models)**

```powershell
python -c "from src.ocr_engine import get_reader; get_reader(); print('Models loaded')"
```

Expected: prints `Models loaded` after a one-time ~250 MB download.

- [ ] **Step 13.3: Checkpoint**

---

## Orchestration

### Task 14: `src/pipeline.py` — per-message orchestration

**Files:**
- Create: `src/pipeline.py`

- [ ] **Step 14.1: Implement pipeline**

```python
# src/pipeline.py
import os
import logging
import tempfile
from src.parser_caption import parse_caption
from src.parser_ocr import parse_ocr_text, merge_extractions
from src.name_normalizer import normalize_arabic_name
from src.frame_extractor import extract_frames
from src.ocr_engine import ocr_image
from src.excel_writer import MartyrRow

log = logging.getLogger("pipeline")

def determine_status(merged: dict) -> str:
    if not merged.get("birth_date") and not merged.get("martyrdom_date"):
        return "missing_critical"
    if not merged.get("birth_date"):
        return "partial_birth"
    if not merged.get("martyrdom_date"):
        return "partial_martyrdom"
    return "complete"

async def process_message(tg_msg, fetcher, channel: str,
                          photos_dir: str, frames_dir: str,
                          missing_birth_log_path: str) -> MartyrRow:
    msg_id = tg_msg.msg_id
    log.info(f"Processing msg {msg_id}")

    cap = parse_caption(tg_msg.caption)

    photo_path = ""
    if tg_msg.has_photo:
        photo_path = os.path.join(photos_dir, f"{msg_id}.jpg")
        try:
            await fetcher.download_photo(tg_msg, photo_path)
        except Exception as e:
            log.warning(f"Photo download failed for {msg_id}: {e}")
            photo_path = ""

    frame_paths = []
    merged = {"birth_date": "", "martyrdom_date": "", "city": "",
              "weapon": "", "military_rank": ""}

    if tg_msg.has_video:
        with tempfile.TemporaryDirectory() as td:
            video_path = os.path.join(td, f"{msg_id}.mp4")
            try:
                await fetcher.download_video(tg_msg, video_path)
                frame_paths = extract_frames(video_path, frames_dir, msg_id)
            except Exception as e:
                log.warning(f"Video download/extract failed for {msg_id}: {e}")
        if frame_paths:
            extractions = []
            for fp in frame_paths:
                try:
                    text = ocr_image(fp)
                    extractions.append(parse_ocr_text(text))
                except Exception as e:
                    log.warning(f"OCR failed on {fp}: {e}")
            merged = merge_extractions(extractions)

    # Photo OCR fallback for critical missing fields
    if photo_path and (not merged["birth_date"] or not merged["martyrdom_date"]):
        try:
            text = ocr_image(photo_path)
            photo_extract = parse_ocr_text(text)
            if not merged["birth_date"]:
                merged["birth_date"] = photo_extract.get("birth_date", "")
            if not merged["martyrdom_date"]:
                merged["martyrdom_date"] = photo_extract.get("martyrdom_date", "")
            for k in ("city", "weapon", "military_rank"):
                if not merged[k]:
                    merged[k] = photo_extract.get(k, "")
        except Exception as e:
            log.warning(f"Photo OCR fallback failed for {msg_id}: {e}")

    status = determine_status(merged)
    if status in ("partial_birth", "missing_critical"):
        with open(missing_birth_log_path, "a", encoding="utf-8") as f:
            f.write(f"{msg_id}\n")

    return MartyrRow(
        msg_id=msg_id,
        name=cap["name"],
        name_normalized=normalize_arabic_name(cap["name"]),
        birth_date=merged.get("birth_date", ""),
        martyrdom_date=merged.get("martyrdom_date", ""),
        city=merged.get("city", ""),
        military_rank=merged.get("military_rank", ""),
        weapon=merged.get("weapon", ""),
        battalion=cap["battalion"],
        brigade=cap["brigade"],
        photo_path=photo_path,
        frame_paths=";".join(frame_paths),
        posted_date=tg_msg.posted_date,
        message_link=f"https://t.me/{channel}/{msg_id}",
        extraction_status=status,
        duplicate_status="unique",
    )
```

- [ ] **Step 14.2: Smoke import test**

```powershell
python -c "from src.pipeline import process_message; print('OK')"
```

- [ ] **Step 14.3: Checkpoint**

---

## Phase scripts

### Task 15: `scripts/phase0_sample.py` — sample frames for review

**Files:**
- Create: `scripts/phase0_sample.py`

- [ ] **Step 15.1: Implement phase0 script**

```python
# scripts/phase0_sample.py
import asyncio
import sys
import logging
import random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.frame_extractor import extract_frames
import tempfile
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    print("Fetching all messages from channel...")
    messages = await fetcher.fetch_all_messages()
    videos = [m for m in messages if m.has_video]
    print(f"Found {len(videos)} video messages.")

    # Pick: 1 oldest, 1 newest, 3 random middle
    if len(videos) < 5:
        samples = videos
    else:
        oldest = videos[0]
        newest = videos[-1]
        middle = random.sample(videos[1:-1], 3)
        samples = [oldest] + middle + [newest]

    print("\nSelected samples:")
    for s in samples:
        print(f"  msg {s.msg_id} | {s.posted_date} | {s.video_w}x{s.video_h} | {s.video_size//1024//1024}MB")

    frames_dir = "data/frames"
    for s in samples:
        print(f"\nProcessing msg {s.msg_id}...")
        with tempfile.TemporaryDirectory() as td:
            video_path = os.path.join(td, f"{s.msg_id}.mp4")
            await fetcher.download_video(s, video_path)
            paths = extract_frames(video_path, frames_dir, s.msg_id)
            print(f"  Extracted {len(paths)} frames:")
            for p in paths:
                print(f"    {p}")

    await fetcher.disconnect()
    print("\nPhase 0 done. Review the frames above with the user before Phase 1.")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 15.2: Run Phase 0**

```powershell
.venv\Scripts\activate
python scripts\phase0_sample.py
```

First run: Telegram will text a code to your Telegram app — type it in the prompt. After that, the session is saved and no code is needed for future runs.

- [ ] **Step 15.3: 🚦 PHASE 0 GATE — show user the extracted frames**

Open the JPGs in `data/frames/` and visually verify:
- Birth date is visible in at least one frame
- Martyrdom date is visible in at least one frame
- City is visible in at least one frame

If user confirms data is visible → proceed to Task 16.
If data is NOT visible → revisit frame timestamps in `src/frame_extractor.py` (try 15-30 range only, or 8-25, etc.) and re-run Phase 0.

- [ ] **Step 15.4: Checkpoint**

---

### Task 16: `scripts/phase1_test.py` — full pipeline on 5 samples

**Files:**
- Create: `scripts/phase1_test.py`

- [ ] **Step 16.1: Implement phase1 script**

```python
# scripts/phase1_test.py
import asyncio
import sys
import logging
import random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.excel_writer import ExcelWriter
from src.state import State

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"

async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    messages = await fetcher.fetch_all_messages()
    videos = [m for m in messages if m.has_video]
    if len(videos) < 5:
        samples = videos
    else:
        samples = [videos[0]] + random.sample(videos[1:-1], 3) + [videos[-1]]

    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    state = State.load(STATE_PATH)

    for tg in samples:
        try:
            row = await process_message(tg, fetcher, cfg.channel_username,
                                        PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG)
            writer.append_row(row)
            state.mark_processed(tg.msg_id, row.extraction_status)
            print(f"  msg {tg.msg_id}: {row.extraction_status} | birth={row.birth_date} | martyrdom={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {tg.msg_id}: {e}")
            state.mark_processed(tg.msg_id, "failed")

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nPhase 1 done. Open {EXCEL_PATH} and verify the 5 rows.")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 16.2: Run Phase 1**

```powershell
python scripts\phase1_test.py
```

- [ ] **Step 16.3: 🚦 PHASE 1 GATE — user opens Excel, verifies quality**

Acceptance: ≥4 of 5 birth dates correct AND ≥4 of 5 martyrdom dates correct.

If gate fails → tune (frame timestamps, OCR preprocessing in `Pillow`, regex patterns in `parser_ocr.py`) and re-run Phase 1.

- [ ] **Step 16.4: Checkpoint**

---

### Task 17: `scripts/phase2_backfill.py` — process all historical

**Files:**
- Create: `scripts/phase2_backfill.py`

- [ ] **Step 17.1: Implement phase2 script**

```python
# scripts/phase2_backfill.py
import asyncio
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.excel_writer import ExcelWriter, DuplicateRow
from src.state import State
from src.dedup import dedup_by_name, VideoMeta
from src.parser_caption import parse_caption

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler("logs/pipeline.log", encoding="utf-8"),
              logging.StreamHandler()],
)

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"

async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    print("Fetching all messages...")
    messages = await fetcher.fetch_all_messages()
    videos = [m for m in messages if m.has_video]
    print(f"Total video messages: {len(videos)}")

    # Dedup: build VideoMeta from caption.name + video metadata
    items = []
    for tg in videos:
        cap = parse_caption(tg.caption)
        items.append(VideoMeta(
            msg_id=tg.msg_id, name=cap["name"],
            w=tg.video_w, h=tg.video_h, size_bytes=tg.video_size,
        ))
    keep, dupes = dedup_by_name(items)
    print(f"After dedup: {len(keep)} unique, {len(dupes)} duplicates skipped")

    keep_ids = {k.msg_id for k in keep}
    msg_by_id = {m.msg_id: m for m in videos}

    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    state = State.load(STATE_PATH)

    # Write duplicates sheet
    for d in dupes:
        meta = d.duplicate
        writer.append_duplicate(DuplicateRow(
            msg_id=meta.msg_id, name=meta.name, reason=d.reason,
            resolution=f"{meta.w}x{meta.h}",
            size_mb=round(meta.size_bytes / 1024 / 1024, 2),
            kept_msg_id=d.kept_msg_id,
            link=f"https://t.me/{cfg.channel_username}/{meta.msg_id}",
        ))

    # Process each unique HD message
    for i, kept in enumerate(keep, start=1):
        if state.is_processed(kept.msg_id):
            print(f"[{i}/{len(keep)}] Skip msg {kept.msg_id} (already processed)")
            continue
        tg = msg_by_id[kept.msg_id]
        print(f"[{i}/{len(keep)}] Processing msg {kept.msg_id}...")
        try:
            row = await process_message(tg, fetcher, cfg.channel_username,
                                        PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG)
            writer.append_row(row)
            state.mark_processed(kept.msg_id, row.extraction_status)
        except Exception as e:
            logging.exception(f"Failed msg {kept.msg_id}: {e}")
            state.mark_processed(kept.msg_id, "failed")
        if i % 10 == 0:
            writer.save()
            state.save(STATE_PATH)

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nBackfill complete. {len(keep)} rows in {EXCEL_PATH}")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 17.2: Run Phase 2**

```powershell
python scripts\phase2_backfill.py
```

Estimated time: 30-60 minutes. The script saves state every 10 messages, so a crash is recoverable.

- [ ] **Step 17.3: 🚦 PHASE 2 GATE — user reviews full Excel**

Open `data/martyrs.xlsx`. Check:
- Total row count makes sense (~400 minus duplicates)
- Duplicates sheet populated
- Birth dates filled for ≥85% of rows
- Spot-check 10 random rows against the channel manually

- [ ] **Step 17.4: Checkpoint**

---

### Task 18: `scripts/phase3_daily.py` — incremental daily run

**Files:**
- Create: `scripts/phase3_daily.py`

- [ ] **Step 18.1: Implement phase3 script**

```python
# scripts/phase3_daily.py
import asyncio
import sys
import logging
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.excel_writer import ExcelWriter
from src.state import State
from src.parser_caption import parse_caption

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler("logs/daily.log", encoding="utf-8"),
              logging.StreamHandler()],
)

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"

async def main():
    cfg = load_config()
    state = State.load(STATE_PATH)
    min_id = (state.last_processed_msg_id or 0) + 1

    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    new_msgs = await fetcher.fetch_all_messages(min_id=min_id)
    new_videos = [m for m in new_msgs if m.has_video]
    print(f"{datetime.now().isoformat()} | new video messages since msg {min_id}: {len(new_videos)}")

    if not new_videos:
        await fetcher.disconnect()
        return

    # Read existing names from Excel for cross-run dedup
    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()

    # Simple per-day dedup: only handle dupes within new batch (not against backfill)
    seen_names = set()
    for tg in new_videos:
        if state.is_processed(tg.msg_id):
            continue
        cap = parse_caption(tg.caption)
        if cap["name"] and cap["name"] in seen_names:
            print(f"  Skipping intra-batch duplicate: msg {tg.msg_id} ({cap['name']})")
            state.mark_processed(tg.msg_id, "duplicate_in_batch")
            continue
        seen_names.add(cap["name"])
        try:
            row = await process_message(tg, fetcher, cfg.channel_username,
                                        PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG)
            writer.append_row(row)
            state.mark_processed(tg.msg_id, row.extraction_status)
            print(f"  msg {tg.msg_id}: {row.extraction_status}")
        except Exception as e:
            logging.exception(f"Failed msg {tg.msg_id}: {e}")
            state.mark_processed(tg.msg_id, "failed")

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"Daily run complete. Processed {len(new_videos)} new videos.")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 18.2: Run Phase 3 manually first (one-time validation)**

```powershell
python scripts\phase3_daily.py
```

Should output `new video messages since msg <last_id>: N` (likely 0 immediately after backfill, more if days have passed).

- [ ] **Step 18.3: Checkpoint**

---

### Task 19: `scripts/setup_daily_trigger.ps1` — Windows Task Scheduler

**Files:**
- Create: `scripts/setup_daily_trigger.ps1`

- [ ] **Step 19.1: Implement PowerShell setup script**

```powershell
# scripts/setup_daily_trigger.ps1
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$script = Join-Path $projectRoot "scripts\phase3_daily.py"
$logFile = Join-Path $projectRoot "logs\daily_errors.log"
$taskName = "AqmarTofan Daily Scrape"

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv python not found at $venvPython. Run: python -m venv .venv first."
}
if (-not (Test-Path $script)) {
    Write-Error "Script not found at $script."
}

# Read DAILY_RUN_HOUR from .env (default 9)
$envFile = Join-Path $projectRoot ".env"
$hour = 9
if (Test-Path $envFile) {
    $line = (Get-Content $envFile | Where-Object { $_ -match "^DAILY_RUN_HOUR=" })
    if ($line) { $hour = [int]($line -replace "DAILY_RUN_HOUR=", "") }
}
$triggerTime = (Get-Date).Date.AddHours($hour)

$cmd = "`"$venvPython`" `"$script`" 2>> `"$logFile`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"cd '$projectRoot'; & $cmd`"" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Daily scrape of @AqmarTofan channel"

Write-Host "Scheduled task '$taskName' created. Runs daily at $($triggerTime.ToString('HH:mm'))."
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
```

- [ ] **Step 19.2: Test setup script (creates the task; doesn't execute it)**

```powershell
.\scripts\setup_daily_trigger.ps1
Get-ScheduledTask -TaskName "AqmarTofan Daily Scrape"
```

Expected: prints task info with State = `Ready`.

- [ ] **Step 19.3: 🚦 PHASE 3 GATE — wait for two consecutive successful daily runs**

Check `logs/daily.log` after 24h and 48h. If both runs completed without errors → done.

- [ ] **Step 19.4: Checkpoint**

---

## Day-2 utilities

### Task 20: `scripts/reprocess.py` — re-process a specific message

**Files:**
- Create: `scripts/reprocess.py`

- [ ] **Step 20.1: Implement reprocess script**

```python
# scripts/reprocess.py
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.excel_writer import ExcelWriter
from src.state import State

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"

async def main(msg_id: int):
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    msg = await fetcher.client.get_messages(cfg.channel_username, ids=msg_id)
    if msg is None:
        print(f"Message {msg_id} not found.")
        await fetcher.disconnect()
        return
    tg = fetcher._to_tg_message(msg)
    if not tg.has_video:
        print(f"Message {msg_id} has no video; skipping.")
        await fetcher.disconnect()
        return
    row = await process_message(tg, fetcher, cfg.channel_username,
                                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG)
    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    # Note: append_row will skip if msg_id exists; for re-process we need to manually
    # remove the old row first. For v1, we just print and don't update Excel.
    print(f"msg {msg_id}: {row.extraction_status}")
    print(f"  birth: {row.birth_date}")
    print(f"  martyrdom: {row.martyrdom_date}")
    print(f"  city: {row.city}")
    print(f"  rank: {row.military_rank}")
    print(f"  weapon: {row.weapon}")
    await fetcher.disconnect()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--msg-id", type=int, required=True)
    args = parser.parse_args()
    asyncio.run(main(args.msg_id))
```

- [ ] **Step 20.2: Smoke test**

```powershell
python scripts\reprocess.py --msg-id 808
```

Expected: prints extracted fields for message 808.

- [ ] **Step 20.3: Checkpoint**

---

### Task 21: `scripts/status.py` — print pipeline counts

**Files:**
- Create: `scripts/status.py`

- [ ] **Step 21.1: Implement status script**

```python
# scripts/status.py
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.state import State
from openpyxl import load_workbook

STATE_PATH = "data/state.json"
EXCEL_PATH = "data/martyrs.xlsx"

def main():
    state = State.load(STATE_PATH)
    print(f"Total processed messages: {len(state.processed_msg_ids)}")
    print(f"Last processed msg_id:     {state.last_processed_msg_id}")
    counts = Counter(state.statuses.values())
    print("\nStatus breakdown:")
    for status, n in counts.most_common():
        print(f"  {status:25} {n}")

    if Path(EXCEL_PATH).exists():
        wb = load_workbook(EXCEL_PATH)
        ws = wb["الشهداء"]
        print(f"\nExcel rows: {ws.max_row - 2} (excluding 2 header rows)")
        if "النسخ_المكررة" in wb.sheetnames:
            ws2 = wb["النسخ_المكررة"]
            print(f"Duplicate rows: {ws2.max_row - 2}")

    log = Path("logs/missing_birthdates.log")
    if log.exists():
        n = len(log.read_text(encoding="utf-8").strip().splitlines())
        print(f"\nMissing birthdates queue: {n} msg_ids in {log}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 21.2: Smoke test**

```powershell
python scripts\status.py
```

Expected: prints counts and breakdown.

- [ ] **Step 21.3: Checkpoint**

---

## Final verification

### Task 22: Acceptance criteria check

- [ ] **Step 22.1: Verify each spec acceptance criterion**

Open the spec section 16 and confirm:

1. ☐ All Phase 0–3 gates have passed (✅ user confirmed at each gate above)
2. ☐ `data/martyrs.xlsx` contains rows for ~all unique martyrs in the channel after dedup
3. ☐ Birth date populated for ≥85% of rows (run a quick count via `scripts\status.py`)
4. ☐ Martyrdom date populated for ≥85% of rows
5. ☐ Daily scheduled task is registered (`Get-ScheduledTask -TaskName "AqmarTofan Daily Scrape"`) and has run successfully twice (`logs\daily.log`)
6. ☐ `logs/missing_birthdates.log` exists and is reviewable

- [ ] **Step 22.2: Quick coverage report**

```powershell
$wb = New-Object -ComObject Excel.Application
$wb.Visible = $false
$book = $wb.Workbooks.Open((Resolve-Path "data\martyrs.xlsx").Path)
$ws = $book.Worksheets.Item("الشهداء")
$total = $ws.UsedRange.Rows.Count - 2
$birthFilled = 0
$martyrdomFilled = 0
for ($i = 3; $i -le $total + 2; $i++) {
    if ($ws.Cells.Item($i, 4).Text) { $birthFilled++ }
    if ($ws.Cells.Item($i, 5).Text) { $martyrdomFilled++ }
}
$book.Close($false)
$wb.Quit()
Write-Host "Total: $total | Birth filled: $birthFilled ($([math]::Round($birthFilled/$total*100,1))%) | Martyrdom filled: $martyrdomFilled ($([math]::Round($martyrdomFilled/$total*100,1))%)"
```

If birth_filled% ≥ 85 → ✅ acceptance met.

- [ ] **Step 22.3: Final checkpoint — show user the report and announce v1 complete**

---

## Self-Review (performed after writing this plan)

| Check | Result |
|---|---|
| Spec coverage | ✅ Every spec section maps to tasks: Sec 4 stack→T2, Sec 5 layout→T1, Sec 6 data flow→T14, Sec 7 Excel→T10, Sec 8 parsing→T7,T8, Sec 9 multi-frame→T12,T14, Sec 10 dedup→T9, Sec 11 phasing→T15-T19, Sec 12 errors→T11,T14 (retry+fallback), Sec 13 ops→T19,T20,T21, Sec 14 config→T1,T3, Sec 16 acceptance→T22. |
| Placeholders | ✅ No `TBD`/`TODO`/`fill in` left. Every code step has complete code. |
| Type consistency | ✅ `MartyrRow` fields match Excel `HEADERS_AR` order. `VideoMeta` and `DuplicateRecord` consistent across `dedup.py` and tests. `TgMessage` consistent in telegram_client.py and pipeline.py. |
| Git commits | ✅ Replaced with "Checkpoint — ask user before committing" per user's CLAUDE.md rule. |
