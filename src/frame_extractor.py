import os
import subprocess

DEFAULT_TIMESTAMPS = [5, 10, 15, 20, 25, 30]

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
