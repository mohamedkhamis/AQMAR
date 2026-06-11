"""Tests for src/sqlserver_client.py.

The real pyodbc connection is stubbed via MagicMock so these tests don't need
a live SQL Server. The .commit() / .cursor() / .execute() / .fetchone()
methods are all asserted against directly."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.sqlserver_client import (
    martyr_row_to_db_dict,
    upsert_martyr,
    mark_verified,
    mark_rejected,
    mark_ai_verified,
    mark_ai_note,
    get_ai_pending,
    get_by_status,
    get_by_msg_id,
    get_all,
    next_publish_version,
    insert_publish_version,
    COLUMNS,
)


# =============================================================================
# Row conversion
# =============================================================================

def test_martyr_row_to_db_dict_maps_all_fields():
    """All MartyrRow fields land in the DB payload with the right names + types."""
    from src.excel_writer import MartyrRow
    row = MartyrRow(
        msg_id=20, name="فلان", name_normalized="فلان",
        birth_date="1980-02-12", martyrdom_date="2024-05-17",
        city="غزة", military_rank="قائد", weapon="مدفعية",
        battalion="كتيبة", brigade="لواء",
        photo_path="data/photos/20.jpg",
        frame_paths="data/frames/20_28.jpg;data/frames/20_30.jpg",
        posted_date="2024-05-18 12:00", message_link="https://t.me/x/20",
        extraction_status="complete", duplicate_status="unique",
    )
    payload = martyr_row_to_db_dict(row)
    assert payload["msg_id"] == 20
    assert payload["name"] == "فلان"
    assert payload["birth_date"] == "1980-02-12"
    assert payload["martyrdom_date"] == "2024-05-17"
    assert payload["photo_path"] == "data/photos/20.jpg"
    assert payload["extraction_status"] == "complete"
    # frame_paths is now preserved (was dropped pre-2026-05-18 — re-introduced
    # so the admin SPA can display OCR source frames in the verification UI).
    assert payload["frame_paths"] == "data/frames/20_28.jpg;data/frames/20_30.jpg"
    # OCR fields preserve the original (pre-edit) OCR output
    assert payload["ocr_name"] == "فلان"
    assert payload["ocr_birth_date"] == "1980-02-12"
    assert payload["ocr_martyrdom_date"] == "2024-05-17"


def test_martyr_row_to_db_dict_empty_dates_become_none():
    """SQL Server DATE columns reject ''; must coerce to None."""
    from src.excel_writer import MartyrRow
    row = MartyrRow(
        msg_id=99, name="x", name_normalized="x",
        birth_date="", martyrdom_date="",
        city="", military_rank="", weapon="",
        battalion="", brigade="",
        photo_path="", frame_paths="",
        posted_date="", message_link="",
        extraction_status="missing_critical", duplicate_status="unique",
    )
    payload = martyr_row_to_db_dict(row)
    assert payload["birth_date"] is None
    assert payload["martyrdom_date"] is None
    assert payload["posted_date"] is None
    assert payload["photo_path"] is None
    assert payload["city"] is None


def test_martyr_row_to_db_dict_malformed_dates_become_none_but_preserve_ocr_text():
    """Regression for SQL error 22007 (conversion failed) on msg 1033 in the
    2026-05-24 daily scrape: OCR produced a clipped date string like '1989' or
    '2024-04' which SQL Server DATE column rejected, killing the entire upsert.
    Fix: structured DATE columns are NULL'd when not strict YYYY-MM-DD, but the
    raw OCR text stays in the NVARCHAR ocr_* mirror columns so the admin can
    see what was extracted and decide how to fix it."""
    from src.excel_writer import MartyrRow
    row = MartyrRow(
        msg_id=1033, name="osama", name_normalized="osama",
        birth_date="1989",            # year only — would crash DATE column (SQL 22007)
        martyrdom_date="2024-04",     # missing day — would also crash
        city="", military_rank="", weapon="",
        battalion="", brigade="",
        photo_path="", frame_paths="",
        posted_date="not a date",     # garbage — would crash DATETIME2 column
        message_link="",
        extraction_status="partial_birth", duplicate_status="unique",
    )
    payload = martyr_row_to_db_dict(row)
    # Structured DATE / DATETIME2 columns get NULL — won't crash the insert
    assert payload["birth_date"] is None
    assert payload["martyrdom_date"] is None
    assert payload["posted_date"] is None
    # Raw OCR text preserved in the mirror columns so the admin sees what
    # was extracted and can correct it during verification
    assert payload["ocr_birth_date"] == "1989"
    assert payload["ocr_martyrdom_date"] == "2024-04"


# =============================================================================
# UPSERT
# =============================================================================

def test_upsert_martyr_inserts_when_not_exists():
    """No existing row → INSERT path runs with all columns."""
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = None    # no existing row
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    payload = {c: f"v_{c}" for c in COLUMNS}
    payload["msg_id"] = 42

    upsert_martyr(mock_conn, payload)

    # Two SELECT-then-INSERT calls
    assert mock_cur.execute.call_count == 2
    # First call: existence check
    select_sql = mock_cur.execute.call_args_list[0].args[0]
    assert "SELECT 1 FROM dbo.martyrs" in select_sql
    # Second call: INSERT
    insert_sql = mock_cur.execute.call_args_list[1].args[0]
    assert "INSERT INTO dbo.martyrs" in insert_sql
    mock_conn.commit.assert_called_once()


def test_upsert_martyr_updates_when_exists():
    """Existing row → UPDATE path runs WITHOUT touching verification_status."""
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = (1,)    # row exists
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    payload = {c: f"v_{c}" for c in COLUMNS}
    payload["msg_id"] = 42

    upsert_martyr(mock_conn, payload)

    assert mock_cur.execute.call_count == 2
    update_sql = mock_cur.execute.call_args_list[1].args[0]
    assert update_sql.lstrip().startswith("UPDATE dbo.martyrs")
    # CRITICAL: re-scrape must not reset admin's verification work
    assert "verification_status" not in update_sql
    assert "verified_at" not in update_sql
    assert "verified_by" not in update_sql
    mock_conn.commit.assert_called_once()


# =============================================================================
# Verification workflow
# =============================================================================

def test_mark_verified_updates_status_fields_and_audit_timestamp():
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    edits = {"name": "Corrected Name", "city": "غزة"}
    mark_verified(mock_conn, msg_id=42, edits=edits, verified_by="admin")

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "UPDATE dbo.martyrs" in sql
    assert "verification_status = 'verified'" in sql
    assert "verified_at = SYSUTCDATETIME()" in sql
    assert "verified_by = ?" in sql
    assert "name = ?" in sql
    assert "city = ?" in sql
    assert "WHERE msg_id = ?" in sql
    mock_conn.commit.assert_called_once()


def test_mark_verified_with_no_edits_still_flips_status():
    """Empty edits dict → still marks verified, just doesn't update other fields."""
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    mark_verified(mock_conn, msg_id=42, edits={}, verified_by="admin")

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "verification_status = 'verified'" in sql
    mock_conn.commit.assert_called_once()


