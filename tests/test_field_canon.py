from src.field_canon import build_dump, plan_canon_updates


def test_build_dump_sorts_by_count_desc_then_value():
    out = build_dump({"military_rank": [("a", 5), ("b", 10), ("c", 10)]})
    assert out["military_rank"] == [
        {"value": "b", "count": 10},
        {"value": "c", "count": 10},
        {"value": "a", "count": 5},
    ]


def test_build_dump_drops_blank_values():
    out = build_dump({"battalion": [("x", 3), ("   ", 2), ("", 1)]})
    assert out["battalion"] == [{"value": "x", "count": 3}]


def test_plan_valid_update_is_applied():
    existing = {"military_rank": {"قائد فصيل", "قائدفصيل"}}
    mapping = {"military_rank": [
        {"from": "قائدفصيل", "to": "قائد فصيل", "count": 5, "note": "space"}]}
    plan = plan_canon_updates(mapping, existing)
    assert plan.errors == []
    assert [(e.from_value, e.to_value, e.action) for e in plan.entries] == [
        ("قائدفصيل", "قائد فصيل", "apply")]
    assert len(plan.to_apply) == 1
    assert plan.entries[0].count == 5 and plan.entries[0].note == "space"


def test_plan_skips_when_to_missing_from_db():
    existing = {"battalion": {"كتيبة القدس"}}
    mapping = {"battalion": [{"from": "كتيبة القدس", "to": "NOT-IN-DB"}]}
    plan = plan_canon_updates(mapping, existing)
    assert plan.to_apply == []
    assert plan.entries[0].reason == "to-missing"


def test_plan_skips_when_from_absent_from_db():
    existing = {"battalion": {"كتيبة القدس"}}
    mapping = {"battalion": [{"from": "GONE", "to": "كتيبة القدس"}]}
    plan = plan_canon_updates(mapping, existing)
    assert plan.to_apply == []
    assert plan.entries[0].reason == "from-absent"


def test_plan_noop_when_from_equals_to():
    existing = {"battalion": {"كتيبة القدس"}}
    mapping = {"battalion": [{"from": "كتيبة القدس", "to": "كتيبة القدس"}]}
    plan = plan_canon_updates(mapping, existing)
    assert plan.to_apply == []
    assert plan.entries[0].reason == "no-op"


def test_plan_chain_is_hard_error():
    existing = {"military_rank": {"A", "B", "C"}}
    mapping = {"military_rank": [
        {"from": "A", "to": "B"},
        {"from": "B", "to": "C"}]}
    plan = plan_canon_updates(mapping, existing)
    assert plan.errors
    assert "chain" in plan.errors[0].lower()
