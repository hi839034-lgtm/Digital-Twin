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
    """화면에 나올 수 있는 모든 글자: 두 화면(v1 web, v2 web2)의 코드 · CSS · 서버가 내려주는 모든 데이터"""
    sys.path.insert(0, str(ROOT / "server"))
    import payloads
    text = []
    files = [ROOT / "web" / "index.html", ROOT / "web" / "style.css", *sorted((ROOT / "web" / "js").glob("*.js")),
             ROOT / "web2" / "index.html", ROOT / "web2" / "style.css", ROOT / "web2" / "ui.js", ROOT / "web2" / "adapter.js"]
    for p in files:  # v1(web) 과 v2(web2) 화면에 나오는 글자를 모두 포함
        if p.exists():
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
    """굵기별 woff2 바이트와 글자 목록.
    원본 OTF(web/vendor/fonts/src, 용량 때문에 깃 제외)가 있으면 현재 문구 기준으로 다시 줄이고,
    없으면(저장소를 새로 받은 경우) 깃에 올라가 있는 줄인 글꼴(web/vendor/fonts/*.woff2)을 그대로 쓴다."""
    chars = collect_chars()
    if all((SRC / f"Pretendard-{n}.otf").exists() for n in WEIGHTS.values()):
        return {w: subset_weight(w, chars) for w in WEIGHTS}, chars
    print("[fonts] 원본 OTF 없음 → 저장소의 줄인 글꼴(woff2)을 그대로 사용합니다. 문구를 바꿨다면 OTF를 받아 다시 줄이세요 (tools/subset_font.py).", file=sys.stderr)
    out = {w: (SRC.parent / f"Pretendard-{n}.woff2").read_bytes() for w, n in WEIGHTS.items()}
    return out, chars
