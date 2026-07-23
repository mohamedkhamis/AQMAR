import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ai_verify  # noqa: E402


class FakeConn:
    def close(self):
        pass


def test_canon_dump_writes_sorted_json(tmp_path, monkeypatch):
    fake = {"military_rank": [("a", 1), ("b", 5)], "battalion": [("x", 2)]}
    monkeypatch.setattr(ai_verify, "load_config", lambda: None)
    monkeypatch.setattr(ai_verify, "make_conn", lambda cfg: FakeConn())
    monkeypatch.setattr(ai_verify, "get_distinct_field_values",
                        lambda conn, col: fake[col])
    out = tmp_path / "dump.json"
    rc = ai_verify.cmd_canon_dump(
        argparse.Namespace(columns=["military_rank", "battalion"], json=str(out)))
    assert rc == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["military_rank"] == [
        {"value": "b", "count": 5}, {"value": "a", "count": 1}]
    assert data["battalion"] == [{"value": "x", "count": 2}]


def _setup_conn(monkeypatch, existing, calls):
    def fake_bulk_update(conn, col, frm, to):
        calls.append((col, frm, to))
        return 1

    monkeypatch.setattr(ai_verify, "load_config", lambda: None)
    monkeypatch.setattr(ai_verify, "make_conn", lambda cfg: FakeConn())
    monkeypatch.setattr(ai_verify, "get_distinct_field_values",
                        lambda conn, col: [(v, 1) for v in existing[col]])
    monkeypatch.setattr(ai_verify, "bulk_update_field_value", fake_bulk_update)


def _write(tmp_path, mapping):
    f = tmp_path / "m.json"
    f.write_text(json.dumps(mapping, ensure_ascii=False), encoding="utf-8")
    return str(f)


def test_canon_apply_dryrun_writes_nothing(tmp_path, monkeypatch):
    calls = []
    _setup_conn(monkeypatch, {"battalion": {"كتيبة القدس", "كتيبةالقدس"}}, calls)
    path = _write(tmp_path, {"battalion": [
        {"from": "كتيبةالقدس", "to": "كتيبة القدس"}]})
    rc = ai_verify.cmd_canon_apply(argparse.Namespace(results=path, apply=False))
    assert rc == 0
    assert calls == []  # dry-run performs zero writes


def test_canon_apply_applies_valid_mapping(tmp_path, monkeypatch):
    calls = []
    _setup_conn(monkeypatch, {"battalion": {"كتيبة القدس", "كتيبةالقدس"}}, calls)
    path = _write(tmp_path, {"battalion": [
        {"from": "كتيبةالقدس", "to": "كتيبة القدس"}]})
    rc = ai_verify.cmd_canon_apply(argparse.Namespace(results=path, apply=True))
    assert rc == 0
    assert calls == [("battalion", "كتيبةالقدس", "كتيبة القدس")]


def test_canon_apply_aborts_on_chain_without_writing(tmp_path, monkeypatch):
    calls = []
    _setup_conn(monkeypatch, {"military_rank": {"A", "B", "C"}}, calls)
    path = _write(tmp_path, {"military_rank": [
        {"from": "A", "to": "B"}, {"from": "B", "to": "C"}]})
    rc = ai_verify.cmd_canon_apply(argparse.Namespace(results=path, apply=True))
    assert rc == 2
    assert calls == []  # nothing written when a chain is present
