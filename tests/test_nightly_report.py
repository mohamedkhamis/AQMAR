# tests/test_nightly_report.py
"""Pure report assembly — no DB, no SMTP."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from nightly_report import build_report, _safe_load


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


# --- _safe_load: guards corrupt/unreadable JSON so main() can't crash ---

def test_safe_load_valid_json_returns_dict(tmp_path):
    p = tmp_path / "martyrs.json"
    p.write_text('{"version": 1, "martyrs": []}', encoding="utf-8")
    errors = []
    result = _safe_load(p, errors, "martyrs.json")
    assert result == {"version": 1, "martyrs": []}
    assert errors == []


def test_safe_load_missing_file_returns_none_no_error(tmp_path):
    p = tmp_path / "does_not_exist.json"
    errors = []
    result = _safe_load(p, errors, "baseline")
    assert result is None
    assert errors == []


def test_safe_load_empty_file_returns_none_no_error(tmp_path):
    p = tmp_path / "empty.json"
    p.write_text("", encoding="utf-8")
    errors = []
    result = _safe_load(p, errors, "baseline")
    assert result is None
    assert errors == []


def test_safe_load_malformed_json_returns_none_and_appends_error(tmp_path):
    p = tmp_path / "truncated.json"
    p.write_text('{"version": 1, "martyrs": [', encoding="utf-8")  # truncated
    errors = []
    result = _safe_load(p, errors, "martyrs.json")
    assert result is None
    assert len(errors) == 1
    assert errors[0]["stage"] == "report"
    assert "martyrs.json unreadable" in errors[0]["detail"]
