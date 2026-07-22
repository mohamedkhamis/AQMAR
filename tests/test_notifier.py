# tests/test_notifier.py
"""Email building + send matrix. smtplib is monkeypatched — no network."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src import notifier

SETTINGS = {
    "version": 1, "enabled": True,
    "sender_email": "s@gmail.com", "app_password": "pw",
    "recipients": ["a@x.com", "b@y.com"],
}

def rep(**kw):
    base = {"run_start": "2026-07-22T22:30:00Z", "published": False,
            "version": None, "row_count": 0, "new_people": [],
            "fixed_count": 0, "ai_total": 0, "covers_count": 0,
            "stuck": [], "errors": []}
    base.update(kw)
    return base

NEW = {"msg_id": 1871, "name": "الشهيد المجاهد فلان",
       "birth_date": "1990-01-01", "martyrdom_date": "2026-07-20",
       "message_link": "https://t.me/AqmarTofan/1871"}
STUCK = {"msg_id": 1850, "name": "فلان آخر", "ai_note": "card day-less: مايو 2025"}


def test_should_send_matrix():
    assert notifier.should_send(rep()) is False
    assert notifier.should_send(rep(fixed_count=3, published=True)) is False
    assert notifier.should_send(rep(new_people=[NEW])) is True
    assert notifier.should_send(rep(stuck=[STUCK])) is True
    assert notifier.should_send(rep(errors=[{"stage": "verify", "detail": "x"}])) is True


def test_subject_variants():
    assert "1" in notifier.build_subject(rep(new_people=[NEW], published=True, version=16))
    assert "مراجع" in notifier.build_subject(rep(stuck=[STUCK]))
    assert "فشل" in notifier.build_subject(rep(errors=[{"stage": "publish", "detail": "x"}]))


def test_html_contains_name_link_and_note_escaped():
    evil = dict(NEW, name="<script>bad</script>")
    html = notifier.build_html(rep(new_people=[evil], stuck=[STUCK],
                                   published=True, version=16))
    assert "&lt;script&gt;" in html and "<script>bad" not in html
    assert NEW["message_link"] in html
    assert STUCK["ai_note"] in html
    assert 'dir="rtl"' in html
    assert "v16" in html                      # published version + row count line


class FakeSMTP:
    sent = []
    def __init__(self, host, port, timeout=30):
        FakeSMTP.sent.append(("connect", host, port))
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def login(self, user, pw): FakeSMTP.sent.append(("login", user))
    def send_message(self, msg): FakeSMTP.sent.append(("send", msg["Subject"], msg["To"]))


@pytest.fixture
def fake_smtp(monkeypatch):
    FakeSMTP.sent = []
    monkeypatch.setattr(notifier.smtplib, "SMTP_SSL", FakeSMTP)
    return FakeSMTP


def test_send_summary_sends_to_all_recipients(fake_smtp):
    ok = notifier.send_summary(SETTINGS, rep(new_people=[NEW]))
    assert ok is True
    kinds = [s[0] for s in fake_smtp.sent]
    assert kinds == ["connect", "login", "send"]
    assert "a@x.com" in fake_smtp.sent[-1][2] and "b@y.com" in fake_smtp.sent[-1][2]


def test_send_summary_skips_when_disabled(fake_smtp):
    ok = notifier.send_summary(dict(SETTINGS, enabled=False), rep(new_people=[NEW]))
    assert ok is False and fake_smtp.sent == []


def test_send_summary_skips_when_nothing_to_say(fake_smtp):
    ok = notifier.send_summary(SETTINGS, rep(fixed_count=5, published=True))
    assert ok is False and fake_smtp.sent == []


def test_send_test_and_error(fake_smtp):
    notifier.send_test(SETTINGS)
    assert notifier.send_error(SETTINGS, "publish", "git push failed") is True
    assert len([s for s in fake_smtp.sent if s[0] == "send"]) == 2
