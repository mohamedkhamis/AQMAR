# scripts/reprocess.py
"""Re-process a single message and print what the pipeline would extract.

Useful for:
  - Manually verifying a specific row against the source frames + photo
  - Recovering a row that failed during a daily run (e.g. cp1252 codec
    error, network drop, OCR catastrophe)
  - Debugging when one row looks wrong in the SPA / SQL Server

Does NOT write to SQL Server by default — only prints the extracted
fields. Pass --update to upsert into SQL Server with the new extraction.

Usage:
  python scripts\reprocess.py --msg-id 874
  python scripts\reprocess.py --msg-id 874 --update
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Force UTF-8 on stdout — Arabic chars in row.name crash Windows cp1252.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.pipeline import process_message
from src.parser_caption import parse_caption
from src.state import State
from src.sqlserver_client import make_conn, martyr_row_to_db_dict, upsert_martyr

STATE_PATH = "data/state.json"
PHOTOS_DIR = "data/photos"
FRAMES_DIR = "data/frames"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"


async def main(msg_id: int, update: bool):
    cfg = load_config()

    if update and not cfg.sqlserver_conn_str:
        print("ERROR: --update requires SQLSERVER_CONN_STR in .env")
        sys.exit(1)

    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    msg = await fetcher.client.get_messages(cfg.channel_username, ids=msg_id)
    if msg is None:
        print(f"Message {msg_id} not found in @{cfg.channel_username}.")
        await fetcher.disconnect()
        return
    tg = fetcher._to_tg_message(msg)
    if not tg.has_video:
        print(f"Message {msg_id} has no video; nothing to reprocess.")
        await fetcher.disconnect()
        return

    # Find the paired photo by name (looking at adjacent messages)
    name = parse_caption(tg.caption)["name"]
    paired = None
    if name:
        for offset in (-1, -2, -3, 1, 2):
            adj = await fetcher.client.get_messages(cfg.channel_username, ids=msg_id + offset)
            if adj is None:
                continue
            adj_tg = fetcher._to_tg_message(adj)
            if adj_tg.has_photo and parse_caption(adj_tg.caption)["name"] == name:
                paired = adj_tg
                print(f"Paired photo found at msg {paired.msg_id}")
                break

    row = await process_message(
        tg, fetcher, cfg.channel_username,
        PHOTOS_DIR, FRAMES_DIR, MISSING_BIRTH_LOG,
        paired_photo_msg=paired,
    )

    print(f"\nmsg {msg_id}: {row.extraction_status}")
    print(f"  name:        {row.name}")
    print(f"  birth:       {row.birth_date}")
    print(f"  martyrdom:   {row.martyrdom_date}")
    print(f"  city:        {row.city}")
    print(f"  rank:        {row.military_rank}")
    print(f"  weapon:      {row.weapon}")
    print(f"  battalion:   {row.battalion}")
    print(f"  brigade:     {row.brigade}")
    print(f"  photo_path:  {row.photo_path}")
    print(f"  message:     {row.message_link}")

    if update:
        # Upsert into SQL Server (INSERT-or-UPDATE on msg_id). Verification
        # status defaults to 'unverified' on INSERT and is preserved on
        # UPDATE — so reprocessing won't clobber admin's verify decision.
        db = make_conn(cfg)
        payload = martyr_row_to_db_dict(row)
        upsert_martyr(db, payload)
        db.close()

        # Mark processed in state.json so the next phase3_daily run skips it
        state = State.load(STATE_PATH)
        state.mark_processed(msg_id, row.extraction_status)
        state.save(STATE_PATH)

        print(f"\nUpserted msg {msg_id} into dbo.martyrs + marked processed in state.json.")

    await fetcher.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--msg-id", type=int, required=True)
    parser.add_argument("--update", action="store_true",
                        help="Also UPSERT the new extraction into SQL Server.")
    args = parser.parse_args()
    asyncio.run(main(args.msg_id, args.update))
