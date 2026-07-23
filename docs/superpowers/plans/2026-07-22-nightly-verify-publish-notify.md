# Nightly Verify → Two-Repo Publish → Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily 22:30 scheduled task that AI-verifies pending rows headlessly, publishes site files to the public `AQMAR` repo + full backup to a private repo, and emails the admin — with email settings editable from a new admin Settings page.

**Architecture:** Deterministic PowerShell orchestrator (`nightly_verify_publish.ps1`) drives four phases: guards → headless Claude verify-only → deterministic two-repo publish (`publish_core.ps1`) → DB-derived report + Gmail SMTP email (`nightly_report.py` + `src/notifier.py`). Admin portal splits into People-verify and Settings views; email settings live in a gitignored local JSON managed by new FastAPI endpoints.

**Tech Stack:** Python 3.11 (`.venv\Scripts\python.exe`), FastAPI, pyodbc/SQL Server, stdlib `smtplib`, PowerShell 5.1, Windows `schtasks`, Alpine.js SPA (no build step), `claude` CLI (subscription, headless).

**Spec:** `docs/superpowers/specs/2026-07-22-nightly-verify-publish-notify-design.md`

## Global Constraints

- **GIT RULE (absolute):** every commit step below = summarize the change, ask the user **"Ready to commit?"**, and run git only after explicit approval. This applies to every task in this plan. The *scheduled script* has standing authorization for its own runtime pushes only.
- Run every Python command from the repo root with `.venv\Scripts\python.exe` (config loads `.env` CWD-relative).
- Tests: `.venv\Scripts\python.exe -m pytest -q` must stay green (92 existing tests).
- PowerShell is 5.1: no `&&`, no ternary; `$ErrorActionPreference = "Stop"`; UTF-8 via `$env:PYTHONIOENCODING = "utf-8"`. Additional 5.1 footguns this plan works around: (a) `$OutputEncoding` defaults to ASCII — set `$OutputEncoding = New-Object System.Text.UTF8Encoding($false)` before piping Arabic to native `claude`; (b) never `2>&1`-capture a child call whose result you then parse (Write-Host isn't captured; git stderr under `Stop` can raise `NativeCommandError`) — pass results via a file; (c) `Start-Transcript` does not capture native `python`/`git` output in a hidden window — the scheduled run logs via the VBS `cmd /c … >> log 2>&1` wrapper instead; (d) `$LASTEXITCODE` only reflects native commands, not `.ps1` calls (those signal failure by throwing under `Stop`), so don't guard on it right after invoking a sub-script; (e) `.Trim()` on a `$null` from a failed native command throws a misleading error — check exit + null first.
- No build step in webui; new JS follows the `(function (global) { "use strict"; … })(window)` IIFE pattern; design tokens only (no hard-coded colors/fonts); Arabic-primary bilingual via `lang === 'ar' ? '…' : '…'`; names rendered with `x-text` (never `x-html`).
- Never log, print, echo, or return `app_password` anywhere (API responses, logs, emails, git).
- `data/notify_settings.json` and `scripts/_run_nightly_silent.vbs` are gitignored and must never be committed.
- Do not rename any `window.*` export used by `webui/tests.html`.
- Headless `claude` in `nightly_verify_publish.ps1` runs under an **allowlist** (`--allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(.venv*)" --disallowedTools "Bash(git*)"`), NOT `--dangerously-skip-permissions`. It reads externally-sourced OCR images, so a blanket bypass is unsafe; the allowlist still runs fully silent (headless auto-approves allowed tools, denies others without prompting) while confining a prompt-injected image to file ops + `.venv` python. Same proven set as `ai_verify_daily.ps1`. (Security review, 2026-07-22 — the user's original ask was `--dangerously-skip-permissions` "to work silent"; the allowlist meets that goal more safely.)

---

### Task 1: Notify settings store (`src/notify_store.py`)

**Files:**
- Create: `src/notify_store.py`
- Create: `tests/test_notify_store.py`
- Modify: `.gitignore` (add `data/notify_settings.json`)

**Interfaces:**
- Produces: `DEFAULT_NOTIFY: dict`, `load_notify(path) -> dict` (ValueError on corrupt JSON), `validate_notify(data) -> list[str]`, `merge_notify(existing: dict, incoming: dict) -> dict` (blank incoming `app_password` keeps existing), `mask_notify(data) -> dict` (drops `app_password`, adds `has_password: bool`), `save_notify(path, data) -> None` (atomic).

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests\test_notify_store.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.notify_store'`

- [ ] **Step 3: Implement `src/notify_store.py`**

```python
# src/notify_store.py
"""Load/validate/save the LOCAL email-notification settings
(data/notify_settings.json).

Unlike data/settings.json this file is GITIGNORED and machine-local: it
holds the Gmail sender address, its App Password, and the recipient list
for the nightly summary email. It must never be committed or served.
Mirrors the settings_store.py patterns (atomic save, ValueError on corrupt
JSON, merge preserves unknown keys) so the two stores behave alike.
"""
import json
import os
import re
import tempfile
from pathlib import Path

DEFAULT_NOTIFY = {
    "version": 1,
    "enabled": False,
    "sender_email": "mohamed.khamis.alex@gmail.com",
    "app_password": "",
    "recipients": ["mohamed.khamis.alex@gmail.com"],
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_RECIPIENTS = 20


def _valid_email(s) -> bool:
    return isinstance(s, str) and bool(_EMAIL_RE.match(s))


def load_notify(path: str | Path) -> dict:
    """Parsed notify file, or a fresh DEFAULT_NOTIFY copy when missing.
    Invalid JSON raises ValueError (fail loud — same policy as settings)."""
    p = Path(path)
    if not p.exists():
        return json.loads(json.dumps(DEFAULT_NOTIFY))
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{p.name} is not valid JSON: {e}") from e


def validate_notify(data) -> list[str]:
    """Human-readable validation errors; [] means valid."""
    if not isinstance(data, dict):
        return ["settings must be an object"]
    errors: list[str] = []
    if not isinstance(data.get("enabled"), bool):
        errors.append("enabled must be true or false")
    if not _valid_email(data.get("sender_email")):
        errors.append("sender_email must be a valid email address")
    recips = data.get("recipients")
    if not isinstance(recips, list) or any(not _valid_email(r) for r in recips):
        errors.append("recipients must be a list of valid email addresses")
    elif len(recips) > MAX_RECIPIENTS:
        errors.append(f"recipients: at most {MAX_RECIPIENTS} addresses")
    pw = data.get("app_password")
    if pw is not None and not isinstance(pw, str):
        errors.append("app_password must be a string")
    if data.get("enabled") is True:
        if isinstance(recips, list) and len(recips) == 0:
            errors.append("recipients required when enabled")
        if not (isinstance(pw, str) and pw.strip()):
            errors.append("app_password required when enabled")
    return errors


def merge_notify(existing: dict, incoming: dict) -> dict:
    """existing file content + incoming settings → full settings.
    A blank/missing incoming app_password KEEPS the stored one (the UI is
    write-only for the password). Unknown top-level keys survive."""
    merged = dict(existing) if isinstance(existing, dict) else dict(DEFAULT_NOTIFY)
    for key in ("version", "enabled", "sender_email", "recipients"):
        if key in incoming:
            merged[key] = incoming[key]
    pw = incoming.get("app_password")
    if isinstance(pw, str) and pw.strip():
        merged["app_password"] = pw
    merged.setdefault("app_password", "")
    return merged


def mask_notify(data: dict) -> dict:
    """API-safe copy: app_password removed, has_password flag added."""
    out = {k: v for k, v in data.items() if k != "app_password"}
    out["has_password"] = bool(str(data.get("app_password") or "").strip())
    return out


def save_notify(path: str | Path, data: dict) -> None:
    """Atomic write (tempfile in same dir + os.replace)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".notify-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
```

- [ ] **Step 4: Add the gitignore entry**

In `.gitignore`, directly under the `data/ai_batches/` line, add:

```
# Local-only email notification settings (Gmail app password) — NEVER commit.
data/notify_settings.json
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests\test_notify_store.py -q`
Expected: all PASS. Then full suite: `.venv\Scripts\python.exe -m pytest -q` — no regressions.

- [ ] **Step 6: Commit (ask "Ready to commit?" first)**

```
git add src/notify_store.py tests/test_notify_store.py .gitignore
git commit -m "feat(notify): local notify-settings store (gitignored, atomic, masked)"
```

---

### Task 2: Email sender (`src/notifier.py`)

**Files:**
- Create: `src/notifier.py`
- Create: `tests/test_notifier.py`

**Interfaces:**
- Consumes: notify settings dict shape from Task 1.
- Produces: `should_send(report) -> bool`, `build_subject(report) -> str`, `build_html(report) -> str`, `build_text(report) -> str`, `send_summary(settings, report) -> bool` (False when disabled/unconfigured), `send_test(settings) -> None` (raises on failure), `send_error(settings, stage, detail) -> bool`, module constants `SMTP_HOST = "smtp.gmail.com"`, `SMTP_PORT = 465`.
- **Report dict shape (canonical, used by Tasks 2, 4, 5, 10):**

```python
{
  "run_start": "2026-07-22T22:30:00Z",
  "published": True,            # a publish commit happened tonight
  "version": 16,                # from data/martyrs.json; None if not published
  "row_count": 820,
  "new_people": [{"msg_id": 1871, "name": "…", "birth_date": "…",
                  "martyrdom_date": "…", "message_link": "…"}],
  "fixed_count": 2,             # ai_note LIKE fix%/fill% since run_start
  "ai_total": 9,                # rows ai-verified since run_start
  "covers_count": 9,
  "stuck": [{"msg_id": 1850, "name": "…", "ai_note": "…"}],
  "errors": [{"stage": "verify", "detail": "claude exit 1"}],
}
```

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests\test_notifier.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.notifier'`

- [ ] **Step 3: Implement `src/notifier.py`**

```python
# src/notifier.py
"""Gmail SMTP sender for the nightly summary / test / error emails.

Pure stdlib (smtplib + email.message). Settings come from
src/notify_store.py (data/notify_settings.json — local, gitignored).
The app password is used for login only and never logged or returned.
Report shape: see tests/test_notifier.py::rep — produced by
scripts/nightly_report.py.
"""
import html
import smtplib
from email.message import EmailMessage

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
SITE_URL = "https://aqmar.pages.dev"
ADMIN_URL = "http://localhost:8000/webui/"


def should_send(report: dict) -> bool:
    """Email only for: new people, rows stuck for a human, or errors."""
    return bool(report.get("new_people") or report.get("stuck")
                or report.get("errors"))


def _configured(settings: dict) -> bool:
    return bool(settings.get("enabled") and settings.get("sender_email")
                and str(settings.get("app_password") or "").strip()
                and settings.get("recipients"))


def build_subject(report: dict) -> str:
    if report.get("errors"):
        return "أقمار الطوفان — فشل النشر الليلي"
    n = len(report.get("new_people") or [])
    if n:
        v = report.get("version")
        tail = f" (نشرة v{v})" if v else ""
        return f"أقمار الطوفان — {n} شهيد جديد{tail}"
    return "أقمار الطوفان — سجلات بحاجة لمراجعتك"


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def build_html(report: dict) -> str:
    parts = ['<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;'
             'line-height:1.8;color:#222;max-width:640px">']
    parts.append(f"<h2>ملخّص التشغيل الليلي — {_esc(report.get('run_start'))}</h2>")

    if report.get("published"):
        parts.append(f"<p>نُشرت النسخة v{_esc(report.get('version'))} — "
                     f"{_esc(report.get('row_count', 0))} سجلاً منشوراً.</p>")

    if report.get("errors"):
        parts.append('<h3 style="color:#a30000">أخطاء</h3><ul>')
        for e in report["errors"]:
            parts.append(f"<li><b>{_esc(e.get('stage'))}</b>: {_esc(e.get('detail'))}</li>")
        parts.append("</ul>")

    new = report.get("new_people") or []
    if new:
        v = report.get("version")
        parts.append(f"<h3>شهداء جدد ({len(new)})"
                     + (f" — نشرة v{_esc(v)}" if v else "") + "</h3><ul>")
        for p in new:
            link = _esc(p.get("message_link") or "")
            parts.append(
                f"<li><b>{_esc(p.get('name'))}</b> — "
                f"الميلاد: {_esc(p.get('birth_date') or '—')} · "
                f"الشهادة: {_esc(p.get('martyrdom_date') or '—')}"
                + (f' · <a href="{link}">المصدر</a>' if link else "") + "</li>")
        parts.append("</ul>")

    stuck = report.get("stuck") or []
    if stuck:
        parts.append(f"<h3>بحاجة لقرارك ({len(stuck)})</h3><ul>")
        for s in stuck:
            parts.append(f"<li><b>{_esc(s.get('name'))}</b> "
                         f"(msg {_esc(s.get('msg_id'))}) — {_esc(s.get('ai_note'))}</li>")
        parts.append("</ul>")

    parts.append("<p>تدقيقات هذه الليلة: "
                 f"{_esc(report.get('ai_total', 0))} سجل — "
                 f"منها {_esc(report.get('fixed_count', 0))} تصحيح تاريخ، "
                 f"{_esc(report.get('covers_count', 0))} صورة غلاف.</p>")
    parts.append(f'<p><a href="{SITE_URL}">الموقع</a> · '
                 f'<a href="{ADMIN_URL}">لوحة التحرير (محلية)</a></p></div>')
    return "".join(parts)


def build_text(report: dict) -> str:
    lines = [f"AQMAR nightly run {report.get('run_start')}"]
    if report.get("published"):
        lines.append(f"published v{report.get('version')} - {report.get('row_count', 0)} rows")
    for e in report.get("errors") or []:
        lines.append(f"ERROR [{e.get('stage')}]: {e.get('detail')}")
    for p in report.get("new_people") or []:
        lines.append(f"NEW: {p.get('name')} ({p.get('birth_date')} - "
                     f"{p.get('martyrdom_date')}) {p.get('message_link') or ''}")
    for s in report.get("stuck") or []:
        lines.append(f"NEEDS-HUMAN: {s.get('name')} (msg {s.get('msg_id')}): {s.get('ai_note')}")
    lines.append(f"verified tonight: {report.get('ai_total', 0)} "
                 f"(fixed {report.get('fixed_count', 0)}, covers {report.get('covers_count', 0)})")
    return "\n".join(lines)


def _send(settings: dict, subject: str, html_body: str, text_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings["sender_email"]
    msg["To"] = ", ".join(settings["recipients"])
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.login(settings["sender_email"], settings["app_password"])
        smtp.send_message(msg)


def send_summary(settings: dict, report: dict) -> bool:
    """Send the nightly summary. False = intentionally not sent
    (disabled/unconfigured, or nothing email-worthy)."""
    if not _configured(settings) or not should_send(report):
        return False
    _send(settings, build_subject(report), build_html(report), build_text(report))
    return True


def send_test(settings: dict) -> None:
    """Minimal test mail; raises smtplib/OS errors for the caller to show."""
    _send(settings, "أقمار الطوفان — رسالة تجريبية ✓",
          '<div dir="rtl">إعدادات البريد تعمل بنجاح.</div>',
          "AQMAR email settings OK.")


def send_error(settings: dict, stage: str, detail: str) -> bool:
    if not _configured(settings):
        return False
    report = {"run_start": "", "errors": [{"stage": stage, "detail": detail}]}
    _send(settings, build_subject(report), build_html(report), build_text(report))
    return True
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests\test_notifier.py -q` → PASS, then full suite `-q` → no regressions.

- [ ] **Step 5: Commit (ask "Ready to commit?" first)**

```
git add src/notifier.py tests/test_notifier.py
git commit -m "feat(notify): Gmail SMTP notifier with RTL summary/test/error mails"
```

---

### Task 3: Publish diff helpers (`src/publish_diff.py`)

**Files:**
- Create: `src/publish_diff.py`
- Create: `tests/test_publish_diff.py`

**Interfaces:**
- Consumes: `src.exporter.serialize_row` (existing).
- Produces: `payload_msg_ids(payload) -> set[int]`, `new_people(old_payload, new_martyrs) -> list[dict]` (subset fields: msg_id, name, birth_date, martyrdom_date, message_link), `martyrs_changed(old_payload, new_martyrs) -> bool` (envelope-insensitive), `referenced_files(martyrs) -> dict` with keys `"photos"` / `"frames"` (forward-slash, unique, sorted). All take *serialized* martyr dicts (already ISO dates).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_publish_diff.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.publish_diff import (
    payload_msg_ids, new_people, martyrs_changed, referenced_files,
)

def m(i, **kw):
    base = {"msg_id": i, "name": f"n{i}", "birth_date": "1990-01-01",
            "martyrdom_date": "2026-07-01", "message_link": f"https://t.me/AqmarTofan/{i}",
            "photo_path": f"data\\photos\\{i}.jpg",
            "featured_frame_path": f"data/frames/{i}_28.jpg"}
    base.update(kw)
    return base

OLD = {"version": 15, "generated_at": "x", "note": None, "channel": "AqmarTofan",
       "martyrs": [m(1), m(2)]}


def test_payload_msg_ids():
    assert payload_msg_ids(OLD) == {1, 2}
    assert payload_msg_ids(None) == set()


def test_new_people_only_new_ids_with_summary_fields():
    got = new_people(OLD, [m(1), m(2), m(3)])
    assert [p["msg_id"] for p in got] == [3]
    assert set(got[0]) == {"msg_id", "name", "birth_date", "martyrdom_date", "message_link"}


def test_new_people_no_baseline_means_all_new():
    assert len(new_people(None, [m(1), m(2)])) == 2


def test_martyrs_changed_ignores_envelope():
    same = {"version": 99, "generated_at": "y", "note": "z",
            "channel": "AqmarTofan", "martyrs": [m(1), m(2)]}
    assert martyrs_changed(same, [m(1), m(2)]) is False
    assert martyrs_changed(OLD, [m(1), m(2, city="غزة")]) is True
    assert martyrs_changed(OLD, [m(1)]) is True
    assert martyrs_changed(None, []) is False
    assert martyrs_changed(None, [m(1)]) is True


def test_referenced_files_normalized_unique_sorted():
    rows = [m(2), m(1), m(3, featured_frame_path=None, photo_path=None)]
    ref = referenced_files(rows)
    assert ref["photos"] == ["data/photos/1.jpg", "data/photos/2.jpg"]
    assert ref["frames"] == ["data/frames/1_28.jpg", "data/frames/2_28.jpg"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests\test_publish_diff.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/publish_diff.py`**

```python
# src/publish_diff.py
"""Pure diff/reference helpers for the nightly publish decision.

Inputs are the *published payload* (data/martyrs.json content, or None when
no baseline exists) and lists of martyr dicts already serialized by
src.exporter.serialize_row. No DB, no git, no I/O — unit-testable."""

_SUMMARY_FIELDS = ("msg_id", "name", "birth_date", "martyrdom_date", "message_link")


def payload_msg_ids(payload) -> set:
    if not payload:
        return set()
    return {r.get("msg_id") for r in payload.get("martyrs", [])}


def new_people(old_payload, new_martyrs) -> list:
    """Rows present now but absent from the baseline payload — the email's
    'new people' list. Summary fields only (the email needs no more)."""
    old_ids = payload_msg_ids(old_payload)
    return [{f: r.get(f) for f in _SUMMARY_FIELDS}
            for r in new_martyrs if r.get("msg_id") not in old_ids]


def martyrs_changed(old_payload, new_martyrs) -> bool:
    """True when the martyr rows differ from the baseline in any way,
    ignoring the version/generated_at/note envelope."""
    old_rows = (old_payload or {}).get("martyrs", [])
    return old_rows != list(new_martyrs)


def _norm(p) -> str:
    return str(p).replace("\\", "/")


def referenced_files(martyrs) -> dict:
    """photo/cover paths referenced by the given rows — the ONLY files the
    site repo may contain (unpublished people must never leak)."""
    photos = {_norm(r["photo_path"]) for r in martyrs if r.get("photo_path")}
    frames = {_norm(r["featured_frame_path"]) for r in martyrs
              if r.get("featured_frame_path")}
    return {"photos": sorted(photos), "frames": sorted(frames)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests\test_publish_diff.py -q` → PASS; full suite → green.

- [ ] **Step 5: Commit (ask "Ready to commit?" first)**

```
git add src/publish_diff.py tests/test_publish_diff.py
git commit -m "feat(publish): pure diff helpers (new people, change check, referenced files)"
```

---

### Task 4: DB report queries + CLI tools (`publish_check.py`, `nightly_report.py`)

**Files:**
- Modify: `src/sqlserver_client.py` (append two read functions near `get_ai_pending`)
- Create: `scripts/publish_check.py`
- Create: `scripts/nightly_report.py`
- Create: `tests/test_nightly_report.py`

**Interfaces:**
- Consumes: `load_config`, `make_conn`, `get_verified_for_export`, `serialize_row`, Task 3 helpers, Task 2 notifier, Task 1 store.
- Produces:
  - `sqlserver_client.get_stuck_rows(conn) -> list[dict]` (`msg_id`, `name`, `ai_note`)
  - `sqlserver_client.count_ai_verified_since(conn, since_iso: str) -> dict` (`total`, `fixed`, `covers` ints)
  - `scripts/publish_check.py --baseline PATH [--since ISO] [--json OUT]` → JSON `{"changed": bool, "new_count": int, "fixed_count": int, "new_msg_ids": [int], "referenced_photos": [...], "referenced_frames": [...]}` (`fixed_count` is 0 unless `--since` is given)
  - `scripts/nightly_report.py --baseline PATH --run-start ISO [--error STAGE:DETAIL]... [--dry-run] [--json OUT]` → builds the canonical report dict (Task 2 shape), prints it, sends email per matrix. Exit 0 always unless the SMTP send itself fails (exit 3).
  - `nightly_report.build_report(run_start, baseline_payload, current_payload, stuck_rows, counts, errors) -> dict` (pure, imported by tests).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_nightly_report.py
"""Pure report assembly — no DB, no SMTP."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from nightly_report import build_report


def m(i):
    return {"msg_id": i, "name": f"n{i}", "birth_date": "1990-01-01",
            "martyrdom_date": "2026-07-01",
            "message_link": f"https://t.me/AqmarTofan/{i}",
            "photo_path": None, "featured_frame_path": None}

BASE = {"version": 15, "martyrs": [m(1)]}
CURR = {"version": 16, "martyrs": [m(1), m(2)]}
COUNTS = {"total": 5, "fixed": 2, "covers": 4}


def test_published_run_lists_new_people():
    r = build_report("2026-07-22T22:30:00Z", BASE, CURR,
                     [{"msg_id": 9, "name": "x", "ai_note": "conflict"}], COUNTS, [])
    assert r["published"] is True and r["version"] == 16
    assert [p["msg_id"] for p in r["new_people"]] == [2]
    assert r["row_count"] == 2
    assert r["stuck"][0]["msg_id"] == 9
    assert r["fixed_count"] == 2 and r["ai_total"] == 5 and r["covers_count"] == 4


def test_unchanged_run_is_not_published():
    r = build_report("2026-07-22T22:30:00Z", BASE, BASE, [], COUNTS, [])
    assert r["published"] is False and r["new_people"] == []
    assert r["version"] is None          # canonical shape: None when not published


def test_missing_current_payload_reports_error_not_crash():
    r = build_report("2026-07-22T22:30:00Z", BASE, None, [], COUNTS,
                     [{"stage": "verify", "detail": "claude exit 1"}])
    assert r["published"] is False
    assert r["errors"][0]["stage"] == "verify"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests\test_nightly_report.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'nightly_report'`

- [ ] **Step 3: Add the two DB read functions to `src/sqlserver_client.py`**

Append after `get_ai_pending` (follow that function's dict-rows style):

```python
def get_stuck_rows(conn) -> list[dict]:
    """Pending rows the AI flagged for a human (verified:false + note).
    These stay in the queue until the admin verifies/rejects them; the
    nightly email lists them so they aren't forgotten."""
    sql = """
        SELECT msg_id, name, ai_note
        FROM dbo.martyrs
        WHERE verification_status = 'unverified'
          AND ai_verified = 0
          AND ai_note IS NOT NULL AND LTRIM(RTRIM(ai_note)) <> ''
        ORDER BY msg_id
    """
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def count_ai_verified_since(conn, since_iso: str) -> dict:
    """Counts for the nightly email: rows AI-verified since the run started.
    'fixed' relies on the ai_note conventions ('fixed…'/'filled…') written
    by the verify prompt — a heuristic, good enough for a summary line."""
    sql = """
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN ai_note LIKE 'fix%' OR ai_note LIKE 'fill%'
                                 THEN 1 ELSE 0 END), 0) AS fixed,
               COALESCE(SUM(CASE WHEN featured_frame_path IS NOT NULL
                                 THEN 1 ELSE 0 END), 0) AS covers
        FROM dbo.martyrs
        WHERE ai_verified_at >= ?
    """
    cur = conn.cursor()
    cur.execute(sql, (since_iso,))
    row = cur.fetchone()
    return {"total": int(row[0] or 0), "fixed": int(row[1] or 0),
            "covers": int(row[2] or 0)}
```

- [ ] **Step 4: Implement `scripts/publish_check.py`**

```python
# scripts/publish_check.py
"""Pre-publish change check for the nightly orchestrator.

Compares the DB's would-be export against a baseline martyrs.json (the
HEAD copy, extracted by the caller with `git show`) WITHOUT consuming a
publish version. Prints JSON so PowerShell can branch on it.

Usage:
    .venv\\Scripts\\python.exe scripts\\publish_check.py --baseline logs\\nightly_baseline.json [--json out.json]
"""
import argparse
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import load_config
from src.sqlserver_client import (
    make_conn, get_verified_for_export, count_ai_verified_since,
)
from src.exporter import serialize_row
from src.publish_diff import new_people, martyrs_changed, referenced_files


def main() -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--since", help="run-start ISO; adds a 'fixed' count for the commit note")
    ap.add_argument("--json", help="also write the result to this path")
    args = ap.parse_args()

    baseline = None
    bp = Path(args.baseline)
    if bp.exists() and bp.stat().st_size > 0:
        baseline = json.loads(bp.read_text(encoding="utf-8"))

    cfg = load_config()
    conn = make_conn(cfg)
    try:
        rows = [serialize_row(r) for r in get_verified_for_export(conn)]
        fixed = count_ai_verified_since(conn, args.since)["fixed"] if args.since else 0
    finally:
        conn.close()

    fresh = new_people(baseline, rows)
    ref = referenced_files(rows)
    out = {
        "changed": martyrs_changed(baseline, rows),
        "new_count": len(fresh),
        "fixed_count": fixed,
        "new_msg_ids": [p["msg_id"] for p in fresh],
        "referenced_photos": ref["photos"],
        "referenced_frames": ref["frames"],
    }
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Implement `scripts/nightly_report.py`**

```python
# scripts/nightly_report.py
"""Build the nightly report from DB + payload diff and send the email.

Deterministic: 'new people' comes from diffing data/martyrs.json against
the pre-run baseline; 'stuck' and counts come from SQL Server — never from
what the AI step claims. Called by scripts/nightly_verify_publish.ps1.

Usage:
    .venv\\Scripts\\python.exe scripts\\nightly_report.py --baseline logs\\nightly_baseline.json ^
        --run-start 2026-07-22T22:30:00Z [--error verify:"claude exit 1"] [--dry-run] [--json out.json]

Exit codes: 0 ok (email sent, skipped, or dry-run) · 3 SMTP send failed.
"""
import argparse
import io
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from src.config import load_config
from src.sqlserver_client import make_conn, get_stuck_rows, count_ai_verified_since
from src.publish_diff import new_people, martyrs_changed
from src import notifier
from src.notify_store import load_notify

NOTIFY_PATH = _ROOT / "data" / "notify_settings.json"
MARTYRS_PATH = _ROOT / "data" / "martyrs.json"


def build_report(run_start, baseline_payload, current_payload,
                 stuck_rows, counts, errors) -> dict:
    """Pure assembly of the canonical report dict (shape: tests/test_notifier.py)."""
    curr_rows = (current_payload or {}).get("martyrs", [])
    published = bool(current_payload) and martyrs_changed(baseline_payload, curr_rows)
    return {
        "run_start": run_start,
        "published": published,
        "version": (current_payload or {}).get("version") if published else None,
        "row_count": len(curr_rows),
        "new_people": new_people(baseline_payload, curr_rows) if published else [],
        "fixed_count": counts.get("fixed", 0),
        "ai_total": counts.get("total", 0),
        "covers_count": counts.get("covers", 0),
        "stuck": [{"msg_id": s.get("msg_id"), "name": s.get("name"),
                   "ai_note": s.get("ai_note")} for s in stuck_rows],
        "errors": list(errors),
    }


def _load_json(path: Path):
    if path.exists() and path.stat().st_size > 0:
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def main() -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--run-start", required=True)
    ap.add_argument("--error", action="append", default=[],
                    help="stage:detail — repeatable")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--json", help="also write the report to this path")
    args = ap.parse_args()

    errors = []
    for e in args.error:
        stage, _, detail = e.partition(":")
        errors.append({"stage": stage, "detail": detail or stage})

    baseline = _load_json(Path(args.baseline))
    current = _load_json(MARTYRS_PATH)

    stuck, counts = [], {"total": 0, "fixed": 0, "covers": 0}
    try:
        cfg = load_config()
        conn = make_conn(cfg)
        try:
            stuck = get_stuck_rows(conn)
            counts = count_ai_verified_since(conn, args.run_start)
        finally:
            conn.close()
    except Exception as e:
        errors.append({"stage": "report-db", "detail": str(e)[:300]})

    report = build_report(args.run_start, baseline, current, stuck, counts, errors)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json:
        Path(args.json).write_text(text, encoding="utf-8")
    print(text)

    if args.dry_run:
        print("[dry-run] email not sent; would send:",
              notifier.should_send(report))
        return 0

    try:
        settings = load_notify(NOTIFY_PATH)
    except ValueError as e:
        print(f"[notify] settings file corrupt — email skipped: {e}")
        return 0
    try:
        sent = notifier.send_summary(settings, report)
        print(f"[notify] email sent: {sent}")
        return 0
    except Exception as e:
        print(f"[notify] SEND FAILED: {e}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests\test_nightly_report.py -q` → PASS; full suite → green.
Also smoke-run against the live DB (read-only):
`.venv\Scripts\python.exe scripts\publish_check.py --baseline data\martyrs.json`
Expected: JSON with `"changed"` true/false and non-empty `referenced_photos`.

- [ ] **Step 7: Commit (ask "Ready to commit?" first)**

```
git add src/sqlserver_client.py scripts/publish_check.py scripts/nightly_report.py tests/test_nightly_report.py
git commit -m "feat(nightly): change-check + DB-derived report CLIs with email dispatch"
```

---

### Task 5: Admin API notify endpoints

**Files:**
- Modify: `src/admin_app.py` (imports + `NOTIFY_PATH` + three routes, placed directly after the `/api/settings` routes)
- Create: `tests/test_admin_app_notify.py`

**Interfaces:**
- Consumes: Task 1 store, Task 2 `notifier.send_test`.
- Produces: `GET /api/notify-settings` (admin → masked dict), `PUT /api/notify-settings` (admin → masked dict; blank password keeps stored), `POST /api/notify-test` (admin → `{"ok": true}` or `{"ok": false, "error": str}`), module attr `admin_app.NOTIFY_PATH` (monkeypatchable).

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests\test_admin_app_notify.py -q`
Expected: FAIL — 404s / missing `NOTIFY_PATH` attribute.

- [ ] **Step 3: Implement the routes in `src/admin_app.py`**

Add to the imports block:

```python
from src import notifier
from src.notify_store import (
    load_notify,
    validate_notify,
    merge_notify,
    mask_notify,
    save_notify,
)
```

Next to `SETTINGS_PATH` add:

```python
NOTIFY_PATH = _PROJECT_ROOT / "data" / "notify_settings.json"
```

After the `/api/settings` routes add:

```python
# =============================================================================
# Email notification settings (data/notify_settings.json — LOCAL, gitignored)
# =============================================================================

@app.get("/api/notify-settings")
def get_notify_settings(_: None = Depends(require_admin)):
    """Admin-only (unlike /api/settings): recipients are private. The app
    password never leaves the server — only has_password does."""
    try:
        return mask_notify(load_notify(NOTIFY_PATH))
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/notify-settings")
def put_notify_settings(
    body: dict = Body(...),
    _: None = Depends(require_admin),
):
    """Merge over the stored file (blank app_password keeps the stored one),
    validate the MERGED result, save atomically, return it masked."""
    try:
        existing = load_notify(NOTIFY_PATH)
    except ValueError:
        existing = load_notify(NOTIFY_PATH.with_name("__missing__"))  # defaults
    merged = merge_notify(existing, body)
    errors = validate_notify(merged)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    save_notify(NOTIFY_PATH, merged)
    return mask_notify(merged)


@app.post("/api/notify-test")
def notify_test(_: None = Depends(require_admin)):
    """Send a test email with the stored settings. SMTP errors come back as
    {ok:false, error} so the UI can show them inline. 422 when not yet
    configured (no password / no recipients / no sender). Deliberately does
    NOT require enabled=true — a test-send is how the user validates the
    App Password BEFORE turning nightly email on (see setup flow)."""
    try:
        settings = load_notify(NOTIFY_PATH)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not (str(settings.get("app_password") or "").strip()
            and settings.get("recipients") and settings.get("sender_email")):
        raise HTTPException(status_code=422,
                            detail="Email settings incomplete — save sender, password and recipients first")
    try:
        notifier.send_test(settings)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests\test_admin_app_notify.py -q` → PASS; full suite → green.

- [ ] **Step 5: Commit (ask "Ready to commit?" first)**

```
git add src/admin_app.py tests/test_admin_app_notify.py
git commit -m "feat(admin): notify-settings API (masked GET/PUT, test-send endpoint)"
```

---

### Task 6: Settings-page visual preview (USER PICKS — checkpoint)

**Files:**
- Create: `webui/_preview_admin_settings.html` (throwaway, same convention as `_preview_ai_verify.html`)

The user is not a UI developer — they pick layouts visually, never from text descriptions.

- [ ] **Step 1: Build the preview page**

A static HTML page (no Alpine, links `styles.css`, hardcoded sample data, `html[data-theme="dark"]`, `dir="rtl"`) showing the Settings page twice, labeled **خيار أ** and **خيار ب**:
- **Option A — stacked cards:** the admin banner with tabs (التحقق ▸ الإعدادات active), then two full-width cards: "الأحداث العامة" (the existing events list layout) and below it "إشعارات البريد" (toggle, sender, password field with •••• placeholder, recipients list with ✕ remove buttons + add row, "إرسال رسالة تجريبية" button).
- **Option B — side navigation:** same banner; below it a two-column layout — narrow right column with section links (الأحداث العامة / إشعارات البريد), wide left column showing the active section card.
Reuse existing classes (`.bg-paper`, `.btn`, `.btn-primary`, `.input`, `.field-label`, `.admin-banner`) so both options look native. Build the cards concretely by copying real markup: the events card from `webui/index.html:968-1033` (statically, sample values instead of Alpine bindings) and the email card from this plan's **Task 7 Step 4** markup (same static treatment). The only new composition is Option B's two-column shell: a `display:grid; grid-template-columns: 220px 1fr; gap: 28px` wrapper with the section links in the narrow column.

- [ ] **Step 2: Serve and let the user choose**

Run: `python scripts\admin_server.py`, open `http://localhost:8000/webui/_preview_admin_settings.html`.
**STOP — ask the user: "Which option, أ or ب?"** Record the answer; Task 7 implements the chosen layout (its steps are written for Option A stacked cards — if the user picks B, wrap the two section cards in the two-column shell shown in the preview instead; everything else is identical).

- [ ] **Step 3: Commit the preview (ask "Ready to commit?" first)**

```
git add webui/_preview_admin_settings.html
git commit -m "chore(webui): admin settings layout preview (user selection page)"
```

---

### Task 7: Web UI — admin split (People / Settings) + email section

**Files:**
- Modify: `webui/index.html` (banner → shared section with tabs; move events block; new settings section)
- Modify: `webui/app.js` (state + methods + `goto` gating)
- Modify: `webui/admin-edit.js` (three API wrappers)
- Modify: `webui/styles.css` (tab styles)

**Interfaces:**
- Consumes: Task 5 endpoints via `AQMAR_API`.
- Produces: view value `'admin-settings'`; Alpine members `isAdminView` (getter), `notifySettings`, `notifyLoading`, `notifySaving`, `notifyError`, `notifyTestState`, `newRecipient`, `loadNotifySettings()`, `saveNotifySettings()`, `addRecipient()`, `removeRecipient(i)`, `sendTestEmail()`; globals `getNotifySettingsViaApi()`, `saveNotifySettingsViaApi(body)`, `sendTestEmailViaApi()`.

- [ ] **Step 1: admin-edit.js — add API wrappers**

After `saveSettingsViaApi`, before the exports:

```javascript
  // --- Email notification settings (local notify_settings.json) ---
  async function getNotifySettingsViaApi() {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.get("/notify-settings");
  }
  async function saveNotifySettingsViaApi(body) {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.put("/notify-settings", body);
  }
  async function sendTestEmailViaApi() {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.post("/notify-test");
  }
```

and add to the export block:

```javascript
  global.getNotifySettingsViaApi = getNotifySettingsViaApi;
  global.saveNotifySettingsViaApi = saveNotifySettingsViaApi;
  global.sendTestEmailViaApi = sendTestEmailViaApi;
```

- [ ] **Step 2: app.js — state, getter, gating, methods**

In the state object after `eventSaving: false,` add:

```javascript
    // ----- email notification settings (admin Settings page) -----
    notifySettings: null,   // masked dict from GET /api/notify-settings
    notifyLoading: false,
    notifySaving: false,
    notifyError: '',
    notifyTestState: '',    // '' | 'sending' | 'ok' | error message
    newRecipient: '',
```

Add a computed next to `adminAllowed`:

```javascript
    get isAdminView() {
      return this.view === 'admin' || this.view === 'admin-settings';
    },
```

In `goto(v)` change the admin gate line to:

```javascript
      if ((v === 'admin' || v === 'admin-settings') && !this.adminAllowed) v = 'home';
```

and at the end of `goto`, load lazily:

```javascript
      if (v === 'admin-settings' && !this.notifySettings) this.loadNotifySettings();
```

After `_putEvents` add the methods:

```javascript
    // ---- Email notification settings (admin Settings page) ----
    async loadNotifySettings() {
      this.notifyLoading = true;
      this.notifyError = '';
      try {
        this.notifySettings = await getNotifySettingsViaApi();
        this.notifySettings.app_password = '';   // write-only field
      } catch (e) {
        this.notifyError = e.message || 'Load failed';
      } finally {
        this.notifyLoading = false;
      }
    },
    addRecipient() {
      const v = this.newRecipient.trim();
      if (!v) return;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        this.notifyError = this.lang === 'ar' ? 'بريد غير صالح' : 'Invalid email';
        return;
      }
      if (!this.notifySettings.recipients.includes(v)) this.notifySettings.recipients.push(v);
      this.newRecipient = '';
      this.notifyError = '';
    },
    removeRecipient(i) {
      this.notifySettings.recipients.splice(i, 1);
    },
    async saveNotifySettings() {
      if (!this.notifySettings || this.notifySaving) return;
      this.notifySaving = true;
      this.notifyError = '';
      try {
        const s = this.notifySettings;
        const saved = await saveNotifySettingsViaApi({
          version: s.version, enabled: s.enabled,
          sender_email: s.sender_email,
          app_password: s.app_password || '',   // blank keeps stored
          recipients: s.recipients,
        });
        this.notifySettings = saved;            // server truth (masked)
        this.notifySettings.app_password = '';
      } catch (e) {
        this.notifyError = e.message || (this.lang === 'ar' ? 'فشل الحفظ' : 'Save failed');
      } finally {
        this.notifySaving = false;
      }
    },
    async sendTestEmail() {
      this.notifyTestState = 'sending';
      try {
        const r = await sendTestEmailViaApi();
        this.notifyTestState = r.ok ? 'ok' : (r.error || 'failed');
      } catch (e) {
        this.notifyTestState = e.message || 'failed';
      }
    },
```

- [ ] **Step 3: index.html — shared banner with tabs**

Cut the whole banner `<div class="admin-banner …">…</div>` (index.html:930-963) out of the admin section and paste it into a NEW sibling section placed immediately before `<section id="main-content-admin" …>`:

```html
  <!-- Shared admin banner + page tabs (People verify / Settings) -->
  <section x-show="isAdminView && isAdmin" :aria-hidden="!isAdminView"
           class="max-w-[1240px] mx-auto px-8 pt-8" x-cloak>
    <!-- [the moved banner div goes here unchanged] -->
    <div class="admin-tabs flex gap-2 mb-7">
      <button @click="goto('admin')" class="btn admin-tab"
              :class="view === 'admin' ? 'is-active' : ''"
              x-text="lang === 'ar' ? 'التحقق' : 'People verify'"></button>
      <button @click="goto('admin-settings')" class="btn admin-tab"
              :class="view === 'admin-settings' ? 'is-active' : ''"
              x-text="lang === 'ar' ? 'الإعدادات' : 'Settings'"></button>
    </div>
  </section>
```

Change the admin section's `pt-8` to `pt-0` (the banner section now owns the top padding).

- [ ] **Step 4: index.html — move events panel + add settings section**

Cut the entire events block (`<div x-show="!editingId" class="bg-paper …">` … its closing `</div>`, index.html:968-1033) out of the admin section. Create a new section AFTER the admin section, paste the events block inside it, and **remove `x-show="!editingId"` from the pasted block** (keep the class attribute):

```html
  <!-- ===================== ADMIN SETTINGS ===================== -->
  <section id="main-content-admin-settings"
           x-show="view === 'admin-settings' && isAdmin"
           :aria-hidden="view !== 'admin-settings'"
           class="max-w-[1240px] mx-auto px-8 pt-0 pb-20" x-cloak>

    <!-- [moved events block here, x-show removed] -->

    <!-- Email notifications (data/notify_settings.json — local only) -->
    <div class="bg-paper border border-divider rounded-lg mb-7" style="padding: 22px 26px;">
      <div class="font-latin-sans text-[11px] tracking-[0.2em] text-olive uppercase"
           x-text="lang === 'ar' ? 'إشعارات البريد' : 'Email notifications'"></div>
      <div class="font-body text-[13px] text-muted mt-1"
           x-text="lang === 'ar'
             ? 'ملخّص النشر الليلي يُرسل من حساب Gmail عبر كلمة مرور تطبيق. الإعدادات محلية على هذا الجهاز فقط ولا تُنشر أبداً.'
             : 'Nightly summary is sent from a Gmail account via an App Password. Stored on this PC only, never published.'"></div>

      <template x-if="notifyLoading"><div class="text-muted text-[14px] mt-4">…</div></template>

      <template x-if="notifySettings">
        <div class="mt-5">
          <label class="flex items-center gap-3 mb-5" style="cursor:pointer;">
            <input type="checkbox" x-model="notifySettings.enabled">
            <span class="font-body font-bold text-ink text-[15px]"
                  x-text="lang === 'ar' ? 'تفعيل الإرسال' : 'Enable sending'"></span>
          </label>

          <div class="grid-pair grid gap-x-6">
            <label class="block mb-4">
              <div class="field-label" x-text="lang === 'ar' ? 'بريد المرسِل (Gmail)' : 'Sender (Gmail)'"></div>
              <input class="input" dir="ltr" x-model="notifySettings.sender_email">
            </label>
            <label class="block mb-4">
              <div class="field-label"
                   x-text="(lang === 'ar' ? 'كلمة مرور التطبيق' : 'App Password')
                           + (notifySettings.has_password ? ' ✓' : '')"></div>
              <input class="input" dir="ltr" type="password" x-model="notifySettings.app_password"
                     :placeholder="notifySettings.has_password
                       ? '•••• •••• •••• ••••'
                       : (lang === 'ar' ? 'أدخل كلمة مرور التطبيق' : 'Enter app password')">
            </label>
          </div>

          <div class="field-label" x-text="lang === 'ar' ? 'المستلمون' : 'Recipients'"></div>
          <div class="flex flex-col mb-3">
            <template x-for="(r, i) in notifySettings.recipients" :key="r">
              <div class="flex items-center gap-3 py-2" style="border-bottom: 1px solid var(--divider);">
                <span class="font-latin-sans text-[14px] text-ink" dir="ltr" x-text="r"></span>
                <button @click="removeRecipient(i)" class="btn btn-ghost"
                        style="color: var(--crimson); margin-inline-start: auto;">✕</button>
              </div>
            </template>
          </div>
          <div class="flex items-center gap-3 mb-5 flex-wrap">
            <input class="input" dir="ltr" style="max-width: 320px;" x-model="newRecipient"
                   @keydown.enter="addRecipient()"
                   :placeholder="lang === 'ar' ? 'إضافة بريد…' : 'Add email…'">
            <button @click="addRecipient()" class="btn btn-ghost"
                    x-text="lang === 'ar' ? '+ إضافة' : '+ Add'"></button>
          </div>

          <div class="flex items-center gap-3 flex-wrap">
            <button @click="saveNotifySettings()" class="btn btn-primary" :disabled="notifySaving"
                    x-text="notifySaving ? '…' : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save settings')"></button>
            <button @click="sendTestEmail()" class="btn btn-ghost" :disabled="notifyTestState === 'sending'"
                    x-text="notifyTestState === 'sending' ? '…'
                            : (lang === 'ar' ? 'إرسال رسالة تجريبية' : 'Send test email')"></button>
            <span class="text-[13px]" style="color: var(--forest);"
                  x-show="notifyTestState === 'ok'"
                  x-text="lang === 'ar' ? 'وصلت الرسالة ✓' : 'Test sent ✓'"></span>
            <span class="text-[13px]" style="color: var(--crimson);"
                  x-show="notifyTestState && notifyTestState !== 'ok' && notifyTestState !== 'sending'"
                  x-text="notifyTestState"></span>
            <span class="text-[13px]" style="color: var(--crimson);" x-text="notifyError"></span>
          </div>
        </div>
      </template>
    </div>
  </section>
```

(If the user chose Option B in Task 6, wrap the two cards in the preview's two-column shell; card markup identical.)

- [ ] **Step 5: styles.css — tab styles (tokens only)**

Add near the admin styles:

```css
/* Admin page tabs (People verify / Settings) */
.admin-tab {
  border: 1px solid var(--divider);
  background: transparent;
  color: var(--muted);
}
.admin-tab.is-active {
  background: var(--paper);
  color: var(--ink);
  border-color: var(--forest);
}
```

- [ ] **Step 6: Manual browser verification**

Run `python scripts\admin_server.py`, open http://localhost:8000/, log in with the admin token, then check each and note results:
1. Banner shows tabs; التحقق shows the verify table; الإعدادات shows events + email cards; events editor add/edit/delete still works from its new home.
2. Email card: save sender/password/recipients → reload page → `has_password ✓`, password field empty (write-only), recipients persist.
3. Send test email → inline ✓ (real Gmail) or readable error.
4. Open a person for editing on التحقق — banner stays, settings unaffected.
5. Public site (no login / `.\scripts\serve.ps1`): no admin UI leaks; boot is not slowed (notify load happens only on entering Settings).
6. Confirm `git status` does NOT list `data/notify_settings.json`.

- [ ] **Step 7: Commit (ask "Ready to commit?" first)**

```
git add webui/index.html webui/app.js webui/admin-edit.js webui/styles.css
git commit -m "feat(webui): split admin into People/Settings pages with email notification settings"
```

---

### Task 8: Photo staging (`scripts/stage_photos.ps1`)

**Files:**
- Create: `scripts/stage_photos.ps1`

**Interfaces:**
- Produces: idempotent script staging exactly the `photo_path` files referenced by `data/martyrs.json`; `-DryRun` reports only. Consumed by Task 9.

- [ ] **Step 1: Implement (mirror `stage_covers.ps1` exactly, with `photo_path` and plain `git add`)**

```powershell
# scripts/stage_photos.ps1
#
# Stage exactly the portrait photos referenced by data/martyrs.json
# (photo_path values). data/photos/ is TRACKED (not ignored) but nothing
# ever staged new scraper photos — published rows pointed at untracked
# files and rendered broken images. Publish flows call this so every
# referenced photo ships. Idempotent; plain `git add` (no -f needed).
#
# Usage:  .\scripts\stage_photos.ps1 [-DryRun]

param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $projectRoot
try {
    $jsonPath = Join-Path $projectRoot "data\martyrs.json"
    if (-not (Test-Path $jsonPath)) {
        Write-Error "data/martyrs.json not found - run the export first."
    }

    $data = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $photos = @(
        $data.martyrs |
        ForEach-Object { $_.photo_path } |
        Where-Object { $_ } |
        ForEach-Object { $_ -replace '\\', '/' } |
        Select-Object -Unique
    )

    if ($photos.Count -eq 0) {
        Write-Host "No photo_path values in data/martyrs.json - nothing to stage."
        return
    }

    $present = @($photos | Where-Object { Test-Path $_ })
    $missing = @($photos | Where-Object { -not (Test-Path $_) })

    Write-Host ("Photos referenced by martyrs.json: {0}" -f $photos.Count)
    Write-Host ("  present on disk: {0}" -f $present.Count)
    if ($missing.Count -gt 0) {
        $sample = ($missing | Select-Object -First 5) -join ', '
        Write-Warning ("  MISSING on disk: {0} (skipped) - e.g. {1}" -f $missing.Count, $sample)
    }

    if ($DryRun) {
        Write-Host "(dry run: nothing staged)"
        return
    }
    if ($present.Count -eq 0) {
        Write-Error "None of the referenced photos exist on disk - aborting."
    }

    $chunkSize = 100
    for ($i = 0; $i -lt $present.Count; $i += $chunkSize) {
        $end = [Math]::Min($i + $chunkSize - 1, $present.Count - 1)
        $chunk = $present[$i..$end]
        & git add -- $chunk
        if ($LASTEXITCODE -ne 0) {
            Write-Error "git add failed on chunk starting at index $i"
        }
    }
    Write-Host ("Staged {0} photo(s)." -f $present.Count)
}
finally {
    Pop-Location
}
```

- [ ] **Step 2: Verify with dry run only (no git mutation)**

Run: `.\scripts\stage_photos.ps1 -DryRun`
Expected: reports ~814 referenced photos, lists any missing (e.g. it will name the currently-untracked `data/photos/1780.jpg`), and stages **nothing**.
Do NOT run it without `-DryRun` here — a real `git add` is an unapproved index mutation (violates the git rule). The publish flow (Task 9) stages for real, inside the approved publish path. If you want to prove the real add works, first ask the user "OK to run stage_photos for real (it runs git add)?" and, on yes, run it then `git reset` to unstage.

- [ ] **Step 3: Commit (ask "Ready to commit?" first)**

```
git add scripts/stage_photos.ps1
git commit -m "feat(publish): stage referenced portrait photos (fixes broken published images)"
```

---

### Task 9: Two-repo publish core (`publish_core.ps1`, site sync, `publish.ps1` rewrite)

**Files:**
- Create: `scripts/publish_core.ps1`
- Create: `scripts/sync_site_repo.ps1`
- Create: `scripts/site_repo/deploy-pages.yml`
- Create: `scripts/site_repo/README.md`
- Rewrite: `scripts/publish.ps1`
- Modify: `.env.example` (document `SITE_REPO_URL`, `SITE_REPO_DIR`)

**Interfaces:**
- Consumes: `publish_check.py` (Task 4), `stage_covers.ps1`, `stage_photos.ps1` (Task 8), `export_to_json.py`.
- Produces: `publish_core.ps1 -Note <str> [-DryRun]` → runs check → export → local stage/commit → private push → site sync/push; writes `logs\publish_result.json` = `{"published":bool,"version":N|null}` that Task 10 reads (NOT stdout — see the result-file note in the code). `sync_site_repo.ps1 -CheckJson <path> -CommitMessage <str> [-DryRun] [-NoPush] [-Bootstrap]` syncs + commits + pushes the site clone; `-Bootstrap` skips the fetch/reset clone-management (used once by Task 12 against a caller-prepared orphan branch). `.env` keys `SITE_REPO_URL` (default `https://github.com/mohamedkhamis/AQMAR.git`) and `SITE_REPO_DIR` (default `..\AQMAR-site`; a relative value is resolved against the repo root).

- [ ] **Step 1: `scripts/site_repo/deploy-pages.yml`** — copy of the current `.github/workflows/deploy-pages.yml` with the "Stage site" comment updated to say the whole tree is the site (keep `git archive HEAD` staging — it still guards against node_modules). No other changes.

- [ ] **Step 2: `scripts/site_repo/README.md`**

```markdown
# أقمار الطوفان — سجلّ الشهداء

Static memorial site for شهداء كتائب القسام في معركة طوفان الأقصى,
mirroring the public Telegram channel [@AqmarTofan](https://t.me/AqmarTofan).

- Live: https://aqmar.pages.dev (also served via GitHub Pages)
- This repository contains ONLY the published site files (web UI + JSON
  snapshot + published images). It is generated and pushed automatically
  by a local pipeline; issues and PRs here are not monitored.
```

- [ ] **Step 3: Implement `scripts/sync_site_repo.ps1`**

```powershell
# scripts/sync_site_repo.ps1
#
# Mirror the published site files from this working tree into the public
# site repo clone (SITE_REPO_DIR), commit and push. The public repo IS the
# site: webui + root entry files + martyrs.json/settings.json + ONLY the
# photos/covers referenced by the published JSON (unpublished people's
# files must never leak). Clone recreated / hard-reset as needed — it
# holds no unique state.
#
# Usage: .\scripts\sync_site_repo.ps1 -CheckJson logs\publish_check.json `
#            -CommitMessage "publish v16: nightly auto" [-DryRun] [-NoPush]

param(
    [Parameter(Mandatory=$true)][string]$CheckJson,
    [Parameter(Mandatory=$true)][string]$CommitMessage,
    [switch]$DryRun,
    [switch]$NoPush,
    [switch]$Bootstrap   # first-time: caller prepared an orphan branch; skip fetch/reset
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path

# --- read SITE_REPO_URL / SITE_REPO_DIR from .env (defaults if absent) ---
$siteUrl = "https://github.com/mohamedkhamis/AQMAR.git"
$siteDir = Join-Path (Split-Path -Parent $repo) "AQMAR-site"
$envFile = Join-Path $repo ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*SITE_REPO_URL\s*=\s*(.+)$') { $siteUrl = $Matches[1].Trim() }
        if ($line -match '^\s*SITE_REPO_DIR\s*=\s*(.+)$') { $siteDir = $Matches[1].Trim() }
    }
}
# A relative SITE_REPO_DIR must resolve against the repo root, NOT the
# caller's CWD (publish_core Push-Locations to $repo, but be defensive).
if (-not [System.IO.Path]::IsPathRooted($siteDir)) {
    $siteDir = Join-Path $repo $siteDir
}

$check = Get-Content (Join-Path $repo $CheckJson) -Raw -Encoding UTF8 | ConvertFrom-Json

# Dry run must touch NOTHING (no clone, no fetch) - return before any git.
if ($DryRun) {
    Write-Host ("(dry run) would sync {0} photos, {1} frames, webui/, JSON into {2}" -f `
        $check.referenced_photos.Count, $check.referenced_frames.Count, $siteDir)
    return
}

# --- ensure a clean clone (skipped in -Bootstrap: caller owns the branch) ---
if ($Bootstrap) {
    if (-not (Test-Path (Join-Path $siteDir ".git"))) {
        Write-Error "-Bootstrap requires an already-initialized $siteDir (git init + branch -m master)."
    }
    Write-Host "Bootstrap mode: using caller-prepared orphan branch, skipping fetch/reset."
} elseif (-not (Test-Path (Join-Path $siteDir ".git"))) {
    Write-Host "Site clone missing - cloning $siteUrl -> $siteDir"
    git clone $siteUrl $siteDir
    if ($LASTEXITCODE -ne 0) { Write-Error "git clone failed" }
} else {
    git -C $siteDir fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Error "git fetch failed in site clone" }
    git -C $siteDir reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Error "git reset failed in site clone" }
    git -C $siteDir clean -fd
}

# --- copy roots + webui (mirror deletes removed webui files) ---
Copy-Item (Join-Path $repo "index.html") $siteDir -Force
Copy-Item (Join-Path $repo "sw.js") $siteDir -Force
robocopy (Join-Path $repo "webui") (Join-Path $siteDir "webui") /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy webui failed ($LASTEXITCODE)" }
New-Item -ItemType Directory -Force (Join-Path $siteDir "data") | Out-Null
Copy-Item (Join-Path $repo "data\martyrs.json") (Join-Path $siteDir "data\martyrs.json") -Force
Copy-Item (Join-Path $repo "data\settings.json") (Join-Path $siteDir "data\settings.json") -Force

# --- deploy workflow + README templates ---
New-Item -ItemType Directory -Force (Join-Path $siteDir ".github\workflows") | Out-Null
Copy-Item (Join-Path $repo "scripts\site_repo\deploy-pages.yml") (Join-Path $siteDir ".github\workflows\deploy-pages.yml") -Force
Copy-Item (Join-Path $repo "scripts\site_repo\README.md") (Join-Path $siteDir "README.md") -Force

# --- photos + frames: exactly the referenced files, pruning extras ---
function Sync-Referenced([string[]]$relPaths, [string]$siteSubdir) {
    $destRoot = Join-Path $siteDir $siteSubdir
    New-Item -ItemType Directory -Force $destRoot | Out-Null
    $want = @{}
    foreach ($rel in $relPaths) {
        $win = $rel -replace '/', '\'
        $src = Join-Path $repo $win
        $dst = Join-Path $siteDir $win
        $want[(Split-Path $win -Leaf)] = $true
        if (Test-Path $src) {
            New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
            Copy-Item $src $dst -Force
        } else {
            Write-Warning "referenced file missing on disk: $rel"
        }
    }
    Get-ChildItem $destRoot -File -Recurse | ForEach-Object {
        if (-not $want.ContainsKey($_.Name)) { Remove-Item $_.FullName -Force }
    }
}
Sync-Referenced $check.referenced_photos "data\photos"
Sync-Referenced $check.referenced_frames "data\frames"

# --- commit + push ---
git -C $siteDir add -A
$dirty = git -C $siteDir status --porcelain
if (-not $dirty) {
    Write-Host "Site clone unchanged - nothing to push."
    return
}
git -C $siteDir commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { Write-Error "site commit failed" }
if ($NoPush) {
    Write-Host "(-NoPush) site commit created, not pushed."
    return
}
git -C $siteDir push origin master
if ($LASTEXITCODE -ne 0) { Write-Error "site push failed" }
Write-Host "Site repo pushed: $CommitMessage"
```

- [ ] **Step 4: Implement `scripts/publish_core.ps1`**

```powershell
# scripts/publish_core.ps1
#
# The deterministic publish used by BOTH the nightly task and manual
# publish.ps1:
#   1. staged-index guard (never sweep unrelated staged work)
#   2. baseline = HEAD data/martyrs.json; publish_check.py (no version burn)
#   3. if changed: export + stage covers/photos/JSON + local commit
#   4. ALWAYS: push local master -> origin (private backup)
#   5. if changed: sync + push the public site repo
# Writes: logs\publish_result.json = {"published":bool,"version":N|null}
#   (plus a human-readable PUBLISH_RESULT log line)
#
# Usage: .\scripts\publish_core.ps1 [-Note "..."] [-DryRun]

param(
    [string]$Note = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$py = Join-Path $repo ".venv\Scripts\python.exe"
$env:PYTHONIOENCODING = "utf-8"
Push-Location $repo
try {
    # 1. guard: nothing may be pre-staged
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Index is not clean (something is already staged) - aborting so the publish commit can't sweep it in."
    }

    # 2. baseline + change check (no publish version consumed)
    New-Item -ItemType Directory -Force (Join-Path $repo "logs") | Out-Null
    $baseline = "logs\nightly_baseline.json"
    cmd /c "git show HEAD:data/martyrs.json > $baseline 2>nul"
    $checkJson = "logs\publish_check.json"
    & $py scripts\publish_check.py --baseline $baseline --json $checkJson
    if ($LASTEXITCODE -ne 0) { Write-Error "publish_check.py failed" }
    $check = Get-Content $checkJson -Raw -Encoding UTF8 | ConvertFrom-Json

    $version = $null
    $published = $false

    if (-not $check.changed) {
        Write-Host "No data changes since last publish - skipping export/commit."
    } elseif ($DryRun) {
        Write-Host ("(dry run) WOULD publish: {0} new, photos {1}, frames {2}" -f `
            $check.new_count, $check.referenced_photos.Count, $check.referenced_frames.Count)
    } else {
        # 3. export + stage + commit
        $noteArg = @()
        if ($Note) { $noteArg = @("--note", $Note) }
        & $py scripts\export_to_json.py @noteArg
        if ($LASTEXITCODE -ne 0) { Write-Error "export failed" }
        # Native python: check exit AND null before calling .Trim() (a null
        # would throw a confusing 'method on null' and mask the real error).
        $version = & $py -c "import json; print(json.load(open('data/martyrs.json',encoding='utf-8'))['version'])"
        if ($LASTEXITCODE -ne 0 -or -not $version) { Write-Error "could not read version after export" }
        $version = "$version".Trim()

        # stage_covers/stage_photos set $ErrorActionPreference=Stop + Write-Error
        # internally, so a failure THROWS and propagates here (caught by the
        # caller). Do NOT test $LASTEXITCODE after them - it holds the inner
        # git's code, a misleading stale value.
        & (Join-Path $PSScriptRoot "stage_covers.ps1")
        & (Join-Path $PSScriptRoot "stage_photos.ps1")
        git add data/martyrs.json
        if ($LASTEXITCODE -ne 0) { Write-Error "git add martyrs.json failed" }
        git add data/settings.json
        if ($LASTEXITCODE -ne 0) { Write-Error "git add settings.json failed" }

        $msg = "publish v${version}"
        if ($Note) { $msg = "publish v${version}: $Note" }
        git commit -m $msg
        if ($LASTEXITCODE -ne 0) { Write-Error "local publish commit failed" }
        $published = $true
    }

    # 4. private backup push (every run, even unchanged)
    if ($DryRun) {
        Write-Host "(dry run) would push origin master (private backup)"
    } else {
        git push origin master
        if ($LASTEXITCODE -ne 0) { Write-Error "backup push to origin failed" }
    }

    # 5. site sync + public push (only when something was published)
    if ($published -or $DryRun) {
        $msg2 = "publish v${version}"
        if ($Note) { $msg2 = "publish v${version}: $Note" }
        $syncArgs = @("-CheckJson", $checkJson, "-CommitMessage", $msg2)
        if ($DryRun) { $syncArgs += "-DryRun" }
        # sync_site_repo.ps1 throws (Stop + Write-Error) on any failure, which
        # propagates here — no $LASTEXITCODE guard (it would read a stale value).
        & (Join-Path $PSScriptRoot "sync_site_repo.ps1") @syncArgs
    }

    # Hand the result to the orchestrator via a FILE, not stdout. Write-Host
    # goes to the PS 5.1 information stream (6) which the caller's capture
    # never sees, and 2>&1-capturing the child would risk NativeCommandError
    # on git's stderr under Stop. A file sidesteps both.
    $verNum = $null
    if ($version) { $verNum = [int]$version }
    @{ published = [bool]$published; version = $verNum } |
        ConvertTo-Json -Compress |
        Set-Content -Path (Join-Path $repo "logs\publish_result.json") -Encoding utf8
    Write-Host ("PUBLISH_RESULT: published=$published version=$version")   # human-readable log line
}
finally {
    Pop-Location
}
```

- [ ] **Step 5: Rewrite `scripts/publish.ps1` as the manual wrapper**

Replace the whole file body (keep the header comment style):

```powershell
# scripts/publish.ps1
#
# Manual one-command publish — thin wrapper over publish_core.ps1
# (export -> local commit -> private backup push -> public site push).
# The nightly task runs the same core plus AI-verify + email.
#
# Usage:
#   .\scripts\publish.ps1                     # publish with no note
#   .\scripts\publish.ps1 -Note "weekly cut"  # publish with a note
#   .\scripts\publish.ps1 -DryRun             # show what would happen

param(
    [string]$Note = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$coreArgs = @()
if ($Note)   { $coreArgs += @("-Note", $Note) }
if ($DryRun) { $coreArgs += "-DryRun" }
& (Join-Path $PSScriptRoot "publish_core.ps1") @coreArgs
```

- [ ] **Step 6: Document the new `.env` keys in `.env.example`**

```
# --- two-repo publishing (nightly automation) ---
# Public site repo (receives ONLY site files) + local clone location.
SITE_REPO_URL=https://github.com/mohamedkhamis/AQMAR.git
SITE_REPO_DIR=..\AQMAR-site
```

- [ ] **Step 7: Verify with dry run only**

Run: `.\scripts\publish_core.ps1 -DryRun`
Expected: change check runs, "(dry run) WOULD publish…" or "No data changes…", "(dry run) would push origin", site sync dry-run line, final `PUBLISH_RESULT:` line. **No git state changes** (`git status` unchanged). Do NOT run a real publish — the remotes aren't migrated yet (Task 12).

- [ ] **Step 8: Commit (ask "Ready to commit?" first)**

```
git add scripts/publish_core.ps1 scripts/sync_site_repo.ps1 scripts/site_repo/ scripts/publish.ps1 .env.example
git commit -m "feat(publish): two-repo publish core (private backup + filtered public site sync)"
```

---

### Task 10: Nightly orchestrator (`nightly_verify_publish.ps1` + `ai_mk_args.py`)

**Files:**
- Create: `scripts/ai_mk_args.py` (tracked replacement for the gitignored `data/ai_batches/_mk_args.py`)
- Create: `scripts/nightly_verify_publish.ps1`

**Interfaces:**
- Consumes: `ai_verify.py pending/apply`, `claude` CLI, `publish_check.py --since` (note counts), `publish_core.ps1` (Task 9, reads its `logs\publish_result.json`), `nightly_report.py` (Task 4).
- Produces: `nightly_verify_publish.ps1 [-DryRun] [-SkipVerify]`; log `logs\nightly_publish.log` (written by the scheduled VBS wrapper's `cmd` redirection; interactive runs print to console); lock `logs\nightly_publish.lock`; exit 0 clean / 1 guard-fail / 2 publish-fail / 3 email-fail.
- `ai_mk_args.py pending.json args.json` → `{"rows":[{"msg_id":N,"frames":[...],"photo":str|null}]}` excluding msg_ids in `data/ai_batches/noted_ids.json`.

- [ ] **Step 1: Implement `scripts/ai_mk_args.py`**

```python
# scripts/ai_mk_args.py
"""Build the headless-verify work list from an ai_verify.py pending dump.

Filters out rows already noted needs-human (data/ai_batches/noted_ids.json)
so the nightly agent never re-reads them. Tracked twin of the ad-hoc
data/ai_batches/_mk_args.py used by ai_verify_daily.ps1.

Usage: .venv\\Scripts\\python.exe scripts\\ai_mk_args.py data\\ai_batches\\pending_nightly.json data\\ai_batches\\args_nightly.json
"""
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
NOTED = _ROOT / "data" / "ai_batches" / "noted_ids.json"


def main() -> int:
    pending_path, args_path = Path(sys.argv[1]), Path(sys.argv[2])
    pending = json.loads(pending_path.read_text(encoding="utf-8"))
    noted = set()
    if NOTED.exists():
        noted = set(json.loads(NOTED.read_text(encoding="utf-8")))
    rows = [
        {"msg_id": r["msg_id"], "frames": r.get("frame_paths") or [],
         "photo": r.get("photo_path")}
        for r in pending.get("rows", [])
        if r["msg_id"] not in noted
    ]
    args_path.parent.mkdir(parents=True, exist_ok=True)
    args_path.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=1),
                         encoding="utf-8")
    print(f"{len(rows)} row(s) to verify ({len(pending.get('rows', [])) - len(rows)} noted, skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Implement `scripts/nightly_verify_publish.ps1`**

```powershell
# scripts/nightly_verify_publish.ps1
#
# The 22:30 nightly task: AI-verify pending rows (headless Claude, verify
# ONLY - git stays script-side), publish via publish_core.ps1 (local commit
# -> private backup push -> public site push), then email the summary
# (nightly_report.py: new people / stuck rows / errors only).
#
# Runs hidden via scripts\_run_nightly_silent.vbs (Task Scheduler), which
# redirects all output to logs\nightly_publish.log. Direct runs print to console.
#
# Usage: .\scripts\nightly_verify_publish.ps1 [-DryRun] [-SkipVerify]
#   -DryRun     verify runs; publish + email only print what they would do
#   -SkipVerify skip the Claude phase (publish + report only)

param(
    [switch]$DryRun,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo
$env:PYTHONIOENCODING = "utf-8"
# PS 5.1's $OutputEncoding defaults to ASCII, which mangles the Arabic label
# names in the verify prompt to '?' when piped to the native `claude`. Force
# UTF-8 (no BOM) so the prompt reaches Claude intact.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$py = Join-Path $repo ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force (Join-Path $repo "logs") | Out-Null
# NOTE: logging is handled by the scheduled wrapper (_run_nightly_silent.vbs
# runs `cmd /c powershell ... >> logs\nightly_publish.log 2>&1`), which
# captures native python/git output that Start-Transcript would silently drop
# in a hidden window. Direct/interactive runs print to the console.
Write-Host "=== AQMAR nightly run $(Get-Date -Format u) ==="

$lock = Join-Path $repo "logs\nightly_publish.lock"
$lockAcquired = $false   # only delete the lock WE created (never another run's)
$runStart = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$errors = @()          # each: "stage:detail" for nightly_report.py --error
$exitCode = 0

try {
    # ---------- Phase 0: guards ----------
    if (Test-Path $lock) {
        $age = (Get-Date) - (Get-Item $lock).LastWriteTime
        if ($age.TotalHours -lt 6) {
            Write-Host "Another nightly run appears active (lock age $([int]$age.TotalMinutes)m) - exiting."
            $exitCode = 1
            return
        }
        Write-Host "Stale lock ($([int]$age.TotalHours)h) - taking over."
    }
    $runStart | Set-Content $lock
    $lockAcquired = $true

    if (-not (Test-Path $py)) { throw "venv python missing: $py" }
    if (-not (Test-Path (Join-Path $repo ".env"))) { throw ".env missing" }

    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "Index not clean (something already staged) - refusing to run."
    }

    & $py -c "from src.config import load_config; from src.sqlserver_client import make_conn; make_conn(load_config()).close(); print('DB OK')"
    if ($LASTEXITCODE -ne 0) { throw "DB connection check failed" }

    # Baseline BEFORE anything changes (publish_core rewrites it identically).
    cmd /c "git show HEAD:data/martyrs.json > logs\nightly_baseline.json 2>nul"

    # ---------- Phase 1: AI verify (headless Claude, verify only) ----------
    if (-not $SkipVerify) {
        $claudeOk = (Get-Command claude -ErrorAction SilentlyContinue)
        if (-not $claudeOk) {
            Write-Host "claude CLI not found - skipping verify phase."
            $errors += "verify:claude CLI not found on PATH"
        } else {
            $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
            for ($pass = 1; $pass -le 3; $pass++) {
                $pendingJson = "data\ai_batches\pending_nightly.json"
                $argsJson    = "data\ai_batches\args_nightly.json"
                $results     = "data\ai_batches\results_nightly_${stamp}_p$pass.json"

                & $py scripts\ai_verify.py pending --limit 100 --json $pendingJson
                if ($LASTEXITCODE -ne 0) { $errors += "verify:pending pull failed (pass $pass)"; break }
                & $py scripts\ai_mk_args.py $pendingJson $argsJson
                if ($LASTEXITCODE -ne 0) { $errors += "verify:ai_mk_args failed (pass $pass)"; break }

                $count = & $py -c "import json; print(len(json.load(open(r'$argsJson',encoding='utf-8'))['rows']))"
                if ([int]$count -eq 0) {
                    Write-Host "Pass ${pass}: nothing verifiable left (only noted rows or empty queue)."
                    break
                }
                Write-Host "Pass ${pass}: $count row(s) - launching headless Claude..."

                $prompt = @"
You are running the AQMAR NIGHTLY AI date-verification cycle (repo: $repo).
Work list: $argsJson (msg_id + "frames" image paths + optional "photo";
rows already noted needs-human are excluded). Current DB values are in
$pendingJson (birth_date / martyrdom_date per msg_id).

FOR EACH row in the work list:
1. Read the MIDDLE frame image with the Read tool, then Read ONE other frame
   and confirm the digits agree (single-frame photo posts: read carefully once).
2. Read the dates printed next to the yellow labels:
   - birth.....: "تاريخ الميلاد" / "تاريخ الولادة"
   - martyrdom.: "تاريخ الشهادة" / "تاريخ الاستشهاد"
   Numeric rule (validated on 550+ cards): the MONTH is ALWAYS the middle
   group; the DAY is the outer group on the OPPOSITE side from the 4-digit
   year. "03 - 10 - 1994" -> 1994-10-03; "1994 - 10 - 03" -> 1994-10-03.
   The poster (photo) prints DD-MM-YYYY while the card prints YYYY-MM-DD -
   use the poster to break fully-ambiguous swaps where both tokens <= 12.
   A bare year is NOT a date.
3. Compare with the DB values and decide:
   - card matches DB              -> verified true, note "match (card: .. / ..)"
   - card differs from DB         -> fix to the card (include the date field in
                                     the result), note "fixed[ swap]: <field>
                                     old -> new (card: ..)"
   - DB NULL, card has a date     -> fill it, note "filled <field> from card .."
   - card has no <field>, DB NULL -> verified true, note "card has no <field> date"
   - card has no <field>, DB set  -> verified FALSE, note it (needs human)
   - card vs poster CONFLICT on a date        -> verified FALSE, note
     "conflict card .. vs poster .. (needs human)" - NEVER guess
   - month-name + year with NO day (e.g. "مايو - 2025") -> verified FALSE,
     note "day-less date on card: <what it prints> (needs human)" - the
     admin decides the day; do NOT invent day 15
   - no memorial card in any frame (ops video / speech / nasheed) ->
     verified FALSE, note "not a martyr post" (needs human)
   - the card ITSELF prints an impossible date -> verified FALSE, note it
4. COVER FRAME: for verified-true rows pick featured_frame_path = the
   sharpest fully-rendered frame showing the whole card (portrait + both
   dates + name clean, no animated title overlay). It is almost always the
   _28 frame; _32 is the transition frame. The value MUST be one of that
   row's own "frames" paths. Omit it if no frame qualifies.
5. SANITY before writing: martyrdom within 2023-10 .. today+1month; age 15-70.
   If a reading fails sanity, re-read; if the card really prints it,
   verified FALSE. If still unsure after re-reading, SKIP the row entirely.

THEN:
6. Write $results as {"results":[{"msg_id":N,
     "birth_date":"yyyy-mm-dd" (only when fixing/filling),
     "martyrdom_date":"yyyy-mm-dd" (only when fixing/filling),
     "verified":true|false,
     "featured_frame_path":"data/frames/..." (verified-true rows, when a
       clean frame exists),
     "note":"..." (<=255 chars, English, include the card reading)}]}
   - one entry per PROCESSED row (skipped rows omitted).
7. Apply it:  .venv\Scripts\python.exe scripts\ai_verify.py apply $results
8. For every verified-FALSE row, add its msg_id to
   data/ai_batches/noted_ids.json (keep it a sorted JSON array).
9. Append one section to docs/ai-verify-daily-log.md:
   "## $stamp nightly p$pass - N processed" plus a markdown table of every
   change (msg | field | was | now | card shows) and every needs-human row
   with its reason; list exact matches as one comma-separated msg_id line.

HARD RULES: touch ONLY birth_date/martyrdom_date/featured_frame_path via
scripts/ai_verify.py apply - never any other column or any file outside
data/ai_batches and docs/ai-verify-daily-log.md.
NEVER run git add/commit/push or any git state-changing command.
"@

                # Native claude call: relax Stop locally so claude writing
                # progress to stderr (merged by 2>&1) can't raise a terminating
                # NativeCommandError; capture the real exit code explicitly.
                # Output flows to stdout where the wrapper's cmd redirection logs it.
                $eap = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                $prompt | claude -p --output-format text `
                    --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(.venv*)" `
                    --disallowedTools "Bash(git*)" 2>&1
                $claudeExit = $LASTEXITCODE
                $ErrorActionPreference = $eap
                if ($claudeExit -ne 0) {
                    $errors += "verify:claude exited $claudeExit (pass $pass)"
                    break
                }
            }
        }
    }

    # ---------- Phase 2: publish (deterministic) ----------
    # Compose the spec's "nightly auto (X new, Y fixed)" note. A read-only
    # pre-check (no version consumed) gives both counts in one call; publish_core
    # re-checks internally for its own change decision.
    $noteText = "nightly auto"
    try {
        & $py scripts\publish_check.py --baseline logs\nightly_baseline.json `
            --since $runStart --json logs\precheck.json
        if ($LASTEXITCODE -eq 0 -and (Test-Path "logs\precheck.json")) {
            $pc = Get-Content "logs\precheck.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            $noteText = "nightly auto ($($pc.new_count) new, $($pc.fixed_count) fixed)"
        }
    } catch { $errors += "publish:precheck failed: $($_.Exception.Message)" }

    # publish_core uses Write-Error under $ErrorActionPreference=Stop, which
    # propagates here as a terminating exception — catch it so a publish failure
    # is a reported phase error, not a bare fatal. It hands its result back via
    # logs\publish_result.json (NOT stdout — Write-Host isn't capturable and
    # 2>&1 would risk NativeCommandError on git stderr), so we do NOT pipe-capture.
    Remove-Item "logs\publish_result.json" -Force -ErrorAction SilentlyContinue
    # HASHTABLE splat (binds by NAME). Array splat @("-Note",..) binds
    # POSITIONALLY to a .ps1 in PS 5.1 — "-DryRun" would land in $Note and a
    # dry run would become a real publish. (Fixed in Task 9's scripts too.)
    $coreArgs = @{ Note = $noteText }
    if ($DryRun) { $coreArgs["DryRun"] = $true }
    try {
        & (Join-Path $PSScriptRoot "publish_core.ps1") @coreArgs
        if (-not (Test-Path "logs\publish_result.json")) {
            $errors += "publish:publish_core produced no result file"
            $exitCode = 2
        }
    } catch {
        $errors += "publish:$($_.Exception.Message)"
        $exitCode = 2
    }

    # ---------- Phase 3: report + email ----------
    $repArgs = @("scripts\nightly_report.py",
                 "--baseline", "logs\nightly_baseline.json",
                 "--run-start", $runStart,
                 "--json", "logs\nightly_report.json")
    foreach ($e in $errors) { $repArgs += @("--error", $e) }
    if ($DryRun) { $repArgs += "--dry-run" }
    & $py @repArgs
    if ($LASTEXITCODE -eq 3) {
        Write-Host "EMAIL SEND FAILED - see log."
        if ($exitCode -eq 0) { $exitCode = 3 }
    }

    if ($errors.Count -gt 0 -and $exitCode -eq 0) { $exitCode = 2 }
    Write-Host "Nightly run finished $(Get-Date -Format u) (exit $exitCode, errors: $($errors.Count))"
}
catch {
    Write-Host "FATAL: $($_.Exception.Message)"
    # best-effort error email (never throws the run further). Honors -DryRun so a
    # fatal thrown during a dry run can't reach a real send.
    try {
        $fatalArgs = @("scripts\nightly_report.py",
                       "--baseline", "logs\nightly_baseline.json",
                       "--run-start", $runStart,
                       "--error", "fatal:$($_.Exception.Message)")
        if ($DryRun) { $fatalArgs += "--dry-run" }
        & $py @fatalArgs
    } catch {}
    $exitCode = 1
}
finally {
    if ($lockAcquired -and (Test-Path $lock)) {
        Remove-Item $lock -Force -ErrorAction SilentlyContinue
    }
    exit $exitCode
}
```

- [ ] **Step 3: Verify the pieces without side effects**

1. `.venv\Scripts\python.exe scripts\ai_verify.py pending --limit 5 --json data\ai_batches\pending_nightly.json` then `.venv\Scripts\python.exe scripts\ai_mk_args.py data\ai_batches\pending_nightly.json data\ai_batches\args_nightly.json` → prints counts; inspect the args file shape.
2. `.\scripts\nightly_verify_publish.ps1 -DryRun -SkipVerify` → transcript appears in `logs\nightly_publish.log`; guards pass; publish dry-run lines; report dry-run prints the JSON and `would send: True|False`; lock file removed afterwards; `git status` untouched.

- [ ] **Step 4: Commit (ask "Ready to commit?" first)**

```
git add scripts/ai_mk_args.py scripts/nightly_verify_publish.ps1
git commit -m "feat(nightly): orchestrator — guards, headless verify, publish, report+email"
```

---

### Task 11: Task registration (`setup_nightly_trigger.ps1`)

**Files:**
- Create: `scripts/setup_nightly_trigger.ps1`
- Modify: `.gitignore` (add `scripts/_run_nightly_silent.vbs` under the existing "Generated by scripts/setup_2hourly_trigger.ps1" comment block)

**Interfaces:**
- Produces: Task Scheduler task **`AqmarTofan Nightly Verify+Publish`** (daily 22:30, hidden via wscript) + generated `scripts\_run_nightly_silent.vbs`.

- [ ] **Step 1: Implement `scripts/setup_nightly_trigger.ps1`**

```powershell
# scripts/setup_nightly_trigger.ps1
#
# Register "AqmarTofan Nightly Verify+Publish": daily 22:30, runs
# scripts\nightly_verify_publish.ps1 HIDDEN (wscript launcher - no console
# window, so nothing can be killed by closing one; the wrapper redirects all
# output to logs\nightly_publish.log via `cmd /c ... >> log 2>&1`).
#
# Same schtasks pattern as setup_2hourly_trigger.ps1: /it (runs while the
# user is logged in - required: claude CLI + git creds live in this user's
# profile), /rl LIMITED, no UAC needed. Re-run any time; it deletes and
# recreates the task and REGENERATES the .vbs (don't hand-edit it).

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$taskName = "AqmarTofan Nightly Verify+Publish"
$vbs = Join-Path $repo "scripts\_run_nightly_silent.vbs"
$ps1 = Join-Path $repo "scripts\nightly_verify_publish.ps1"
$logPath = Join-Path $repo "logs\nightly_publish.log"

# The VBS runs powershell HIDDEN (window style 0), WAITS (bWaitOnReturn=True),
# and quits with powershell's exit code so Task Scheduler's Last Run Result
# reflects real failures — including an SMTP send failure, which by definition
# produces no email, making the exit code the only signal. It wraps the call in
# `cmd /c ... >> log 2>&1` so native python/git stdout+stderr are captured to
# the log (a hidden window has no console for Start-Transcript to scrape).
# q = Chr(34) (a double-quote) keeps the nested quoting legible.
$vbsBody = @"
' Generated by setup_nightly_trigger.ps1 - do not edit (machine-specific paths).
q = Chr(34)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$repo"
cmd = "cmd /c " & q & q & "powershell.exe" & q & " -NoProfile -ExecutionPolicy Bypass -File " & q & "$ps1" & q & " >> " & q & "$logPath" & q & " 2>&1" & q
code = sh.Run(cmd, 0, True)
WScript.Quit code
"@
Set-Content -Path $vbs -Value $vbsBody -Encoding ASCII
Write-Host "Wrote $vbs"

cmd /c "schtasks /delete /tn `"$taskName`" /f 2>nul"
schtasks /create /tn "$taskName" /sc DAILY /st 22:30 /it /rl LIMITED `
    /tr "wscript.exe \`"$vbs\`"" /f
if ($LASTEXITCODE -ne 0) { Write-Error "schtasks /create failed" }

Write-Host "Registered '$taskName' - daily 22:30, hidden."
schtasks /query /tn "$taskName" /v /fo LIST | Select-String -Pattern "Task To Run|Next Run Time|Schedule Type"
```

- [ ] **Step 2: Add the gitignore entry**

Under the existing `scripts/_run_phase3_silent.bat` comment block in `.gitignore`, add:

```
scripts/_run_nightly_silent.vbs
```

- [ ] **Step 3: Verify registration (safe — DO NOT let it fire yet)**

Run `.\scripts\setup_nightly_trigger.ps1` → prints task details, Next Run Time = today/tomorrow 22:30. Then **disable it until Task 13's supervised run**: `schtasks /change /tn "AqmarTofan Nightly Verify+Publish" /disable`. Confirm: `schtasks /query /tn "AqmarTofan Nightly Verify+Publish"` shows Disabled.

- [ ] **Step 4: Commit (ask "Ready to commit?" first)**

```
git add scripts/setup_nightly_trigger.ps1 .gitignore
git commit -m "feat(nightly): task registration — daily 22:30 hidden run"
```

---

### Task 12: Repo migration (INTERACTIVE — approval before every git/GitHub action)

**Files:**
- Delete (tracked): `.github/workflows/deploy-pages.yml` (the site copy comes from `scripts/site_repo/deploy-pages.yml`)
- Modify: `.gitignore` (remove no-op entries)
- External: new private GitHub repo `AQMAR-pipeline`; public `AQMAR` fresh-started; site clone `..\AQMAR-site`

Every step here is run WITH the user, each git/GitHub action approved individually. Order matters — the workflow must leave the local repo BEFORE the first push to the private remote (otherwise the private repo would run the Cloudflare deploy).

- [ ] **Step 1: Clean up `.gitignore` no-ops** — remove these lines (they never worked; the files are tracked on purpose): `scripts/ai_verify.py` (×2), `src/sqlserver_client.py` (×2), `src/field_normalizer.py`, `tests/test_field_normalizer.py`, `docs/superpowers/specs/2026-06-22-field-spelling-normalizer-design.md`, `docs/superpowers/specs/2026-07-15-field-canon-rank-battalion-design.md`, `docs/superpowers/plans/2026-07-15-field-canon-rank-battalion.md`.
- [ ] **Step 2: Remove the workflow from the pipeline repo**: `git rm .github/workflows/deploy-pages.yml`.
- [ ] **Step 3: Commit outstanding work** (with approval): the pre-existing dirty files (`scripts/ai_verify.py`, `src/field_canon.py`, both canon test files — the canon refactor) as their own commit, then the Step 1+2 changes as `chore(repo): prepare two-repo split (drop CF workflow from pipeline repo, gitignore cleanup)`.
- [ ] **Step 4: Create the private repo** (approval): `gh repo create AQMAR-pipeline --private --description "AQMAR pipeline (private backup)"` → verify `gh repo view mohamedkhamis/AQMAR-pipeline --json visibility` says `PRIVATE`.
- [ ] **Step 5: Re-point origin + first backup push** (approval): `git remote set-url origin https://github.com/mohamedkhamis/AQMAR-pipeline.git` → `git remote -v` shows the private URL → `git push -u origin master` → verify on github.com: full history present, repo private, no Actions runs.
- [ ] **Step 6: Build the site snapshot as a fresh single-commit history** (approval; the force-push REPLACES the public repo's history — the old commits containing code disappear from GitHub. State this to the user and get an explicit yes. Caveat to say once: anyone who cloned/forked earlier keeps their copy — the past can't be recalled):

```powershell
# fresh baseline + check json for the sync (read-only; no version consumed)
cmd /c "git show HEAD:data/martyrs.json > logs\nightly_baseline.json"
.venv\Scripts\python.exe scripts\publish_check.py --baseline logs\nightly_baseline.json --json logs\publish_check.json

# Create the site repo working tree with a SINGLE orphan commit (no code, no
# history). `branch -m master` renames the unborn default branch to master
# regardless of the machine's init.defaultBranch (main vs master).
Remove-Item -Recurse -Force ..\AQMAR-site -ErrorAction SilentlyContinue
git init ..\AQMAR-site
git -C ..\AQMAR-site branch -m master
git -C ..\AQMAR-site remote add origin https://github.com/mohamedkhamis/AQMAR.git

# -Bootstrap: sync copies site files into the empty orphan tree and makes the
# FIRST commit; it skips the fetch/reset clone-management (there is no upstream
# history to reset to, and we do not want the old code pulled in).
.\scripts\sync_site_repo.ps1 -CheckJson logs\publish_check.json `
    -CommitMessage "site snapshot (code moved to private pipeline repo)" -Bootstrap -NoPush

# Replace public master with the single-commit, code-free history.
git -C ..\AQMAR-site push --force origin master        # ← EXPLICIT approval (destructive)
```

  After this the public `AQMAR` repo has exactly one commit containing only site files; Step 7's checklist (code paths 404, single-commit history, both hosts still serve the site) is the acceptance gate. Subsequent nightly/manual publishes reuse this same `..\AQMAR-site` clone via the normal (non-Bootstrap) path.
- [ ] **Step 7: Verify the migration** (checklist from the spec):
  - github.com/mohamedkhamis/AQMAR → only site files, fresh history; Actions tab shows the Cloudflare deploy running (repo secrets survived) and it succeeds.
  - https://aqmar.pages.dev and https://mohamedkhamis.github.io/AQMAR/ → SPA loads, photos load **including previously-broken ones like `data/photos/1780.jpg`**, covers load, JSON loads.
  - `…/scripts/ai_verify.py`, `…/src/config.py`, `…/CLAUDE.md` → 404 on both hosts.
  - github.com/mohamedkhamis/AQMAR-pipeline → private, full history.
- [ ] **Step 8: Real end-to-end publish test** (approval): `.\scripts\publish.ps1 -Note "two-repo publish test"` → PUBLISH_RESULT line; site repo gets a `publish vN` commit only if data changed (likely "No data changes" — that's a pass too, backup push still runs).

---

### Task 13: Docs, registration, supervised live run

**Files:**
- Modify: `CLAUDE.md` (Commands table + Constraints: two-repo layout, nightly task, publish.ps1 now pushes both repos, correct the outdated "no auto-push" note)
- Modify: `progress.md` (dated entry summarizing the feature)
- Modify: `README.md` (publish flow section: two-repo diagram line)
- Delete: `webui/_preview_admin_settings.html` (served its purpose)
- Memory: update `projects/.../memory/` — `project_cloudflare_pages_deploy.md` (deploys now from the site repo), new `project_nightly_automation.md` (task names, log paths, two-repo layout, email rules), `MEMORY.md` index lines.

- [ ] **Step 1: Update CLAUDE.md / README.md / progress.md** — document: `AQMAR-pipeline` (private, origin) vs `AQMAR` (public site repo, synced clone at `..\AQMAR-site`); nightly task name + 22:30 + `logs\nightly_publish.log`; `publish.ps1` = manual wrapper that pushes BOTH repos (fix the stale "no auto-push" text); email settings live in admin → Settings (local file `data/notify_settings.json`, gitignored); 2-hourly scrape unchanged.
- [ ] **Step 2: Delete the preview page**, run full test suite one last time: `.venv\Scripts\python.exe -m pytest -q` → all green.
- [ ] **Step 3: Commit docs (ask "Ready to commit?" first)** — `git add CLAUDE.md README.md progress.md` + deleted preview; `git commit -m "docs: nightly automation + two-repo publishing"` → `git push origin master` (private backup; approval).
- [ ] **Step 4: User one-time email setup** — walk the user through: Google Account → Security → 2-Step Verification → App Passwords → create for "Mail"; paste into admin Settings → إشعارات البريد; **Send test email** → confirm it arrives at mohamed.khamis.alex@gmail.com; toggle **تفعيل الإرسال** on and Save.
- [ ] **Step 5: Supervised live run (direct)** — with the user watching, run the orchestrator directly (console output visible): `.\scripts\nightly_verify_publish.ps1` (no flags). Verify afterwards: pending queue drained or noted; publish happened iff data changed; both remotes updated (private always, public iff published); email received iff new people/stuck/errors; the process exit code is 0 (`$LASTEXITCODE`).
- [ ] **Step 6: Enable + verify the scheduled path** — `schtasks /change /tn "AqmarTofan Nightly Verify+Publish" /enable`; confirm Next Run Time shows 22:30. Then run it on demand once — `schtasks /run /tn "AqmarTofan Nightly Verify+Publish"` — and confirm: no console window appeared (hidden), `logs\nightly_publish.log` captured this run's native python/git output (proving the VBS `cmd` redirection works), and `schtasks /query /tn "AqmarTofan Nightly Verify+Publish" /v /fo LIST` shows Last Run Result 0x0 on success (the VBS propagates the real exit code, so a failed run would surface as non-zero).
- [ ] **Step 7: Save memory** — write the memory files from Step 0's list; confirm `MEMORY.md` updated.

---

## Self-Review Notes (kept for the executor)

- The spec's "no publish version consumed on no-change nights" is honored by `publish_check.py` running BEFORE `export_to_json.py` (publish_core Step 2 vs 3).
- The spec's "photos of unpublished people never leak" is honored twice: `stage_photos.ps1` stages only referenced photos (local repo), and `sync_site_repo.ps1::Sync-Referenced` copies only referenced files and prunes extras (site repo).
- The nightly prompt intentionally DIFFERS from `ai_verify_daily.ps1` in two agreed ways: day-less month-name dates → needs-human (no day-15 convention), and cover-frame selection is included.
- `nightly_report.py` derives everything from DB + JSON diff, so a half-failed verify phase still yields a truthful email.
- Baseline capture happens in Phase 0 (before verify), and `publish_core.ps1` regenerates it identically from `git show HEAD:` before the export — both are pre-export HEAD state, so Phase 3's diff is correct.

### Post-verification fixes (2026-07-22 adversarial review — 9 confirmed + PS 5.1 pass)

- **Migration now truly removes code from public GitHub** (was a blocker): Task 12 Step 6 builds a fresh orphan single-commit history and force-pushes; `sync_site_repo.ps1 -Bootstrap` skips the fetch/reset that would have re-pulled the old code-bearing tree.
- **Publish handshake via `logs\publish_result.json`** (was a blocker): `Write-Host "PUBLISH_RESULT:"` was uncapturable on stream 6; the orchestrator now reads a result file and never `2>&1`-captures publish_core (which also dodged a `NativeCommandError` risk on git stderr).
- **Scheduled failures are visible**: the VBS waits (`bWaitOnReturn=True`) and `WScript.Quit code`, so Task Scheduler shows the orchestrator's real exit code (the only signal for an SMTP-send failure, which sends no email).
- **Hidden-run logging fixed**: dropped `Start-Transcript` (can't capture native output in a hidden window) in favor of the VBS `cmd /c … >> log 2>&1` wrapper.
- **Arabic prompt integrity**: `$OutputEncoding` forced to UTF-8 before piping to `claude`.
- **Dry-run no longer pre-creates the site clone**: `sync_site_repo.ps1` returns on `-DryRun` before any git, so Task 9/10 dry-runs don't collide with Task 12's fresh init.
- **notify-test works before enabling** (matches the setup flow), **email shows publish version + row count**, **report `version` is None when unpublished** (canonical shape), **commit note carries `(X new, Y fixed)`**, and **Task 8's verify step no longer runs an unapproved `git add`**.
- Minor PS 5.1 hardening: relative `SITE_REPO_DIR` resolved against repo root; null-safe version read; removed dead `$LASTEXITCODE` guards after `.ps1` calls; `git init` + `branch -m master` is default-branch-agnostic.

### Execution-time fixes (SDD reviews + security + final whole-branch review)

- **Array-splat → hashtable-splat** (Task 9, empirically verified): `& script @("-Name",v)` binds POSITIONALLY to a `.ps1` in PS 5.1, so `publish.ps1 -DryRun` would have put `-DryRun` in `$Note` and run a REAL publish. All `.ps1` call sites use `@{ Name = v }` now (publish.ps1, publish_core→sync, orchestrator→publish_core).
- **Headless Claude allowlist** (security review): replaced `--dangerously-skip-permissions` with `--allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(.venv*)" --disallowedTools "Bash(git*)"` — still silent, but a prompt-injected OCR image can't reach a blanket-bypass agent.
- **Fatal-catch email honors `-DryRun`** (Task 10 review): the outer catch appends `--dry-run` when `$DryRun`, so a fatal thrown during a dry run can't send a real email.
- **Backup-safety guard** (final review, CRITICAL): `sync_site_repo.ps1` refuses to run when `SITE_REPO_URL` equals origin's push URL — otherwise, before migration, the site sync would mirror/prune the private backup repo and delete unpublished-people files. So origin MUST be repointed to the private backup (Task 12 Step 5) before any real publish/sync.
- **Unstage on failed publish** (final review): `publish_core` `git reset -q` on a mid-publish throw, so a failed commit doesn't wedge the next run's index guard.
- **Stable export order** (final review): `get_verified_for_export` ORDER BY gains a `, msg_id DESC` tiebreaker so tied `posted_date` rows can't reorder and spuriously read as "changed" (burning a version on a no-change night).
- The `Z`-suffixed run-start timestamp was tested against the live `datetime2` column and accepted — no change needed.
