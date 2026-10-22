"""서버 없이 더블클릭으로 열리는 단일 HTML 파일을 만든다 (원본 WP5_InspectionDT.html 과 같은 배포 형태).

  python tools/export_html.py            →  export/WP5_InspectionDT_py.html

들어가는 것: 화면 코드(web/js) · CSS · 글꼴(Pretendard 부분 글꼴) · three.js(web/vendor) · 서버가 계산하는 모든 데이터
(시나리오 3개 · 데이터 사전 · 편차 맵 · 2D 영상). 파일 안에 모두 들어 있어 인터넷도 필요 없다.
(ES 모듈은 import map 의 data: URL 로 연결한다. Edge · Chrome 에서 file:// 로 열린다.)
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

WEB = ROOT / "web"
OUT = ROOT / "export" / "WP5_InspectionDT_py.html"


def data_url(text_or_bytes, mime="text/javascript"):
    raw = text_or_bytes.encode("utf-8") if isinstance(text_or_bytes, str) else text_or_bytes
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def js_literal(obj):
    # <script> 안에 넣어도 닫히지 않도록 "</" 를 "<\/" 로 (JSON 문자열 안에서만 나타난다)
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main():
    # 1) 화면 모듈: "./x.js" → "dt/x" (import map 이름), 그리고 이름 → data URL
    imports = {}
    for p in sorted((WEB / "js").glob("*.js")):
        src = p.read_text(encoding="utf-8")
        src = re.sub(r'(from\s+|import\s+)(["\'])\./([A-Za-z0-9_]+)\.js\2', r'\1\2dt/\3\2', src)
        imports[f"dt/{p.stem}"] = data_url(src)
    # 2) three.js
    imports["three"] = data_url((WEB / "vendor/three/three.module.min.js").read_bytes())
    imports["three/addons/controls/OrbitControls.js"] = data_url((WEB / "vendor/three/addons/controls/OrbitControls.js").read_bytes())

    # 3) 서버가 만드는 데이터 (화면이 /api/... 로 요청하는 것과 같은 경로를 키로 쓴다)
    js = {"/api/codes": payloads.codes()}
    for sid in payloads.SCENARIOS:
        js[f"/api/scenario/{sid}"] = payloads.scenario(sid)
    for part in payloads.PARTS:
        js[f"/api/devgrid/{part}"] = payloads.devgrid(part)
    blob = {}
    for spot, sat in payloads.needed_spots():
        blob[f"/api/spot/{spot}?sat={sat}"] = {"type": "image/png", "b64": base64.b64encode(payloads.spot_png(spot, bool(sat))).decode("ascii")}
    embed = {"json": js, "blob": blob}

    # 4) HTML 조립: index.html 의 뼈대를 쓰고 CSS · 스크립트만 바꿔 넣는다
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "style.css").read_text(encoding="utf-8")
    # 글꼴: 이 화면에 쓰는 글자만 남긴 Pretendard 를 CSS 에 base64 로 넣는다 (매번 현재 문구 기준으로 다시 만든다)
    font_data, _ = fonts.build_all()
    for w, b in font_data.items():
        css = css.replace(f"url(vendor/fonts/Pretendard-{fonts.WEIGHTS[w]}.woff2)", f"url({data_url(b, 'font/woff2')})")
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    a = html.index('<script type="importmap">')
    b = html.index("</body>")
    scripts = (
        f"<script>window.__DT_DATA__={js_literal(embed)};</script>\n"
        f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n'
        '<script type="module">import "dt/main";</script>\n'
    )
    html = html[:a] + scripts + html[b:]

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    mb = OUT.stat().st_size / 1e6
    print(f"{OUT.relative_to(ROOT)}  {mb:.2f} MB  (모듈 {len([k for k in imports if k.startswith('dt/')])}개 · 데이터 {len(js)}개 · 영상 {len(blob)}장)")


if __name__ == "__main__":
    main()
