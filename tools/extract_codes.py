"""원본 WP5_InspectionDT.html 의 CODES 모듈(계층·공정·데이터 사전)을 server/data/codes.json 으로 추출한다.

사용:  python tools/extract_codes.py <원본 HTML 경로>
"""
import ast
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r"var CODES = \(function \(\) \{(.*?)\n  function build\(SC\)", src, re.S)
code = m.group(1)


def grab(start, end):
    a = code.index(start) + len(start)
    return code[a:code.index(end, a)]


def lit(text):
    return ast.literal_eval(text)


# LAYERS: 객체 리터럴(키에 따옴표 없음) → 키에 따옴표를 붙여 파이썬 리터럴로 읽는다
layers_txt = "[" + grab("const LAYERS = [", "];") + "]"
layers_txt = re.sub(r"([{,]\s*)([a-z]+):", r"\1'\2':", layers_txt)
layers = [{"id": d["id"], "name": d["n"], "sub": d["s"], "role": d["role"], "sw": d["sw"], "io": d["io"]}
          for d in lit(layers_txt)]

procs = [{"id": a, "name": b} for a, b in lit("[" + grab("const PROCS = [", "];") + "]")]

cat_txt = grab("const CAT = ", ";").strip()
cat_txt = re.sub(r"([{,]\s*)([a-z]+):", r"\1'\2':", cat_txt)
cats = lit(cat_txt)

d_txt = "[" + grab("const D = [", "\n  ].map") + "]"
rows = lit(d_txt)
codes = []
for r in rows:
    r = list(r) + [None] * (10 - len(r))
    codes.append({
        "code": r[0], "name": r[1], "format": r[2], "desc": r[3],
        "sub": [{"code": s[0], "name": s[1], "detail": s[2]} for s in r[4]],
        "storage": r[5], "source_layer": r[6], "category": r[7],
        "extension": bool(r[8]), "preview": r[9],
    })

out = {"layers": layers, "processes": procs, "categories": cats, "codes": codes}
dst = Path(__file__).parent.parent / "server" / "data" / "codes.json"
dst.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"layers={len(layers)} processes={len(procs)} categories={len(cats)} codes={len(codes)} "
      f"sub={sum(len(c['sub']) for c in codes)} → {dst}")
