# ai_verify.py — best-frame selection in the date-verify pass

**Date:** 2026-07-02
**Status:** design approved (pending spec review)
**Scope:** `scripts/ai_verify.py`, `src/sqlserver_client.py`, `tests/` only.
Daily automation (`scripts/ai_verify_daily.ps1`) is explicitly **out of scope**
here (noted as a follow-up).

## Goal

When the AI date-verification pass reviews an unverified person, it should also
pick that person's best "cover" frame and store it in
`dbo.martyrs.featured_frame_path` — in the **same** `pending → read → apply`
cycle, since Claude already reads every frame to check the dates.

Background: `featured_frame_path` (NVARCHAR 500) holds one token from
`frame_paths`, e.g. `data/frames/1600_28.jpg` (forward slashes). It is exported
to `martyrs.json` and shown on the public detail page; normally the admin picks
it in the webui carousel. As of 2026-07-02 all 707 framed rows have it set, but
new unverified rows arrive with it NULL.

## Non-goals (YAGNI)

- No standalone/backfill subcommand (the one-off bulk job already backfilled).
- No change to the daily PowerShell automation.
- No new vision heuristic in Python — the human/Claude reviewer picks the frame,
  the CLI only records it (consistent with how dates work today).

## Design

### 1. `pending` (dump) — docstring only
No structural change; `frame_paths` is already emitted per row. Update the module
docstring to (a) document the new optional results field and (b) state the
picking rule for the reader:

> Pick the sharpest, fully-rendered frame — the one where the whole card
> (portrait + rank + both dates + name + battalion line) is clean and
> unobstructed. Reject transition frames (faded / motion-blurred / overlaid with
> the animated "أقمار الطوفان" title). If several are equally clean, choose the
> smallest suffix number.

### 2. Results file — one new optional field
```jsonc
{ "msg_id": 1600,
  "birth_date": "1995-04-08",
  "martyrdom_date": "2023-12-03",
  "verified": true,
  "featured_frame_path": "data/frames/1600_28.jpg",   // NEW — optional
  "note": "match; cover = _28 (28/30 clean, 32 is the title-transition frame)" }
```
The existing per-row contract is unchanged: `note` still required non-empty,
`verified` still true/false. `featured_frame_path` is purely additive and
independent of `verified` (a note-only row may still carry a cover pick).

### 3. New function `set_featured_frame(conn, msg_id, path) -> bool` (src/sqlserver_client.py)
- Normalize `path`: strip; backslashes → forward slashes.
- Read the row's `frame_paths`; split on `;`; normalize each; build a set.
- **Validate:** if `path` is not a member of that set (including the case where
  the row has no frames), raise `ValueError` naming the msg_id and the allowed
  frames. (Fail loud — a bad path means the results file is wrong.)
- **Write, NULL-guarded:**
  `UPDATE dbo.martyrs SET featured_frame_path = ? WHERE msg_id = ? AND (featured_frame_path IS NULL OR LTRIM(RTRIM(featured_frame_path)) = '')`
- Return `True` if a row was updated (`rowcount == 1`), `False` if it was skipped
  because a value already existed (preserve admin hand-picks).
- Touches **only** `featured_frame_path` — never `verification_status`,
  `ai_verified`, `ocr_*`, or the date columns. `commit()` like the siblings.
- Not added to `_AI_EDITABLE_FIELDS` / `mark_ai_verified` (that path runs every
  edit through `_sanitize_date`, which is date-only). This is a separate write.

### 4. `apply` change (scripts/ai_verify.py `cmd_apply`)
After the existing verified/note handling for each result, if
`featured_frame_path` is present:
```python
feat = (r.get("featured_frame_path") or "").strip()
if feat:
    try:
        if set_featured_frame(conn, msg_id, feat):
            framed += 1
            print(f"  [FRAME]      msg {msg_id}: {feat}")
        else:
            print(f"  [FRAME-KEEP] msg {msg_id}: kept existing cover")
    except ValueError as e:
        print(f"  [FRAME-SKIP] msg {msg_id}: {e}")
```
Rationale for warn-and-continue (not abort): the cover frame is cosmetic, unlike
mandatory dates. A single bad frame path must not abort an otherwise-good date
batch. Add `framed` to the closing summary line
(`… {framed} cover frames set`).

### 5. Tests (tests/test_sqlserver_client.py, tests/test_ai_verify*.py or inline)
Using the existing MagicMock stub pattern (`fetchone`/`rowcount`, assert on SQL):
- `set_featured_frame` writes the UPDATE, guarded on NULL, only
  `featured_frame_path` in the SQL; returns True when `rowcount == 1`.
- Returns False (no clobber) when `rowcount == 0`.
- Raises `ValueError` when the path is not one of the row's `frame_paths`.
- Raises `ValueError` when the row has no `frame_paths`.
- `cmd_apply` (or a thin unit): a result with `featured_frame_path` calls the
  setter; an invalid one is caught and does not abort the batch.

## Data flow (unchanged loop, one extra write)
```
pending (unverified + ai_verified=0, emits frame_paths)
  → Claude reads frames: verifies dates AND picks cover frame
  → results.json (dates + note + optional featured_frame_path)
  → apply: mark_ai_verified/mark_ai_note (dates)  +  set_featured_frame (cover)
```

## Risks / edge cases
- Path format mismatch (`\` vs `/`): handled by normalizing both sides before the
  membership check.
- Row already has a cover: preserved (NULL-guard), reported as `[FRAME-KEEP]`.
- Invalid path in results: reported as `[FRAME-SKIP]`, batch continues.
- No verification_status / ai_verified side effects: asserted in tests.

## Note on git
Per the repo's absolute git rule, this spec is **not** auto-committed; the user
approves commits explicitly.
