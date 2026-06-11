# scripts/recover_missing_photos.py
"""Recover martyr portrait photos for rows where photo_path IS NULL.

Root cause (2026-06-10 investigation): the daily scraper pairs each video
with its portrait photo by EXACT caption-name match within the same batch
(+ a 20-message lookback). A photo posted in a *later* batch never
back-fills an already-processed video, captions that parse slightly
differently never match, and a transient download failure leaves "" —
all of which strand the row with photo_path NULL even though the video
side (frames, OCR) worked fine.

This script re-queries Telegram around each photo-less video with a wider
window (±WINDOW messages) and matches photo captions in three tiers,
nearest message first:

  1. exact       — photo caption name == video caption / DB name
  2. normalized  — equal after normalize_arabic_name (diacritics, hamza
                   variants, whitespace)
  3. name-overlap — ONLY at offsets -1/-2 (the channel posts the portrait
                   immediately before the video): the captions often spell
                   the same person slightly differently (photo msg 117
                   "أحمد ماجد أبو طير" vs video msg 118 "أمجد ماجد أبو طير",
                   extra middle names, typos). Accepted when the normalized
                   token sets share >= 2 tokens AND >= half of the target's
                   tokens — a missing photo can't pair with the *previous*
                   martyr's portrait because two different names won't clear
                   that bar.

The matched photo is downloaded to data/photos/<msg_id>.jpg and ONLY the
photo_path column is updated. Dates, names, OCR mirrors and verification
state (human or AI) are never touched.

Usage:
  python scripts\recover_missing_photos.py --dry-run      # report matches only
  python scripts\recover_missing_photos.py                # download + update DB
  python scripts\recover_missing_photos.py --ids 118,168  # subset
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

# Force UTF-8 on stdout — Arabic names crash Windows cp1252 consoles.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import load_config
from src.telegram_client import TelegramFetcher
from src.parser_caption import parse_caption
from src.name_normalizer import normalize_arabic_name
from src.sqlserver_client import make_conn

PHOTOS_DIR = "data/photos"
WINDOW = 10  # messages searched on each side of the video


def fetch_missing(conn, ids=None) -> list:
    """(msg_id, name) for every row still missing a photo."""
    cur = conn.cursor()
    sql = "SELECT msg_id, name FROM dbo.martyrs WHERE photo_path IS NULL"
    params = []
    if ids:
        sql += f" AND msg_id IN ({','.join('?' for _ in ids)})"
        params = list(ids)
    sql += " ORDER BY msg_id"
    cur.execute(sql, *params)
    return [(r[0], r[1] or "") for r in cur.fetchall()]


def set_photo_path(conn, msg_id: int, path: str) -> None:
    """The one and only DB write this script performs."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE dbo.martyrs SET photo_path = ? WHERE msg_id = ?",
        path, msg_id,
    )
    conn.commit()


def _norm_tokens(name: str) -> set:
    return set(normalize_arabic_name(name).split())


def neighbor_ids(msg_id: int, window: int) -> list:
    """Adjacent msg ids nearest-first, before-the-video preferred at each
    distance (the channel posts the portrait immediately before the video)."""
    out = []
    for d in range(1, window + 1):
        out.extend([msg_id - d, msg_id + d])
    return [i for i in out if i > 0]


async def recover_one(fetcher, conn, channel, msg_id, db_name, dry_run) -> dict:
    nids = neighbor_ids(msg_id, WINDOW)
    msgs = await fetcher.client.get_messages(channel, ids=[msg_id] + nids)
    by_id = {m.id: m for m in msgs if m is not None}

    video_raw = by_id.get(msg_id)
    video_name = parse_caption(video_raw.message or "")["name"] if video_raw else ""
    targets = [n for n in dict.fromkeys([video_name, db_name]) if n]
    target_norms = {normalize_arabic_name(n) for n in targets}
    target_token_sets = [_norm_tokens(n) for n in targets]
    if not targets:
        return {"msg_id": msg_id, "status": "no-name",
                "detail": "video message gone and DB name empty"}

    for nid in nids:  # already nearest-first
        raw = by_id.get(nid)
        if raw is None:
            continue
        tg = fetcher._to_tg_message(raw)
        if not tg.has_photo:
            continue
        nm = parse_caption(tg.caption)["name"]
        if not nm:
            continue
        if nm in targets:
            tier = "exact"
        elif normalize_arabic_name(nm) in target_norms:
            tier = "normalized"
        elif nid - msg_id in (-1, -2):
            # Positional tier: the portrait is conventionally the message
            # right before the video, but its caption may spell the name
            # differently. Require a solid token overlap so a genuinely
            # missing photo can't grab the previous martyr's portrait.
            toks = _norm_tokens(nm)
            tier = None
            for tt in target_token_sets:
                overlap = len(toks & tt)
                if overlap >= 2 and overlap * 2 >= len(tt):
                    tier = f"name-overlap {overlap}/{len(tt)}"
                    break
        else:
            tier = None
        if tier is None:
            continue

        result = {"msg_id": msg_id, "status": "matched", "photo_msg": nid,
                  "offset": nid - msg_id, "tier": tier, "name": nm,
                  "target": targets[0]}
        if dry_run:
            return result
        out_path = os.path.join(PHOTOS_DIR, f"{msg_id}.jpg")
        try:
            await fetcher.download_photo(tg, out_path)
        except Exception as e:
            result.update(status="download-failed", detail=str(e))
            return result
        set_photo_path(conn, msg_id, out_path)
        result["status"] = "recovered"
        return result

    return {"msg_id": msg_id, "status": "no-photo-found",
            "detail": f"no name-matched photo within ±{WINDOW}"}


async def main(dry_run: bool, ids):
    cfg = load_config()
    conn = make_conn(cfg)
    missing = fetch_missing(conn, ids)
    print(f"{len(missing)} rows missing photo_path"
          f"{' (dry run — no downloads, no DB writes)' if dry_run else ''}\n")
    if not missing:
        conn.close()
        return

    fetcher = TelegramFetcher(
        cfg.api_id, cfg.api_hash, cfg.phone, cfg.two_fa_password,
        cfg.session_path, cfg.channel_username,
    )
    await fetcher.connect()

    results = []
    for msg_id, db_name in missing:
        r = await recover_one(fetcher, conn, cfg.channel_username,
                              msg_id, db_name, dry_run)
        results.append(r)
        if r["status"] in ("matched", "recovered"):
            print(f"  {msg_id:>5}  {r['status']:<13} photo msg {r['photo_msg']} "
                  f"(offset {r['offset']:+d}, {r['tier']})")
            print(f"         video/db: {r.get('target','')}")
            print(f"         photo:    {r['name']}")
        else:
            print(f"  {msg_id:>5}  {r['status']:<13} {r.get('detail','')}")
        await asyncio.sleep(0.5)  # stay polite with Telegram

    await fetcher.disconnect()
    conn.close()

    by_status = {}
    for r in results:
        by_status.setdefault(r["status"], []).append(r["msg_id"])
    print("\nSummary:")
    for status, mids in sorted(by_status.items()):
        print(f"  {status:<16} {len(mids):>3}  {', '.join(map(str, mids))}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Report matches only — no downloads, no DB writes.")
    ap.add_argument("--ids", type=str, default="",
                    help="Comma-separated msg_ids to limit the run.")
    args = ap.parse_args()
    id_list = [int(x) for x in args.ids.split(",") if x.strip()] if args.ids else None
    asyncio.run(main(args.dry_run, id_list))
