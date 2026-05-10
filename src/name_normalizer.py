import re

DIACRITICS = "ًٌٍَُِّْ"
TATWEEL = "ـ"
ALEF_VARIANTS = "أإآ"
YA_VARIANTS = "ى"
TA_MARBUTA = "ة"

def normalize_arabic_name(text: str) -> str:
    if not text:
        return ""
    s = text
    s = re.sub(f"[{DIACRITICS}]", "", s)
    s = s.replace(TATWEEL, "")
    s = re.sub(f"[{ALEF_VARIANTS}]", "ا", s)
    s = s.replace(TA_MARBUTA, "ه")
    s = re.sub(f"[{YA_VARIANTS}]", "ي", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
