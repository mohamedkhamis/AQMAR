# scripts/publish_check.py
"""Pre-publish change check for the nightly orchestrator.

Compares the DB's would-be export against a baseline martyrs.json (the
HEAD copy, extracted by the caller with `git show`) WITHOUT consuming a
publish version. Prints JSON so PowerShell can branch on it.

Usage:
    .venv\\Scripts\\python.exe scripts\\publish_check.py --baseline logs\\nightly_baseline.json [--json out.json]
"""
import argparse
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import load_config
from src.sqlserver_client import (
    make_conn, get_verified_for_export, count_ai_verified_since,
)
from src.exporter import serialize_row
from src.publish_diff import new_people, martyrs_changed, referenced_files


def main() -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--since", help="run-start ISO; adds a 'fixed' count for the commit note")
    ap.add_argument("--json", help="also write the result to this path")
    args = ap.parse_args()

    baseline = None
    bp = Path(args.baseline)
    if bp.exists() and bp.stat().st_size > 0:
        baseline = json.loads(bp.read_text(encoding="utf-8"))

    cfg = load_config()
    conn = make_conn(cfg)
    try:
        rows = [serialize_row(r) for r in get_verified_for_export(conn)]
        fixed = count_ai_verified_since(conn, args.since)["fixed"] if args.since else 0
    finally:
        conn.close()

    fresh = new_people(baseline, rows)
    ref = referenced_files(rows)
    out = {
        "changed": martyrs_changed(baseline, rows),
        "new_count": len(fresh),
        "fixed_count": fixed,
        "new_msg_ids": [p["msg_id"] for p in fresh],
        "referenced_photos": ref["photos"],
        "referenced_frames": ref["frames"],
    }
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
