# scripts/status.py
"""Print a quick status of the AqmarTofan pipeline: counts, breakdown, and
anything that needs manual review."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.state import State
from src.config import load_config
from src.sqlserver_client import make_conn, get_all

STATE_PATH = "data/state.json"
MISSING_BIRTH_LOG = "logs/missing_birthdates.log"


def print_db_coverage():
    """Mandatory-field coverage from SQL Server — the canonical store since the
    Excel -> SQL Server migration. Silently degrades if the DB is unreachable
    (e.g. SQLSERVER_CONN_STR not set), so `status.py` still works for the
    state.json + log sections alone."""
    try:
        conn = make_conn(load_config())
    except Exception as e:
        print(f"\nSQL Server not available ({e}).")
        return
    try:
        rows = get_all(conn)
    finally:
        conn.close()

    total = len(rows)
    print(f"\nSQL Server rows:      {total}")
    if not total:
        return

    birth_filled = sum(1 for r in rows if r.get("birth_date"))
    mart_filled = sum(1 for r in rows if r.get("martyrdom_date"))
    photo_filled = sum(
        1 for r in rows
        if r.get("photo_path") and Path(str(r["photo_path"])).exists()
    )
    print(f"  birth_date filled:    {birth_filled}/{total} ({birth_filled * 100 // total}%)")
    print(f"  martyrdom filled:     {mart_filled}/{total} ({mart_filled * 100 // total}%)")
    print(f"  photo on disk:        {photo_filled}/{total} ({photo_filled * 100 // total}%)")

    verification = Counter(r.get("verification_status") or "unverified" for r in rows)
    print("  verification:")
    for status, n in verification.most_common():
        print(f"    {status:23} {n}")


def main():
    state = State.load(STATE_PATH)
    print(f"Total processed messages: {len(state.processed_msg_ids)}")
    print(f"Last processed msg_id:     {state.last_processed_msg_id}")

    counts = Counter(state.statuses.values())
    print("\nStatus breakdown:")
    for status, n in counts.most_common():
        print(f"  {status:25} {n}")

    print_db_coverage()

    log = Path(MISSING_BIRTH_LOG)
    if log.exists():
        n = len([l for l in log.read_text(encoding="utf-8").splitlines() if l.strip()])
        print(f"\nMissing birthdates queue: {n} msg_ids in {log}")


if __name__ == "__main__":
    main()
