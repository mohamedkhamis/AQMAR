"""Tests for src/admin_app.py.

Uses FastAPI's TestClient + dependency_overrides to substitute a mock DB
connection in place of the real pyodbc call. cfg.admin_token is monkey-
patched to a known value so the auth checks can be exercised."""
import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from src import admin_app
from src.config import Config

# Override the cfg admin_app captured at module load with a deterministic
# test config. This isolates tests from whatever's in the real .env file.
# Don't monkey-patch load_config globally — that leaks into other test files.
_test_cfg = Config(
    api_id=0, api_hash="", phone="", two_fa_password="",
    channel_username="", session_path="", daily_run_hour=9,
    sqlserver_conn_str="DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;Trusted_Connection=yes",
    admin_token="t3st-t0k3n",
)
admin_app.cfg = _test_cfg

VALID_TOKEN_HEADER = {"X-Admin-Token": "t3st-t0k3n"}


@pytest.fixture
def mock_db():
    """A MagicMock that stands in for a pyodbc Connection."""
    return MagicMock()


@pytest.fixture
def client(mock_db):
    """TestClient with get_db overridden to yield our mock."""
    def _override_get_db():
        yield mock_db
    admin_app.app.dependency_overrides[admin_app.get_db] = _override_get_db
    yield TestClient(admin_app.app)
    admin_app.app.dependency_overrides.clear()


# =============================================================================
# Health
# =============================================================================

def test_health_returns_basic_shape(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "db" in body
    assert body["admin_token_configured"] is True


# =============================================================================
# Public read endpoints
# =============================================================================

def test_list_martyrs_returns_db_rows(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_all", lambda db: [
        {"msg_id": 20, "name": "Foo", "verification_status": "unverified"},
        {"msg_id": 21, "name": "Bar", "verification_status": "verified"},
    ])
    r = client.get("/api/martyrs")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["msg_id"] == 20


def test_get_martyr_returns_single_row(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id", lambda db, msg_id: {
        "msg_id": msg_id, "name": "Found", "verification_status": "unverified",
    })
    r = client.get("/api/martyrs/42")
    assert r.status_code == 200
    assert r.json() == {"msg_id": 42, "name": "Found", "verification_status": "unverified"}


def test_get_martyr_404_when_missing(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id", lambda db, msg_id: None)
    r = client.get("/api/martyrs/99999")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# =============================================================================
# Auth gate on admin endpoints
# =============================================================================

def test_unverified_requires_admin_token(client):
    r = client.get("/api/martyrs/unverified")    # no header
    assert r.status_code == 403
    assert "X-Admin-Token" in r.json()["detail"]


def test_unverified_rejects_wrong_token(client):
    r = client.get("/api/martyrs/unverified",
                   headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 403


def test_unverified_accepts_valid_token(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_status", lambda db, status: [
        {"msg_id": 100, "verification_status": "unverified"},
    ])
    r = client.get("/api/martyrs/unverified", headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1 and rows[0]["msg_id"] == 100


def test_put_requires_admin_token(client):
    r = client.put("/api/martyrs/42", json={"name": "X"})
    assert r.status_code == 403


def test_reject_requires_admin_token(client):
    r = client.post("/api/martyrs/42/reject")
    assert r.status_code == 403


# =============================================================================
# PUT (edit + verify)
# =============================================================================

def test_put_calls_mark_verified_and_returns_ok(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id",
                        lambda db, msg_id: {"msg_id": msg_id})
    mark_called = []
    monkeypatch.setattr(admin_app, "mark_verified",
                        lambda db, msg_id, edits, verified_by: mark_called.append((msg_id, edits, verified_by)))

    r = client.put("/api/martyrs/42",
                   json={"name": "New Name", "city": "غزة"},
                   headers=VALID_TOKEN_HEADER)

    assert r.status_code == 200
    body = r.json()
    assert body == {"ok": True, "msg_id": 42, "verification_status": "verified"}
    assert mark_called == [(42, {"name": "New Name", "city": "غزة"}, "admin")]


def test_put_404_when_msg_missing(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id", lambda db, msg_id: None)
    r = client.put("/api/martyrs/99999",
                   json={"name": "X"},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 404


def test_put_with_empty_edits_still_verifies(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id",
                        lambda db, msg_id: {"msg_id": msg_id})
    mark_called = []
    monkeypatch.setattr(admin_app, "mark_verified",
                        lambda db, msg_id, edits, verified_by: mark_called.append(edits))
    r = client.put("/api/martyrs/42", json={}, headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    assert mark_called == [{}]


# =============================================================================
# POST /reject
# =============================================================================

def test_reject_calls_mark_rejected(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id",
                        lambda db, msg_id: {"msg_id": msg_id})
    rejected = []
    monkeypatch.setattr(admin_app, "mark_rejected",
                        lambda db, msg_id, verified_by: rejected.append((msg_id, verified_by)))

    r = client.post("/api/martyrs/42/reject", headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    body = r.json()
    assert body == {"ok": True, "msg_id": 42, "verification_status": "rejected"}
    assert rejected == [(42, "admin")]


def test_reject_404_when_missing(client, mock_db, monkeypatch):
    monkeypatch.setattr(admin_app, "get_by_msg_id", lambda db, msg_id: None)
    r = client.post("/api/martyrs/99999/reject", headers=VALID_TOKEN_HEADER)
    assert r.status_code == 404


# =============================================================================
# Publish stub
# =============================================================================

def test_publish_calls_export_to_json_and_returns_summary(client, mock_db, monkeypatch):
    """POST /api/publish should call exporter.export_to_json and surface its
    {version, row_count, path} return as part of the response."""
    monkeypatch.setattr(admin_app, "export_to_json",
                        lambda conn, json_path, note: {
                            "version": 7,
                            "row_count": 312,
                            "path": "/tmp/martyrs.json",
                        })

    r = client.post("/api/publish",
                    json={"note": "weekly snapshot"},
                    headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "ok": True,
        "version": 7,
        "row_count": 312,
        "path": "/tmp/martyrs.json",
    }


def test_publish_works_with_no_body(client, mock_db, monkeypatch):
    """Empty body should be accepted; note defaults to None."""
    notes_seen = []
    monkeypatch.setattr(admin_app, "export_to_json",
                        lambda conn, json_path, note: (notes_seen.append(note), {
                            "version": 1, "row_count": 0, "path": "/tmp/x.json",
                        })[1])
    r = client.post("/api/publish", headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    assert notes_seen == [None]


def test_publish_500_when_exporter_raises(client, mock_db, monkeypatch):
    def boom(conn, json_path, note):
        raise RuntimeError("db connection lost mid-publish")
    monkeypatch.setattr(admin_app, "export_to_json", boom)
    r = client.post("/api/publish", headers=VALID_TOKEN_HEADER)
    assert r.status_code == 500
    assert "db connection lost mid-publish" in r.json()["detail"]


def test_publish_requires_admin_token(client):
    r = client.post("/api/publish")
    assert r.status_code == 403


# =============================================================================
# Static / root redirect
# =============================================================================

def test_root_redirects_to_webui(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/webui/"
