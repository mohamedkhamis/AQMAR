# tests/test_publish_diff.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.publish_diff import (
    payload_msg_ids, new_people, martyrs_changed, referenced_files,
)

def m(i, **kw):
    base = {"msg_id": i, "name": f"n{i}", "birth_date": "1990-01-01",
            "martyrdom_date": "2026-07-01", "message_link": f"https://t.me/AqmarTofan/{i}",
            "photo_path": f"data\\photos\\{i}.jpg",
            "featured_frame_path": f"data/frames/{i}_28.jpg"}
    base.update(kw)
    return base

OLD = {"version": 15, "generated_at": "x", "note": None, "channel": "AqmarTofan",
       "martyrs": [m(1), m(2)]}


def test_payload_msg_ids():
    assert payload_msg_ids(OLD) == {1, 2}
    assert payload_msg_ids(None) == set()


def test_new_people_only_new_ids_with_summary_fields():
    got = new_people(OLD, [m(1), m(2), m(3)])
    assert [p["msg_id"] for p in got] == [3]
    assert set(got[0]) == {"msg_id", "name", "birth_date", "martyrdom_date", "message_link"}


def test_new_people_no_baseline_means_all_new():
    assert len(new_people(None, [m(1), m(2)])) == 2


def test_martyrs_changed_ignores_envelope():
    same = {"version": 99, "generated_at": "y", "note": "z",
            "channel": "AqmarTofan", "martyrs": [m(1), m(2)]}
    assert martyrs_changed(same, [m(1), m(2)]) is False
    assert martyrs_changed(OLD, [m(1), m(2, city="غزة")]) is True
    assert martyrs_changed(OLD, [m(1)]) is True
    assert martyrs_changed(None, []) is False
    assert martyrs_changed(None, [m(1)]) is True


def test_referenced_files_normalized_unique_sorted():
    rows = [m(2), m(1), m(3, featured_frame_path=None, photo_path=None)]
    ref = referenced_files(rows)
    assert ref["photos"] == ["data/photos/1.jpg", "data/photos/2.jpg"]
    assert ref["frames"] == ["data/frames/1_28.jpg", "data/frames/2_28.jpg"]
