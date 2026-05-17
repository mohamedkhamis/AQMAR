# scripts/export_to_json.py
"""CLI for the publish workflow. Reads verified rows from SQL Server,
writes data/martyrs.json with a version + generated_at envelope, records
the publish in dbo.publish_versions.

Usage:
    .venv\Scripts\activate
    python scripts\export_to_json.py
    python scripts\export_to_json.py --note "weekly snapshot"
    python scripts\export_to_json.py --dry-run    # show stats, write nothing

After running, `git add data/martyrs.json && git commit && git push` ships
the new snapshot to GitHub Pages. See scripts/publish.ps1 for a one-shot
version of that.
"""
import argparse
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import load_config
from src.sqlserver_client import make_conn, get_verified_for_export, next_publish_version
from src.exporter import export_to_json, build_payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--note", default="",
                        help="One-line description for the audit trail")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show stats, don't write JSON or record version")
    parser.add_argument("--output", default="data/martyrs.json",
                        help="Where to write the JSON (default data/martyrs.json)")
    args = parser.parse_args()

    cfg = load_config()
    if not cfg.sqlserver_conn_str:
        print("ERROR: SQLSERVER_CONN_STR is empty in .env")
        sys.exit(1)

    conn = make_conn(cfg)

    if args.dry_run:
        verified = get_verified_for_export(conn)
        next_v = next_publish_version(conn)
        print(f"DRY RUN")
        print(f"  Verified rows to publish: {len(verified)}")
        print(f"  Next version number:      {next_v}")
        print(f"  Would write to:           {args.output}")
        if verified:
            sample = verified[0]
            print(f"  Sample row msg_ids: {[r['msg_id'] for r in verified[:5]]}")
        conn.close()
        return

    result = export_to_json(conn, json_path=args.output, note=args.note)
    conn.close()

    print(f"Published version {result['version']}")
    print(f"  Rows:    {result['row_count']}")
    print(f"  Path:    {result['path']}")
    print()
    print("Next step:")
    print(f"  git add {args.output}")
    print(f"  git commit -m \"publish v{result['version']}{(': ' + args.note) if args.note else ''}\"")
    print(f"  git push")


if __name__ == "__main__":
    main()
