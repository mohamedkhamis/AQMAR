# scripts/ai_verify.py
"""CLI for the AI date-verification batch (2026-06-10 design).

Two subcommands:

  pending --limit N [--json out.json]
      Dump the next N rows needing AI verification (human-unverified AND
      ai_verified=0), with current dates + raw OCR text + frame paths.
      Claude reads the frames and writes a results file.

  apply results.json
      Apply a results file. Shape:
        {"results": [
          {"msg_id": 23,
           "birth_date": "1991-01-08",      # present => fix this column
           "martyrdom_date": null,           # null/absent => keep DB value
           "verified": true,                 # false => note-only (mark_ai_note)
           "note": "fixed swap: ..."}
        ]}
      Dates are strict yyyy-mm-dd; anything else aborts with an error.

Usage:
  .venv\\Scripts\\python.exe scripts\\ai_verify.py pending --limit 50 --json data\\ai_batches\\pending_001.json
  .venv\\Scripts\\python.exe scripts\\ai_verify.py apply data\\ai_batches\\results_001.json
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
)


def cmd_pending(args) -> int:
    conn = make_conn(load_config())
    try:
        rows = get_ai_pending(conn, limit=args.limit)
    finally:
        conn.close()
    # Split the semicolon list so the reader doesn't have to re-parse it.
    for r in rows:
        r["frame_paths"] = [
            p.strip().replace("\\", "/")
            for p in (r.get("frame_paths") or "").split(";") if p.strip()
        ]
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
    ok = fixed = noted = 0
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
    finally:
        conn.close()
    print(f"\nApplied {len(results)} rows: {ok} match, {fixed} fixed, {noted} not-verifiable")
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

    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
