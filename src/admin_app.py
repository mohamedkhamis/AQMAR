# src/admin_app.py
"""FastAPI app for the AQMAR admin portal.

Serves the SPA static files + a JSON REST API backed by SQL Server.
Designed to run locally (http://localhost:8000) — no internet required.

Endpoints:
  Public (no auth):
    GET  /api/health                — connectivity probe
    GET  /api/martyrs               — all rows (the SPA's main list)
    GET  /api/martyrs/{msg_id}      — single row by primary key

  Admin (require X-Admin-Token header matching cfg.admin_token):
    GET  /api/martyrs/unverified    — verification queue
    PUT  /api/martyrs/{msg_id}      — apply edits + mark verified
    POST /api/martyrs/{msg_id}/reject — mark rejected (won't be published)
    POST /api/publish               — trigger export-to-JSON (stub, Batch 6)

Static:
  /webui/...        — SPA static files (from webui/ directory)
  /data/photos/...  — martyr photos (from data/photos/ directory)
  /                 — 302 redirect to /webui/
"""
from pathlib import Path
from typing import Optional, Annotated

from fastapi import FastAPI, Depends, HTTPException, Header, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from src.config import load_config
from src.sqlserver_client import (
    make_conn,
    get_all,
    get_by_status,
    get_by_msg_id,
    mark_verified,
    mark_rejected,
)
from src.exporter import export_to_json, DEFAULT_JSON_PATH

cfg = load_config()

app = FastAPI(
    title="AQMAR Admin API",
    version="1.0.0",
    description="Local admin portal for verifying OCR output before publishing.",
)


# =============================================================================
# Dependencies
# =============================================================================

def get_db():
    """Open a fresh pyodbc connection per request. Closed after the response
    is sent. Caller dependency injection lets tests substitute a mock."""
    if not cfg.sqlserver_conn_str:
        raise HTTPException(
            status_code=500,
            detail="SQLSERVER_CONN_STR not set in .env",
        )
    db = make_conn(cfg)
    try:
        yield db
    finally:
        db.close()


def require_admin(
    x_admin_token: Annotated[Optional[str], Header(alias="X-Admin-Token")] = None,
):
    """Reject requests without a valid X-Admin-Token header."""
    if not cfg.admin_token:
        raise HTTPException(
            status_code=500,
            detail="ADMIN_TOKEN not set in .env — write endpoints disabled",
        )
    if x_admin_token != cfg.admin_token:
        raise HTTPException(
            status_code=403,
            detail="Invalid or missing X-Admin-Token",
        )


# =============================================================================
# Public read endpoints
# =============================================================================

@app.get("/api/health")
def health():
    """Connectivity probe used by the SPA + ops. Returns DB reachability +
    whether admin writes are even possible (ADMIN_TOKEN set)."""
    db_ok = False
    db_error = None
    if cfg.sqlserver_conn_str:
        try:
            db = make_conn(cfg)
            db.close()
            db_ok = True
        except Exception as e:
            db_error = str(e)
    return {
        "ok": True,
        "db": db_ok,
        "db_error": db_error,
        "admin_token_configured": bool(cfg.admin_token),
    }


@app.get("/api/martyrs")
def list_martyrs(db=Depends(get_db)):
    """All rows, including unverified and rejected. The SPA's read view
    typically filters client-side; the API doesn't pre-filter."""
    return get_all(db)


# IMPORTANT: define this BEFORE /api/martyrs/{msg_id} so "unverified" doesn't
# get parsed as an integer msg_id. FastAPI matches routes top-to-bottom.
@app.get("/api/martyrs/unverified")
def list_unverified(
    db=Depends(get_db),
    _: None = Depends(require_admin),
):
    """Verification queue. Sorted by posted_date DESC (newest first) so
    the admin tackles fresh OCR before tackling backlog. Auth required."""
    return get_by_status(db, "unverified")


@app.get("/api/martyrs/{msg_id}")
def get_martyr(msg_id: int, db=Depends(get_db)):
    row = get_by_msg_id(db, msg_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"msg_id {msg_id} not found")
    return row


# =============================================================================
# Admin (auth-required) endpoints
# =============================================================================


@app.put("/api/martyrs/{msg_id}")
def update_and_verify_martyr(
    msg_id: int,
    edits: dict = Body(...),
    db=Depends(get_db),
    _: None = Depends(require_admin),
):
    """Apply the admin's edits and mark the row 'verified' atomically.
    edits is a dict of field-name → new-value; unknown / non-editable fields
    are filtered out by sqlserver_client.mark_verified."""
    if get_by_msg_id(db, msg_id) is None:
        raise HTTPException(status_code=404, detail=f"msg_id {msg_id} not found")
    mark_verified(db, msg_id, edits, verified_by="admin")
    return {"ok": True, "msg_id": msg_id, "verification_status": "verified"}


@app.post("/api/martyrs/{msg_id}/reject")
def reject_martyr(
    msg_id: int,
    db=Depends(get_db),
    _: None = Depends(require_admin),
):
    """Mark a row 'rejected' so it never appears in published JSON.
    Use for spam, duplicates, mis-categorized posts, etc."""
    if get_by_msg_id(db, msg_id) is None:
        raise HTTPException(status_code=404, detail=f"msg_id {msg_id} not found")
    mark_rejected(db, msg_id, verified_by="admin")
    return {"ok": True, "msg_id": msg_id, "verification_status": "rejected"}


@app.post("/api/publish")
def publish(
    body: dict = Body(default={}),
    db=Depends(get_db),
    _: None = Depends(require_admin),
):
    """Reads verified rows from SQL Server, writes a new versioned
    data/martyrs.json, records the publish in publish_versions. Returns
    a summary; the SPA shows it in a confirmation message.

    Body shape: {"note": "optional one-liner for audit trail"}
    Returns: {"ok": true, "version": int, "row_count": int, "path": str}

    NOTE: this writes the JSON locally but does NOT git-push. Use
    scripts/publish.ps1 for the one-command publish-and-deploy flow.
    """
    note = (body or {}).get("note") or None
    try:
        result = export_to_json(db, json_path=DEFAULT_JSON_PATH, note=note)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Publish failed: {e}")
    return {"ok": True, **result}




# =============================================================================
# Static file mounts (SPA + photos)
# =============================================================================

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_WEBUI_DIR = _PROJECT_ROOT / "webui"
_PHOTOS_DIR = _PROJECT_ROOT / "data" / "photos"
_FRAMES_DIR = _PROJECT_ROOT / "data" / "frames"

if _WEBUI_DIR.exists():
    app.mount("/webui", StaticFiles(directory=_WEBUI_DIR, html=True), name="webui")
if _PHOTOS_DIR.exists():
    app.mount("/data/photos", StaticFiles(directory=_PHOTOS_DIR), name="photos")
# Frames are the OCR source extracts (5-6 stills per video). Shown to the
# admin in the edit form so they can verify what OCR actually saw before
# accepting / correcting the structured fields.
if _FRAMES_DIR.exists():
    app.mount("/data/frames", StaticFiles(directory=_FRAMES_DIR), name="frames")


@app.get("/")
def root_redirect():
    """Redirect bare URL to the SPA entry point."""
    return RedirectResponse(url="/webui/", status_code=302)
