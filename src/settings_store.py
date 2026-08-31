# src/settings_store.py
"""Load/validate/save the global settings JSON (data/settings.json).

The file is the source of truth for site-wide settings — currently the
global-events list rendered on every martyr's lifespan line. Pure file +
dict logic (no FastAPI, no DB) so it unit-tests in isolation.

Shape:
    {"version": 1, "events": [
        {"id": "evt-1", "name_ar": "معركة طوفان الأقصى",
         "name_en": "7 October War", "start_date": "2023-10-07"}],
     "lifeline": {"default": "w", "enabled": ["w", "a"]}}

An event is a single point in time — there is no end_date (2026-07-23).
Every event the channel commemorates is dated to its start, and the old
nullable end_date only ever produced wrong output: null was read as
"still running", which drew a band to the martyrdom date and labelled a
one-day event like اتفاقية أوسلو as ongoing.
"""
import json
import os
import re
import tempfile
from datetime import date
from pathlib import Path

DEFAULT_SETTINGS = {"version": 1, "events": []}

# Keys of the selectable lifespan-line designs. MUST stay in sync with ORDER
# in webui/lifeline-designs.js — the admin may only offer designs the SPA can
# actually render, so an unknown key here is a validation error, not a
# silently-ignored value.
LIFELINE_DESIGNS = ("w", "a", "b", "c", "d", "e")

# Keys of the selectable statistics designs. MUST stay in sync with ORDER
# in webui/stats-designs.js, for the same reason as LIFELINE_DESIGNS: the
# admin may only offer a design the SPA can actually render.
STATS_DESIGNS = ("register", "board", "layers")

# PUT payloads above this are rejected so the settings file (git-tracked and
# publicly served) can't be abused as a blob store.
MAX_BODY_BYTES = 256 * 1024

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _valid_iso_date(s) -> bool:
    if not isinstance(s, str) or not _DATE_RE.match(s):
        return False
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def load_settings(path: str | Path) -> dict:
    """Parsed settings file, or a fresh DEFAULT_SETTINGS copy when missing.
    Invalid JSON raises ValueError — silently resetting the file would
    destroy hand-entered events, so the admin must see the error."""
    p = Path(path)
    if not p.exists():
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{p.name} is not valid JSON: {e}") from e


def validate_events(events) -> list[str]:
    """Human-readable validation errors; [] means valid."""
    if not isinstance(events, list):
        return ["'events' must be a list"]
    errors: list[str] = []
    seen_ids: set[str] = set()
    for i, ev in enumerate(events):
        label = f"event {i + 1}"
        if not isinstance(ev, dict):
            errors.append(f"{label}: must be an object")
            continue
        name_ar = ev.get("name_ar")
        if not isinstance(name_ar, str) or not name_ar.strip():
            errors.append(f"{label}: name_ar is required")
        name_en = ev.get("name_en")
        if name_en is not None and not isinstance(name_en, str):
            errors.append(f"{label}: name_en must be a string or null")
        start = ev.get("start_date")
        if not _valid_iso_date(start):
            errors.append(f"{label}: start_date must be a real YYYY-MM-DD date")
        # No end_date: an event is a single point in time (2026-07-23). A
        # legacy end_date on an incoming payload is not an error — it is
        # stripped by merge_settings.
        ev_id = ev.get("id")
        if ev_id is not None:
            if not isinstance(ev_id, str) or not ev_id.strip():
                errors.append(f"{label}: id must be a non-empty string")
            elif ev_id in seen_ids:
                errors.append(f"{label}: duplicate id '{ev_id}'")
            else:
                seen_ids.add(ev_id)
    return errors


def _validate_design_block(cfg, block: str, known: tuple) -> list[str]:
    """Shared validator for the selectable-design blocks. Both have the same
    shape — {"default": key, "enabled": [key, ...]} — and the same rule:
    "enabled" is the set a visitor may switch between and "default" is what
    they see before choosing, so the default must itself be enabled or the
    site would boot into a design nobody is allowed to select.
    """
    if not isinstance(cfg, dict):
        return [f"{block!r} must be an object"]
    errors: list[str] = []

    enabled = cfg.get("enabled")
    if not isinstance(enabled, list) or not enabled:
        errors.append(f"{block}.enabled must be a non-empty list of design keys")
        enabled = []
    else:
        seen: set[str] = set()
        for k in enabled:
            if not isinstance(k, str) or k not in known:
                errors.append(f"{block}.enabled: unknown design {k!r}; "
                              f"known: {list(known)}")
            elif k in seen:
                errors.append(f"{block}.enabled: duplicate design {k!r}")
            else:
                seen.add(k)

    default = cfg.get("default")
    if not isinstance(default, str) or default not in known:
        errors.append(f"{block}.default must be one of {list(known)}")
    elif enabled and default not in enabled:
        errors.append(f"{block}.default {default!r} must also be in "
                      f"{block}.enabled")
    return errors


def validate_lifeline(cfg) -> list[str]:
    """Errors for the 'lifeline' block; [] means valid."""
    return _validate_design_block(cfg, "lifeline", LIFELINE_DESIGNS)


def validate_stats(cfg) -> list[str]:
    """Errors for the 'stats' block; [] means valid. Same shape and rules as
    the lifeline block — see _validate_design_block."""
    return _validate_design_block(cfg, "stats", STATS_DESIGNS)


def assign_ids(events) -> list:
    """Copies of the events with every missing/empty id replaced by a fresh
    'evt-<n>'. Never mutates the input."""
    used = {ev.get("id") for ev in events if ev.get("id")}
    out = []
    n = 1
    for ev in events:
        ev = dict(ev)
        if not ev.get("id"):
            while f"evt-{n}" in used:
                n += 1
            ev["id"] = f"evt-{n}"
            used.add(ev["id"])
        out.append(ev)
    return out


def merge_settings(existing: dict, incoming: dict) -> dict:
    """existing file content + incoming {version, events} → full settings.
    Unknown top-level keys already in the file survive untouched, so an
    events-only save can never wipe future settings keys. Events are id-
    assigned and stored sorted by start_date (stable git diffs)."""
    merged = dict(existing) if isinstance(existing, dict) else dict(DEFAULT_SETTINGS)
    version = incoming.get("version", 1)
    if not isinstance(version, int) or isinstance(version, bool):
        raise ValueError("'version' must be an integer")
    merged["version"] = version
    # Events carry no end_date; strip it off legacy payloads and off whatever
    # is already in the file so a single save migrates the whole list.
    events = [{k: v for k, v in ev.items() if k != "end_date"}
              for ev in assign_ids(incoming.get("events") or [])]
    merged["events"] = sorted(events, key=lambda e: e.get("start_date") or "")
    # Only touched when the caller sends it, so an events-only save leaves the
    # design config alone. 'enabled' is rewritten in LIFELINE_DESIGNS order so
    # the file diff is stable however the admin UI ordered the checkboxes.
    if "lifeline" in incoming:
        cfg = incoming["lifeline"] or {}
        picked = cfg.get("enabled") or []
        merged["lifeline"] = {
            "default": cfg.get("default"),
            "enabled": [k for k in LIFELINE_DESIGNS if k in picked],
        }
    if "stats" in incoming:
        cfg = incoming["stats"] or {}
        picked = cfg.get("enabled") or []
        merged["stats"] = {
            "default": cfg.get("default"),
            "enabled": [k for k in STATS_DESIGNS if k in picked],
        }
    return merged


def save_settings(path: str | Path, data: dict) -> None:
    """Atomic write: temp file in the same directory then os.replace, so a
    crash mid-write can never leave a half-written settings.json."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".settings-", suffix=".tmp")
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
