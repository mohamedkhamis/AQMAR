# tests/test_admin_app_notify.py
"""Notify-settings routes. No DB, no SMTP — path + notifier monkeypatched.
Mirrors tests/test_admin_app_settings.py conventions."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from src import admin_app
from src.config import Config

_test_cfg = Config(
    api_id=0, api_hash="", phone="", two_fa_password="",
    channel_username="", session_path="", daily_run_hour=9,
    sqlserver_conn_str="DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;Trusted_Connection=yes",
    admin_token="t3st-t0k3n",
)
admin_app.cfg = _test_cfg
TOK = {"X-Admin-Token": "t3st-t0k3n"}

BODY = {"version": 1, "enabled": True,
        "sender_email": "s@gmail.com", "app_password": "pw123",
        "recipients": ["a@x.com"]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_app, "NOTIFY_PATH", tmp_path / "notify.json")
    return TestClient(admin_app.app)


def test_get_requires_admin(client):
    assert client.get("/api/notify-settings").status_code == 403


def test_put_requires_admin_token(client):
    assert client.put("/api/notify-settings", json=BODY).status_code == 403


def test_put_rejects_wrong_token(client):
    r = client.put("/api/notify-settings", json=BODY,
                   headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 403


def test_notify_test_requires_admin_token(client):
    assert client.post("/api/notify-test").status_code == 403


def test_notify_test_rejects_wrong_token(client):
    assert client.post("/api/notify-test",
                       headers={"X-Admin-Token": "wrong"}).status_code == 403


def test_get_returns_masked_defaults(client):
    r = client.get("/api/notify-settings", headers=TOK)
    assert r.status_code == 200
    body = r.json()
    assert "app_password" not in body
    assert body["has_password"] is False
    assert body["sender_email"] == "mohamed.khamis.alex@gmail.com"


def test_put_round_trip_masks_password(client):
    r = client.put("/api/notify-settings", json=BODY, headers=TOK)
    assert r.status_code == 200
    assert "app_password" not in r.json() and r.json()["has_password"] is True
    r2 = client.get("/api/notify-settings", headers=TOK)
    assert r2.json()["recipients"] == ["a@x.com"]


def test_put_blank_password_keeps_stored(client):
    client.put("/api/notify-settings", json=BODY, headers=TOK)
    r = client.put("/api/notify-settings",
                   json=dict(BODY, app_password=""), headers=TOK)
    assert r.status_code == 200 and r.json()["has_password"] is True


def test_put_validation_422(client):
    r = client.put("/api/notify-settings",
                   json=dict(BODY, sender_email="nope"), headers=TOK)
    assert r.status_code == 422
    assert "sender_email" in r.json()["detail"]


def test_put_enabled_without_password_422(client):
    r = client.put("/api/notify-settings",
                   json=dict(BODY, app_password=""), headers=TOK)
    assert r.status_code == 422          # nothing stored yet → merged pw empty


def test_notify_test_ok(client, monkeypatch):
    client.put("/api/notify-settings", json=BODY, headers=TOK)
    calls = []
    monkeypatch.setattr(admin_app.notifier, "send_test",
                        lambda s: calls.append(s["sender_email"]))
    r = client.post("/api/notify-test", headers=TOK)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert calls == ["s@gmail.com"]


def test_notify_test_surfaces_error_without_password(client, monkeypatch):
    client.put("/api/notify-settings", json=BODY, headers=TOK)
    def boom(s):
        raise RuntimeError("SMTP auth failed")
    monkeypatch.setattr(admin_app.notifier, "send_test", boom)
    r = client.post("/api/notify-test", headers=TOK)
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "SMTP auth failed" in r.json()["error"]
    assert "pw123" not in r.text


def test_notify_test_unconfigured_422(client):
    r = client.post("/api/notify-test", headers=TOK)   # all-defaults: no password
    assert r.status_code == 422


def test_notify_test_works_while_disabled(client, monkeypatch):
    # The documented setup flow sends the test BEFORE enabling — must work.
    client.put("/api/notify-settings", json=dict(BODY, enabled=False), headers=TOK)
    calls = []
    monkeypatch.setattr(admin_app.notifier, "send_test",
                        lambda s: calls.append(True))
    r = client.post("/api/notify-test", headers=TOK)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert calls == [True]
