# src/ocr_engine.py
import easyocr

_reader = None

def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        # First call downloads ~250 MB of models. CPU mode (no GPU required).
        _reader = easyocr.Reader(["ar", "en"], gpu=False, verbose=False)
    return _reader

def ocr_image(image_path: str) -> str:
    reader = get_reader()
    results = reader.readtext(image_path, detail=0, paragraph=True)
    return "\n".join(results)
