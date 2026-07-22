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
