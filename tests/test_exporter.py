"""Tests for src/exporter.py — the SQL Server → versioned JSON pipeline."""
import json
import sys
from datetime import datetime, date
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.exporter import (
    serialize_row,
    build_payload,
    export_to_json,
    PUBLISHED_FIELDS,
)


# =============================================================================
# serialize_row
# =============================================================================

def test_serialize_row_isoformats_date_and_datetime():
    row = {
        "msg_id": 20,
        "name": "فلان",
        "birth_date": date(1980, 2, 12),
        "martyrdom_date": date(2024, 5, 17),
        "posted_date": datetime(2024, 5, 18, 12, 0, 0),
    }
    out = serialize_row(row)
    assert out["msg_id"] == 20
    assert out["name"] == "فلان"
    assert out["birth_date"] == "1980-02-12"
    assert out["martyrdom_date"] == "2024-05-17"
    assert out["posted_date"] == "2024-05-18T12:00:00"


def test_serialize_row_filters_to_published_fields_only():
    """Verifies the public/private boundary on published JSON.

    Published (per admin request 2026-05-23): ocr_*, created_at, updated_at,
    frame_paths — kept as a transparent audit trail and provenance record.

    Still admin-only: verification_status (redundant — only verified rows
    are exported), verified_at, verified_by (identifies the reviewer),
    duplicate_status (pipeline-internal flag).
    """
    row = {
        "msg_id": 20, "name": "x",
        # Audit fields — now included
        "ocr_name": "raw ocr name",
        "ocr_birth_date": "garbage",
        "ocr_martyrdom_date": "more garbage",
        "created_at": "2026-01-01",
        "updated_at": "2026-05-17",
        "frame_paths": "data/frames/20_28.jpg",
        # featured_frame_path: included (Phase 1 cover-image feature, 2026-05-25)
        "featured_frame_path": "data/frames/20_28.jpg",
        # Reviewer + redundant + internal fields — must NOT leak
        "verification_status": "verified",
        "verified_at": "2026-05-17T10:00:00",
        "verified_by": "admin",
        "duplicate_status": "unique",
    }
    out = serialize_row(row)
    leaked = set(out.keys()) - set(PUBLISHED_FIELDS)
    assert leaked == set(), f"These fields leaked into the public JSON: {leaked}"
    # Hard-coded checks for fields that must stay admin-only.
    assert "verification_status" not in out
    assert "verified_at" not in out
    assert "verified_by" not in out
    assert "duplicate_status" not in out
    # And confirm the newly-published audit fields actually made it through.
    assert out["ocr_name"] == "raw ocr name"
    assert out["created_at"] == "2026-01-01"
    assert out["frame_paths"] == "data/frames/20_28.jpg"
    assert out["featured_frame_path"] == "data/frames/20_28.jpg"


def test_serialize_row_preserves_none_values():
    row = {"msg_id": 20, "name": "x", "birth_date": None, "city": None}
    out = serialize_row(row)
    assert out["birth_date"] is None
    assert out["city"] is None


# =============================================================================
# build_payload
# =============================================================================

def test_build_payload_wraps_rows_with_envelope():
    rows = [{"msg_id": 1, "name": "A"}, {"msg_id": 2, "name": "B"}]
    payload = build_payload(rows, version=47, note="weekly")
    assert payload["version"] == 47
    assert payload["channel"] == "AqmarTofan"
    assert payload["note"] == "weekly"
    assert "generated_at" in payload
    assert payload["generated_at"].endswith("Z")  # UTC marker
    assert len(payload["martyrs"]) == 2


def test_build_payload_empty_note_becomes_none():
    payload = build_payload([], version=1, note="")
    assert payload["note"] is None
    payload2 = build_payload([], version=1)  # not passed at all
    assert payload2["note"] is None


def test_build_payload_with_no_rows_is_valid():
    """A publish with zero verified rows should still produce valid JSON
    (e.g. fresh DB before admin verifies anything)."""
    payload = build_payload([], version=1)
    assert payload["version"] == 1
    assert payload["martyrs"] == []


# =============================================================================
# export_to_json — full flow with mocked DB
# =============================================================================

def test_export_to_json_writes_file_and_records_version(tmp_path, monkeypatch):
    """The end-to-end happy path: queries verified rows, computes version,
    writes JSON, records publish_versions row, returns summary."""
    out_path = tmp_path / "martyrs.json"

    # Mock the DB query functions used inside export_to_json
    import src.exporter as exporter_module
    verified_rows = [
        {"msg_id": 20, "name": "Foo", "birth_date": date(1990, 1, 1)},
        {"msg_id": 21, "name": "Bar", "birth_date": date(1985, 6, 15)},
    ]
    inserted = []
    monkeypatch.setattr(exporter_module, "get_verified_for_export",
                        lambda conn: verified_rows)
    monkeypatch.setattr(exporter_module, "next_publish_version",
                        lambda conn: 5)
    monkeypatch.setattr(exporter_module, "insert_publish_version",
                        lambda conn, row_count, note: inserted.append((row_count, note)))

    mock_conn = MagicMock()
    result = export_to_json(mock_conn, json_path=str(out_path), note="test publish")

    # Return shape
    assert result["version"] == 5
    assert result["row_count"] == 2
    assert "martyrs.json" in result["path"]

    # File written
    assert out_path.exists()
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["version"] == 5
    assert payload["note"] == "test publish"
    assert len(payload["martyrs"]) == 2
    assert payload["martyrs"][0]["msg_id"] == 20
    assert payload["martyrs"][0]["birth_date"] == "1990-01-01"

    # publish_versions row inserted
    assert inserted == [(2, "test publish")]


def test_export_to_json_empty_note_passes_none_to_insert(tmp_path, monkeypatch):
    out_path = tmp_path / "martyrs.json"
    import src.exporter as exporter_module
    inserted = []
    monkeypatch.setattr(exporter_module, "get_verified_for_export", lambda c: [])
    monkeypatch.setattr(exporter_module, "next_publish_version", lambda c: 1)
    monkeypatch.setattr(exporter_module, "insert_publish_version",
                        lambda c, row_count, note: inserted.append((row_count, note)))

    export_to_json(MagicMock(), json_path=str(out_path), note="")

    assert inserted == [(0, None)]


def test_published_fields_exclude_ai_verification_columns():
    """The AI verification track is admin-internal - must never publish.
    (PUBLISHED_FIELDS is an allowlist, so this pins the invariant.)"""
    from src.exporter import PUBLISHED_FIELDS
    for f in ("ai_verified", "ai_verified_at", "ai_note"):
        assert f not in PUBLISHED_FIELDS
