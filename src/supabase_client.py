# src/supabase_client.py
"""Thin wrapper around supabase-py for the AQMAR pipeline.

Used by:
  - scripts/migrate_to_supabase.py (one-time bulk push)
  - scripts/phase3_daily.py (daily upserts of new posts)

All write methods use the service_role key (passed in via the supabase
client at construction time) — this BYPASSES row-level security so the
pipeline can write freely.
"""
import os
from dataclasses import asdict
from typing import Optional


def _str_or_none(v):
    """Postgres date/text columns prefer NULL to empty string."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def martyr_row_to_db_dict(row, photo_url: str) -> dict:
    """Convert a MartyrRow dataclass into a Postgres-ready dict.

    `photo_url` is the public Supabase Storage URL (or "" if no photo).
    The local frame_paths column is dropped — it's a runtime artifact.
    """
    d = asdict(row)
    d["photo_path"] = _str_or_none(photo_url)
    # Coerce empty strings on nullable columns to None
    for k in ("birth_date", "martyrdom_date", "city", "military_rank",
              "weapon", "battalion", "brigade", "posted_date",
              "message_link", "extraction_status", "duplicate_status"):
        d[k] = _str_or_none(d.get(k))
    # Drop local-only field
    d.pop("frame_paths", None)
    return d


class SupabaseSync:
    """Thin facade over supabase-py."""

    def __init__(self, client, bucket: str, project_url: str):
        self.client = client
        self.bucket = bucket
        self.project_url = project_url.rstrip("/")

    def public_photo_url(self, msg_id: int) -> str:
        return f"{self.project_url}/storage/v1/object/public/{self.bucket}/{msg_id}.jpg"

    def upsert_martyr_dict(self, payload: dict):
        """UPSERT a single martyr row (ON CONFLICT on msg_id → UPDATE)."""
        return self.client.table("martyrs").upsert(payload).execute()

    def upsert_martyr_row(self, row, photo_url: str = ""):
        """Convenience: convert MartyrRow → dict and upsert."""
        return self.upsert_martyr_dict(martyr_row_to_db_dict(row, photo_url))

    def upsert_duplicate(self, payload: dict):
        return self.client.table("martyrs_duplicates").upsert(payload).execute()

    def upload_photo(self, msg_id: int, local_path: str):
        """Upload a JPEG to <bucket>/<msg_id>.jpg. Idempotent (upsert)."""
        if not os.path.exists(local_path):
            return None
        with open(local_path, "rb") as f:
            data = f.read()
        return self.client.storage.from_(self.bucket).upload(
            f"{msg_id}.jpg",
            data,
            file_options={"contentType": "image/jpeg", "upsert": "true"},
        )

    def delete_photo(self, msg_id: int):
        return self.client.storage.from_(self.bucket).remove([f"{msg_id}.jpg"])


def make_sync_from_config(cfg) -> SupabaseSync:
    """Factory: build a SupabaseSync from a Config, using the
    SERVICE ROLE key (pipeline-side, bypasses RLS)."""
    from supabase import create_client
    if not cfg.supabase_url or not cfg.supabase_service_role_key:
        raise RuntimeError("Supabase not configured — fill in .env first.")
    client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    return SupabaseSync(client, cfg.supabase_storage_bucket, cfg.supabase_url)
