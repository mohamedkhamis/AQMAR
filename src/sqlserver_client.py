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
import re
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


# Strict YYYY-MM-DD only. The DB DATE column rejects anything else (e.g. OCR
# clipped a year-only "1989" or month-only "2024-04"). When a value fails this
# match, the typed DATE column gets NULL but the raw text stays in the ocr_*
# mirror column (NVARCHAR — accepts any string) for the admin to fix during
# verification.
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# DATETIME2 is more forgiving — accepts "2026-01-07 14:02" / "2026-01-07T14:02:00".
_ISO_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$")


def _sanitize_date(v, *, allow_datetime=False):
    """Validate that the value parses as YYYY-MM-DD (or full DATETIME when
    allow_datetime=True). Returns the cleaned string, or None for any value
    that doesn't match. Called by martyr_row_to_db_dict before payload reaches
    the DB so OCR garbage never lands in DATE / DATETIME2 columns and crashes
    the insert with SQL error 22007 (conversion failed)."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    if _ISO_DATE.match(s):
        return s
    if allow_datetime and _ISO_DATETIME.match(s):
        return s
    return None


def martyr_row_to_db_dict(row) -> dict:
    """Convert a MartyrRow dataclass into a dict matching COLUMNS.

    The OCR fields (ocr_name, ocr_birth_date, ocr_martyrdom_date) mirror the
    current values at scrape time — they're the audit trail of what the
    pipeline extracted before any admin edit. The scraper writes them once
    on first insert; subsequent re-scrapes don't overwrite them (preserved
    in the UPDATE branch by listing only the post-OCR fields).

    CRITICAL: date fields are sanitized BEFORE going to the DB. OCR sometimes
    produces malformed dates ('22', '1989', '2024-04') that SQL Server DATE
    columns reject with error 22007. We NULL the structured date columns for
    those values but keep the raw OCR text in the ocr_* mirror columns so the
    admin can see what was extracted and decide what the right date is.
    """
    d = asdict(row)
    # Preserve raw OCR text in the mirror columns BEFORE we sanitize the
    # structured date columns. The mirrors are NVARCHAR, so they accept
    # anything; the admin sees them in the verification UI.
    d["ocr_name"] = d.get("name")
    d["ocr_birth_date"] = d.get("birth_date")
    d["ocr_martyrdom_date"] = d.get("martyrdom_date")
    # Sanitize the structured DATE / DATETIME2 columns. Junk → NULL.
    d["birth_date"] = _sanitize_date(d.get("birth_date"))
    d["martyrdom_date"] = _sanitize_date(d.get("martyrdom_date"))
    d["posted_date"] = _sanitize_date(d.get("posted_date"), allow_datetime=True)
    # Coerce empties on every nullable text column.
    for k in (
        "name", "name_normalized",
        "city", "military_rank", "weapon", "battalion", "brigade",
        "photo_path", "frame_paths", "message_link",
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
    # featured_frame_path: the OCR frame the admin picked as the "cover" for
    # this row (Phase 1 cover-image feature, 2026-05-25). One token from
    # frame_paths, stored separately so the public detail page can show it
    # alongside the portrait without re-parsing the semicolon list.
    "featured_frame_path",
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
# AI verification track (2026-06-10)
#
# A second, independent verification dimension: the AI date-check batch
# (scripts/ai_verify.py + Claude reading the OCR frames) confirms or fixes
# birth_date / martyrdom_date and flips ai_verified. Deliberately decoupled
# from the human verification_status workflow — neither touches the other.
# =============================================================================

# The AI batch may only ever correct the two date columns.
_AI_EDITABLE_FIELDS = {"birth_date", "martyrdom_date"}


def mark_ai_verified(conn, msg_id: int, edits: dict, note: str) -> None:
    """Set ai_verified=1 (+timestamp +note), optionally fixing the date
    columns. Strict yyyy-mm-dd enforced — raises ValueError on anything else
    (fail loud: a malformed date here means the batch results file is wrong).
    """
    edits = edits or {}
    unknown = set(edits) - _AI_EDITABLE_FIELDS
    if unknown:
        raise ValueError(f"AI batch may only edit dates, got: {sorted(unknown)}")

    set_parts = ["ai_verified = 1",
                 "ai_verified_at = SYSUTCDATETIME()",
                 "ai_note = ?"]
    params = [note]
    for k, v in edits.items():
        clean = _sanitize_date(v)
        if clean is None:
            raise ValueError(f"{k} must be strict YYYY-MM-DD, got: {v!r}")
        set_parts.append(f"{k} = ?")
        params.append(clean)
    params.append(msg_id)

    cur = conn.cursor()
    cur.execute(
        f"UPDATE dbo.martyrs SET {', '.join(set_parts)} WHERE msg_id = ?",
        *params,
    )
    conn.commit()


def mark_ai_note(conn, msg_id: int, note: str) -> None:
    """Record why the AI could NOT verify a row (no frames / unreadable /
    no date on card). ai_verified stays 0 so the row remains in the queue."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE dbo.martyrs SET ai_note = ? WHERE msg_id = ?",
        note, msg_id,
    )
    conn.commit()


