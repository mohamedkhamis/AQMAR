# scripts/nightly_report.py
"""Build the nightly report from DB + payload diff and send the email.

Deterministic: 'new people' comes from diffing data/martyrs.json against
the pre-run baseline; 'stuck' and counts come from SQL Server — never from
what the AI step claims. Called by scripts/nightly_verify_publish.ps1.

Usage:
    .venv\\Scripts\\python.exe scripts\\nightly_report.py --baseline logs\\nightly_baseline.json ^
        --run-start 2026-07-22T22:30:00Z [--error verify:"claude exit 1"] [--dry-run] [--json out.json]

Exit codes: 0 ok (email sent, skipped, or dry-run) · 3 SMTP send failed.
"""
import argparse
import io
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from src.config import load_config
from src.sqlserver_client import make_conn, get_stuck_rows, count_ai_verified_since
from src.publish_diff import new_people, martyrs_changed
from src import notifier
from src.notify_store import load_notify

NOTIFY_PATH = _ROOT / "data" / "notify_settings.json"
MARTYRS_PATH = _ROOT / "data" / "martyrs.json"


def build_report(run_start, baseline_payload, current_payload,
                 stuck_rows, counts, errors) -> dict:
    """Pure assembly of the canonical report dict (shape: tests/test_notifier.py)."""
    curr_rows = (current_payload or {}).get("martyrs", [])
    published = bool(current_payload) and martyrs_changed(baseline_payload, curr_rows)
    return {
        "run_start": run_start,
        "published": published,
        "version": (current_payload or {}).get("version") if published else None,
        "row_count": len(curr_rows),
        "new_people": new_people(baseline_payload, curr_rows) if published else [],
        "fixed_count": counts.get("fixed", 0),
        "ai_total": counts.get("total", 0),
        "covers_count": counts.get("covers", 0),
        "stuck": [{"msg_id": s.get("msg_id"), "name": s.get("name"),
                   "ai_note": s.get("ai_note")} for s in stuck_rows],
        "errors": list(errors),
    }


def _load_json(path: Path):
    if path.exists() and path.stat().st_size > 0:
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _safe_load(path: Path, errors: list, label: str):
    """Load JSON from path; never raises.

    Missing/empty file is a normal "nothing there yet" case: returns None,
    no error. A present-but-corrupt file (malformed JSON or unreadable) is
    an actual failure: appends an entry to `errors` and returns None so the
    caller can treat the payload as unavailable instead of crashing.
    """
    try:
        return _load_json(path)
    except (json.JSONDecodeError, OSError) as e:
        errors.append({"stage": "report", "detail": f"{label} unreadable: {e}"[:300]})
        return None


def main() -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--run-start", required=True)
    ap.add_argument("--error", action="append", default=[],
                    help="stage:detail — repeatable")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--json", help="also write the report to this path")
    args = ap.parse_args()

    errors = []
    for e in args.error:
        stage, _, detail = e.partition(":")
        errors.append({"stage": stage, "detail": detail or stage})

    n_errors_before_loads = len(errors)
    baseline = _safe_load(Path(args.baseline), errors, "baseline")
    current = _safe_load(MARTYRS_PATH, errors, "martyrs.json")
    if len(errors) > n_errors_before_loads:
        # Either load actually failed (corrupt/unreadable, not just missing) —
        # treat the run as "nothing to publish" rather than risk a spurious
        # "everything is new" email off a partial/mismatched payload pair.
        current = None

    stuck, counts = [], {"total": 0, "fixed": 0, "covers": 0}
    try:
        cfg = load_config()
        conn = make_conn(cfg)
        try:
            stuck = get_stuck_rows(conn)
            counts = count_ai_verified_since(conn, args.run_start)
        finally:
            conn.close()
    except Exception as e:
        errors.append({"stage": "report-db", "detail": str(e)[:300]})

    report = build_report(args.run_start, baseline, current, stuck, counts, errors)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json:
        Path(args.json).write_text(text, encoding="utf-8")
    print(text)

    if args.dry_run:
        print("[dry-run] email not sent; would send:",
              notifier.should_send(report))
        return 0

    try:
        settings = load_notify(NOTIFY_PATH)
    except ValueError as e:
        print(f"[notify] settings file corrupt — email skipped: {e}")
        return 0
    try:
        sent = notifier.send_summary(settings, report)
        print(f"[notify] email sent: {sent}")
        return 0
    except Exception as e:
        print(f"[notify] SEND FAILED: {e}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
