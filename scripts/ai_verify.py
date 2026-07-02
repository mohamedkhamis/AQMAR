# scripts/ai_verify.py
"""CLI for the AI date-verification batch (2026-06-10 design).

Two subcommands:

  pending --limit N [--json out.json]
      Dump the next N rows needing AI verification (human-unverified AND
      ai_verified=0), with current dates + raw OCR text + frame paths.
      Claude reads the frames and writes a results file. While reading the
      frames to check the dates, also pick each row's best "cover" frame: the
      sharpest, fully-rendered one where the whole card (portrait + rank + both
      dates + name + battalion line) is clean and unobstructed. Reject the
      transition frames (faded / motion-blurred / overlaid with the animated
      "أقمار الطوفان" title). If several are equally clean, pick the smallest
      suffix. Put it in the result's featured_frame_path (see below).

  apply results.json
      Apply a results file. Shape:
        {"results": [
          {"msg_id": 23,
           "birth_date": "1991-01-08",      # present => fix this column
           "martyrdom_date": null,           # null/absent => keep DB value
           "verified": true,                 # false => note-only (mark_ai_note)
           "featured_frame_path":            # optional => set the cover frame
             "data/frames/23_28.jpg",        #   (must be one of the row's frames)
           "note": "fixed swap: ..."}
        ]}
      Dates are strict yyyy-mm-dd; anything else aborts with an error.
      featured_frame_path is optional and independent of `verified`: it is
      written NULL-guarded (won't overwrite an admin's hand-picked cover) and
      touches only that column. A path that isn't one of the row's frames is a
      non-fatal [FRAME-SKIP] warning — it won't abort the date batch.

  normalize-fields [--columns ...] [--json plan.json] [--apply]
      Merge near-duplicate spellings in the metadata columns
      (military_rank / weapon / battalion / brigade). Values that are
      identical after stripping tashkeel/tatweel/punctuation and collapsing
      whitespace are merged to the most-frequent spelling; letters are never
      changed. Dry-run by default — pass --apply to write.

Usage:
  .venv\\Scripts\\python.exe scripts\\ai_verify.py pending --limit 50 --json data\\ai_batches\\pending_001.json
  .venv\\Scripts\\python.exe scripts\\ai_verify.py apply data\\ai_batches\\results_001.json
  .venv\\Scripts\\python.exe scripts\\ai_verify.py normalize-fields
  .venv\\Scripts\\python.exe scripts\\ai_verify.py normalize-fields --apply
"""
import argparse
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from src.config import load_config
from src.sqlserver_client import (
    make_conn,
    get_ai_pending,
    mark_ai_verified,
    mark_ai_note,
    set_featured_frame,
    parse_frame_paths,
    NORMALIZE_COLUMNS,
    ALLOWED_NORMALIZE_COLUMNS,
    get_distinct_field_values,
    bulk_update_field_value,
)
from src.field_normalizer import build_merge_plan


def cmd_pending(args) -> int:
    conn = make_conn(load_config())
    try:
        rows = get_ai_pending(conn, limit=args.limit)
    finally:
        conn.close()
    # Split the semicolon list so the reader doesn't have to re-parse it.
    for r in rows:
        r["frame_paths"] = parse_frame_paths(r.get("frame_paths"))
    payload = {"count": len(rows), "rows": rows}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(text, encoding="utf-8")
        print(f"{len(rows)} pending rows -> {args.json}")
    else:
        print(text)
    return 0


