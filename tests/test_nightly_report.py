# tests/test_nightly_report.py
"""Pure report assembly — no DB, no SMTP."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from nightly_report import build_report


def m(i):
    return {"msg_id": i, "name": f"n{i}", "birth_date": "1990-01-01",
            "martyrdom_date": "2026-07-01",
            "message_link": f"https://t.me/AqmarTofan/{i}",
            "photo_path": None, "featured_frame_path": None}

BASE = {"version": 15, "martyrs": [m(1)]}
CURR = {"version": 16, "martyrs": [m(1), m(2)]}
COUNTS = {"total": 5, "fixed": 2, "covers": 4}


def test_published_run_lists_new_people():
    r = build_report("2026-07-22T22:30:00Z", BASE, CURR,
                     [{"msg_id": 9, "name": "x", "ai_note": "conflict"}], COUNTS, [])
    assert r["published"] is True and r["version"] == 16
    assert [p["msg_id"] for p in r["new_people"]] == [2]
    assert r["row_count"] == 2
    assert r["stuck"][0]["msg_id"] == 9
    assert r["fixed_count"] == 2 and r["ai_total"] == 5 and r["covers_count"] == 4


def test_unchanged_run_is_not_published():
    r = build_report("2026-07-22T22:30:00Z", BASE, BASE, [], COUNTS, [])
    assert r["published"] is False and r["new_people"] == []
    assert r["version"] is None          # canonical shape: None when not published


def test_missing_current_payload_reports_error_not_crash():
    r = build_report("2026-07-22T22:30:00Z", BASE, None, [], COUNTS,
                     [{"stage": "verify", "detail": "claude exit 1"}])
    assert r["published"] is False
    assert r["errors"][0]["stage"] == "verify"
