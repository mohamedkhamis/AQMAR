# Hybrid Video Hosting: Google Drive (private master) → Archive.org (public CDN)

> **Goal:** Keep your 2 TB Google Drive as the **private master archive** (originals,
> full quality, backups). Use **Archive.org** as the **public-facing CDN** the SPA
> embeds in martyr profiles. Telegram link stays as the third fallback / source-of-truth.
>
> **Why this split:**
> - Google Drive's 2 TB plan upgrades **storage only**. Per-file view throttles
>   (~25 viewers/24h on shared links) and the 750 GB/day per-account download
>   cap stay the same. A memorial day traffic spike on a single profile would
>   make that profile's video go dark for 24h.
> - Archive.org is purpose-built for permanent public archival of human-rights
>   / conflict media. Free forever, no throttles, stable embed URLs, mission-aligned.
> - Google Drive remains your **immutable backup** in case Archive.org ever
>   has issues or you need to re-upload to a different provider.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Create your Archive.org account](#2-create-your-archiveorg-account)
3. [Get your S3-like API credentials](#3-get-your-s3-like-api-credentials)
4. [Install + configure the `internetarchive` CLI](#4-install--configure-the-internetarchive-cli)
5. [Set up Google Drive Desktop (file-system mirror)](#5-set-up-google-drive-desktop-file-system-mirror)
6. [Add `archive_org_id` column to SQL Server](#6-add-archive_org_id-column-to-sql-server)
7. [Create the mirror script `scripts/mirror_to_archive_org.py`](#7-create-the-mirror-script-scriptsmirror_to_archive_orgpy)
8. [Wire the SPA to embed Archive.org videos](#8-wire-the-spa-to-embed-archiveorg-videos)
9. [Run the first migration (manual, with `--limit 3` smoke test)](#9-run-the-first-migration-manual-with---limit-3-smoke-test)
10. [Automate daily mirror via Windows Task Scheduler](#10-automate-daily-mirror-via-windows-task-scheduler)
11. [Operational notes — Archive.org limits, deletion, content policy](#11-operational-notes--archiveorg-limits-deletion-content-policy)
12. [Troubleshooting cheat-sheet](#12-troubleshooting-cheat-sheet)

---

## 1. Prerequisites

- Windows 10/11 with the existing AQMAR repo at `D:\Repo\01-Khamis-Projects\AQMAR`
- The repo's `.venv` already activated (or willingness to activate it)
- SQL Server with `aqmar.dbo.martyrs` populated (current state — 448 rows)
- Google account with the 2 TB Google One plan
- A modern browser
- ~10 GB free disk space on `D:` for Drive Desktop's local cache
- Working email address for Archive.org account verification

**File naming convention for videos in Drive** *(mandatory for the script to work)*:
```
{msg_id}.mp4         e.g.  955.mp4, 956.mp4, 957.mp4
```
If your existing files are named differently (e.g. `أنس خالد أبو نصر - 955.mp4`),
you'll need to rename them. The mirror script identifies which video belongs to
which martyr by parsing the leading numeric `msg_id` from the filename.

---

## 2. Create your Archive.org account

1. Open https://archive.org/account/signup
2. Use the email **info@azkapmo.com** (matches your existing AQMAR identity)
3. Pick a screen name — recommended: `AQMAR` (uppercase, no spaces)
4. Set a strong password (save it to your password manager)
5. Check the verification email → click the confirmation link
6. Sign in at https://archive.org → upper-right shows "Hi, AQMAR" if successful

**Account-level profile setup** *(takes 2 minutes, improves embed appearance):*

1. While signed in, click your username top-right → **Edit Settings**
2. Set:
   - **Full name:** AQMAR — أقمار الطوفان
   - **Description:** Memorial archive of Palestinian martyrs from the AqmarTofan
     Telegram channel. Preserved for historical record.
   - **Website:** *(your GitHub Pages URL once known, or skip)*
3. Save

> **Important:** Archive.org is a public archive. All your uploads will be
> visible to everyone unless you explicitly mark them otherwise. For a public
> memorial this is the desired behavior.

---

## 3. Get your S3-like API credentials

Archive.org uses S3-compatible access keys for uploads — these are **separate**
from your account password.

1. Sign in at https://archive.org
2. Visit https://archive.org/account/s3.php
3. The page shows:
   - **Access Key** (looks like `abc123XYZ456` — 16 chars, alphanumeric)
   - **Secret Key** (looks like `xyzABC789def` — 16 chars, alphanumeric)
4. **Copy both values somewhere safe immediately** — these grant write access
   to your account
5. Click "I understand the risks" if a confirmation appears

Treat these like a password. Never commit them to git, never paste them in chat,
never email them. They go in your local `.env` only.

---

## 4. Install + configure the `internetarchive` CLI

Open PowerShell **inside the project root**:

```powershell
cd D:\Repo\01-Khamis-Projects\AQMAR
.\.venv\Scripts\Activate.ps1
pip install internetarchive
```

The package gives you both:
- A Python module (`import internetarchive`)
- A CLI command (`ia`)

Verify install:
```powershell
ia --version
# Should print something like: ia 5.2.0
```

**Configure with your S3-like keys** (from Section 3):

```powershell
ia configure
```

It will prompt:
```
Email address: info@azkapmo.com
Password: <your archive.org password — NOT the S3 keys>
```

This actually pulls your S3 keys via the password and writes them to
`%USERPROFILE%\.config\internetarchive\ia.ini` so the CLI / Python module
can authenticate without re-prompting.

**Verify the config works:**
```powershell
ia configure --check
# Expected: "Success! Your credentials are valid."
```

**Alternative — environment variables** (if you prefer to keep secrets in `.env`):

Add to `.env`:
```
IA_ACCESS_KEY=abc123XYZ456
IA_SECRET_KEY=xyzABC789def
```

Then in your script, read them and pass to the API explicitly. The mirror
script in Section 7 reads from `.env` to keep things consistent with the rest
of the AQMAR codebase.

---

## 5. Set up Google Drive Desktop (file-system mirror)

The simplest automation path: let Drive Desktop sync your video folder to a
local `Z:\` (or chosen) drive, then the mirror script reads files like any
other folder — no Drive API juggling.

### Install Drive Desktop

1. Download from https://www.google.com/drive/download/
2. Run the installer → sign in with the Google account that holds your 2 TB plan
3. When asked **what to sync**:
   - Choose **Stream files** (not Mirror) — saves local disk; files download
     on-demand when the script opens them
   - Pick a drive letter — recommended **`G:`** (G for Google)
4. Once it shows "G:\My Drive" in Explorer, you're set

### Organize your videos in Drive

In **G:\My Drive\**, create a folder structure:
```
G:\My Drive\AQMAR-Videos\
  ├── 955.mp4
  ├── 956.mp4
  ├── 957.mp4
  └── ...
```

If you already have videos but with messier names, do a one-time rename pass
in Drive Desktop's Explorer view. (PowerShell rename is fine for bulk too.)

**Set this path in `.env`** so the mirror script knows where to look:
```
DRIVE_VIDEO_DIR=G:\My Drive\AQMAR-Videos
```

---

## 6. Add `archive_org_id` column to SQL Server

Save this as `scripts/add_archive_org_id_column.sql` and run it once:

```sql
-- scripts/add_archive_org_id_column.sql
-- Adds the public-CDN identifier column. NULLable because not every row will
-- have a video mirrored to Archive.org (e.g. caption-only Telegram posts).

USE [aqmar];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.martyrs') AND name = 'archive_org_id'
)
BEGIN
    ALTER TABLE dbo.martyrs
    ADD archive_org_id NVARCHAR(120) NULL;

    PRINT 'Added archive_org_id column.';
END
ELSE
BEGIN
    PRINT 'archive_org_id column already exists. Skipping.';
END
GO

-- Index for "find rows needing mirror" — much faster than full scan
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_martyrs_archive_org_id' AND object_id = OBJECT_ID('dbo.martyrs')
)
BEGIN
    CREATE INDEX IX_martyrs_archive_org_id
        ON dbo.martyrs (archive_org_id)
        WHERE archive_org_id IS NOT NULL;

    PRINT 'Added index on archive_org_id.';
END
GO
```

Run it:
```powershell
sqlcmd -E -S localhost -i scripts\add_archive_org_id_column.sql
# Expected: "Added archive_org_id column." and "Added index..."
```

Also update `src/sqlserver_client.py` `COLUMNS` tuple to include the new field
(otherwise UPSERT will silently skip it):

```python
# In src/sqlserver_client.py — around the COLUMNS = (...) definition

COLUMNS = (
    "msg_id", "name", "name_normalized",
    "birth_date", "martyrdom_date",
    "city", "military_rank", "weapon",
    "battalion", "brigade",
    "photo_path", "frame_paths",
    "posted_date", "message_link",
    "extraction_status", "duplicate_status",
    "ocr_name", "ocr_birth_date", "ocr_martyrdom_date",
    "archive_org_id",     # ← ADD THIS LINE
)
```

And add `archive_org_id` to `_EDITABLE_FIELDS` so the admin SPA can override it
manually if needed:

```python
_EDITABLE_FIELDS = {
    "name", "name_normalized", "birth_date", "martyrdom_date",
    "city", "military_rank", "weapon", "battalion", "brigade",
    "photo_path", "message_link",
    "archive_org_id",     # ← ADD THIS LINE
}
```

---

## 7. Create the mirror script `scripts/mirror_to_archive_org.py`

This is the main automation. It:

1. Connects to SQL Server
2. Reads rows that have a `message_link` (i.e. have a video) but NO `archive_org_id`
3. For each row, looks in `G:\My Drive\AQMAR-Videos\{msg_id}.mp4`
4. If the file exists, uploads to Archive.org with descriptive metadata
5. Writes the resulting Archive.org identifier back to SQL Server
6. Skips rows already mirrored — safe to re-run anytime (idempotent)

Save this as `scripts/mirror_to_archive_org.py`:

```python
# scripts/mirror_to_archive_org.py
"""Mirror Google Drive videos → Archive.org, record IDs in SQL Server.

Hybrid hosting strategy:
  - Google Drive (2 TB plan): private master archive, full-quality originals
  - Archive.org: free public CDN with stable embed URLs for the SPA
  - Telegram link: source-of-truth, kept as third fallback

Idempotent — every row is checked against existing archive_org_id. Only rows
missing the identifier (and with a video file present on Drive) get uploaded.

Usage:
  .\\.venv\\Scripts\\Activate.ps1
  python scripts\\mirror_to_archive_org.py                # mirror all eligible
  python scripts\\mirror_to_archive_org.py --limit 3      # smoke test
  python scripts\\mirror_to_archive_org.py --msg-id 955   # one specific row
  python scripts\\mirror_to_archive_org.py --dry-run      # preview only
"""
import argparse
import os
import sys
from pathlib import Path

# Force UTF-8 stdout — Arabic names crash Windows cp1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))

from internetarchive import upload, get_item
from src.config import load_config
from src.sqlserver_client import make_conn


# Archive.org identifier pattern. Slug rules: lowercase, digits, hyphens.
# 5-100 chars, must start with a letter. We use "aqmar-<msg_id>" so every
# AQMAR upload is grouped under a predictable prefix — handy for collection
# queries later (https://archive.org/search?query=identifier%3Aaqmar-*).
def make_identifier(msg_id: int) -> str:
    return f"aqmar-{msg_id}"


def build_metadata(row: dict) -> dict:
    """Build the Archive.org item metadata from a martyr DB row.

    Required:  title, mediatype
    Strongly recommended:  creator, date, description, subject, collection
    """
    name = row.get("name") or f"Martyr {row['msg_id']}"
    martyrdom = row.get("martyrdom_date") or ""
    city = row.get("city") or ""
    battalion = row.get("battalion") or ""
    brigade = row.get("brigade") or ""

    description_parts = [
        f"Memorial entry from the AqmarTofan Telegram archive (message {row['msg_id']}).",
    ]
    if martyrdom:
        description_parts.append(f"Date of martyrdom: {martyrdom}.")
    if city:
        description_parts.append(f"City: {city}.")
    if battalion:
        description_parts.append(f"Battalion: {battalion}.")
    if brigade:
        description_parts.append(f"Brigade: {brigade}.")
    if row.get("message_link"):
        description_parts.append(f"Source: {row['message_link']}")

    return {
        "mediatype":   "movies",
        "collection":  "opensource_movies",   # public community collection
        "title":       name,
        "creator":     "AqmarTofan",
        "date":        martyrdom or "",
        "subject":     ["memorial", "Palestine", "Gaza", "AqmarTofan", "martyrs"],
        "description": " ".join(description_parts),
        "language":    "ara",                  # ISO 639-2 Arabic
        # Free-text "noindex" hint — does NOT hide from Archive.org search,
        # just signals search engines (Google etc.) to skip. Comment out
        # if you want the page indexed externally.
        # "noindex":   "true",
    }


def already_mirrored(identifier: str) -> bool:
    """Check Archive.org for an existing item with this identifier.

    Avoids re-uploads if the DB row got reset but the upload succeeded.
    """
    item = get_item(identifier)
    return item.exists


def mirror_one(conn, row: dict, drive_dir: Path, *, dry_run: bool = False) -> bool:
    """Upload one row's video. Returns True on success, False on skip/fail."""
    msg_id = row["msg_id"]
    video_path = drive_dir / f"{msg_id}.mp4"

    if not video_path.exists():
        # Try common alternates the user might have used
        for ext in (".MP4", ".mov", ".MOV", ".webm"):
            alt = drive_dir / f"{msg_id}{ext}"
            if alt.exists():
                video_path = alt
                break
        else:
            print(f"  [skip] msg {msg_id}: no file at {video_path} (or .MP4/.mov)")
            return False

    identifier = make_identifier(msg_id)

    if dry_run:
        print(f"  [dry-run] would upload {video_path.name} → {identifier}")
        return True

    if already_mirrored(identifier):
        print(f"  [exists] {identifier} already on Archive.org — recording in DB only")
        _record_in_db(conn, msg_id, identifier)
        return True

    metadata = build_metadata(row)
    print(f"  [upload] {video_path.name} ({video_path.stat().st_size // 1024} KB) → {identifier}")
    print(f"           title: {metadata['title']}")
    responses = upload(
        identifier,
        files=[str(video_path)],
        metadata=metadata,
        verbose=False,
        retries=3,
        retries_sleep=5,
    )
    # `upload` returns a list of requests.Response objects, one per file
    if not responses or any(r.status_code not in (200, 201) for r in responses):
        bad = [r.status_code for r in responses]
        print(f"           !! upload failed (HTTP {bad})")
        return False

    print(f"           ✓ uploaded.  Embed URL: https://archive.org/embed/{identifier}")
    _record_in_db(conn, msg_id, identifier)
    return True


def _record_in_db(conn, msg_id: int, identifier: str) -> None:
    cur = conn.cursor()
    cur.execute(
        "UPDATE dbo.martyrs SET archive_org_id = ? WHERE msg_id = ?",
        identifier, msg_id,
    )
    conn.commit()


def list_eligible(conn, *, only_msg_id: int | None = None) -> list[dict]:
    """Rows that have a Telegram link (so a video exists) but no archive_org_id."""
    cur = conn.cursor()
    where = "WHERE message_link IS NOT NULL AND message_link <> '' AND archive_org_id IS NULL"
    params: tuple = ()
    if only_msg_id is not None:
        # Override: just this one row, ignore the archive_org_id condition
        # so admin can force re-mirror after manual deletion.
        where = "WHERE msg_id = ?"
        params = (only_msg_id,)
    cur.execute(f"""
        SELECT msg_id, name, martyrdom_date, city, battalion, brigade, message_link
        FROM dbo.martyrs
        {where}
        ORDER BY msg_id DESC
    """, *params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=None,
                        help="Process only the first N rows (smoke test)")
    parser.add_argument("--msg-id",  type=int, default=None,
                        help="Process only one specific msg_id (force re-mirror)")
    parser.add_argument("--dry-run", action="store_true",
                        help="List what would be uploaded but don't actually upload")
    args = parser.parse_args()

    cfg = load_config()
    drive_dir = Path(os.getenv("DRIVE_VIDEO_DIR", ""))
    if not drive_dir.exists():
        print(f"ERROR: DRIVE_VIDEO_DIR not set or not found: {drive_dir}")
        print("       Set it in .env, e.g.  DRIVE_VIDEO_DIR=G:\\My Drive\\AQMAR-Videos")
        sys.exit(1)

    print(f"Drive dir:   {drive_dir}")
    print(f"Connecting:  {cfg.sqlserver_conn_str.split(';')[0]}…")
    conn = make_conn(cfg)

    eligible = list_eligible(conn, only_msg_id=args.msg_id)
    if args.limit:
        eligible = eligible[:args.limit]
    print(f"Eligible:    {len(eligible)} rows to mirror")

    ok = fail = 0
    for row in eligible:
        try:
            if mirror_one(conn, row, drive_dir, dry_run=args.dry_run):
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  !! msg {row['msg_id']}: {type(e).__name__}: {e}")
            fail += 1

    conn.close()
    print(f"\nDone. {ok} mirrored, {fail} failed/skipped.")


if __name__ == "__main__":
    main()
```

---

## 8. Wire the SPA to embed Archive.org videos

Once rows have `archive_org_id` populated, the SPA can show an embedded player
instead of the "Watch on Telegram" link.

### 8a. Expose the field in the API + SPA adapter

In **`webui/data-loader.js`**, update `adaptMartyrToNewSchema`:

```js
function adaptMartyrToNewSchema(row) {
  if (!row || row.msg_id === undefined || row.msg_id === null) return null;
  return {
    id:        row.msg_id,
    name:      row.name || "",
    // ... (existing fields) ...
    source:    row.message_link || "",
    archive:   row.archive_org_id || "",   // ← ADD THIS LINE
    verification: row.verification_status || "unverified",
    isVerified: (row.verification_status || "unverified") === "verified",
  };
}
```

### 8b. Add an embed card to the admin edit form

In **`webui/index.html`**, find the existing "Watch source video" card
(around line 857, the forest-gradient anchor element). Add a new block ABOVE
it that renders the embed when `archive` is set:

```html
<!-- Archive.org embedded player — shown when this martyr's video has been
     mirrored. Public-CDN URL with no throttling on popular profiles. -->
<template x-if="editingMartyr()?.archive">
  <div class="mt-4 rounded-lg overflow-hidden"
       style="border: 1px solid var(--divider); aspect-ratio: 16/9;">
    <iframe :src="`https://archive.org/embed/${editingMartyr().archive}`"
            class="w-full h-full"
            style="border: 0;"
            allowfullscreen
            webkitallowfullscreen
            mozallowfullscreen></iframe>
  </div>
</template>

<!-- "Watch on Telegram" — keep as the source-of-truth fallback below the embed -->
<a x-show="editingMartyr()?.source"
   :href="editingMartyr()?.source"
   ...existing code unchanged...
```

### 8c. (Optional) Show the embed on the public detail page

In the same `index.html`, find the public detail/profile view (the `current.X`
section around line 670–700). Add the same `<template x-if>` block but bound to
`current.archive`:

```html
<template x-if="current?.archive">
  <div class="mt-3 rounded-lg overflow-hidden"
       style="border: 1px solid var(--divider); aspect-ratio: 16/9;">
    <iframe :src="`https://archive.org/embed/${current.archive}`"
            class="w-full h-full" style="border: 0;"
            allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe>
  </div>
</template>
```

---

## 9. Run the first migration (manual, with `--limit 3` smoke test)

**Always smoke-test first.** Upload 3 videos to confirm metadata, embed URLs,
and DB write-back all work before committing to a full run.

```powershell
cd D:\Repo\01-Khamis-Projects\AQMAR
.\.venv\Scripts\Activate.ps1

# Dry run — see what WOULD be uploaded without actually uploading
python scripts\mirror_to_archive_org.py --limit 3 --dry-run

# Real smoke test — upload 3 videos
python scripts\mirror_to_archive_org.py --limit 3
```

Expected output:
```
Drive dir:   G:\My Drive\AQMAR-Videos
Connecting:  DRIVER={ODBC Driver 17 for SQL Server}…
Eligible:    448 rows to mirror

  [upload] 980.mp4 (4823 KB) → aqmar-980
           title: محمد عبد الرحمن
           ✓ uploaded.  Embed URL: https://archive.org/embed/aqmar-980
  [upload] 978.mp4 (3611 KB) → aqmar-978
           ...

Done. 3 mirrored, 0 failed/skipped.
```

**Verify in the browser:**
1. Open https://archive.org/details/aqmar-980 — should show the item page
   with metadata
2. Open https://archive.org/embed/aqmar-980 — should show the embedded player
3. SQL: `SELECT msg_id, archive_org_id FROM dbo.martyrs WHERE archive_org_id IS NOT NULL`
   — should list the 3 rows

> **Heads up:** Archive.org takes 1–10 minutes to process a freshly-uploaded
> video into its streaming format. During processing, the embed page shows
> "Item not yet available." Wait, then refresh.

**Once happy, run the full mirror:**
```powershell
python scripts\mirror_to_archive_org.py
```

Upload speed is bottlenecked by your upstream bandwidth. ~5 MB videos at typical
10 Mbps upload ≈ 4 seconds each ≈ ~30 minutes for 448 videos. Run it overnight
the first time.

---

## 10. Automate daily mirror via Windows Task Scheduler

Once the initial bulk migration is done, you only need to mirror **new videos**
that the daily Telegram scraper adds. The script is already idempotent — re-running
it picks up only the new rows.

### Create the scheduled task

Save as `scripts/setup_mirror_trigger.ps1`:

```powershell
# scripts/setup_mirror_trigger.ps1
# Registers a Windows Task Scheduler job that runs the Drive→Archive.org
# mirror every day at 02:30 (after the 02:00 daily Telegram scrape).
#
# Usage:  .\scripts\setup_mirror_trigger.ps1   (UAC elevation prompted)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$pythonExe   = "$projectRoot\.venv\Scripts\python.exe"
$scriptPath  = "$projectRoot\scripts\mirror_to_archive_org.py"
$logDir      = "$projectRoot\logs"
$logFile     = "$logDir\mirror_to_archive_org.log"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$taskName = "AQMAR-MirrorToArchiveOrg"
$action   = New-ScheduledTaskAction `
    -Execute $pythonExe `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At 2:30am

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Mirrors new AQMAR Drive videos to Archive.org daily." `
    -Force

Write-Host "Task '$taskName' registered. View in Task Scheduler under \Microsoft\Windows\Task Scheduler\."
Write-Host "First run: $(Get-Date -Date '02:30' -Format 'yyyy-MM-dd HH:mm')"
Write-Host "Log file:  $logFile"
Write-Host ""
Write-Host "Manual run:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
```

Run it as Administrator:
```powershell
.\scripts\setup_mirror_trigger.ps1
```

Verify:
```powershell
Get-ScheduledTask -TaskName AQMAR-MirrorToArchiveOrg
```

Trigger it manually to test:
```powershell
Start-ScheduledTask -TaskName AQMAR-MirrorToArchiveOrg

# Check the log a minute later
Get-Content logs\mirror_to_archive_org.log -Tail 30
```

---

## 11. Operational notes — Archive.org limits, deletion, content policy

### What Archive.org gives you (free, no plan needed)

| Feature | Limit |
|---|---|
| Storage | **Unlimited** (no quota for community uploads) |
| Bandwidth | **Unlimited** (they're a non-profit CDN funded by donations) |
| File size per item | 50 GB recommended max (much more is technically allowed) |
| Items per account | No documented cap |
| API rate limits | Generous — ~25 uploads/min is fine; throttle past that |
| Embed format stability | Highly stable — has not changed since 2014 |
| Search engine indexing | Indexed by Google + Archive's own search |

### What Archive.org does NOT do

- **No private mode.** Everything uploaded is public. If you have material
  that shouldn't be public, keep it in Drive only and don't mirror it.
- **No easy delete.** You can "darken" items (remove from public view) but
  full deletion requires emailing `info@archive.org`. Plan uploads carefully.
- **No SLA.** Free service. Outages happen ~once a year, usually <24h.
- **Some videos may be flagged.** Archive has anti-spam reviews; legitimate
  memorial content is fine, but high-volume uploads (1000+/day from a new
  account) can trigger a manual review hold.

### Content policy for your use case

The Archive.org Terms of Service specifically welcome:
- Historical conflict archives
- Memorial / human-rights documentation
- Open-source movie collections (which the script uses)

You're well within their mission. If anything ever gets flagged, the appeal
process is fast (~48h) and friendly.

### Drive cleanup (optional)

You're keeping Drive as your master, but if you ever want to free Drive space,
you can **safely delete** the local copies after mirroring is verified — Archive.org
becomes your archival copy of record. Most people keep both for at least
12 months as belt-and-suspenders.

---

## 12. Troubleshooting cheat-sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| `ia configure --check` fails | Wrong password OR 2FA enabled on Archive | Use an app password if 2FA on; or set `IA_ACCESS_KEY`/`IA_SECRET_KEY` directly |
| Upload returns HTTP 403 | Bad credentials | Re-run `ia configure` |
| Upload returns HTTP 503 | Archive.org under load | Script retries 3× automatically; wait + re-run if all fail |
| "no file at G:\My Drive\AQMAR-Videos\955.mp4" | File missing or named differently | Check `dir "G:\My Drive\AQMAR-Videos\955*"` and rename if needed |
| Embed shows "Item not yet available" | Archive is still processing (just uploaded) | Wait 1–10 min, refresh |
| Embed shows "This item is darkened" | Archive flagged the item | Email `info@archive.org` to appeal — fast turnaround |
| All uploads succeed but DB column stays NULL | Step 6 not done (column missing) | Re-run `add_archive_org_id_column.sql` |
| SPA still shows "Watch on Telegram" only | Step 8 not done, OR browser cache | Hard refresh (Ctrl+F5); check `data-loader.js` includes `archive: row.archive_org_id` |
| Drive Desktop says "Z: not ready" mid-upload | Drive sync paused / file not downloaded yet | In Drive Desktop settings, set the folder to "Available offline" |
| Script crashes with "ssl.SSLCertVerificationError" | Corporate proxy MITM | Set `REQUESTS_CA_BUNDLE` env var to your company's CA cert path |

---

## Appendix A: Quick-reference one-time setup checklist

- [ ] Archive.org account created + verified
- [ ] S3-like keys copied to a safe place
- [ ] `pip install internetarchive` succeeded
- [ ] `ia configure --check` returns success
- [ ] Drive Desktop installed and `G:\My Drive` accessible
- [ ] Videos in `G:\My Drive\AQMAR-Videos\` named `{msg_id}.mp4`
- [ ] `DRIVE_VIDEO_DIR` set in `.env`
- [ ] `add_archive_org_id_column.sql` run against `aqmar` DB
- [ ] `src/sqlserver_client.py` `COLUMNS` updated
- [ ] `scripts/mirror_to_archive_org.py` saved
- [ ] Smoke test `--limit 3` succeeded
- [ ] Browser-verified embed URLs work
- [ ] `webui/data-loader.js` exposes `archive` field
- [ ] `webui/index.html` renders the embed when `archive` is set
- [ ] Daily Task Scheduler entry registered

## Appendix B: Daily operational flow (steady state)

```
02:00 — daily Telegram scrape runs (phase3_daily.py)
        → new rows land in SQL Server with message_link, no archive_org_id

   ~during the day — you (optionally) review the videos and upload manually
   to Drive: drag {msg_id}.mp4 into G:\My Drive\AQMAR-Videos\
   (Or write a hook on the scraper to download Telegram videos directly
   to Drive — beyond this guide's scope.)

02:30 — mirror_to_archive_org.py runs (Task Scheduler)
        → for each new row with a Drive file, uploads to Archive.org
        → DB updated with archive_org_id
        → SPA picks up the new embed on next page load

— DONE. Visitors see the Archive.org embed; Telegram link remains as a
  "View source on Telegram" secondary link.
```

---

**Questions / changes:** see `docs/superpowers/plans/` for related plans, or
edit this file directly. Commit changes with conventional commits style
(`docs(hosting): ...`).
