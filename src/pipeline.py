# src/pipeline.py
import os
import logging
import tempfile
from src.parser_caption import parse_caption
from src.parser_ocr import parse_ocr_text, merge_extractions
from src.name_normalizer import normalize_arabic_name
from src.frame_extractor import extract_frames
from src.ocr_engine import ocr_image
from src.excel_writer import MartyrRow

log = logging.getLogger("pipeline")

def determine_status(merged: dict) -> str:
    if not merged.get("birth_date") and not merged.get("martyrdom_date"):
        return "missing_critical"
    if not merged.get("birth_date"):
        return "partial_birth"
    if not merged.get("martyrdom_date"):
        return "partial_martyrdom"
    return "complete"

async def process_message(tg_msg, fetcher, channel: str,
                          photos_dir: str, frames_dir: str,
                          missing_birth_log_path: str) -> MartyrRow:
    msg_id = tg_msg.msg_id
    log.info(f"Processing msg {msg_id}")

    cap = parse_caption(tg_msg.caption)

    photo_path = ""
    if tg_msg.has_photo:
        photo_path = os.path.join(photos_dir, f"{msg_id}.jpg")
        try:
            await fetcher.download_photo(tg_msg, photo_path)
        except Exception as e:
            log.warning(f"Photo download failed for {msg_id}: {e}")
            photo_path = ""

    frame_paths = []
    merged = {"birth_date": "", "martyrdom_date": "", "city": "",
              "weapon": "", "military_rank": ""}

    if tg_msg.has_video:
        with tempfile.TemporaryDirectory() as td:
            video_path = os.path.join(td, f"{msg_id}.mp4")
            try:
                await fetcher.download_video(tg_msg, video_path)
                frame_paths = extract_frames(video_path, frames_dir, msg_id)
            except Exception as e:
                log.warning(f"Video download/extract failed for {msg_id}: {e}")
        if frame_paths:
            extractions = []
            for fp in frame_paths:
                try:
                    text = ocr_image(fp)
                    extractions.append(parse_ocr_text(text))
                except Exception as e:
                    log.warning(f"OCR failed on {fp}: {e}")
            merged = merge_extractions(extractions)

    # Photo OCR fallback for critical missing fields
    if photo_path and (not merged["birth_date"] or not merged["martyrdom_date"]):
        try:
            text = ocr_image(photo_path)
            photo_extract = parse_ocr_text(text)
            if not merged["birth_date"]:
                merged["birth_date"] = photo_extract.get("birth_date", "")
            if not merged["martyrdom_date"]:
                merged["martyrdom_date"] = photo_extract.get("martyrdom_date", "")
            for k in ("city", "weapon", "military_rank"):
                if not merged[k]:
                    merged[k] = photo_extract.get(k, "")
        except Exception as e:
            log.warning(f"Photo OCR fallback failed for {msg_id}: {e}")

    status = determine_status(merged)
    if status in ("partial_birth", "missing_critical"):
        with open(missing_birth_log_path, "a", encoding="utf-8") as f:
            f.write(f"{msg_id}\n")

    return MartyrRow(
        msg_id=msg_id,
        name=cap["name"],
        name_normalized=normalize_arabic_name(cap["name"]),
        birth_date=merged.get("birth_date", ""),
        martyrdom_date=merged.get("martyrdom_date", ""),
        city=merged.get("city", ""),
        military_rank=merged.get("military_rank", ""),
        weapon=merged.get("weapon", ""),
        battalion=cap["battalion"],
        brigade=cap["brigade"],
        photo_path=photo_path,
        frame_paths=";".join(frame_paths),
        posted_date=tg_msg.posted_date,
        message_link=f"https://t.me/{channel}/{msg_id}",
        extraction_status=status,
        duplicate_status="unique",
    )