def test_mark_rejected_sets_status_only():
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    mark_rejected(mock_conn, msg_id=42, verified_by="admin")

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "verification_status = 'rejected'" in sql
    assert "WHERE msg_id = ?" in sql
    mock_conn.commit.assert_called_once()


# =============================================================================
# AI verification track (2026-06-10)
# =============================================================================

def test_mark_ai_verified_sets_flag_and_applies_date_fixes():
    """AI found a swapped date → fixes the column AND sets the AI flag/audit,
    WITHOUT touching the human verification fields."""
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    mark_ai_verified(
        mock_conn, msg_id=23,
        edits={"birth_date": "1991-01-08"},
        note="fixed swap: birth 1991-08-01 -> 1991-01-08 (card: 08-01-1991)",
    )

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "ai_verified = 1" in sql
    assert "ai_verified_at = SYSUTCDATETIME()" in sql
    assert "ai_note = ?" in sql
    assert "birth_date = ?" in sql
    assert "WHERE msg_id = ?" in sql
    # The AI track must NEVER touch the human verification fields
    assert "verification_status" not in sql
    assert "verified_by" not in sql
    assert "ocr_" not in sql
    mock_conn.commit.assert_called_once()


def test_mark_ai_verified_without_edits_only_flags():
    """Dates already match the card → flag + note only, no date columns in SQL."""
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    mark_ai_verified(mock_conn, msg_id=38, edits={}, note="match")

    sql = mock_cur.execute.call_args.args[0]
    assert "ai_verified = 1" in sql
    assert "birth_date" not in sql
    assert "martyrdom_date" not in sql


def test_mark_ai_verified_rejects_malformed_dates():
    """Strict yyyy-mm-dd only — the whole point is killing malformed dates.
    Anything else must raise instead of silently writing NULL."""
    import pytest
    mock_conn = MagicMock()
    for bad in ("08-01-1991", "1991-8-1", "1991/01/08", "garbage", ""):
        with pytest.raises(ValueError):
            mark_ai_verified(mock_conn, msg_id=1, edits={"birth_date": bad}, note="x")


