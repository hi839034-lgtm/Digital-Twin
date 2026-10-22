"""서버 없이 더블클릭으로 열리는 단일 HTML 파일을 만든다 (원본 WP5_InspectionDT.html 과 같은 배포 형태).

  python tools/export_html.py          →  v1, v2 둘 다
  python tools/export_html.py v1       →  export/WP5_InspectionDT_py_v1.html   (web/  : 직접 작성한 화면)
  python tools/export_html.py v2       →  export/WP5_InspectionDT_py_v2.html   (web2/ : 원본 화면 코드 + 서버 데이터)

들어가는 것: 화면 코드 · CSS · 글꼴(Pretendard 부분 글꼴) · three.js · 서버(server/payloads.py)가 계산하는 모든 데이터
(시나리오 3개 · 데이터 사전 · 편차 맵 · 2D 영상). 파일 안에 모두 들어 있어 서버도 인터넷도 필요 없다.
"""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
import payloads  # noqa: E402
sys.path.insert(0, str(ROOT / "tools"))
import fonts  # noqa: E402

OUT_DIR = ROOT / "export"


def data_url(text_or_bytes, mime="text/javascript"):
    raw = text_or_bytes.encode("utf-8") if isinstance(text_or_bytes, str) else text_or_bytes
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def js_literal(obj):
    # <script> 안에 넣어도 닫히지 않도록 "</" 를 "<\/" 로 (JSON 문자열 안에서만 나타난다)
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def inline_fonts(css, font_data):
    """CSS 의 글꼴 파일 참조를 base64 data URL 로 바꾼다 (v1: vendor/fonts/…, v2: /vendor/fonts/…)"""
    for w, b in font_data.items():
        css = re.sub(rf"url\(/?vendor/fonts/Pretendard-{fonts.WEIGHTS[w]}\.woff2\)", lambda m: f"url({data_url(b, 'font/woff2')})", css)
    return css


def spot_blobs():
    blob = {}
    for spot, sat in payloads.needed_spots():
        blob[f"/api/spot/{spot}?sat={sat}"] = {"type": "image/png", "b64": base64.b64encode(payloads.spot_png(spot, bool(sat))).decode("ascii")}
    return blob


def safe_script_text(text):
    """인라인 <script> 안에 넣을 때 </script 가 끼어 있으면 닫히므로 이스케이프"""
    return re.sub(r"</(script)", r"<\\/\1", text, flags=re.I)


def write(name, html):
    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / name
    out.write_text(html, encoding="utf-8")
    return out


# ---------------------------------------------------------------- v1 (web/)
def build_v1(font_data):
    web = ROOT / "web"
    # 화면 모듈: "./x.js" → "dt/x" (import map 이름), 그리고 이름 → data URL
    imports = {}
    for p in sorted((web / "js").glob("*.js")):
        src = re.sub(r'(from\s+|import\s+)(["\'])\./([A-Za-z0-9_]+)\.js\2', r'\1\2dt/\3\2', p.read_text(encoding="utf-8"))
        imports[f"dt/{p.stem}"] = data_url(src)
    imports["three"] = data_url((web / "vendor/three/three.module.min.js").read_bytes())
    imports["three/addons/controls/OrbitControls.js"] = data_url((web / "vendor/three/addons/controls/OrbitControls.js").read_bytes())

    js = {"/api/codes": payloads.codes()}
    for sid in payloads.SCENARIOS:
        js[f"/api/scenario/{sid}"] = payloads.scenario(sid)
    for part in payloads.PARTS:
        js[f"/api/devgrid/{part}"] = payloads.devgrid(part)
    embed = {"json": js, "blob": spot_blobs()}

    html = (web / "index.html").read_text(encoding="utf-8")
    css = inline_fonts((web / "style.css").read_text(encoding="utf-8"), font_data)
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    a, b = html.index('<script type="importmap">'), html.index("</body>")
    html = html[:a] + (
        f"<script>window.__DT_DATA__={js_literal(embed)};</script>\n"
        f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n'
        '<script type="module">import "dt/main";</script>\n') + html[b:]
    out = write("WP5_InspectionDT_py_v1.html", html)
    return out, f"모듈 {len(imports) - 2}개 · 데이터 {len(js)}개 · 영상 {len(embed['blob'])}장"


# ---------------------------------------------------------------- v2 (web2/)
def build_v2(font_data):
    web2 = ROOT / "web2"
    js = {"/api/codes": payloads.codes()}
    for sid in payloads.SCENARIOS:
        js[f"/api/scenario/{sid}?full=true"] = payloads.scenario(sid, full=True)
    for part in payloads.PARTS:
        js[f"/api/devgrid/{part}"] = payloads.devgrid(part)
    embed = {"json": js, "blob": spot_blobs()}

    html = (web2 / "index.html").read_text(encoding="utf-8")
    css = inline_fonts((web2 / "style.css").read_text(encoding="utf-8"), font_data)
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    three = safe_script_text((web2 / "vendor/three.r128.min.js").read_text(encoding="utf-8"))
    orbit = safe_script_text((web2 / "vendor/OrbitControls.r128.js").read_text(encoding="utf-8"))
    ui = safe_script_text((web2 / "ui.js").read_text(encoding="utf-8"))
    adapter = safe_script_text((web2 / "adapter.js").read_text(encoding="utf-8"))
    a, b = html.index('<script src="vendor/three.r128.min.js">'), html.index("</body>")
    html = html[:a] + (
        f"<script>window.__DT_DATA__={js_literal(embed)};</script>\n"
        f"<script>{three}</script>\n<script>{orbit}</script>\n"
        f'<script id="dt-ui" type="text/plain">{ui}</script>\n'   # 실행하지 않는 텍스트로 두고, adapter 가 데이터를 만든 뒤 실행한다
        f"<script>{adapter}</script>\n") + html[b:]
    out = write("WP5_InspectionDT_py_v2.html", html)
    return out, f"데이터 {len(js)}개 · 영상 {len(embed['blob'])}장"


def main(which):
    font_data, _ = fonts.build_all()  # 두 화면의 글자를 모두 포함하는 글꼴 (매번 현재 문구 기준으로 다시 만든다)
    builders = {"v1": build_v1, "v2": build_v2}
    for k in (["v1", "v2"] if which == "all" else [which]):
        out, info = builders[k](font_data)
        print(f"{out.relative_to(ROOT)}  {out.stat().st_size / 1e6:.2f} MB  ({info})")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg not in ("v1", "v2", "all"):
        sys.exit("사용법: python tools/export_html.py [v1|v2|all]")
    main(arg)
