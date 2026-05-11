# scripts/phase2_photos_only.py
"""Fast photo-only backfill for the historical gap.

When you want to populate the remaining ~240 martyrs WITHOUT waiting
for video downloads (which would take ~24-40h), this script just:

  1. Fetches all messages.
  2. Dedups by name (HD-pick like phase2_backfill_v2).
  3. For each kept video, finds its paired photo by name.
  4. Downloads ONLY the photo (5-10s per photo, no 80 MB video download).
  5. Runs OCR on the photo for name + martyrdom date (photos in this
     channel reliably show those two fields; birth date is NOT on photos).
  6. Writes the row to Excel with extraction_status = "photo_only".
  7. Saves checkpoint every 10 messages.

Each row goes in with birth_date left blank. You can fill those manually
later, or run scripts/phase2_backfill_v2.py separately to backfill them
from video frames in the background.

Estimated runtime for 240 messages: 30-60 minutes (vs 24-40h for full
video processing).
"""
import asyncio
import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.parser_caption import parse_caption
from src.parser_ocr import parse_ocr_text
from src.name_normalizer import normalize_arabic_name
from src.ocr_engine import ocr_image
from src.excel_writer import ExcelWriter, MartyrRow, DuplicateRow
from src.state import State
from src.dedup import dedup_by_name, VideoMeta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler("logs/photos_only.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

EXCEL_PATH = "data/martyrs.xlsx"
STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"


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

    # Only process messages that aren't already done (or that are marked
    # skipped_manual — we override that since the user changed their mind)
    pending = []
    for k in keep:
        st = state.statuses.get(k.msg_id)
        if st in (None, "skipped_manual"):
            pending.append(k)
    print(f"Pending (incl. skipped_manual override): {len(pending)}")
    if not pending:
        await fetcher.disconnect()
        print("Nothing to do.")
        return

    total = len(pending)
    for i, kept in enumerate(pending, start=1):
        tg = msg_by_id[kept.msg_id]
        paired = name_to_photo.get(kept.name)
        cap = parse_caption(tg.caption)

        photo_path = ""
        ocr_fields = {"birth_date": "", "martyrdom_date": "", "city": "",
                      "weapon": "", "military_rank": ""}

        if paired is not None:
            try:
                photo_path = os.path.join(PHOTOS_DIR, f"{kept.msg_id}.jpg")
                if not (os.path.exists(photo_path) and os.path.getsize(photo_path) > 0):
                    await fetcher.download_photo(paired, photo_path)
                # OCR the photo for whatever fields it has (name + martyrdom + maybe more)
                try:
                    text = ocr_image(photo_path)
                    ocr_fields.update(parse_ocr_text(text))
                except Exception as e:
                    logging.warning(f"OCR failed for msg {kept.msg_id}: {e}")
            except Exception as e:
                logging.warning(f"Photo download failed for msg {kept.msg_id}: {e}")
                photo_path = ""

        # Status reflects partial extraction (birth date will be blank for most)
        if ocr_fields["martyrdom_date"]:
            status = "photo_only_complete" if ocr_fields["birth_date"] else "photo_only_no_birth"
        else:
            status = "photo_only_no_dates"

        row = MartyrRow(
            msg_id=kept.msg_id,
            name=cap["name"],
            name_normalized=normalize_arabic_name(cap["name"]),
            birth_date=ocr_fields["birth_date"],
            martyrdom_date=ocr_fields["martyrdom_date"],
            city=ocr_fields["city"],
            military_rank=ocr_fields["military_rank"],
            weapon=ocr_fields["weapon"],
            battalion=cap["battalion"],
            brigade=cap["brigade"],
            photo_path=photo_path,
            frame_paths="",
            posted_date=tg.posted_date,
            message_link=f"https://t.me/{cfg.channel_username}/{kept.msg_id}",
            extraction_status=status,
            duplicate_status="unique",
        )
        added = writer.append_row(row)
        state.mark_processed(kept.msg_id, status)
        marker = "+" if added else "="  # = means already in Excel, skipped
        print(f"  [{i}/{total}] {marker} msg {kept.msg_id}: {status} | "
              f"mart={ocr_fields['martyrdom_date']:>12} | {cap['name'][:35]}")

        if i % 10 == 0:
            writer.save()
            state.save(STATE_PATH)

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nDone. {total} messages processed via photo-only.")
    print("To fill in birth dates later, run scripts/phase2_backfill_v2.py")


if __name__ == "__main__":
    asyncio.run(main())
