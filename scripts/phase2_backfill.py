# scripts/phase2_backfill.py
"""Full backfill of all historical AqmarTofan messages.

1. Fetch ALL messages from the channel.
2. Build photo index by name (each video has a paired photo with same name).
3. Dedup videos by name (keep HD only, mark others as duplicates).
4. Process each unique HD message: download photo + video → frames → OCR → Excel.
5. Save state every 10 messages (resumable on crash).

Estimated runtime for ~400 messages: 8-15 hours (network-bound).
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
    print(f"Total messages: {len(messages)} | videos: {len(videos)} | photos: {len(photos)}")

    # Build name -> photo TgMessage index
    name_to_photo = {}
    for p in photos:
        nm = parse_caption(p.caption)["name"]
        if nm and nm not in name_to_photo:
            name_to_photo[nm] = p
    print(f"Indexed {len(name_to_photo)} unique photos by name")

    # Dedup videos by name — keep HD (max w*h, tiebreak by file size)
    items = []
    for tg in videos:
        cap = parse_caption(tg.caption)
        items.append(VideoMeta(
            msg_id=tg.msg_id, name=cap["name"],
            w=tg.video_w, h=tg.video_h, size_bytes=tg.video_size,
        ))
    keep, dupes = dedup_by_name(items)
    print(f"After dedup: {len(keep)} unique HD videos | {len(dupes)} duplicates skipped")

    msg_by_id = {m.msg_id: m for m in videos}

    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    state = State.load(STATE_PATH)

    # Write duplicates sheet (always, idempotent)
    for d in dupes:
        meta = d.duplicate
        writer.append_duplicate(DuplicateRow(
            msg_id=meta.msg_id,
            name=meta.name,
            reason=d.reason,
            resolution=f"{meta.w}x{meta.h}",
            size_mb=round(meta.size_bytes / 1024 / 1024, 2),
            kept_msg_id=d.kept_msg_id,
            link=f"https://t.me/{cfg.channel_username}/{meta.msg_id}",
        ))

    # Process each unique HD message
    total = len(keep)
    for i, kept in enumerate(keep, start=1):
        if state.is_processed(kept.msg_id):
            print(f"[{i}/{total}] Skip msg {kept.msg_id} (already processed)")
            continue
        tg = msg_by_id[kept.msg_id]
        paired = name_to_photo.get(kept.name)
        paired_id = paired.msg_id if paired else "—"
        print(f"[{i}/{total}] msg {kept.msg_id} (photo {paired_id}) — {kept.name[:40]}")
        try:
            row = await process_message(
                tg, fetcher, cfg.channel_username,
                PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                paired_photo_msg=paired,
            )
            writer.append_row(row)
            state.mark_processed(kept.msg_id, row.extraction_status)
            print(f"           → {row.extraction_status} | birth={row.birth_date} | mart={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {kept.msg_id}: {e}")
            state.mark_processed(kept.msg_id, "failed")

        # Persist progress every 10 messages
        if i % 10 == 0:
            writer.save()
            state.save(STATE_PATH)
            print(f"  ... checkpoint saved at {i}/{total}")

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nBackfill complete. Open {EXCEL_PATH} — {total} unique martyrs processed.")


if __name__ == "__main__":
    asyncio.run(main())
