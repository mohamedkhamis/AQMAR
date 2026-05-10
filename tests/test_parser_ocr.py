from src.parser_ocr import parse_ocr_text, normalize_date, merge_extractions

OCR_CLEAN = (
    "الرتبة العسكرية: نائب قائد سرية\n"
    "تاريخ الميلاد: 1980-02-12\n"
    "تاريخ الاستشهاد: 2024-05-17\n"
    "المدينة: غزة\n"
    "السلاح: المدفعية\n"
)

def test_parse_clean_ocr():
    r = parse_ocr_text(OCR_CLEAN)
    assert r["birth_date"] == "1980-02-12"
    assert r["martyrdom_date"] == "2024-05-17"
    assert r["city"] == "غزة"
    assert r["weapon"] == "المدفعية"
    assert r["military_rank"] == "نائب قائد سرية"

def test_ignore_field_commander_rank():
    text = "الرتبة العسكرية: القائد الميداني\nتاريخ الميلاد: 1990-01-01"
    r = parse_ocr_text(text)
    assert r["military_rank"] == ""
    assert r["birth_date"] == "1990-01-01"

def test_letter_variations():
    text = "تاريخ الميلاد: 1980-02-12\nالمدينه: غزه\nالرتبه العسكريه: نائب قائد سريه"
    r = parse_ocr_text(text)
    assert r["birth_date"] == "1980-02-12"
    assert r["city"] == "غزه"
    assert r["military_rank"] == "نائب قائد سريه"

def test_normalize_date_iso():
    assert normalize_date("2026-05-08") == "2026-05-08"

def test_normalize_date_slash():
    assert normalize_date("8/5/2026") == "2026-05-08"

def test_normalize_date_arabic_numerals():
    assert normalize_date("٢٠٢٦-٠٥-٠٨") == "2026-05-08"

def test_normalize_date_year_only():
    assert normalize_date("1945") == "1945"

def test_normalize_date_garbage_returns_original():
    assert normalize_date("???") == "???"

def test_merge_extractions_majority_vote():
    extractions = [
        {"birth_date": "1980-02-12", "city": "غزة", "weapon": ""},
        {"birth_date": "1980-02-12", "city": "غزة", "weapon": "المدفعية"},
        {"birth_date": "1880-02-12", "city": "غزة", "weapon": ""},  # OCR error
    ]
    merged = merge_extractions(extractions)
    assert merged["birth_date"] == "1980-02-12"  # majority
    assert merged["city"] == "غزة"  # all agree
    assert merged["weapon"] == "المدفعية"  # only non-empty

def test_merge_extractions_all_empty():
    extractions = [{"birth_date": ""}, {"birth_date": ""}]
    merged = merge_extractions(extractions)
    assert merged["birth_date"] == ""


# Phase 0 findings — real channel uses "تاريخ الشهادة" not "تاريخ الاستشهاد"

def test_martyrdom_label_shahada():
    text = "تاريخ الشهادة: 2025-03-18\nتاريخ الميلاد: 1997-08-01"
    r = parse_ocr_text(text)
    assert r["martyrdom_date"] == "2025-03-18"
    assert r["birth_date"] == "1997-08-01"

def test_martyrdom_label_shahada_with_letter_variation():
    # ة → ه variant
    text = "تاريخ الشهاده: 2024-05-17"
    r = parse_ocr_text(text)
    assert r["martyrdom_date"] == "2024-05-17"

def test_martyrdom_label_legacy_istishhad_still_works():
    text = "تاريخ الاستشهاد: 2024-05-17"
    r = parse_ocr_text(text)
    assert r["martyrdom_date"] == "2024-05-17"

def test_martyrdom_dates_with_spaces():
    # Real OCR output of msg 716 has " 1997 - 08 - 01 " with extra spaces around hyphens
    text = "تاريخ الميلاد: 1997 - 08 - 01\nتاريخ الشهادة: 2025 - 03 - 18"
    r = parse_ocr_text(text)
    assert r["birth_date"] == "1997-08-01"
    assert r["martyrdom_date"] == "2025-03-18"

def test_normalize_date_arabic_month_year_egyptian():
    # msg 20 caption shows "مايو - 2025" — partial date → maps to mid-month (day 15)
    assert normalize_date("مايو - 2025") == "2025-05-15"

def test_normalize_date_arabic_month_year_levantine():
    assert normalize_date("أيار 2025") == "2025-05-15"
    assert normalize_date("ايار - 2025") == "2025-05-15"

def test_normalize_date_arabic_month_compound_levantine():
    # "تشرين الأول" = October
    assert normalize_date("تشرين الأول - 2024") == "2024-10-15"
    # "كانون الثاني" = January
    assert normalize_date("كانون الثاني 2024") == "2024-01-15"

def test_parse_arabic_month_year_in_martyrdom_label():
    # End-to-end: msg 20 style — full label + Arabic month value, mid-month default
    text = "تاريخ الشهادة: مايو - 2025"
    r = parse_ocr_text(text)
    assert r["martyrdom_date"] == "2025-05-15"


# Phase 0 findings — actual EasyOCR output is noisy

def test_parse_split_tarikh_word():
    # EasyOCR splits "تاريخ" as "تاري خ" (extra space before خ)
    text = "تاري خ الميلاد: 1997-08-01"
    r = parse_ocr_text(text)
    assert r["birth_date"] == "1997-08-01"

def test_parse_real_msg64_ocr():
    # Real OCR output observed from data/frames/64_30.jpg
    text = (
        "الت 7\n"
        "الرتبة العسكرية قائد فصيل\n"
        "تاري خ الميلاد 08- 01 1997\n"
        "تاريخ الشهادة 03-18 2025\n"
    )
    r = parse_ocr_text(text)
    assert r["birth_date"] == "1997-08-01"
    assert r["martyrdom_date"] == "2025-03-18"
    assert r["military_rank"] == "قائد فصيل"

def test_normalize_date_scrambled_mm_dd_yyyy():
    # Year at end, MM and DD before
    assert normalize_date("08- 01 1997") == "1997-08-01"
    assert normalize_date("03-18 2025") == "2025-03-18"

def test_normalize_date_scrambled_disambiguates_via_day_gt_12():
    # If first number > 12 it must be the day (DD-MM-YYYY)
    assert normalize_date("18 03 2025") == "2025-03-18"
    # If second > 12 it must be the day (MM-DD-YYYY)
    assert normalize_date("03 18 2025") == "2025-03-18"

def test_rank_does_not_slurp_next_field_label():
    # OCR sometimes drops newline between rank and birth date — observed in msgs 538/716/828.
    # Rank field should stop at "تاريخ" lookahead, not capture the whole rest of the line.
    text = "الرتبة العسكرية قائد فصيل تاريخ الميلاد 1986-11-15"
    r = parse_ocr_text(text)
    assert r["military_rank"] == "قائد فصيل"
    assert r["birth_date"] == "1986-11-15"

def test_rank_does_not_slurp_split_tarikh_label():
    # Same pollution but with split "تاري خ"
    text = "الرتبة العسكرية قائد مجموعة تاري خ الميلاد 10-10 1992"
    r = parse_ocr_text(text)
    assert r["military_rank"] == "قائد مجموعة"
    assert r["birth_date"] == "1992-10-10"