def parse_frame_paths(raw: str) -> list:
    """Split a stored frame_paths value (';'-joined) into a normalized list of
    forward-slash relative paths, dropping blanks. Shared by the pending dump
    and the featured-frame membership check so their normalization can't drift.
    """
    return [p.strip().replace("\\", "/") for p in (raw or "").split(";") if p.strip()]


def set_featured_frame(conn, msg_id: int, path: str) -> bool:
    """Record the AI-picked cover frame for a row (2026-07-02).

    `path` must be one of that row's frame_paths — raises ValueError otherwise
    (a bad path means the results file is wrong; cmd_apply catches this and
    demotes it to a non-fatal [FRAME-SKIP]). Writes ONLY featured_frame_path,
    guarded on NULL so an admin's hand-picked cover is never clobbered. Returns
    True if it wrote, False if a cover already existed. Never touches the human
    verification, ai_verified, ocr_*, or date columns.
    """
    want = (path or "").strip().replace("\\", "/")
    if not want:
        raise ValueError(f"msg {msg_id}: empty featured frame path")

    cur = conn.cursor()
    cur.execute("SELECT frame_paths FROM dbo.martyrs WHERE msg_id = ?", msg_id)
    row = cur.fetchone()
    frames = set(parse_frame_paths(row[0] if row else None))
    if want not in frames:
        raise ValueError(
            f"msg {msg_id}: featured frame {want!r} is not one of the row's "
            f"frames: {sorted(frames)}"
        )

    cur.execute(
        "UPDATE dbo.martyrs SET featured_frame_path = ? "
        "WHERE msg_id = ? "
        "AND (featured_frame_path IS NULL OR LTRIM(RTRIM(featured_frame_path)) = '')",
        want, msg_id,
    )
    updated = cur.rowcount == 1
    conn.commit()
    return updated


def get_ai_pending(conn, limit: int = 50) -> list:
    """Next rows for the AI batch: human-unverified AND not yet AI-checked.
    msg_id ASC keeps batches deterministic and resumable (the flag itself is
    the checkpoint). Dates come back as ISO strings via CONVERT(..., 23)."""
    cur = conn.cursor()
    cur.execute(
        f"SELECT TOP ({int(limit)}) msg_id, name, "
        "CONVERT(varchar(10), birth_date, 23) AS birth_date, "
        "CONVERT(varchar(10), martyrdom_date, 23) AS martyrdom_date, "
        "ocr_birth_date, ocr_martyrdom_date, frame_paths, photo_path "
        "FROM dbo.martyrs "
        "WHERE verification_status = 'unverified' AND ai_verified = 0 "
        "ORDER BY msg_id ASC"
    )
    return _rows_to_dicts(cur)


# =============================================================================
# Field-spelling normalizer (2026-06-22)
#
# Bulk-merge near-duplicate free-text values in the metadata columns. Column
# names can't be parameterized in SQL, so every entry point validates the
# column against this whitelist before interpolating it — the injection guard.
# =============================================================================

# Default columns processed when --columns is omitted (the safe metadata set).
NORMALIZE_COLUMNS = ("military_rank", "weapon", "battalion", "brigade")
# Full whitelist of columns the normalizer is *allowed* to touch. `name` is
# opt-in only (pass --columns name) — it's higher-risk, so it never runs by
# default, but the same conservative same-letters rule applies when asked.
ALLOWED_NORMALIZE_COLUMNS = NORMALIZE_COLUMNS + ("name",)


def _check_normalize_column(column: str) -> str:
    if column not in ALLOWED_NORMALIZE_COLUMNS:
        raise ValueError(
            f"column {column!r} is not normalizable; "
            f"allowed: {ALLOWED_NORMALIZE_COLUMNS}"
        )
    return column


def get_distinct_field_values(conn, column: str) -> list:
    """Distinct non-blank values of one whitelisted column with row counts,
    as a list of (value, count) tuples. NULL and whitespace-only rows are
    excluded — they're not spellings to merge."""
    col = _check_normalize_column(column)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {col}, COUNT(*) FROM dbo.martyrs "
        f"WHERE {col} IS NOT NULL AND LTRIM(RTRIM({col})) <> '' "
        f"GROUP BY {col}"
    )
    return [(row[0], row[1]) for row in cur.fetchall()]


def bulk_update_field_value(conn, column: str, old_value: str, new_value: str) -> int:
    """Rewrite every row whose whitelisted column equals old_value to
    new_value (exact match, parameterized). Returns rows affected."""
    col = _check_normalize_column(column)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE dbo.martyrs SET {col} = ? WHERE {col} = ?",
        new_value, old_value,
    )
    n = cur.rowcount
    conn.commit()
    return n


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
    """Publishable rows for export_to_json: human-verified OR AI-verified
    (widened 2026-06-11 — before the AI run only the ~50 human-verified rows
    ever published, leaving the public site at 52 rows while the registry
    held 569). Rejected rows and rows the AI flagged needs-human
    (ai_verified = 0, e.g. cards whose printed dates are typos) stay off
    the site until the admin reviews them."""
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM dbo.martyrs "
        "WHERE verification_status <> 'rejected' "
        "AND (verification_status = 'verified' OR ai_verified = 1) "
        "ORDER BY posted_date DESC"
    )
    return _rows_to_dicts(cur)


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
