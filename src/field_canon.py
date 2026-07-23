# src/field_canon.py
"""Pure planning helpers for AI-proposed field canonicalization
(canon-dump / canon-apply in scripts/ai_verify.py — 2026-07-15 design).

No DB, no I/O: turn (distinct values, proposed mapping) into a validated,
printable plan. Every `to` must already exist in the column, so the canon is
always anchored to what is already in the DB. Unit-tested in
tests/test_field_canon.py.
"""
from dataclasses import dataclass, field


def build_dump(distinct_by_col):
    """{col: [(value, count), ...]} -> {col: [{"value","count"}, ...]},
    sorted by count desc then value asc, blanks dropped (defensive; the DB
    query already excludes them)."""
    out = {}
    for col, pairs in distinct_by_col.items():
        rows = [(v, int(c)) for v, c in pairs if v and str(v).strip()]
        rows.sort(key=lambda vc: (-vc[1], vc[0]))
        out[col] = [{"value": v, "count": c} for v, c in rows]
    return out


@dataclass
class CanonEntry:
    column: str
    from_value: str
    to_value: str
    count: int          # rows currently holding from_value (0 when absent)
    confidence: str     # "" when omitted
    note: str           # "" when omitted
    reason: str = ""    # "" = apply; else skip: "no-op" | "to-missing" | "from-absent"


@dataclass
class CanonPlan:
    entries: list = field(default_factory=list)   # list[CanonEntry]
    errors: list = field(default_factory=list)    # hard errors -> abort apply

    @property
    def to_apply(self):
        # A plan with hard errors must never write, whatever the caller checks.
        if self.errors:
            return []
        return [e for e in self.entries if not e.reason]


def plan_canon_updates(mapping, existing):
    """Validate a proposed mapping.

    mapping:  {col: [{"from","to","confidence"?,"note"?}, ...]}
    existing: {col: {value: row_count}} — what's currently in that column

    A value that is both a `to` and a `from` within one column is a chain —
    a hard error (recorded in plan.errors; to_apply is then empty, so the
    plan itself refuses to write).
    Per entry: from==to -> skip 'no-op'; to not in DB -> skip 'to-missing';
    from not in DB -> skip 'from-absent'; otherwise -> apply.
    """
    plan = CanonPlan()
    for col, items in mapping.items():
        froms = {i["from"] for i in items}
        tos = {i["to"] for i in items}
        chained = froms & tos
        if chained:
            plan.errors.append(
                f"{col}: chain(s) not allowed — value(s) appear as both "
                f"'from' and 'to': {sorted(chained)}"
            )
        col_existing = existing.get(col, {})
        for i in items:
            frm, to = i["from"], i["to"]
            if frm == to:
                reason = "no-op"
            elif to not in col_existing:
                reason = "to-missing"
            elif frm not in col_existing:
                reason = "from-absent"
            else:
                reason = ""
            plan.entries.append(CanonEntry(
                column=col,
                from_value=frm,
                to_value=to,
                count=col_existing.get(frm, 0),
                confidence=i.get("confidence") or "",
                note=i.get("note") or "",
                reason=reason,
            ))
    return plan
