"""One-shot data-gap report for data/martyrs.json.

Writes a sorted markdown work list to docs/data-gaps-YYYY-MM-DD.md.
Read-only — does not modify the dataset.
"""
import collections
import datetime
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def empty(v):
    return v in (None, "", "null")


def date_status(s):
    if empty(s):
        return "empty"
    if ISO_RE.match(s):
        return "iso"
    return "malformed"


def main():
    with (REPO / "data" / "martyrs.json").open("r", encoding="utf-8") as f:
        data = json.load(f)
    rows = data["martyrs"]
    total = len(rows)

    buckets = collections.defaultdict(list)
    for r in rows:
        if r.get("extraction_status") == "missing_critical":
            buckets["P0"].append(r["msg_id"])
        if (
            date_status(r.get("birth_date")) == "malformed"
            or date_status(r.get("martyrdom_date")) == "malformed"
        ):
            buckets["P1"].append(r["msg_id"])
        if r.get("extraction_status") == "photo_only_no_dates":
            buckets["P2"].append(r["msg_id"])
        if r.get("extraction_status") == "photo_only_no_birth":
            buckets["P3"].append(r["msg_id"])
        if r.get("extraction_status") == "partial_birth":
            buckets["P4"].append(r["msg_id"])
        if r.get("extraction_status") == "partial_martyrdom":
            buckets["P5"].append(r["msg_id"])
        if empty(r.get("photo_path")):
            buckets["P6"].append(r["msg_id"])

    by_id = {r["msg_id"]: r for r in rows}
    today = datetime.date.today().isoformat()
    out_path = REPO / "docs" / f"data-gaps-{today}.md"

    lines = []
    lines.append("# AQMAR data gaps — review snapshot")
    lines.append("")
    lines.append(f"Generated: {datetime.datetime.now().isoformat(timespec='minutes')}")
    lines.append(f"Source: `data/martyrs.json` ({total} rows)")
    lines.append("")
    lines.append("## TL;DR")
    lines.append("")
    complete = sum(1 for r in rows if r.get("extraction_status") == "complete")
    lines.append(f"- {complete} rows ({100*complete/total:.1f}%) complete")
    lines.append(f"- {total-complete} rows ({100*(total-complete)/total:.1f}%) need attention")
    lines.append("- 2 fields the pipeline never extracts: **city** (0/388) and **weapon** (0/388)")
    lines.append("")

    lines.append("## Severity buckets — work through in this order")
    lines.append("")
    priorities = [
        ("P0", "P0 · missing_critical",
         "No name / no birth / no martyrdom — nothing to show. Hand-edit or rerun with --update."),
        ("P1", "P1 · malformed dates",
         "OCR returned garbage in birth or martyrdom (e.g. 'فبرايسر', 'ديمبر', '٥٤٤ 2025'). Easy to fix by hand in the admin UI."),
        ("P2", "P2 · photo_only_no_dates",
         "Only the photo was pulled — both dates blank. Re-run OCR on extra frames."),
        ("P3", "P3 · photo_only_no_birth",
         "Photo + martyrdom present, birth date missing. The biggest bucket."),
        ("P4", "P4 · partial_birth",
         "Most fields OK but birth date blank."),
        ("P5", "P5 · partial_martyrdom",
         "Most fields OK but martyrdom date blank."),
        ("P6", "P6 · no photo on disk",
         "Photo file missing (data/photos/N.jpg). Use scripts/recover_photos.py."),
    ]
    for key, title, blurb in priorities:
        ids = sorted(buckets[key])
        lines.append(f"### {title} — **{len(ids)} rows**")
        lines.append("")
        lines.append(blurb)
        lines.append("")
        if ids:
            lines.append("msg_ids: " + ", ".join(str(i) for i in ids))
            lines.append("")

    lines.append("## P1 detail — malformed dates (the manual-fix list)")
    lines.append("")
    lines.append("| msg_id | birth_date (raw) | martyrdom_date (raw) | telegram |")
    lines.append("|---:|:---|:---|:---|")
    for r in rows:
        if (
            date_status(r.get("birth_date")) == "malformed"
            or date_status(r.get("martyrdom_date")) == "malformed"
        ):
            bd = r.get("birth_date") or "—"
            md = r.get("martyrdom_date") or "—"
            link = r.get("message_link", "")
            lines.append(f"| {r['msg_id']} | `{bd}` | `{md}` | {link} |")
    lines.append("")

    lines.append("## P0 detail — completely broken rows")
    lines.append("")
    lines.append("| msg_id | name | birth_date | martyrdom_date | telegram |")
    lines.append("|---:|:---|:---|:---|:---|")
    for mid in sorted(buckets["P0"]):
        r = by_id[mid]
        lines.append(
            f"| {mid} | {r.get('name') or '—'} | "
            f"`{r.get('birth_date') or '—'}` | `{r.get('martyrdom_date') or '—'}` | "
            f"{r.get('message_link', '')} |"
        )
    lines.append("")

    lines.append("## Always-empty fields")
    lines.append("")
    lines.append("| Field | Empty rows | Note |")
    lines.append("|:---|:---|:---|")

    def emp(fld):
        return sum(1 for r in rows if empty(r.get(fld)))

    lines.append(f"| `city`           | {emp('city')} / {total}   | Pipeline never extracts it. Add to `parser_ocr.py` or rely on admin manual entry. |")
    lines.append(f"| `weapon`         | {emp('weapon')} / {total} | Same — never extracted. |")
    lines.append(f"| `birth_date`     | {emp('birth_date')} / {total}  | The big OCR gap. P2–P4 buckets above. |")
    lines.append(f"| `martyrdom_date` | {emp('martyrdom_date')} / {total}  | P5 + some P1. |")
    lines.append(f"| `military_rank`  | {emp('military_rank')} / {total}  | Often visible in caption but parser may miss it. |")
    lines.append(f"| `battalion`      | {emp('battalion')} / {total}  | |")
    lines.append(f"| `brigade`        | {emp('brigade')} / {total}  | |")
    lines.append(f"| `photo_path`     | {emp('photo_path')} / {total}  | P6 — recover with `scripts/recover_photos.py`. |")
    lines.append(f"| `name`           | {emp('name')} / {total}    | Same 3 as P0 `missing_critical`. |")
    lines.append("")

    lines.append("## Tooling available")
    lines.append("")
    lines.append("| Script | Use for |")
    lines.append("|:---|:---|")
    lines.append("| `python scripts/reprocess.py --msg-id N`         | Re-OCR a single row, print result. |")
    lines.append("| `python scripts/reprocess.py --msg-id N --update` | Re-OCR and overwrite the existing Excel row. |")
    lines.append("| `python scripts/fill_birth_dates_v2.py`          | Overnight batch: re-OCR all rows where birth_date is blank. |")
    lines.append("| `python scripts/recover_photos.py`               | Re-download missing photo files. |")
    lines.append("| Admin UI (`webui/` → \"تحرير\")                   | Hand-edit any row; saves to overrides. Best for P1 malformed dates. |")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}  ({len(lines)} lines)")


if __name__ == "__main__":
    main()
