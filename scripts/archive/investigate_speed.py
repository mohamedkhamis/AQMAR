# scripts/investigate_speed.py
"""One-shot: figure out what's slow about Phase 2 and what alternatives exist.

Reports:
  1. Largest video thumbnail size we can get from Telethon (could be used
     instead of downloading the full video if big enough for OCR).
  2. Typical video file sizes in the channel.
  3. How long Telethon takes to download just a thumbnail vs a full video
     for one specific message.
"""
import asyncio
import sys
import time
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from telethon.tl.types import DocumentAttributeVideo, PhotoStrippedSize, PhotoSize, PhotoSizeProgressive


async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    # Pick a known-good video message (msg 64 was successfully processed before)
    test_msg_id = 64
    print(f"=== Probing video msg {test_msg_id} ===")
    msg = await fetcher.client.get_messages(cfg.channel_username, ids=test_msg_id)
    if not msg or not msg.media:
        print("Not found.")
        return

    doc = msg.media.document
    print(f"File size: {doc.size:,} bytes ({doc.size/1024/1024:.1f} MB)")
    print(f"MIME: {doc.mime_type}")
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeVideo):
            print(f"Video dimensions: {attr.w}x{attr.h}, duration: {attr.duration}s")

    # List all thumbnail sizes available
    print(f"\nThumbnails available:")
    for t in doc.thumbs or []:
        if isinstance(t, PhotoSize):
            print(f"  type={t.type!r} size={t.w}x{t.h} bytes={t.size}")
        elif isinstance(t, PhotoStrippedSize):
            print(f"  type={t.type!r} (stripped, ~tiny)")
        elif isinstance(t, PhotoSizeProgressive):
            print(f"  type={t.type!r} size={t.w}x{t.h} sizes={t.sizes}")
        else:
            print(f"  type={type(t).__name__}: {t}")

    # Time a thumbnail download
    print(f"\n=== Timing thumbnail download ===")
    with tempfile.TemporaryDirectory() as td:
        thumb_path = os.path.join(td, "thumb.jpg")
        t0 = time.time()
        result = await fetcher.client.download_media(msg, file=thumb_path, thumb=-1)
        thumb_secs = time.time() - t0
        size = os.path.getsize(thumb_path) if os.path.exists(thumb_path) else 0
        print(f"Largest thumb: {size:,} bytes in {thumb_secs:.1f}s -> {result}")

    # Sample sizes across the channel — first 30 videos
    print(f"\n=== Sampling first 30 video sizes ===")
    sizes = []
    count = 0
    async for m in fetcher.client.iter_messages(cfg.channel_username, reverse=True, limit=200):
        if not m.media or not getattr(m.media, "document", None):
            continue
        d = m.media.document
        is_video = any(isinstance(a, DocumentAttributeVideo) for a in d.attributes)
        if not is_video:
            continue
        sizes.append(d.size)
        count += 1
        if count >= 30:
            break
    if sizes:
        avg = sum(sizes) / len(sizes)
        print(f"Avg video size: {avg/1024/1024:.1f} MB")
        print(f"Min: {min(sizes)/1024/1024:.1f} MB | Max: {max(sizes)/1024/1024:.1f} MB")
        print(f"Total for {count} videos: {sum(sizes)/1024/1024/1024:.2f} GB")
        # Extrapolate
        total_videos = 391
        proj = sum(sizes) / len(sizes) * total_videos
        print(f"Projected for all {total_videos} videos: {proj/1024/1024/1024:.1f} GB")

    await fetcher.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
