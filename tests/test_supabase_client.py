"""Tests for src/supabase_client.py. The real Supabase calls are stubbed
via monkeypatch so the tests don't need a live project."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.supabase_client import SupabaseSync, martyr_row_to_db_dict


def test_martyr_row_to_db_dict_maps_all_fields():
    """All 16 MartyrRow fields land in the DB payload with correct names."""
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
    payload = martyr_row_to_db_dict(row, photo_url="https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg")
    assert payload["msg_id"] == 20
    assert payload["name"] == "فلان"
    assert payload["birth_date"] == "1980-02-12"
    assert payload["martyrdom_date"] == "2024-05-17"
    assert payload["photo_path"] == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg"
    assert payload["extraction_status"] == "complete"
    # frame_paths is NOT pushed (local-only artifact)
    assert "frame_paths" not in payload


def test_martyr_row_to_db_dict_empty_birth_becomes_none():
    """Postgres date columns prefer NULL over empty string."""
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
    payload = martyr_row_to_db_dict(row, photo_url="")
    assert payload["birth_date"] is None
    assert payload["martyrdom_date"] is None
    assert payload["posted_date"] is None
    assert payload["photo_path"] is None  # empty url also coerced to None


def test_upsert_martyr_calls_table_upsert(monkeypatch):
    """upsert_martyr forwards to client.table('martyrs').upsert(...).execute()."""
    fake_execute = MagicMock(return_value=MagicMock(data=[{"msg_id": 20}], error=None))
    fake_upsert = MagicMock(return_value=MagicMock(execute=fake_execute))
    fake_table = MagicMock(return_value=MagicMock(upsert=fake_upsert))
    fake_client = MagicMock(table=fake_table)

    sync = SupabaseSync(fake_client, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    sync.upsert_martyr_dict({"msg_id": 20, "name": "x"})

    fake_table.assert_called_once_with("martyrs")
    fake_upsert.assert_called_once_with({"msg_id": 20, "name": "x"})
    fake_execute.assert_called_once()


def test_public_photo_url_builds_correct_pattern():
    sync = SupabaseSync(client=None, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    assert sync.public_photo_url(20) == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/20.jpg"
    assert sync.public_photo_url(999) == "https://abc.supabase.co/storage/v1/object/public/aqmar-photos/999.jpg"


def test_upload_photo_calls_storage_upload(monkeypatch, tmp_path):
    photo = tmp_path / "20.jpg"
    photo.write_bytes(b"\xff\xd8\xffFAKEJPEG")
    fake_upload = MagicMock(return_value=None)
    fake_bucket = MagicMock(upload=fake_upload)
    fake_storage = MagicMock(from_=MagicMock(return_value=fake_bucket))
    fake_client = MagicMock(storage=fake_storage)

    sync = SupabaseSync(fake_client, bucket="aqmar-photos", project_url="https://abc.supabase.co")
    sync.upload_photo(20, str(photo))

    fake_storage.from_.assert_called_with("aqmar-photos")
    args, kwargs = fake_upload.call_args
    assert args[0] == "20.jpg"            # path inside bucket
    assert args[1] == b"\xff\xd8\xffFAKEJPEG"
    # upsert=True so re-runs overwrite
    assert kwargs.get("file_options", {}).get("upsert") in ("true", True)
