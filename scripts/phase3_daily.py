# scripts/phase3_daily.py
"""Daily incremental run. Picks up where Phase 2 left off and processes
any new messages posted to the channel since the last run.

Designed to run unattended via Windows Task Scheduler. Auth session and
all credentials come from .env. Logs go to logs/daily.log.

Idempotent:
  - state.json tracks every msg_id ever processed → never reprocesses.
  - The Excel writer's append_row also skips duplicate msg_ids defensively.
  - Within a single batch, also skips intra-batch duplicates by name
    (without doing the full HD-resolution dedup — the chronological
    order means we keep the first of two same-name posts in this batch).
"""
import asyncio
import os
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
    handlers=[
        logging.FileHandler("logs/daily.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
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

    # Supabase sync is optional — only built if .env is configured.
    from src.supabase_client import make_sync_from_config
    supabase_sync = None
    if cfg.supabase_url and cfg.supabase_service_role_key:
        try:
            supabase_sync = make_sync_from_config(cfg)
            print(f"Supabase: writing to {cfg.supabase_url}")
        except Exception as e:
            logging.warning(f"Supabase init failed (writes will be skipped): {e}")

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

    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()

    seen_names = set()
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

            # Incremental persistence — write Excel + state after EVERY processed
            # message so a crash mid-loop loses at most this one message's work
            # rather than the entire run. ExcelWriter.save() rewrites the whole
            # workbook each call (~1-2 MB, sub-second), so the cost is negligible
            # compared to OCR/video time per message.
            writer.save()
            state.save(STATE_PATH)

            print(f"  msg {tg.msg_id}: {row.extraction_status} | "
                  f"birth={row.birth_date} | mart={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {tg.msg_id}: {e}")
            state.mark_processed(tg.msg_id, "failed")
            # Also persist the failure marker so the next run doesn't retry it.
            state.save(STATE_PATH)

    # Final save is now redundant in the happy path (every iteration persists),
    # but kept as a defensive fallback for any state mutated outside the loop.
    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"Daily run complete. Processed {len(new_videos)} new videos.")


if __name__ == "__main__":
    asyncio.run(main())
