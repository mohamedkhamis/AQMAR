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
from src.parser_caption import parse_caption

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

    # Build name -> photo TgMessage index from PHOTO posts (channel pairs each
    # video with a separate photo post that has the same name in caption).
    photos = [m for m in messages if m.has_photo]
    name_to_photo = {}
    for p in photos:
        nm = parse_caption(p.caption)["name"]
        if nm and nm not in name_to_photo:
            name_to_photo[nm] = p
    print(f"Indexed {len(name_to_photo)} unique photos by name (out of {len(photos)} photo posts)")

    if len(videos) < 5:
        samples = videos
    else:
        samples = [videos[0]] + random.sample(videos[1:-1], 3) + [videos[-1]]

    writer = ExcelWriter(EXCEL_PATH)
    writer.ensure_initialized()
    state = State.load(STATE_PATH)

    for tg in samples:
        try:
            video_name = parse_caption(tg.caption)["name"]
            paired = name_to_photo.get(video_name)
            row = await process_message(tg, fetcher, cfg.channel_username,
                                        PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
                                        paired_photo_msg=paired)
            writer.append_row(row)
            state.mark_processed(tg.msg_id, row.extraction_status)
            paired_id = paired.msg_id if paired else "—"
            print(f"  msg {tg.msg_id} (photo from msg {paired_id}): {row.extraction_status} | birth={row.birth_date} | martyrdom={row.martyrdom_date}")
        except Exception as e:
            logging.exception(f"Failed msg {tg.msg_id}: {e}")
            state.mark_processed(tg.msg_id, "failed")

    writer.save()
    state.save(STATE_PATH)
    await fetcher.disconnect()
    print(f"\nPhase 1 done. Open {EXCEL_PATH} and verify the 5 rows.")

if __name__ == "__main__":
    asyncio.run(main())
