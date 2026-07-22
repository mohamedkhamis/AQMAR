# scripts/ai_mk_args.py
"""Build the headless-verify work list from an ai_verify.py pending dump.

Filters out rows already noted needs-human (data/ai_batches/noted_ids.json)
so the nightly agent never re-reads them. Tracked twin of the ad-hoc
data/ai_batches/_mk_args.py used by ai_verify_daily.ps1.

Usage: .venv\\Scripts\\python.exe scripts\\ai_mk_args.py data\\ai_batches\\pending_nightly.json data\\ai_batches\\args_nightly.json
"""
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
NOTED = _ROOT / "data" / "ai_batches" / "noted_ids.json"


def main() -> int:
    pending_path, args_path = Path(sys.argv[1]), Path(sys.argv[2])
    pending = json.loads(pending_path.read_text(encoding="utf-8"))
    noted = set()
    if NOTED.exists():
        noted = set(json.loads(NOTED.read_text(encoding="utf-8")))
    rows = [
        {"msg_id": r["msg_id"], "frames": r.get("frame_paths") or [],
         "photo": r.get("photo_path")}
        for r in pending.get("rows", [])
        if r["msg_id"] not in noted
    ]
    args_path.parent.mkdir(parents=True, exist_ok=True)
    args_path.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=1),
                         encoding="utf-8")
    print(f"{len(rows)} row(s) to verify ({len(pending.get('rows', [])) - len(rows)} noted, skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
