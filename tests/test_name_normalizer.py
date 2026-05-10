from src.name_normalizer import normalize_arabic_name

def test_normalize_alef_variants():
    assert normalize_arabic_name("أحمد") == "احمد"
    assert normalize_arabic_name("إبراهيم") == "ابراهيم"
    assert normalize_arabic_name("آدم") == "ادم"

def test_normalize_ta_marbuta():
    assert normalize_arabic_name("الصوالحة") == "الصوالحه"

def test_normalize_ya():
    assert normalize_arabic_name("على") == "علي"

def test_remove_diacritics():
    assert normalize_arabic_name("مُحَمَّد") == "محمد"

def test_collapse_whitespace():
    assert normalize_arabic_name("محمد   إسماعيل") == "محمد اسماعيل"

def test_remove_tatweel():
    assert normalize_arabic_name("مـحـمـد") == "محمد"

def test_combined():
    assert normalize_arabic_name("مُحَمَّد إسماعيل الصوالحة") == "محمد اسماعيل الصوالحه"
