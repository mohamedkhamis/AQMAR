# src/sqlserver_client.py
"""Thin pyodbc wrapper for AQMAR's local SQL Server backend.

All write methods commit immediately — this is a single-user local DB, no
need for explicit transaction management. Callers manage the connection
lifecycle (open / close) themselves; this module just provides the SQL.

Used by:
  - scripts/migrate_excel_to_sqlserver.py (one-time Excel → SQL Server push)
  - scripts/phase3_daily.py (daily incremental: upsert scraped rows)
  - scripts/admin_server.py (FastAPI: read/edit/verify via the admin SPA)
  - scripts/export_to_json.py (publish: read verified rows → versioned JSON)
"""
from dataclasses import asdict


# Columns the scraper / migration writes. Order matches the schema in
# scripts/setup_sqlserver_schema.sql. verification_status / verified_at /
# verified_by / created_at / updated_at are managed by the schema defaults
# and the verification workflow — NOT touched by upsert (admin's verify
# state must survive a re-scrape).
COLUMNS = [
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
    "posted_date",
    "message_link",
    "extraction_status",
    "duplicate_status",
    "ocr_name",
    "ocr_birth_date",
    "ocr_martyrdom_date",
]


def _str_or_none(v):
    """SQL Server DATE / NVARCHAR columns prefer NULL to empty string —
    coerce '' to None so the driver can bind to typed parameters cleanly."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def martyr_row_to_db_dict(row) -> dict:
    """Convert a MartyrRow dataclass into a dict matching COLUMNS.

    The OCR fields (ocr_name, ocr_birth_date, ocr_martyrdom_date) mirror the
    current values at scrape time — they're the audit trail of what the
    pipeline extracted before any admin edit. The scraper writes them once
    on first insert; subsequent re-scrapes don't overwrite them (preserved
    in the UPDATE branch by listing only the post-OCR fields).
    """
    d = asdict(row)
    # Capture OCR-side snapshot from the same values (first scrape only — on
    # re-scrape the upsert UPDATE branch refreshes these, which matches our
    # intent: rescrape = re-OCR, so newer ocr_* is the latest extraction).
    d["ocr_name"] = d.get("name")
    d["ocr_birth_date"] = d.get("birth_date")
    d["ocr_martyrdom_date"] = d.get("martyrdom_date")
    # Coerce empties on every nullable text/date column. frame_paths is also
    # coerced (empty string → NULL) — the admin SPA tolerates either but
    # NULL is cleaner.
    for k in (
        "name", "name_normalized", "birth_date", "martyrdom_date",
        "city", "military_rank", "weapon", "battalion", "brigade",
        "photo_path", "frame_paths", "posted_date", "message_link",
        "extraction_status", "duplicate_status",
        "ocr_name", "ocr_birth_date", "ocr_martyrdom_date",
    ):
        d[k] = _str_or_none(d.get(k))
    return d


# =============================================================================
# UPSERT — INSERT if new, UPDATE if existing (preserving verification state)
# =============================================================================

def upsert_martyr(conn, payload: dict) -> None:
    """INSERT or UPDATE based on msg_id existence.

    On UPDATE: verification_status / verified_at / verified_by are NOT
    touched — re-scraping a row that the admin has already verified must
    not silently reset that verification.
    """
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM dbo.martyrs WHERE msg_id = ?", payload["msg_id"])
    exists = cur.fetchone() is not None

    if exists:
        # UPDATE all OCR-side fields, leave verification state alone
        update_cols = [c for c in COLUMNS if c != "msg_id"]
        set_clause = ", ".join(f"{c} = ?" for c in update_cols)
        params = [payload.get(c) for c in update_cols] + [payload["msg_id"]]
        cur.execute(
            f"UPDATE dbo.martyrs SET {set_clause} WHERE msg_id = ?",
            *params,
        )
    else:
        # INSERT — verification_status defaults to 'unverified' via the schema
        cols = ", ".join(COLUMNS)
        placeholders = ", ".join("?" for _ in COLUMNS)
        params = [payload.get(c) for c in COLUMNS]
        cur.execute(
            f"INSERT INTO dbo.martyrs ({cols}) VALUES ({placeholders})",
            *params,
        )

    conn.commit()


# =============================================================================
# Verification workflow
# =============================================================================

# Only these fields are admin-editable through the verify flow. Anything else
# (msg_id, audit timestamps, ocr_*) is system-managed and won't be passed in
# an edit dict — but we filter defensively anyway.
_EDITABLE_FIELDS = {
    "name", "name_normalized", "birth_date", "martyrdom_date",
    "city", "military_rank", "weapon", "battalion", "brigade",
    "photo_path", "message_link",
    "extraction_status", "duplicate_status",
}


def mark_verified(conn, msg_id: int, edits: dict, verified_by: str) -> None:
    """Mark a row verified, applying any admin field corrections in the same
    UPDATE. Empty edits dict is fine — status flip still happens."""
    cur = conn.cursor()
    safe = {k: v for k, v in (edits or {}).items() if k in _EDITABLE_FIELDS}

    set_parts = ["verification_status = 'verified'",
                 "verified_at = SYSUTCDATETIME()",
                 "verified_by = ?"]
    params = [verified_by]
    for k, v in safe.items():
        set_parts.append(f"{k} = ?")
        params.append(v)
    params.append(msg_id)

    sql = f"UPDATE dbo.martyrs SET {', '.join(set_parts)} WHERE msg_id = ?"
    cur.execute(sql, *params)
    conn.commit()


def mark_rejected(conn, msg_id: int, verified_by: str) -> None:
    """Mark a row rejected (won't appear in published JSON)."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE dbo.martyrs "
        "SET verification_status = 'rejected', "
        "    verified_at = SYSUTCDATETIME(), "
        "    verified_by = ? "
        "WHERE msg_id = ?",
        verified_by, msg_id,
    )
    conn.commit()


