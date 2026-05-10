# AqmarTofan Scraper — Design Document

| | |
|---|---|
| **Date** | 2026-05-10 |
| **Author** | Mohamed Khamis (with Claude Code) |
| **Project** | AQMAR — Telegram channel scraper |
| **Status** | Draft awaiting user approval |
| **Source channel** | https://t.me/AqmarTofan (public, ~400 posts, ~60K subscribers) |

---

## 1. Goal

Build a free, fully-local Python pipeline that:

1. **Backfills** all historical posts from the public Telegram channel `@AqmarTofan` ("أقمار الطوفان" — a memorial channel for شهداء القسام / Qassam martyrs in معركة طوفان الأقصى).
2. **Extracts structured fields** from each post: name, military rank, battalion, brigade, birth date, martyrdom date, city, weapon, photo, message link.
3. **Outputs** a single Excel file (`data/martyrs.xlsx`) with bilingual Arabic/English headers, one row per unique martyr.
4. **Deduplicates** posts where the same martyr appears in multiple videos (different qualities); keeps the HD copy only.
5. **Runs daily** thereafter to append only new posts (idempotent — no duplicate rows).

## 2. Constraints

- **No paid APIs.** All extraction must run locally with free open-source libraries.
- **Windows host** (`D:\Repo\01-Khamis-Projects\AQMAR`) — runs on the user's machine, scheduled via Windows Task Scheduler.
- **Privacy** — all secrets in `.env`; gitignored. Telethon session file gitignored.
- **Field accuracy priority** — Birth date > Martyrdom date > all other fields. Failures in those two trigger automatic retries on additional video frames + photo OCR fallback.
- **Disk** — 80 GB free; videos are downloaded temporarily and deleted after frame extraction. Photos and frames retained.

## 3. Architecture

### High-level flow

```
Telegram channel (public, MTProto)
   │
   ▼
┌─────────────────────────────────────────────────────────┐
│  PIPELINE (Python)                                      │
│                                                          │
│   1. Fetch all messages (Telethon)                      │
│   2. Parse captions → extract name, battalion, brigade  │
│   3. Group by name → dedup → keep HD video              │
│   4. For each unique HD message:                        │
│        a. Download photo                                │
│        b. Download video → ffmpeg extract 6 frames      │
│           at sec 5, 10, 15, 20, 25, 30                  │
│        c. EasyOCR each frame → merge → birth/martyrdom/ │
│           city/weapon/rank                              │
│        d. Delete video                                  │
│        e. Write Excel row                               │
│   5. Save state.json (last processed msg_id)            │
└─────────────────────────────────────────────────────────┘
   │
   ▼
data/martyrs.xlsx  +  data/photos/  +  data/frames/  +  data/state.json
```

### Architectural principles

1. **Separation of concerns** — each `src/*.py` file has one responsibility.
2. **Idempotent** — re-running on the same messages produces the same Excel.
3. **Resumable** — state saved after each message; can resume after crash.
4. **Observable** — every action logged to `logs/pipeline.log` with timestamps.
5. **Modular phases** — `scripts/phaseN_*.py` are self-contained entry points.
6. **Birth date is sacred** — special-cased retry logic for the most important field.

## 4. Tech Stack

