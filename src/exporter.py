# src/exporter.py
"""Reads verified rows from SQL Server, writes data/martyrs.json with a
{version, generated_at, note, channel, martyrs[]} envelope. Records the
publish in dbo.publish_versions for audit.

Used by both:
  - scripts/export_to_json.py (CLI: `python scripts/export_to_json.py`)
  - src/admin_app.py POST /api/publish (clicked from the SPA admin button)
"""
import json
from pathlib import Path
from datetime import datetime, date

from src.sqlserver_client import (
    get_verified_for_export,
    next_publish_version,
    insert_publish_version,
)

# Default location of the published JSON snapshot. Callers can override.
DEFAULT_JSON_PATH = "data/martyrs.json"

# Fields included in the published JSON. The SPA consumes a subset of these,
# but every field listed below ships in data/martyrs.json so nothing is
# silently dropped on publish. Still excluded (genuinely admin-only):
#   verification_status / verified_at / verified_by — exporter only emits
#       verified rows, so the status fields are redundant + verified_by
#       identifies the reviewer (not for public site).
#   duplicate_status — pipeline-internal flag, no public meaning.
# Included audit fields (admin requested 2026-05-23): ocr_* preserve the
# original OCR output as a transparent before/after trail; frame_paths +
# created_at + updated_at preserve the full row history.
PUBLISHED_FIELDS = [
    "msg_id",
    "name",
    "name_normalized",
    "birth_date",
    "martyrdom_date",
    "city",
    "military_rank",
    "weapon",
    "battalion",
    "brigade",
    "photo_path",
    "frame_paths",
    "featured_frame_path",
    "posted_date",
    "message_link",
    "extraction_status",
    "ocr_name",
    "ocr_birth_date",
    "ocr_martyrdom_date",
    "created_at",
    "updated_at",
    # Public-CDN video identifier (hybrid hosting Phase 2). NULL on every row
    # until scripts/mirror_to_archive_org.py mirrors a video; published so the
    # GitHub Pages site can swap a row's Telegram preview for an inline
    # Archive.org player once mirrored. See docs/hybrid-video-hosting.md.
    "archive_org_id",
]


def serialize_row(row: dict) -> dict:
    """Convert a DB row (dict from pyodbc with date/datetime objects) into a
    JSON-serializable dict. Filters to PUBLISHED_FIELDS only, ISO-formats dates."""
    out = {}
    for f in PUBLISHED_FIELDS:
        v = row.get(f)
        if isinstance(v, datetime):
            out[f] = v.isoformat(timespec="seconds")
        elif isinstance(v, date):
            out[f] = v.isoformat()
        else:
            out[f] = v
    return out


def build_payload(rows: list, version: int, note: str | None = None) -> dict:
    """Wrap a list of serialized rows in the publish envelope."""
    return {
        "version": version,
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "channel": "AqmarTofan",
        "note": note or None,
        "martyrs": [serialize_row(r) for r in rows],
    }


def export_to_json(conn, json_path: str = DEFAULT_JSON_PATH, note: str | None = None) -> dict:
    """Read verified rows + compute next version + write JSON + record
    the publish in publish_versions. Returns a summary dict for the caller
    to log / show in the UI.

    Returns:
        {
            "version": int,        # the version number assigned
            "row_count": int,      # how many rows landed in the JSON
            "path": str,           # absolute path of the written file
        }
    """
    verified = get_verified_for_export(conn)
    version = next_publish_version(conn)
    payload = build_payload(verified, version, note)

    out_path = Path(json_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    insert_publish_version(conn, row_count=len(verified), note=note or None)

    return {
        "version": version,
        "row_count": len(verified),
        "path": str(out_path.resolve()),
    }
