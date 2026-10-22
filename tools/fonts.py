"""Pretendard 글꼴 줄이기 (이 화면에 쓰는 글자만 남긴 woff2).

원본 글꼴(OTF, 굵기당 약 1.5 MB)은 web/vendor/fonts/src/ 에 두고(저장소에는 올리지 않음),
화면 코드 · 서버 데이터에 나오는 글자만 남겨 굵기당 수십~백여 KB 로 줄인다.
Pretendard: SIL OFL 1.1 (licenses/LICENSE_Pretendard.txt)
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "vendor" / "fonts" / "src"
WEIGHTS = {400: "Regular", 600: "SemiBold", 700: "Bold"}


def collect_chars():
    """화면에 나올 수 있는 모든 글자: 화면 코드 · CSS · 서버가 내려주는 모든 데이터"""
    sys.path.insert(0, str(ROOT / "server"))
    import payloads
    text = []
    for p in [ROOT / "web" / "index.html", ROOT / "web" / "style.css", *sorted((ROOT / "web" / "js").glob("*.js"))]:
        text.append(p.read_text(encoding="utf-8"))
    text.append(json.dumps(payloads.codes(), ensure_ascii=False))
    for sid in payloads.SCENARIOS:
        text.append(json.dumps(payloads.scenario(sid), ensure_ascii=False))
    chars = set("".join(text)) | {chr(c) for c in range(0x20, 0x7F)}
    return "".join(sorted(c for c in chars if c.isprintable()))


def subset_weight(weight, chars):
    """굵기 하나의 woff2 바이트"""
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    opts.notdef_outline = True
    font = subset.load_font(str(SRC / f"Pretendard-{WEIGHTS[weight]}.otf"), opts)
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(font)
    buf = io.BytesIO()
    subset.save_font(font, buf, opts)
    return buf.getvalue()


def build_all():
    chars = collect_chars()
    return {w: subset_weight(w, chars) for w in WEIGHTS}, chars
