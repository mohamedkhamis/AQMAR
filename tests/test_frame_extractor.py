import subprocess
import os
from src.frame_extractor import extract_frames, DEFAULT_TIMESTAMPS

def test_extracts_frames_from_generated_video(tmp_path):
    # Generate a 35-second test video with ffmpeg (color bars + timestamp)
    video = tmp_path / "test.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=35:size=320x240:rate=10",
        "-vcodec", "libx264", "-pix_fmt", "yuv420p", str(video)
    ], check=True)
    out_dir = tmp_path / "frames"
    paths = extract_frames(str(video), str(out_dir), msg_id=99,
                           timestamps=DEFAULT_TIMESTAMPS)
    assert len(paths) == 6
    for p in paths:
        assert os.path.exists(p)
        assert os.path.getsize(p) > 0
