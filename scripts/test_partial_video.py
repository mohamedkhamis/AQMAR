# scripts/test_partial_video.py
"""Proof-of-concept: download only the first ~12 MB of a video, then try
to ffmpeg-extract a frame at sec 30 from that partial file.

If this works, we can backfill all 240 remaining messages in ~30-60 min
instead of 24-40h, because we download 8× less data per video."""
import asyncio
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.ocr_engine import ocr_image
from src.parser_ocr import parse_ocr_text


# Try with progressively larger downloads — find smallest that works
TARGETS = [4, 8, 12, 16, 24, 32]  # MB to download


async def download_partial(client, msg, target_mb, out_path):
    """Stream chunks until we've collected target_mb, then stop."""
    target_bytes = target_mb * 1024 * 1024
    total = 0
    with open(out_path, "wb") as f:
        async for chunk in client.iter_download(msg.media, request_size=512 * 1024):
            f.write(chunk)
            total += len(chunk)
            if total >= target_bytes:
                break
    return total


def try_extract_frame(video_path, sec, out_path):
    """Returns True if ffmpeg succeeded in writing a non-empty jpg."""
    try:
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", str(sec), "-i", video_path,
            "-frames:v", "1", "-q:v", "2", out_path,
        ], check=True, timeout=30)
        return os.path.exists(out_path) and os.path.getsize(out_path) > 0
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


async def main():
    cfg = load_config()
    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    # Pick 2 video msgs we haven't processed (in the gap)
    for test_id in [400, 600, 800]:
        msg = await fetcher.client.get_messages(cfg.channel_username, ids=test_id)
        if msg is None or not msg.media or not getattr(msg.media, "document", None):
            print(f"msg {test_id}: not a media message, skip")
            continue
        doc = msg.media.document
        from telethon.tl.types import DocumentAttributeVideo
        if not any(isinstance(a, DocumentAttributeVideo) for a in doc.attributes):
            print(f"msg {test_id}: not a video, skip")
            continue
        full_mb = doc.size / 1024 / 1024
        print(f"\n=== msg {test_id} | full video {full_mb:.1f} MB ===")

        for target in TARGETS:
            if target >= full_mb:
                print(f"  {target} MB target ≥ full file, skip")
                break
            with tempfile.TemporaryDirectory() as td:
                video_path = os.path.join(td, "partial.mp4")
                frame_path = os.path.join(td, "frame.jpg")
                t0 = time.time()
                try:
                    actual = await download_partial(fetcher.client, msg, target, video_path)
                except Exception as e:
                    print(f"  {target} MB partial: download error: {e}")
                    continue
                dl_secs = time.time() - t0
                # Try frame at sec 30
                ok = try_extract_frame(video_path, 30, frame_path)
                if not ok:
                    # Maybe video is too short — try sec 15
                    ok = try_extract_frame(video_path, 15, frame_path)
                size_kb = os.path.getsize(frame_path) if os.path.exists(frame_path) else 0
                # Run OCR on the frame to see if data is actually readable
                ocr_text = ""
                parsed = {}
                if ok and size_kb > 0:
                    try:
                        ocr_text = ocr_image(frame_path)
                        parsed = parse_ocr_text(ocr_text)
                    except Exception as e:
                        print(f"  OCR error: {e}")
                got_dates = bool(parsed.get("birth_date") or parsed.get("martyrdom_date"))
                print(f"  {target} MB ({actual/1024/1024:.1f} MB actual): "
                      f"dl={dl_secs:.1f}s | frame_ok={ok} | frame={size_kb} B | "
                      f"birth={parsed.get('birth_date','-')} | mart={parsed.get('martyrdom_date','-')}")
                if got_dates:
                    print(f"  → SUCCESS at {target} MB!")
                    break

    await fetcher.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
