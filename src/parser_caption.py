import re

NAME_RE = re.compile(r'الشهيد\s+[^/\n]*?/\s*([^\n]+)', re.UNICODE)
BATTALION_RE = re.compile(r'كتيبة\s+([^()\-\n]+?)(?:\s*[\(\-]|\n|$)', re.UNICODE)
BRIGADE_RE = re.compile(r'لواء\s+([^\n#]+?)(?:\s*[\n#]|$)', re.UNICODE)

def parse_caption(text: str) -> dict:
    if not text:
        return {"name": "", "battalion": "", "brigade": ""}

    def grab(rx):
        m = rx.search(text)
        return m.group(1).strip() if m else ""

    return {
        "name": grab(NAME_RE),
        "battalion": ("كتيبة " + grab(BATTALION_RE)) if grab(BATTALION_RE) else "",
        "brigade": ("لواء " + grab(BRIGADE_RE)) if grab(BRIGADE_RE) else "",
    }