def test_mark_ai_verified_rejects_non_date_fields():
    """AI batch is dates-only; any other field in edits is a bug upstream."""
    import pytest
    mock_conn = MagicMock()
    with pytest.raises(ValueError):
        mark_ai_verified(mock_conn, msg_id=1, edits={"name": "X"}, note="x")


def test_mark_ai_note_writes_note_without_flagging():
    """Unreadable frames → note for the human, ai_verified stays 0."""
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    mark_ai_note(mock_conn, msg_id=99, note="frames unreadable")

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "ai_note = ?" in sql
    assert "ai_verified = 1" not in sql
    assert "WHERE msg_id = ?" in sql
    mock_conn.commit.assert_called_once()


def test_get_ai_pending_filters_unverified_not_yet_ai_checked():
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",)]
    mock_cur.fetchall.return_value = [(23, "Foo")]
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    rows = get_ai_pending(mock_conn, limit=50)

    assert rows == [{"msg_id": 23, "name": "Foo"}]
    sql = mock_cur.execute.call_args.args[0]
    assert "verification_status = 'unverified'" in sql
    assert "ai_verified = 0" in sql
    assert "ORDER BY msg_id" in sql
    assert "TOP (50)" in sql


# =============================================================================
# Queries
# =============================================================================

def test_get_by_status_returns_list_of_dicts():
    """Cursor description + rows are zipped into per-row dicts."""
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",), ("verification_status",)]
    mock_cur.fetchall.return_value = [
        (20, "Foo", "unverified"),
        (21, "Bar", "unverified"),
    ]
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    rows = get_by_status(mock_conn, "unverified")

    assert isinstance(rows, list) and len(rows) == 2
    assert rows[0] == {"msg_id": 20, "name": "Foo", "verification_status": "unverified"}
    sql = mock_cur.execute.call_args.args[0]
    assert "WHERE verification_status = ?" in sql


def test_get_verified_for_export_includes_ai_verified_excludes_rejected():
    """The publish rule (widened 2026-06-11): a row reaches data/martyrs.json
    when a human verified it OR the AI verified it; rejected rows and
    needs-human rows (ai_verified = 0, status unverified) never publish."""
    from src.sqlserver_client import get_verified_for_export
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",)]
    mock_cur.fetchall.return_value = [(20, "Foo")]
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    rows = get_verified_for_export(mock_conn)

    assert rows == [{"msg_id": 20, "name": "Foo"}]
    sql = mock_cur.execute.call_args.args[0]
    assert "verification_status <> 'rejected'" in sql
    assert "verification_status = 'verified' OR ai_verified = 1" in sql


def test_get_all_returns_every_row_regardless_of_status():
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",)]
    mock_cur.fetchall.return_value = [(20, "Foo"), (21, "Bar"), (22, "Baz")]
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    rows = get_all(mock_conn)

    assert len(rows) == 3
    sql = mock_cur.execute.call_args.args[0]
    assert "WHERE" not in sql.upper()    # no filter


def test_get_by_msg_id_returns_single_row():
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",)]
    mock_cur.fetchall.return_value = [(20, "Foo")]
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    row = get_by_msg_id(mock_conn, 20)

    assert row == {"msg_id": 20, "name": "Foo"}
    sql = mock_cur.execute.call_args.args[0]
    assert "WHERE msg_id = ?" in sql


def test_get_by_msg_id_returns_none_when_not_found():
    mock_cur = MagicMock()
    mock_cur.description = [("msg_id",), ("name",)]
    mock_cur.fetchall.return_value = []
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    assert get_by_msg_id(mock_conn, 999) is None


# =============================================================================
# Publish versions
# =============================================================================

def test_next_publish_version_returns_one_when_table_empty():
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = (None,)
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    v = next_publish_version(mock_conn)

    assert v == 1
    sql = mock_cur.execute.call_args.args[0]
    assert "MAX(version)" in sql
    assert "publish_versions" in sql


def test_next_publish_version_returns_max_plus_one():
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = (46,)
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    assert next_publish_version(mock_conn) == 47


def test_insert_publish_version_records_row():
    mock_cur = MagicMock()
    mock_conn = MagicMock(cursor=MagicMock(return_value=mock_cur))

    insert_publish_version(mock_conn, row_count=426, note="weekly snapshot")

    mock_cur.execute.assert_called_once()
    sql = mock_cur.execute.call_args.args[0]
    assert "INSERT INTO dbo.publish_versions" in sql
    assert "row_count" in sql
    assert "note" in sql
    mock_conn.commit.assert_called_once()