def cmd_apply(args) -> int:
    data = json.loads(Path(args.results).read_text(encoding="utf-8"))
    results = data.get("results", [])
    if not results:
        print("No results in file — nothing to do.")
        return 1

    conn = make_conn(load_config())
    ok = fixed = noted = framed = 0
    try:
        for r in results:
            msg_id = r["msg_id"]
            note = (r.get("note") or "").strip()[:255]
            if not note:
                raise ValueError(f"msg {msg_id}: empty note — every row needs an audit note")
            if r.get("verified"):
                edits = {
                    k: r[k] for k in ("birth_date", "martyrdom_date")
                    if r.get(k)
                }
                mark_ai_verified(conn, msg_id, edits, note)
                if edits:
                    fixed += 1
                    print(f"  [FIXED]    msg {msg_id}: {edits} — {note}")
                else:
                    ok += 1
                    print(f"  [MATCH]    msg {msg_id} — {note}")
            else:
                mark_ai_note(conn, msg_id, note)
                noted += 1
                print(f"  [SKIPPED]  msg {msg_id} — {note}")

            # Cover frame is independent of date verification. A bad/duplicate
            # path is non-fatal (cosmetic) — warn and keep going so it never
            # aborts an otherwise-good date batch.
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
    finally:
        conn.close()
    print(f"\nApplied {len(results)} rows: {ok} match, {fixed} fixed, "
          f"{noted} not-verifiable, {framed} cover frames set")
    return 0


def cmd_normalize_fields(args) -> int:
    columns = args.columns or list(NORMALIZE_COLUMNS)
    bad = [c for c in columns if c not in ALLOWED_NORMALIZE_COLUMNS]
    if bad:
        print(f"error: not normalizable: {bad}; "
              f"allowed: {list(ALLOWED_NORMALIZE_COLUMNS)}")
        return 2

    conn = make_conn(load_config())
    plan_out = {}
    grand_groups = grand_rows = 0
    try:
        for col in columns:
            value_counts = get_distinct_field_values(conn, col)
            plan = build_merge_plan(value_counts)
            plan_out[col] = [
                {
                    "canonical": g.canonical,
                    "canonical_count": g.canonical_count,
                    "variants": [{"value": v, "count": c} for v, c in g.variants],
                    "rows_changed": g.rows_changed,
                }
                for g in plan
            ]

            print(f"\n=== {col} === ({len(value_counts)} distinct values)")
            if not plan:
                print("  (nothing to merge)")
                continue
            col_rows = 0
            for g in plan:
                print(f'  "{g.canonical}" ({g.canonical_count} rows)')
                for v, c in g.variants:
                    print(f'     <- "{v}" ({c})')
                    if args.apply:
                        n = bulk_update_field_value(conn, col, v, g.canonical)
                        if n != c:
                            print(f"        [warn] updated {n} rows, expected {c}")
                col_rows += g.rows_changed
            print(f"  {len(plan)} group(s), {col_rows} row(s) "
                  f"{'changed' if args.apply else 'would change'}")
            grand_groups += len(plan)
            grand_rows += col_rows
    finally:
        conn.close()

    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(
            json.dumps(plan_out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\nPlan written -> {args.json}")

    verb = "merged" if args.apply else "would merge"
    print(f"\nTotal: {grand_groups} group(s), {grand_rows} row(s) {verb} "
          f"across {len(columns)} column(s).")
    if not args.apply and grand_groups:
        print("[dry-run -- pass --apply to write]")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("pending", help="dump next rows needing AI verification")
    sp.add_argument("--limit", type=int, default=50)
    sp.add_argument("--json", help="write to this file instead of stdout")
    sp.set_defaults(fn=cmd_pending)

    sa = sub.add_parser("apply", help="apply a results JSON file")
    sa.add_argument("results")
    sa.set_defaults(fn=cmd_apply)

    sn = sub.add_parser(
        "normalize-fields",
        help="merge near-duplicate spellings in metadata columns "
             "(military_rank/weapon/battalion/brigade)",
    )
    sn.add_argument(
        "--columns", nargs="+", metavar="COL",
        help=f"columns to process (default: {list(NORMALIZE_COLUMNS)}; "
             f"'name' is opt-in and allowed too)",
    )
    sn.add_argument("--json", help="write the full merge plan to this file")
    sn.add_argument(
        "--apply", action="store_true",
        help="execute the merges (default is a dry-run preview)",
    )
    sn.set_defaults(fn=cmd_normalize_fields)

    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
