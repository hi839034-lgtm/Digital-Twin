"""원본 WP5_InspectionDT.html 에서 화면 계층을 꺼내 web2/ 를 만든다.

  python tools/import_original_ui.py <원본 HTML 경로>

꺼내는 것: CSS · 화면 구조(HTML) · 화면 코드(ui.js) · three.js r128 · OrbitControls r128
바꾸는 것: ① 로봇 경로 계획(planWin)은 서버가 계산한 w.plan 을 쓰고, ② 2D 영상은 서버가 만든 PNG 를 쓰고,
              ③ 도킹 보정 전 툴 끝 오차는 서버가 계산한 w.dockBefore 를 쓴다.
              나머지 화면 코드는 원본 그대로다. 계산 모듈(KIN · GEOM · SCEN · CODES)은 web2/adapter.js 가
              서버 데이터로 같은 모양의 전역 객체를 만들어 준다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web2"

FONT_FACE = "".join(
    f'@font-face{{font-family:"Pretendard";font-style:normal;font-weight:{w};font-display:swap;'
    f'src:url(/vendor/fonts/Pretendard-{n}.woff2) format("woff2")}}\n'
    for w, n in [(400, "Regular"), (500, "Regular"), (600, "SemiBold"), (700, "Bold")]
)


def between(s, a, b, start=0):
    i = s.index(a, start) + len(a)
    return s[i:s.index(b, i)], i


def patch_planwin(js):
    a = js.index("function planWin(w) {")
    b = js.index("function robotAt(c, tt)")
    new = ("// [py] 로봇 경로 계획은 서버(server/sim/plan.py)가 계산해 w.plan = {K, segs} 로 내려준다. 여기서는 실제 도킹 자세의 셀 기하만 붙인다.\n"
           "function planWin(w) { w.plan.act = KIN.makeCtx(w.pose); }\n")
    return js[:a] + new + js[b:]


def patch_spotimg(js):
    a = js.index("function spotImg(spot, sat) {")
    m = re.compile(r"return imgCache\[key\] = cv;\s*\}").search(js, a)  # 원본은 줄바꿈이 섞여 있어 공백 허용
    b = m.end()
    new = ("function spotImg(spot, sat) { // [py] 2D 영상은 서버(server/sim/render.py)가 만든 PNG 를 쓴다\n"
           "    const key = spot + (sat ? ':sat' : ''); if (imgCache[key]) return imgCache[key];\n"
           "    const bm = GEOM.IMG[key]; const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0); return imgCache[key] = cv; }")
    return js[:a] + new + js[b:]


def patch_docks(js):
    a = js.index("const path = s.cell === '3D' ? KIN.scanPasses(")
    marker = "const before = KIN.tipError(KIN.solvePath(path, KIN.HOME, act), act);"
    b = js.index(marker, a) + len(marker)
    return js[:a] + "const before = w.dockBefore; // [py] 보정 전 툴 끝 오차는 서버(sim/plan.py dock_before)가 계산한다" + js[b:]


def main(src_path):
    src = Path(src_path).read_text(encoding="utf-8")
    OUT.mkdir(exist_ok=True)
    (OUT / "vendor").mkdir(exist_ok=True)

    css, _ = between(src, "<style>", "</style>")
    css = re.sub(r"@font-face\{[^}]*\}", "", css)
    (OUT / "style.css").write_text(FONT_FACE + css.strip() + "\n", encoding="utf-8")

    body_start = src.index("</style>") + len("</style>")
    first_script = src.index("<script", body_start)
    markup = src[body_start:first_script].replace("</head>", "").replace("<body>", "").strip()

    blocks = []
    pos = 0
    while True:
        m = re.compile(r"<script[^>]*>").search(src, pos)
        if not m:
            break
        end = src.index("</script>", m.end())
        blocks.append(src[m.end():end])
        pos = end + len("</script>")
    three, orbit, _core, ui = blocks[:4]
    (OUT / "vendor" / "three.r128.min.js").write_text(three.strip() + "\n", encoding="utf-8")
    (OUT / "vendor" / "OrbitControls.r128.js").write_text(orbit.strip() + "\n", encoding="utf-8")

    ui = patch_docks(patch_spotimg(patch_planwin(ui)))
    (OUT / "ui.js").write_text("/* WP5 DT 화면 코드 — 원본 WP5_InspectionDT.html 에서 가져옴 (tools/import_original_ui.py, [py] 표시 3곳만 수정) */\n" + ui.strip() + "\n", encoding="utf-8")

    html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WP5 검사셀 디지털트윈</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
{markup}
<script src="vendor/three.r128.min.js"></script>
<script src="vendor/OrbitControls.r128.js"></script>
<script src="adapter.js"></script>
</body>
</html>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    for p in sorted(OUT.rglob("*")):
        if p.is_file():
            print(f"{p.relative_to(ROOT)}  {p.stat().st_size / 1000:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1])
