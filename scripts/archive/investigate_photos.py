"""One-shot investigation: find out if the channel has separate photo posts
that pair with each video post.

Strategy:
- Fetch the first 30 messages chronologically
- Print: msg_id, type (photo/video/other), first line of caption (if any)
- Look for patterns: do photos cluster right before/after videos?
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument, DocumentAttributeVideo


async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    print(f"\n=== Sampling first 40 messages of @{cfg.channel_username} ===\n")
    print(f"{'msg_id':>6} | {'type':10s} | {'grouped':10s} | first caption line")
    print("-" * 90)

    count = 0
    async for msg in fetcher.client.iter_messages(cfg.channel_username, reverse=True, limit=40):
        count += 1
        media_type = "?"
        if isinstance(msg.media, MessageMediaPhoto):
            media_type = "PHOTO"
        elif isinstance(msg.media, MessageMediaDocument) and msg.media.document:
            is_video = any(isinstance(a, DocumentAttributeVideo) for a in msg.media.document.attributes)
            media_type = "VIDEO" if is_video else "DOCUMENT"
        else:
            media_type = "TEXT/?"
        grouped = msg.grouped_id if msg.grouped_id else ""
        cap = (msg.message or "").split("\n")[0][:60]
        print(f"{msg.id:>6} | {media_type:10s} | {str(grouped):10s} | {cap}")

    print(f"\n=== Sampled {count} messages ===\n")

    # Now also check 5 specific video msgs from Phase 1 and look at neighbors
    print("\n=== Neighbor check for known videos ===\n")
    for video_id in [20, 166, 342, 591, 830]:
        print(f"\n-- msg {video_id} (a known video) and neighbors {video_id-2}..{video_id+2} --")
        for offset in [-2, -1, 0, 1, 2]:
            target_id = video_id + offset
            try:
                m = await fetcher.client.get_messages(cfg.channel_username, ids=target_id)
                if m is None:
                    print(f"  msg {target_id}: (not found)")
                    continue
                media_type = "?"
                if isinstance(m.media, MessageMediaPhoto):
                    media_type = "PHOTO"
                elif isinstance(m.media, MessageMediaDocument) and m.media.document:
                    is_video = any(isinstance(a, DocumentAttributeVideo) for a in m.media.document.attributes)
                    media_type = "VIDEO" if is_video else "DOC"
                else:
                    media_type = "TEXT"
                grouped = m.grouped_id if m.grouped_id else "-"
                cap = (m.message or "").split("\n")[0][:50]
                marker = "  <-- target" if offset == 0 else ""
                print(f"  msg {target_id}: {media_type:6s} | grp={grouped} | {cap}{marker}")
            except Exception as e:
                print(f"  msg {target_id}: error: {e}")

    await fetcher.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
