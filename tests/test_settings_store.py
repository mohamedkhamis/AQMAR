"""Tests for src/settings_store.py — pure file+dict logic, no FastAPI/DB."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.settings_store import (
    DEFAULT_SETTINGS,
    LIFELINE_DESIGNS,
    assign_ids,
    load_settings,
    merge_settings,
    save_settings,
    validate_events,
    validate_lifeline,
)


def _ev(**over):
    base = {"id": "evt-1", "name_ar": "معركة طوفان الأقصى",
            "name_en": "7 October War", "start_date": "2023-10-07"}
    base.update(over)
    return base


# ---- load_settings ----

def test_load_missing_file_returns_default(tmp_path):
    assert load_settings(tmp_path / "settings.json") == DEFAULT_SETTINGS


def test_load_returns_parsed_content_with_arabic(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text(json.dumps({"version": 2, "events": [_ev()]}, ensure_ascii=False),
                 encoding="utf-8")
    loaded = load_settings(p)
    assert loaded["version"] == 2
    assert loaded["events"][0]["name_ar"] == "معركة طوفان الأقصى"


def test_load_invalid_json_raises_value_error(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_settings(p)


def test_load_returns_fresh_copy_not_shared_default(tmp_path):
    a = load_settings(tmp_path / "settings.json")
    a["events"].append({"x": 1})
    assert load_settings(tmp_path / "settings.json") == DEFAULT_SETTINGS


# ---- validate_events ----

def test_valid_event_passes():
    assert validate_events([_ev()]) == []


def test_events_must_be_list():
    assert validate_events({"a": 1}) != []


def test_name_ar_required():
    assert any("name_ar" in e for e in validate_events([_ev(name_ar="  ")]))
    assert any("name_ar" in e for e in validate_events([_ev(name_ar=None)]))


def test_start_date_must_be_real_date():
    assert validate_events([_ev(start_date="2023-13-07")]) != []   # month 13
    assert validate_events([_ev(start_date="2023-02-30")]) != []   # Feb 30
    assert validate_events([_ev(start_date="07-10-2023")]) != []   # wrong format
    assert validate_events([_ev(start_date=None)]) != []


def test_end_date_is_no_longer_part_of_an_event():
    # An event is a single point in time (2026-07-23). A legacy end_date on an
    # incoming payload is tolerated by the validator...
    assert validate_events([_ev(end_date="2023-11-30")]) == []
    assert validate_events([_ev(end_date="nonsense")]) == []


def test_merge_strips_legacy_end_date():
    # ...and stripped on save, so one save migrates the whole list.
    merged = merge_settings({}, {"events": [_ev(end_date="2023-11-30")]})
    assert "end_date" not in merged["events"][0]
    assert merged["events"][0]["start_date"] == "2023-10-07"


def test_duplicate_ids_rejected():
    errs = validate_events([_ev(), _ev(name_ar="آخر")])
    assert any("duplicate" in e for e in errs)


# ---- assign_ids ----

def test_assign_ids_fills_missing_without_touching_existing():
    evs = [_ev(), _ev(id=None, name_ar="آخر"), _ev(id="", name_ar="ثالث")]
    out = assign_ids(evs)
    ids = [e["id"] for e in out]
    assert ids[0] == "evt-1"
    assert len(set(ids)) == 3
    assert all(ids)


def test_assign_ids_does_not_mutate_input():
    evs = [_ev(id=None)]
    assign_ids(evs)
    assert evs[0]["id"] is None


# ---- merge_settings ----

def test_merge_preserves_unknown_top_level_keys():
    existing = {"version": 1, "events": [], "theme": {"accent": "gold"}}
    merged = merge_settings(existing, {"version": 1, "events": [_ev()]})
    assert merged["theme"] == {"accent": "gold"}
    assert len(merged["events"]) == 1


def test_merge_defaults_version_and_rejects_non_int():
    assert merge_settings({}, {"events": []})["version"] == 1
    with pytest.raises(ValueError):
        merge_settings({}, {"version": "x", "events": []})
    with pytest.raises(ValueError):
        merge_settings({}, {"version": True, "events": []})


def test_merge_sorts_events_by_start_date():
    merged = merge_settings({}, {"events": [
        _ev(id="b", start_date="2025-01-19"),
        _ev(id="a", start_date="2023-10-07"),
    ]})
    assert [e["id"] for e in merged["events"]] == ["a", "b"]


# ---- save_settings ----

def test_save_round_trips_utf8_and_ends_with_newline(tmp_path):
    p = tmp_path / "settings.json"
    data = {"version": 1, "events": [_ev()]}
    save_settings(p, data)
    text = p.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert "معركة طوفان الأقصى" in text          # not \u-escaped
    assert json.loads(text) == data


def test_save_creates_parent_dir_and_leaves_no_temp_files(tmp_path):
    p = tmp_path / "sub" / "settings.json"
    save_settings(p, DEFAULT_SETTINGS)
    assert json.loads(p.read_text(encoding="utf-8")) == DEFAULT_SETTINGS
    leftovers = [f.name for f in p.parent.iterdir() if f.name != "settings.json"]
    assert leftovers == []


# ---- validate_lifeline (selectable lifespan-line designs) ----

def test_lifeline_valid_config_has_no_errors():
    assert validate_lifeline({"default": "w", "enabled": ["w", "a", "e"]}) == []


def test_lifeline_rejects_unknown_design_key():
    errors = validate_lifeline({"default": "w", "enabled": ["w", "nope"]})
    assert any("unknown design" in e for e in errors)


def test_lifeline_rejects_default_outside_enabled():
    # Booting into a design the visitor is not allowed to select would strand
    # them on a design the switcher cannot represent.
    errors = validate_lifeline({"default": "e", "enabled": ["w", "a"]})
    assert any("must also be in lifeline.enabled" in e for e in errors)


def test_lifeline_rejects_empty_or_missing_enabled():
    assert validate_lifeline({"default": "w", "enabled": []})
    assert validate_lifeline({"default": "w"})


def test_lifeline_rejects_duplicate_design():
    errors = validate_lifeline({"default": "w", "enabled": ["w", "w"]})
    assert any("duplicate design" in e for e in errors)


def test_lifeline_rejects_non_object():
    assert validate_lifeline(["w"]) == ["'lifeline' must be an object"]


def test_every_known_design_is_accepted():
    for key in LIFELINE_DESIGNS:
        assert validate_lifeline({"default": key, "enabled": [key]}) == []


# ---- merge_settings + lifeline ----

def test_merge_stores_enabled_in_canonical_order():
    merged = merge_settings({}, {"events": [], "lifeline": {
        "default": "a", "enabled": ["e", "a", "w"]}})
    assert merged["lifeline"]["enabled"] == ["w", "a", "e"]   # LIFELINE_DESIGNS order


def test_merge_leaves_lifeline_untouched_when_not_sent():
    existing = {"version": 1, "events": [],
                "lifeline": {"default": "c", "enabled": ["c"]}}
    merged = merge_settings(existing, {"events": [_ev()]})
    assert merged["lifeline"] == {"default": "c", "enabled": ["c"]}


def test_merge_drops_unknown_keys_from_enabled():
    merged = merge_settings({}, {"events": [], "lifeline": {
        "default": "w", "enabled": ["w", "bogus"]}})
    assert merged["lifeline"]["enabled"] == ["w"]
