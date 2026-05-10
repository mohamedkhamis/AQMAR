import re
from collections import Counter

PATTERNS = {
    "birth_date":     re.compile(r'تاريخ\s*ال?ميلاد\s*[:：\-]?\s*([0-9٠-٩\s\-/.]+)', re.UNICODE),
    "martyrdom_date": re.compile(r'تاريخ\s*ال?ا?ستشهاد\s*[:：\-]?\s*([0-9٠-٩\s\-/.]+)', re.UNICODE),
    "city":           re.compile(r'ال?مدين[ةه]\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
    "weapon":         re.compile(r'ال?سلاح\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
    "military_rank":  re.compile(r'ال?رتب[ةه]\s*ال?عسكري[ةه]\s*[:：\-]?\s*([^\n]+)', re.UNICODE),
}

RANK_IGNORE = {"القائد الميداني"}
ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

def normalize_date(raw: str) -> str:
    if not raw:
        return ""
    s = raw.translate(ARABIC_INDIC_DIGITS).strip()
    s = re.sub(r"\s+", "", s)
    m = re.match(r"^(\d{4})[\-/.](\d{1,2})[\-/.](\d{1,2})$", s)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4})$", s)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    if re.match(r"^\d{4}$", s):
        return s
    return raw.strip()

def parse_ocr_text(text: str) -> dict:
    if not text:
        return {k: "" for k in PATTERNS.keys()}
    out = {}
    for field, rx in PATTERNS.items():
        m = rx.search(text)
        if not m:
            out[field] = ""
            continue
        val = m.group(1).strip()
        if field in ("birth_date", "martyrdom_date"):
            val = normalize_date(val)
        if field == "military_rank" and val in RANK_IGNORE:
            val = ""
        out[field] = val
    return out

def merge_extractions(extractions: list) -> dict:
    if not extractions:
        return {k: "" for k in PATTERNS.keys()}
    fields = extractions[0].keys()
    merged = {}
    for f in fields:
        values = [e.get(f, "") for e in extractions if e.get(f, "")]
        if not values:
            merged[f] = ""
        else:
            counts = Counter(values)
            merged[f] = counts.most_common(1)[0][0]
    return merged
