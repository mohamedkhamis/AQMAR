from src.parser_caption import parse_caption

CAPTION_1 = (
    "أَقمَارُ الطُّوْفَانْ\n"
    "الشهيد القائد الميداني/ محمد إسماعيل الصوالحة\n"
    "▫️كتيبة الشهيد رائد العطار (يبنا) - لواء رفح\n"
    "#طوفان_الأقصى"
)

def test_extract_name():
    r = parse_caption(CAPTION_1)
    assert r["name"] == "محمد إسماعيل الصوالحة"

def test_extract_battalion():
    r = parse_caption(CAPTION_1)
    assert r["battalion"] == "كتيبة الشهيد رائد العطار"

def test_extract_brigade():
    r = parse_caption(CAPTION_1)
    assert r["brigade"] == "لواء رفح"

def test_qassami_mujahid_honorific():
    cap = "الشهيد القسامي المجاهد/ أحمد محمد مقداد\nكتيبة X - لواء Y"
    r = parse_caption(cap)
    assert r["name"] == "أحمد محمد مقداد"

def test_missing_battalion():
    cap = "الشهيد القائد الميداني/ فلان الفلاني\n#طوفان_الأقصى"
    r = parse_caption(cap)
    assert r["name"] == "فلان الفلاني"
    assert r["battalion"] == ""
    assert r["brigade"] == ""

def test_empty_caption():
    r = parse_caption("")
    assert r == {"name": "", "battalion": "", "brigade": ""}
