from src.dedup import dedup_by_name, VideoMeta

def test_no_duplicates_keeps_all():
    items = [
        VideoMeta(msg_id=1, name="فلان أ", w=1080, h=1920, size_bytes=1000),
        VideoMeta(msg_id=2, name="فلان ب", w=720, h=1280, size_bytes=500),
    ]
    keep, dupes = dedup_by_name(items)
    assert len(keep) == 2
    assert len(dupes) == 0

def test_pick_highest_resolution():
    items = [
        VideoMeta(msg_id=1, name="فلان أ", w=720, h=1280, size_bytes=500),
        VideoMeta(msg_id=2, name="فلان أ", w=1080, h=1920, size_bytes=900),
        VideoMeta(msg_id=3, name="فلان أ", w=480, h=854, size_bytes=300),
    ]
    keep, dupes = dedup_by_name(items)
    assert len(keep) == 1
    assert keep[0].msg_id == 2
    dupe_ids = {d.duplicate.msg_id for d in dupes}
    assert dupe_ids == {1, 3}
    for d in dupes:
        assert d.kept_msg_id == 2

def test_tie_break_by_size():
    items = [
        VideoMeta(msg_id=1, name="x", w=1080, h=1920, size_bytes=500),
        VideoMeta(msg_id=2, name="x", w=1080, h=1920, size_bytes=900),
    ]
    keep, dupes = dedup_by_name(items)
    assert keep[0].msg_id == 2
