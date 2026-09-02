# src/field_normalizer.py
"""Conservative grouping key + merge-plan builder for the field-spelling
normalizer (2026-06-22 design).

Used by scripts/ai_verify.py `normalize-fields` to collapse near-duplicate
free-text values in military_rank / weapon / battalion / brigade that differ
only by trivial, NON-letter differences.

The rule is deliberately conservative: two values share a key iff they are
identical after stripping tashkeel/tatweel, normalising punctuation to
spaces, and then removing whitespace ENTIRELY. **Letters are never changed**
— `أ` stays distinct from `ا`, `ة` from `ه`, `ى` from `ي`. This is unlike
name_normalizer.normalize_arabic_name (which unifies those letters); names
are out of scope here precisely because that unification is riskier.

Whitespace is dropped rather than collapsed (2026-09-02) because OCR splits
words as often as it joins them: "مجاهد قسا مي" for "مجاهد قسامي",
"قائدفصيل" for "قائد فصيل". Collapsing runs left those in different
groups, so every batch spent an AI canon decision on the same artifact.
Ignoring word boundaries is still conservative: two values whose letter
sequences are identical are the same value. It does NOT touch letter
damage — "قائسد فصيل" and "مجاهد قسا مو" still differ by a letter and
remain the AI canon pass's job.

normalize_key is a GROUPING key only — it is never written to the DB. The DB
always keeps a real, human-written spelling (the canonical original).
"""
import re
import unicodedata
from dataclasses import dataclass, field

# Standard Arabic harakat (U+064B–U+0652) + dagger/superscript alef (U+0670).
# Same set name_normalizer strips, plus the dagger alef.
DIACRITICS = "ًٌٍَُِّْٰ"
TATWEEL = "ـ"  # U+0640

# Punctuation we treat as noise. Replaced with a space (then whitespace is
# removed) so "كتيبة-القسام", "كتيبة - القسام" and "كتيبة القسام" all agree.
_PUNCT = re.compile(r"""[.,،؛؟:;!/\\|\-–—_(){}\[\]"'`«»]""")
_DIACRITICS_RE = re.compile(f"[{DIACRITICS}]")
_WS = re.compile(r"\s+")


def normalize_key(value) -> str:
    """Conservative grouping key. See module docstring for the rule.

    Returns '' for None / empty / whitespace-only input."""
    if not value:
        return ""
    s = unicodedata.normalize("NFKC", str(value))
    s = _DIACRITICS_RE.sub("", s)
    s = s.replace(TATWEEL, "")
    s = _PUNCT.sub(" ", s)
    # Remove whitespace outright - see the module docstring. strip() is then
    # redundant but harmless if the regex ever changes back.
    s = _WS.sub("", s).strip()
    return s


@dataclass
class MergeGroup:
    """One canonical spelling and the variants that should be rewritten to it.

    `variants` excludes the canonical; `rows_changed` is the number of rows
    that move (sum of variant counts), i.e. the rows an --apply would touch.
    """
    canonical: str
    canonical_count: int
    variants: list = field(default_factory=list)  # list[(value, count)]

    @property
    def rows_changed(self) -> int:
        return sum(c for _, c in self.variants)


def build_merge_plan(value_counts) -> list:
    """Group (value, count) pairs by normalize_key and return the groups that
    actually change something (≥2 distinct originals share a key).

    Canonical = highest count; ties break by longest string, then
    alphabetical (deterministic). Groups whose values are already uniform —
    or singletons — are omitted. Values whose key is '' (blank) are skipped.
    """
    groups = {}
    for value, count in value_counts:
        key = normalize_key(value)
        if not key:
            continue
        groups.setdefault(key, []).append((value, int(count)))

    plan = []
    for members in groups.values():
        if len(members) < 2:
            continue
        # Canonical: max count, then longest string, then alphabetical.
        canonical, canonical_count = max(
            members, key=lambda vc: (vc[1], len(vc[0]), _alpha_key(vc[0]))
        )
        variants = sorted(
            (vc for vc in members if vc[0] != canonical),
            key=lambda vc: (-vc[1], vc[0]),
        )
        plan.append(MergeGroup(canonical, canonical_count, variants))
    # Largest impact first, for readable dry-run output.
    plan.sort(key=lambda g: g.rows_changed, reverse=True)
    return plan


def _alpha_key(s: str):
    """Stable alphabetical tiebreaker that won't raise on mixed scripts."""
    return s
