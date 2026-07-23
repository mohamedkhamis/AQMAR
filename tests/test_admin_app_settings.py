"""Tests for the /api/settings routes. No DB involved — the routes only
touch the settings file, which is monkeypatched to tmp_path so tests can
never overwrite the repo's real data/settings.json."""
import json
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

VALID_TOKEN_HEADER = {"X-Admin-Token": "t3st-t0k3n"}

EV = {"name_ar": "معركة طوفان الأقصى", "name_en": "7 October War",
      "start_date": "2023-10-07"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_app, "SETTINGS_PATH", tmp_path / "settings.json")
    return TestClient(admin_app.app)


def test_get_settings_returns_default_when_missing(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json() == {"version": 1, "events": []}


def test_get_settings_is_public_no_token(client):
    assert client.get("/api/settings").status_code == 200


def test_put_requires_admin_token(client):
    r = client.put("/api/settings", json={"version": 1, "events": []})
    assert r.status_code == 403


def test_put_rejects_wrong_token(client):
    r = client.put("/api/settings", json={"version": 1, "events": []},
                   headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 403


def test_put_then_get_round_trip(client):
    r = client.put("/api/settings", json={"version": 1, "events": [EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    saved = r.json()
    assert saved["events"][0]["name_ar"] == EV["name_ar"]
    assert saved["events"][0]["id"]            # server assigned an id
    assert client.get("/api/settings").json() == saved


def test_put_validation_error_is_422_with_detail(client):
    bad = dict(EV, start_date="2023-13-01")
    r = client.put("/api/settings", json={"version": 1, "events": [bad]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422
    assert "start_date" in r.json()["detail"]


def test_put_strips_legacy_end_date(client):
    # end_date was retired 2026-07-23 — an event is a single point in time.
    # A payload still carrying one saves fine, minus the field.
    legacy = dict(EV, end_date="2023-01-01")
    r = client.put("/api/settings", json={"version": 1, "events": [legacy]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    assert "end_date" not in r.json()["events"][0]


def test_put_preserves_unknown_top_level_keys(client):
    path = admin_app.SETTINGS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "events": [], "future_key": [1, 2]}),
                    encoding="utf-8")
    r = client.put("/api/settings", json={"version": 1, "events": [EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    assert r.json()["future_key"] == [1, 2]


def test_put_rejects_oversized_payload(client):
    huge = {"version": 1, "events": [], "blob": "x" * (300 * 1024)}
    r = client.put("/api/settings", json=huge, headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422
    assert "large" in r.json()["detail"].lower()


def test_put_non_integer_version_is_422(client):
    r = client.put("/api/settings", json={"version": "seven", "events": []},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422


def test_put_events_sorted_by_start_date(client):
    ev2 = dict(EV, name_ar="وقف إطلاق النار", start_date="2025-01-19")
    r = client.put("/api/settings", json={"version": 1, "events": [ev2, EV]},
                   headers=VALID_TOKEN_HEADER)
    assert r.status_code == 200
    starts = [e["start_date"] for e in r.json()["events"]]
    assert starts == ["2023-10-07", "2025-01-19"]


def test_get_settings_500_on_invalid_json_on_disk(client):
    path = admin_app.SETTINGS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json", encoding="utf-8")
    r = client.get("/api/settings")
    assert r.status_code == 500
    assert "not valid JSON" in r.json()["detail"]


def test_put_missing_events_key_is_422(client):
    r = client.put("/api/settings", json={"version": 1}, headers=VALID_TOKEN_HEADER)
    assert r.status_code == 422
    assert "events" in r.json()["detail"]
