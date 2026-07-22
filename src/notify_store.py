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
