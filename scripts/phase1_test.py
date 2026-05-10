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
