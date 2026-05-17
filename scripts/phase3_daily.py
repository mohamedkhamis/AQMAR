# scripts/phase3_daily.py
"""Daily incremental run. Picks up where the last run left off and processes
any new messages posted to the channel.

Designed to run unattended via Windows Task Scheduler. Auth + credentials
come from .env. Logs go to logs/daily.log.

Backend (post-2026-05-17 migration to SQL Server):
  - Writes go to SQL Server `dbo.martyrs` via src.sqlserver_client.upsert_martyr
  - Every new row lands with verification_status='unverified' (default)
  - Admin reviews + corrects in the SPA, marks verified
  - Publishes happen via scripts/export_to_json.py (Batch 6)

Idempotent:
  - state.json tracks every msg_id ever processed — never reprocesses
  - SQL Server upsert is also idempotent by msg_id (defensive belt-and-braces)
  - Intra-batch duplicate names are skipped by name (chronological order
    preserved — first of two same-name posts in a batch wins)

Crash resilience:
  - state.save() and upsert_martyr both commit per-message, so a crash
    at message N only loses the in-flight message's work
"""
import asyncio
import os
import sys
import logging
from pathlib import Path
from datetime import datetime

# Force UTF-8 on stdout/stderr so Arabic OCR output, log paths with non-Latin
# chars, and exception messages don't crash on Windows console default cp1252
# ("'charmap' codec can't encode characters in position N" — empirically hit
# on msg 874 during the 2026-05-16 run). Python 3.7+ provides reconfigure().
# Scheduled-task runs already get UTF-8 via setup_daily_trigger.ps1's
# $env:PYTHONIOENCODING=utf-8; this protects manual invocations from a shell.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.state import State
from src.parser_caption import parse_caption
from src.sqlserver_client import make_conn, martyr_row_to_db_dict, upsert_martyr

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler("logs/daily.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"


async def main():
    cfg = load_config()
    state = State.load(STATE_PATH)
    min_id = (state.last_processed_msg_id or 0) + 1

    # SQL Server connection — required (no Excel/Supabase fallback anymore).
    # Fail fast with a clear message if the conn string is missing.
    db = make_conn(cfg)
    print(f"SQL Server connected → dbo.martyrs (verification_status defaults to 'unverified')")

    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    new_msgs = await fetcher.fetch_all_messages(min_id=min_id)
    new_videos = [m for m in new_msgs if m.has_video]
    new_photos = [m for m in new_msgs if m.has_photo]
    print(f"{datetime.now().isoformat()} | new since msg {min_id}: "
          f"{len(new_videos)} videos, {len(new_photos)} photos")

    if not new_videos:
        await fetcher.disconnect()
        db.close()
        return

    # Build a photo index over the entire new batch (covers cross-day pairs too)
    name_to_photo = {}
    for p in new_photos:
        nm = parse_caption(p.caption)["name"]
        if nm and nm not in name_to_photo:
            name_to_photo[nm] = p
    # Plus search the previous N=20 messages in case a paired photo was posted
    # just before the cutoff (e.g. photo on Monday, video on Tuesday)
    lookback = await fetcher.fetch_all_messages(min_id=max(0, min_id - 20))
    for p in lookback:
        if not p.has_photo:
            continue
        nm = parse_caption(p.caption)["name"]
        if nm and nm not in name_to_photo:
            name_to_photo[nm] = p

    seen_names = set()
    upserted = 0
    failed = 0
    for tg in new_videos:
        if state.is_processed(tg.msg_id):
            continue
        cap = parse_caption(tg.caption)
        if cap["name"] and cap["name"] in seen_names:
            print(f"  Skipping intra-batch duplicate: msg {tg.msg_id} ({cap['name']})")
            state.mark_processed(tg.msg_id, "duplicate_in_batch")
            # Persist the duplicate-marker so a crash doesn't lose the skip record.
            state.save(STATE_PATH)
            continue
        seen_names.add(cap["name"])
        paired = name_to_photo.get(cap["name"])
        try:
            row = await process_message(
                tg, fetcher, cfg.channel_username,
                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                paired_photo_msg=paired,
            )

            # Convert MartyrRow → dict (handles empty-string → None coercion +
            # ocr_* mirror population) and upsert into SQL Server. The upsert
            # commits per-call (incremental persistence), so a crash at message
            # N only loses the in-flight message's work.
            payload = martyr_row_to_db_dict(row)
            upsert_martyr(db, payload)

            state.mark_processed(tg.msg_id, row.extraction_status)
            state.save(STATE_PATH)
            upserted += 1

            print(f"  msg {tg.msg_id}: {row.extraction_status} | "
                  f"birth={row.birth_date} | mart={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {tg.msg_id}: {e}")
            state.mark_processed(tg.msg_id, "failed")
            # Also persist the failure marker so the next run doesn't retry it.
            state.save(STATE_PATH)
            failed += 1

    state.save(STATE_PATH)
    await fetcher.disconnect()
    db.close()
    print(f"Daily run complete. Upserted {upserted} rows to SQL Server "
          f"({failed} failures). All new rows start as 'unverified' — review "
          f"via the admin SPA.")


if __name__ == "__main__":
    asyncio.run(main())
