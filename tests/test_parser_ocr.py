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
