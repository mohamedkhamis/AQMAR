# tests/test_notify_store.py
"""Notify settings store — pure file/dict logic, no SMTP, no FastAPI."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.notify_store import (
    DEFAULT_NOTIFY,
    load_notify,
    validate_notify,
    merge_notify,
    mask_notify,
    save_notify,
)

GOOD = {
    "version": 1,
    "enabled": True,
    "sender_email": "mohamed.khamis.alex@gmail.com",
    "app_password": "abcd efgh ijkl mnop",
    "recipients": ["mohamed.khamis.alex@gmail.com"],
}


def test_load_missing_returns_defaults(tmp_path):
    d = load_notify(tmp_path / "nope.json")
    assert d == DEFAULT_NOTIFY
    assert d is not DEFAULT_NOTIFY          # fresh copy, not the module constant


def test_defaults_are_disabled_with_default_addresses():
    assert DEFAULT_NOTIFY["enabled"] is False
    assert DEFAULT_NOTIFY["sender_email"] == "mohamed.khamis.alex@gmail.com"
    assert DEFAULT_NOTIFY["recipients"] == ["mohamed.khamis.alex@gmail.com"]
    assert DEFAULT_NOTIFY["app_password"] == ""


def test_save_load_round_trip(tmp_path):
    p = tmp_path / "notify.json"
    save_notify(p, GOOD)
    assert load_notify(p) == GOOD


def test_load_corrupt_raises_valueerror(tmp_path):
    p = tmp_path / "notify.json"
    p.write_text("{broken", encoding="utf-8")
    with pytest.raises(ValueError):
        load_notify(p)


def test_validate_good_is_empty():
    assert validate_notify(GOOD) == []


def test_validate_bad_sender():
    bad = dict(GOOD, sender_email="not-an-email")
    assert any("sender_email" in e for e in validate_notify(bad))


def test_validate_bad_recipient():
    bad = dict(GOOD, recipients=["ok@x.com", "nope"])
    assert any("recipients" in e for e in validate_notify(bad))


def test_validate_enabled_requires_recipients_and_password():
    bad = dict(GOOD, recipients=[])
    assert any("recipients" in e for e in validate_notify(bad))
    bad2 = dict(GOOD, app_password="")
    assert any("app_password" in e for e in validate_notify(bad2))


def test_validate_disabled_allows_empty_password():
    ok = dict(GOOD, enabled=False, app_password="")
    assert validate_notify(ok) == []


def test_validate_enabled_must_be_bool():
    bad = dict(GOOD, enabled="yes")
    assert any("enabled" in e for e in validate_notify(bad))


def test_merge_blank_password_keeps_existing():
    incoming = dict(GOOD, app_password="")
    merged = merge_notify(GOOD, incoming)
    assert merged["app_password"] == GOOD["app_password"]


def test_merge_absent_password_key_keeps_existing():
    # The realistic PUT-body shape: a payload built from mask_notify's output
    # has no app_password key at all (only has_password). Must keep the stored one.
    incoming = {k: v for k, v in GOOD.items() if k != "app_password"}
    assert merge_notify(GOOD, incoming)["app_password"] == GOOD["app_password"]


def test_merge_new_password_replaces():
    incoming = dict(GOOD, app_password="new pass")
    assert merge_notify(GOOD, incoming)["app_password"] == "new pass"


def test_merge_preserves_unknown_keys():
    existing = dict(GOOD, future_key=[1, 2])
    merged = merge_notify(existing, dict(GOOD))
    assert merged["future_key"] == [1, 2]


def test_mask_hides_password():
    m = mask_notify(GOOD)
    assert "app_password" not in m
    assert m["has_password"] is True
    assert mask_notify(dict(GOOD, app_password=""))["has_password"] is False
