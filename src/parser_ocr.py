import re
from collections import Counter

# Date value pattern: digits (Latin or Arabic-Indic), Arabic letters (for month
# names like "مايو"), space, hyphen, slash, dot. NOT \s — that would match \n
# and slurp the next line. Just regular space + tab.
_DATE_VAL = r'[0-9٠-٩ء-ي \t\-/.]+'

# EasyOCR sometimes splits the word "تاريخ" as "تاري خ" (extra space before خ).
# Use تاري\s*خ to tolerate both.
_TARIKH = r'تاري\s*خ'

# Stop free-text fields (rank, city, weapon) when we hit another known label —
# EasyOCR sometimes drops the newline between fields, causing the rank value
# to slurp the birth_date label and value.
_NEXT_LABEL_LOOKAHEAD = r'(?=\s*تاري|\s*ال?مدين|\s*ال?سلاح|\s*ال?رتب|\n|$)'

PATTERNS = {
    "birth_date":     re.compile(_TARIKH + r'\s*ال?ميلاد\s*[:：\-]?\s*(' + _DATE_VAL + r')', re.UNICODE),
    # Real videos use "تاريخ الشهادة" (Date of Martyrdom). Some captions use the longer
    # "تاريخ الاستشهاد". Allow ة/ه variant on shahada via [ةه].
    "martyrdom_date": re.compile(_TARIKH + r'\s*ال?(?:شهاد[ةه]|ا?ستشهاد)\s*[:：\-]?\s*(' + _DATE_VAL + r')', re.UNICODE),
    "city":           re.compile(r'ال?مدين[ةه]\s*[:：\-]?\s*(.+?)' + _NEXT_LABEL_LOOKAHEAD, re.UNICODE),
    "weapon":         re.compile(r'ال?سلاح\s*[:：\-]?\s*(.+?)' + _NEXT_LABEL_LOOKAHEAD, re.UNICODE),
    "military_rank":  re.compile(r'ال?رتب[ةه]\s*ال?عسكري[ةه]\s*[:：\-]?\s*(.+?)' + _NEXT_LABEL_LOOKAHEAD, re.UNICODE),
}

RANK_IGNORE = {"القائد الميداني"}
ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# Map of Arabic month names → month number. Covers both common variants
# (Egyptian / Gregorian) and Levantine (Hijri-aligned) names.
ARABIC_MONTHS = {
    "يناير": 1, "كانون الثاني": 1,
    "فبراير": 2, "شباط": 2,
    "مارس": 3, "آذار": 3, "اذار": 3,
    "إبريل": 4, "أبريل": 4, "ابريل": 4, "نيسان": 4,
    "مايو": 5, "أيار": 5, "ايار": 5,
    "يونيو": 6, "حزيران": 6,
    "يوليو": 7, "تموز": 7,
    "أغسطس": 8, "اغسطس": 8, "آب": 8,
    "سبتمبر": 9, "أيلول": 9, "ايلول": 9,
    "أكتوبر": 10, "اكتوبر": 10, "تشرين الأول": 10, "تشرين الاول": 10,
    "نوفمبر": 11, "تشرين الثاني": 11,
    "ديسمبر": 12, "كانون الأول": 12, "كانون الاول": 12,
}

def _arabic_month_to_number(text: str) -> int | None:
    # Longest-match first so "تشرين الأول" wins over a hypothetical short overlap.
    for name in sorted(ARABIC_MONTHS, key=len, reverse=True):
        if name in text:
            return ARABIC_MONTHS[name]
    return None

def normalize_date(raw: str) -> str:
    if not raw:
        return ""
    s = raw.translate(ARABIC_INDIC_DIGITS).strip()
    s_compact = re.sub(r"\s+", "", s)

    # ISO YYYY-MM-DD
    m = re.match(r"^(\d{4})[\-/.](\d{1,2})[\-/.](\d{1,2})$", s_compact)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4})$", s_compact)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # Smart parse: 1 four-digit year + 2 one-or-two-digit numbers, in any order
    # with arbitrary separators. Handles OCR-scrambled output like:
    #   "08- 01 1997" → 1997-08-01  (channel's observed pattern: MM DD YYYY)
    # Disambiguation: if either small number > 12, it must be the day.
    # If both <= 12 (ambiguous), assume MM DD because that matches what
    # EasyOCR consistently produces on this channel's frame layout.
    nums = re.findall(r"\d+", s)
    if len(nums) == 3:
        years = [n for n in nums if len(n) == 4]
        smalls = [n for n in nums if 1 <= len(n) <= 2]
        if len(years) == 1 and len(smalls) == 2:
            year = int(years[0])
            a, b = int(smalls[0]), int(smalls[1])
            if a > 12 and b <= 12:
                day, month = a, b
            elif b > 12 and a <= 12:
                day, month = b, a
            else:
                month, day = a, b  # both <=12: assume MM DD
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"

    # Arabic month name + 4-digit year (e.g. "مايو - 2025") → "YYYY-MM-15"
    # Map to middle of month (day 15) per user request — partial dates are still
    # actionable that way (sortable, filterable, displayable).
    month_num = _arabic_month_to_number(s)
    year_match = re.search(r"\d{4}", s)
    if month_num is not None and year_match:
        return f"{int(year_match.group()):04d}-{month_num:02d}-15"

    # Year-only
    if re.match(r"^\d{4}$", s_compact):
        return s_compact

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