| Layer | Library | Rationale |
|---|---|---|
| Runtime | Python 3.11+ | Best Telethon + EasyOCR support |
| Telegram client | [Telethon](https://docs.telethon.dev/) | MTProto — required to read channel history (Bot API cannot) |
| Video frame extraction | `ffmpeg` (binary) + `ffmpeg-python` wrapper | Industry standard, free |
| OCR | [EasyOCR](https://github.com/JaidedAI/EasyOCR) (Arabic + English models) | Free, local, deep-learning Arabic OCR |
| Excel I/O | [openpyxl](https://openpyxl.readthedocs.io/) | Read/write `.xlsx`, RTL support, cell formatting |
| Image preprocessing | Pillow | Contrast/brightness boost before OCR |
| Config | python-dotenv | `.env` loader |
| Scheduling | Windows Task Scheduler (PowerShell-created) | Native, no extra dependencies |

### System prerequisites (one-time install)

1. **Python 3.11+** — https://www.python.org/downloads/
2. **ffmpeg** — https://www.gyan.dev/ffmpeg/builds/ (added to PATH)

Both verified by Phase 0 setup before any code runs.

## 5. File & Folder Layout

```
D:\Repo\01-Khamis-Projects\AQMAR\
├── .env                          # secrets (GITIGNORED)
├── .env.example                  # template, safe to commit
├── .gitignore
├── README.md
├── requirements.txt
│
├── src/
│   ├── __init__.py
│   ├── config.py                 # loads .env
│   ├── telegram_client.py        # Telethon wrapper (auth, fetch, download)
│   ├── frame_extractor.py        # ffmpeg → 6 frames at 5/10/15/20/25/30s
│   ├── ocr_engine.py             # EasyOCR wrapper
│   ├── parser_caption.py         # regex: extract name/rank/battalion/brigade
│   ├── parser_ocr.py             # regex: extract dates/city/weapon from OCR text
│   ├── name_normalizer.py        # Arabic letter normalization
│   ├── dedup.py                  # group by name, pick HD, mark duplicates
│   ├── excel_writer.py           # openpyxl wrapper, RTL, bilingual headers
│   ├── state.py                  # state.json read/write
│   └── pipeline.py               # orchestrates per-message flow
│
├── scripts/
│   ├── phase0_sample.py          # download 5 sample frames, present to user
│   ├── phase1_test.py            # full pipeline on 5 samples → Excel
│   ├── phase2_backfill.py        # full pipeline on all ~400 historical
│   ├── phase3_daily.py           # incremental daily run (skips processed msgs)
│   ├── reprocess.py              # re-process a specific msg_id
│   ├── status.py                 # print pipeline status counts
│   └── setup_daily_trigger.ps1   # creates Windows Scheduled Task
│
├── data/                         # outputs (GITIGNORED)
│   ├── martyrs.xlsx              # the deliverable
│   ├── photos/<msg_id>.jpg       # downloaded photos (kept)
│   ├── frames/<msg_id>_<sec>.jpg # extracted video frames (kept for review)
│   └── state.json                # processed msg_ids, errors
│
├── logs/                         # GITIGNORED
│   ├── pipeline.log              # main rolling log
│   ├── errors.log                # errors only
│   ├── missing_birthdates.log    # msg_ids with no birthdate (manual review queue)
│   └── daily.log                 # daily run summaries
│
├── session/                      # GITIGNORED
│   └── aqmar.session             # Telethon session file
│
└── docs/superpowers/specs/
    └── 2026-05-10-aqmar-tofan-scraper-design.md   # this file
```

## 6. Data Flow (per message)

```
Telegram message (msg_id)
    │
    ├─ Already in state.json (processed)? ──→ YES → SKIP, log "duplicate", next
    │                                          NO → continue
    │
    ├─ Fetch: caption + media (photo + video) + posted_date
    │
    ├─ Parse CAPTION:
    │     name        ← text after "الشهيد <honorific>/"
    │     battalion   ← text after "كتيبة" up to "(" or "-"
    │     brigade     ← text after "لواء" up to end/hashtag
    │
    ├─ Compute name_normalized (Arabic-normalized for future filtering)
    │
    ├─ Download PHOTO ──→ data/photos/<msg_id>.jpg ✅ keep
    │
    ├─ Download VIDEO (temp file in OS temp dir)
    │     ffmpeg → 6 frames at sec 5,10,15,20,25,30
    │     → data/frames/<msg_id>_05.jpg ... <msg_id>_30.jpg ✅ keep
    │     → DELETE video file
    │
    ├─ EasyOCR on each frame → 6 raw text blobs
    │     → parser_ocr.merge() → birth_date, martyrdom_date, city,
    │                            weapon, military_rank
    │
    ├─ If birth_date OR martyrdom_date is empty:
    │     fallback: EasyOCR(photo) → re-parse → fill missing
    │
    ├─ If still empty after fallback:
    │     log msg_id to logs/missing_birthdates.log
    │     extraction_status = "missing_critical"
    │
    ├─ Combine all fields + msg metadata:
    │     msg_id, posted_date, message_link, photo_path, frame_paths
    │
    ├─ Write Excel row (skip if msg_id already in sheet)
    │
    ├─ Update state.json: last_processed_msg_id, extraction_status
    │
    └─ Log result → logs/pipeline.log
```

## 7. Excel Schema — `data/martyrs.xlsx`

**Sheet 1:** `الشهداء` (Martyrs) — RTL layout, frozen header rows
**Sheet 2:** `النسخ_المكررة` (Duplicates) — list of skipped duplicate msg_ids with reasons

### Main sheet columns (16 total)

Row 1 = Arabic headers, Row 2 = English headers, Row 3+ = data.

| # | العربية (Row 1) | English (Row 2) | Source | Notes / example |
|---|---|---|---|---|
| 1 | المعرف | Msg ID | Telegram | `808` |
| 2 | الاسم | Name | Caption (display) | `محمد إسماعيل الصوالحة` |
| 3 | الاسم المُطَبَّع | Name Normalized | Computed | `محمد اسماعيل الصوالحه` (for future filtering only) |
| 4 | تاريخ الميلاد | Birth Date | Video OCR (priority 1) | `1980-02-12` — bold, light yellow background |
| 5 | تاريخ الاستشهاد | Martyrdom Date | Video OCR (priority 2) | `2024-05-17` — bold, light orange background |
| 6 | المدينة | City | Video OCR | `غزة` |
| 7 | الرتبة العسكرية | Military Rank | Video OCR ONLY | `نائب قائد سرية` (ignore `القائد الميداني` if matched) |
| 8 | السلاح | Weapon | Video OCR | `المدفعية` |
| 9 | الكتيبة | Battalion | Caption | `كتيبة الشهيد رائد العطار` |
| 10 | اللواء | Brigade | Caption | `لواء رفح` |
| 11 | مسار الصورة | Photo Path | Local file | `data/photos/808.jpg` |
| 12 | مسار اللقطات | Frame Paths | Local files | `data/frames/808_*.jpg` (semicolon-separated list) |
| 13 | تاريخ النشر | Posted Date | Telegram | `2026-05-09 11:50` |
| 14 | رابط الرسالة | Message Link | Computed | `https://t.me/AqmarTofan/808` |
| 15 | حالة الاستخراج | Extraction Status | Pipeline | `complete` / `partial_birth` / `partial_martyrdom` / `photo_fallback` / `missing_critical` / `failed` |
| 16 | الحالة | Duplicate Status | Pipeline | `unique` / `kept_hd_of_3` / `duplicate_of_812` |

### Duplicates sheet columns

| # | Header | Description |
|---|---|---|
| 1 | المعرف | msg_id of the skipped duplicate |
| 2 | الاسم | name |
| 3 | السبب | Reason (e.g., "lower resolution than msg_812") |
| 4 | الدقة | Resolution (e.g., `854×480`) |
| 5 | الحجم | File size in MB |
| 6 | معرف النسخة المعتمدة | msg_id of the kept HD version |
| 7 | الرابط | Link to skipped message |

## 8. Parsing Rules

### 8.1 Caption parser (text only)

Input example:
```
أَقمَارُ الطُّوْفَانْ
الشهيد القائد الميداني/ محمد إسماعيل الصوالحة
▫️كتيبة الشهيد رائد العطار (يبنا) - لواء رفح
#طوفان_الأقصى
```

Regex (Python):
```python
NAME_PATTERN = r'الشهيد\s+[^/]*?/\s*(.+?)(?:\n|$)'
# Captures everything after the first "/" up to newline as name.
# The honorific between "الشهيد" and "/" (e.g., "القائد الميداني",
# "القسامي المجاهد") is INTENTIONALLY ignored — it is NOT the
# military rank. The real rank comes from the video OCR.

BATTALION_PATTERN = r'كتيبة\s+(.+?)(?:\s*\(|\s*-|\n|$)'
BRIGADE_PATTERN = r'لواء\s+(.+?)(?:\s*\n|\s*#|$)'
```

Tolerant of:
- Decorative bullets (`▫️`, `📌`, `•`)
- Extra whitespace, line breaks
- Missing fields → empty string

### 8.2 OCR text parser (after EasyOCR)

Input example (raw OCR output from a video frame):
```
الرتبة العسكريه: نائب قائد سريه
تاريخ المي لاد: 1980-02-12
تاريخ الاستشهاد: 2024-05-17
المدينه: غزة
السلاح: المدفعيه
```

Regex patterns (whitespace-tolerant, letter-variation-tolerant):
```python
PATTERNS = {
    'birth_date':     r'تاريخ\s*ال?مي\s*لاد\s*[:：\-]?\s*([0-9\s\-/.]+)',
    'martyrdom_date': r'تاريخ\s*ال?ا?ستشهاد\s*[:：\-]?\s*([0-9\s\-/.]+)',
    'city':           r'ال?مدين[ةه]\s*[:：\-]?\s*([^\n]+)',
    'weapon':         r'ال?سلاح\s*[:：\-]?\s*([^\n]+)',
    'rank':           r'ال?رتب[ةه]\s*ال?عسكري[ةه]\s*[:：\-]?\s*([^\n]+)',
}

RANK_IGNORE_LIST = ["القائد الميداني"]  # generic honorific, not a real rank
```

### 8.3 Date normalizer

| Input | Output |
|---|---|
| `2026-05-08` | `2026-05-08` |
| `8/5/2026` | `2026-05-08` |
| `٢٠٢٦-٠٥-٠٨` (Arabic-Indic numerals) | `2026-05-08` |
| `1945` (year only) | `1945` |
| `unparseable garbage` | original raw value, marked in red font |

### 8.4 Name normalizer (for column 3)

Applied transformations (in order):
1. Strip whitespace, collapse multiple spaces
2. Remove diacritics (Arabic tashkeel): ` ً ٌ ٍ َ ُ ِ ّ ْ`
3. Normalize alef: `أ إ آ ا → ا`
4. Normalize ta marbuta: `ة → ه`
5. Normalize ya: `ى → ي`
6. Remove tatweel: `ـ`

The original (column 2) is preserved unchanged.

## 9. Multi-frame Extraction Strategy

For each video, ffmpeg extracts **6 frames** at fixed timestamps:

```
sec 5, 10, 15, 20, 25, 30
```

Each frame is OCR'd independently → 6 raw text blobs.

**Merge logic per field:**
1. Apply regex to each blob → up to 6 candidate values
2. Drop empty values
3. If all candidates agree → use that value (high confidence)
4. If candidates disagree → use majority vote (medium confidence)
5. If no clear majority → use the first non-empty value, mark as low confidence

**Critical-field retry:**
- If `birth_date` OR `martyrdom_date` is missing after merging all 6 frames:
  1. Fall back to OCR'ing the photo file (`data/photos/<msg_id>.jpg`)
  2. If still missing → log to `logs/missing_birthdates.log` for manual review

## 10. Deduplication Strategy

### Step 1 — Build name index

After fetching all messages, build:
```python
{name_exact: [(msg_id, video_w, video_h, video_size), ...]}
```

### Step 2 — Identify duplicates

For each name with **>1 entry**:
- Compute quality score per entry: `score = w * h` (resolution-based)
- Tiebreak: larger `size` wins
- The winner is "HD"; others are duplicates

### Step 3 — Process only HD entries

Duplicates are NOT downloaded or OCR'd. They are written to the `النسخ_المكررة` sheet with:
- The msg_id of the kept HD version
- The reason (`lower_resolution` / `smaller_file_size`)

### Matching policy

- **Exact match only** (Option A) — `محمد إسماعيل الصوالحة` matches only `محمد إسماعيل الصوالحة` exactly.
- The normalized name (column 3) is stored separately so the user can do **manual fuzzy review** later by sorting/filtering on it. Pipeline does not auto-merge based on normalized matches.

## 11. Phasing Plan

### Phase 0 — Sample frame inspection
**Goal:** Confirm video frames contain the expected data BEFORE building the full pipeline.

**Tasks:**
1. Scaffold project: `.env`, `.gitignore`, `requirements.txt`, `src/`, `scripts/`
2. Verify Python + ffmpeg installed on the host
3. Install dependencies (`pip install -r requirements.txt`)
4. `scripts/phase0_sample.py`:
   - Authenticate to Telegram (one-time SMS code via Telegram app)
   - Pick 5 sample messages **spread across timeline** (1 oldest, 1 newest, 3 random middle)
   - Download videos, extract frames at sec 5/10/15/20/25/30
   - Save frames to `data/frames/`
   - Print frame paths

**Gate:** User opens the frames, confirms that birth date / martyrdom date / city / weapon are visible somewhere in the 6 frames.

### Phase 1 — Build pipeline + test on 5 samples
**Goal:** Validate the full extraction pipeline.

**Tasks:**
1. Implement all `src/*.py` modules
2. `scripts/phase1_test.py`:
   - Run full pipeline on the same 5 samples from Phase 0
   - Generate `data/martyrs.xlsx` with 5 rows

**Gate:** User opens `data/martyrs.xlsx`, verifies:
- ≥4 of 5 birth dates correct
- ≥4 of 5 martyrdom dates correct
- Other fields directionally correct

If gate fails → return to tuning (frame timestamps, OCR preprocessing, regex patterns) before proceeding.

### Phase 2 — Full backfill (~400 messages)
**Goal:** Process all historical posts.

**Tasks:**
1. `scripts/phase2_backfill.py`:
   - Fetch all messages from channel
   - Run dedup pass (writes Duplicates sheet)
   - Process each unique HD message
   - Save complete `data/martyrs.xlsx`
   - Save final `data/state.json`

**Estimated time:** 30-60 minutes (depends on video sizes, network, OCR speed).

**Resumable:** State saved after every message. If crash → re-run continues from last successful msg_id.

**Gate:** User reviews Excel, confirms data quality is acceptable.

### Phase 3 — Daily automated trigger
**Goal:** Hands-off daily incremental updates.

**Tasks:**
1. `scripts/phase3_daily.py`:
   - Fetch only messages with msg_id > `state.last_processed_msg_id`
   - Process each (with same dedup logic — checks Excel for existing names too)
   - Append new rows to Excel
2. `scripts/setup_daily_trigger.ps1`:
   - Creates Windows Scheduled Task `AqmarTofan Daily Scrape`
   - Trigger: daily at 09:00 (configurable in script header)
   - Action: runs `phase3_daily.py` in the project venv
   - Logs to `logs/daily.log`

**Gate:** Two consecutive successful daily runs without manual intervention.

## 12. Error Handling

| Failure | Strategy |
|---|---|
| Telegram `FloodWaitError` (rate limit) | Sleep the indicated `seconds`, then retry the call |
| Telegram disconnect / network | Exponential backoff: 1s, 2s, 4s (3 retries), then fail |
| Video download fails after retries | Skip message, log error, set status = `download_failed`, continue |
| ffmpeg fails on one frame timestamp | Try next timestamp; if all 6 fail → fall back to photo OCR |
| EasyOCR returns empty/garbage | Try next frame; if all empty → fall back to photo OCR |
| All extraction methods fail | Write Excel row with blank fields, status = `failed`, log msg_id to `logs/errors.log` |
| Birth date missing after all retries | Log msg_id to `logs/missing_birthdates.log` for manual review |
| Excel file currently open in Excel app | Retry 3× with 60s sleep; if still locked, write to `martyrs.xlsx.bak` and warn |
| Disk free space < 2 GB | Halt pipeline, log critical error, do not crash |
| Crash mid-run | State saved after every message → next run resumes from last successful msg_id |
| Telethon session expired | Print clear error message, prompt user to re-run with phone code |

## 13. Operations / Runbook

### One-time install
```powershell
cd D:\Repo\01-Khamis-Projects\AQMAR
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# Verify ffmpeg
ffmpeg -version
```

### Run phases (with review gates between each)
```powershell
.venv\Scripts\activate

python scripts\phase0_sample.py        # → review frames, then proceed
python scripts\phase1_test.py          # → review 5 Excel rows, then proceed
python scripts\phase2_backfill.py      # → review full Excel, then proceed
.\scripts\setup_daily_trigger.ps1      # → register daily scheduled task
```

### Day-2 commands
```powershell
python scripts\reprocess.py --msg-id 808       # re-process one message
python scripts\status.py                       # print counts: total / done / failed
type logs\errors.log                           # view errors
type logs\missing_birthdates.log               # manual review queue
```

### Disable daily auto-run
```powershell
Unregister-ScheduledTask -TaskName "AqmarTofan Daily Scrape" -Confirm:$false
```

## 14. Configuration / Secrets

### `.env` (gitignored, lives only on user's machine)
```
TELEGRAM_API_ID=35682179
TELEGRAM_API_HASH=<32-char hex>
TELEGRAM_PHONE=+201100759088
TELEGRAM_2FA_PASSWORD=<user's 2FA password>
CHANNEL_USERNAME=AqmarTofan
SESSION_PATH=session/aqmar
DAILY_RUN_HOUR=9
```

### `.env.example` (committed)
```
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_2FA_PASSWORD=
CHANNEL_USERNAME=AqmarTofan
SESSION_PATH=session/aqmar
DAILY_RUN_HOUR=9
```

### `.gitignore`
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
```

### `requirements.txt`
```
telethon>=1.34
easyocr>=1.7
openpyxl>=3.1
python-dotenv>=1.0
ffmpeg-python>=0.2
Pillow>=10.0
```

## 15. Open Questions / Future Extensions (out of scope for v1)

- **Fuzzy dedup**: pipeline-level merge of records with the same normalized name. Currently only flagged via column 3 for manual review.
- **Hijri date display**: store both Gregorian and Hijri side-by-side.
- **Web UI**: a simple read-only HTML viewer for the Excel data.
- **Photo facial recognition**: cluster photos to detect the same person across posts even with different names.
- **Multi-channel support**: extend to scrape from related channels.
- **Cloud deployment**: move from local Windows to a server (would need scheduled cron instead of Task Scheduler).

## 16. Acceptance Criteria

The project is considered **complete** (v1) when:

1. ✅ All Phase 0–3 gates have passed.
2. ✅ `data/martyrs.xlsx` contains rows for ~all unique martyrs in the channel (after dedup).
3. ✅ Birth date populated for ≥85% of rows.
4. ✅ Martyrdom date populated for ≥85% of rows.
5. ✅ Daily scheduled task is registered and has run successfully twice.
6. ✅ `logs/missing_birthdates.log` exists and is reviewable for the failure cases.
