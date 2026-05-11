# scripts/mark_gap_skipped.py
"""User decided to fill the remaining 230 historical messages manually.

This script:
  1. Connects to Telegram, finds the max msg_id in the channel.
  2. Marks every video msg_id between last_processed (354) and the max as
     "skipped_manual" in state.json — so the daily trigger will NOT
     reprocess them.
  3. Sets last_processed_msg_id = max so the daily trigger picks up
     starting at the next NEW post.

After this runs, scripts/phase3_daily.py will only handle posts that
appear in the channel from now on (not the historical gap).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.state import State

STATE_PATH = "data/state.json"


async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    print("Scanning channel for max msg_id...")
    # Fetch newest messages (no reverse) — first one is the highest msg_id
    max_id = 0
    async for msg in fetcher.client.iter_messages(cfg.channel_username, limit=1):
        max_id = msg.id
    print(f"Max msg_id in channel: {max_id}")

    state = State.load(STATE_PATH)
    print(f"Currently processed: {len(state.processed_msg_ids)} | "
          f"last_processed_msg_id: {state.last_processed_msg_id}")

    start = (state.last_processed_msg_id or 0) + 1
    gap = list(range(start, max_id + 1))
    print(f"Marking {len(gap)} message ids ({start}..{max_id}) as skipped_manual")

    for msg_id in gap:
        if msg_id not in state.processed_msg_ids:
            state.mark_processed(msg_id, "skipped_manual")

    state.save(STATE_PATH)
    print(f"Done. New last_processed_msg_id: {state.last_processed_msg_id}")
    print(f"Total processed entries in state: {len(state.processed_msg_ids)}")
    print("\nDaily trigger will now only process new posts (msg_id > "
          f"{state.last_processed_msg_id}).")

    await fetcher.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
