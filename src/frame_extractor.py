import os
import subprocess

# Phase 0 confirmed the data slide reliably appears around sec 30 (±2s).
# Three frames around that window give us OCR redundancy for majority voting
# while being 2x faster than scanning the whole 0-30s range.
DEFAULT_TIMESTAMPS = [28, 30, 32]

def extract_frames(video_path: str, out_dir: str, msg_id: int,
                   timestamps=None) -> list:
    if timestamps is None:
        timestamps = DEFAULT_TIMESTAMPS
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for sec in timestamps:
        out_path = os.path.join(out_dir, f"{msg_id}_{sec:02d}.jpg")
        try:
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(sec), "-i", video_path,
                "-frames:v", "1", "-q:v", "2", out_path
            ], check=True, timeout=30)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                paths.append(out_path)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    return paths
