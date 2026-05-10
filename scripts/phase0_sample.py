# scripts/phase0_sample.py
import asyncio
import sys
import logging
import random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.frame_extractor import extract_frames
import tempfile
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()
    print("Fetching all messages from channel...")
    messages = await fetcher.fetch_all_messages()
    videos = [m for m in messages if m.has_video]
    print(f"Found {len(videos)} video messages.")

    # Pick: 1 oldest, 1 newest, 3 random middle
    if len(videos) < 5:
        samples = videos
    else:
        oldest = videos[0]
        newest = videos[-1]
        middle = random.sample(videos[1:-1], 3)
        samples = [oldest] + middle + [newest]

    print("\nSelected samples:")
    for s in samples:
        url = f"https://t.me/{cfg.channel_username}/{s.msg_id}"
        print(f"  msg {s.msg_id} | {s.posted_date} | {s.video_w}x{s.video_h} | {s.video_size//1024//1024}MB | {url}")

    frames_dir = "data/frames"
    for s in samples:
        url = f"https://t.me/{cfg.channel_username}/{s.msg_id}"
        print(f"\nProcessing msg {s.msg_id}  ({url})")
        with tempfile.TemporaryDirectory() as td:
            video_path = os.path.join(td, f"{s.msg_id}.mp4")
            await fetcher.download_video(s, video_path)
            paths = extract_frames(video_path, frames_dir, s.msg_id)
            print(f"  Extracted {len(paths)} frames:")
            for p in paths:
                print(f"    {p}")

    await fetcher.disconnect()
    print("\nPhase 0 done. Review the frames above with the user before Phase 1.")

if __name__ == "__main__":
    asyncio.run(main())
