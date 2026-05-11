# scripts/phase2_backfill_v2.py
"""Optimized Phase 2 backfill — parallel downloads + fresh references.

What's different from phase2_backfill.py:
  - 5 concurrent video processings via asyncio.Semaphore (5× faster
    on bandwidth-bound work).
  - download_video now refreshes the file reference on expiry (already
    in src/telegram_client.py), so the "File ref expired" stalls go
    away — no more sequential refetch-retry waste per message.
  - Skips anything already in state.json (resumable; preserves the work
    from the first phase2 run).
  - Excel writes serialized through an asyncio.Lock so concurrent tasks
    can't interleave row writes.

Expected wall time: ~3-5h for 230 remaining (vs ~19h sequential).
"""
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
    handlers=[
        logging.FileHandler("logs/pipeline.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"
CONCURRENCY = 5  # number of videos processed in parallel
CHECKPOINT_EVERY = 5  # save Excel + state every N completed messages


async def process_one(tg_msg, fetcher, channel, paired_photo_msg, sem,
                      excel_lock, writer, state, counter):
    async with sem:
        try:
            row = await process_message(
                tg_msg, fetcher, channel,
                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                paired_photo_msg=paired_photo_msg,
            )
            async with excel_lock:
                writer.append_row(row)
                state.mark_processed(tg_msg.msg_id, row.extraction_status)
                counter["done"] += 1
                if counter["done"] % CHECKPOINT_EVERY == 0:
                    writer.save()
                    state.save(STATE_PATH)
                    print(f"  ✓ checkpoint at {counter['done']}/{counter['total']} done")
            print(f"  [{counter['done']}/{counter['total']}] msg {tg_msg.msg_id}: "
                  f"{row.extraction_status} | birth={row.birth_date} | mart={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {tg_msg.msg_id}: {e}")
            async with excel_lock:
                state.mark_processed(tg_msg.msg_id, "failed")


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
    photos = [m for m in messages if m.has_photo]
    print(f"Total: {len(messages)} | videos: {len(videos)} | photos: {len(photos)}")

    name_to_photo = {}
    for p in photos:
        nm = parse_caption(p.caption)["name"]
        if nm and nm not in name_to_photo:
            name_to_photo[nm] = p
    print(f"Indexed {len(name_to_photo)} photos by name")

    items = []
    for tg in videos:
        cap = parse_caption(tg.caption)
        items.append(VideoMeta(
            msg_id=tg.msg_id, name=cap["name"],
            w=tg.video_w, h=tg.video_h, size_bytes=tg.video_size,
        ))
    keep, dupes = dedup_by_name(items)
    print(f"After dedup: {len(keep)} unique | {len(dupes)} duplicates")

    msg_by_id = {m.msg_id: m for m in videos}
    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    state = State.load(STATE_PATH)

    # Refresh duplicates sheet (idempotent)
    for d in dupes:
        meta = d.duplicate
        writer.append_duplicate(DuplicateRow(
            msg_id=meta.msg_id, name=meta.name, reason=d.reason,
            resolution=f"{meta.w}x{meta.h}",
            size_mb=round(meta.size_bytes / 1024 / 1024, 2),
            kept_msg_id=d.kept_msg_id,
            link=f"https://t.me/{cfg.channel_username}/{meta.msg_id}",
        ))

    # Filter out already-processed
    pending = [k for k in keep if not state.is_processed(k.msg_id)]
    print(f"Pending after skipping processed: {len(pending)}")
    if not pending:
        writer.save()
        state.save(STATE_PATH)
        await fetcher.disconnect()
        print("Nothing to do.")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    excel_lock = asyncio.Lock()
    counter = {"done": 0, "total": len(pending)}

    tasks = []
    for kept in pending:
        tg = msg_by_id[kept.msg_id]
        paired = name_to_photo.get(kept.name)
        tasks.append(process_one(
            tg, fetcher, cfg.channel_username,
            paired, sem, excel_lock, writer, state, counter,
        ))

    await asyncio.gather(*tasks, return_exceptions=False)

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nDone. {counter['done']}/{counter['total']} processed in this run.")


if __name__ == "__main__":
    asyncio.run(main())