# =============================================================================
# Read queries
# =============================================================================

def _rows_to_dicts(cur) -> list:
    """Zip cursor.description with each fetched row into name → value dicts."""
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_all(conn) -> list:
    """Every row in the table, regardless of verification status. Used by
    the admin SPA's full registry view."""
    cur = conn.cursor()
    cur.execute("SELECT * FROM dbo.martyrs ORDER BY posted_date DESC")
    return _rows_to_dicts(cur)


def get_by_status(conn, status: str) -> list:
    """Rows with the given verification_status ('unverified' / 'verified' /
    'rejected'). Used by the admin SPA's verify queue."""
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM dbo.martyrs WHERE verification_status = ? "
        "ORDER BY posted_date DESC",
        status,
    )
    return _rows_to_dicts(cur)


def get_verified_for_export(conn) -> list:
    """Only verified rows. Used by export_to_json.py."""
    return get_by_status(conn, "verified")


def get_by_msg_id(conn, msg_id: int) -> dict:
    """Single row by primary key. Returns None if not found.
    Used by the admin API to serve GET /api/martyrs/{msg_id}."""
    cur = conn.cursor()
    cur.execute("SELECT * FROM dbo.martyrs WHERE msg_id = ?", msg_id)
    rows = _rows_to_dicts(cur)
    return rows[0] if rows else None


# =============================================================================
# Publish versions log
# =============================================================================

def next_publish_version(conn) -> int:
    """Compute version N+1 from MAX(version) in publish_versions. Returns 1
    when the table is empty."""
    cur = conn.cursor()
    cur.execute("SELECT MAX(version) FROM dbo.publish_versions")
    row = cur.fetchone()
    return (row[0] + 1) if row and row[0] is not None else 1


def insert_publish_version(conn, row_count: int, note: str = None) -> int:
    """Record a new publish. Returns the assigned version (IDENTITY)."""
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO dbo.publish_versions (row_count, note) OUTPUT inserted.version "
        "VALUES (?, ?)",
        row_count, note,
    )
    row = cur.fetchone()
    conn.commit()
    return row[0] if row else None


# =============================================================================
# Connection factory
# =============================================================================

def make_conn(cfg):
    """Build a pyodbc Connection from a Config dataclass.

    Reads cfg.sqlserver_conn_str. Connection is opened with autocommit=False
    (default) — write methods in this module call conn.commit() explicitly
    after each statement so a crash leaves no partial state.
    """
    import pyodbc
    if not cfg.sqlserver_conn_str:
        raise RuntimeError(
            "SQL Server not configured — set SQLSERVER_CONN_STR in .env. "
            "Example: DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;"
            "DATABASE=aqmar;Trusted_Connection=yes;TrustServerCertificate=yes"
        )
    return pyodbc.connect(cfg.sqlserver_conn_str, timeout=10)
