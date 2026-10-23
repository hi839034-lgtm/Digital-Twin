"""화면이 쓰는 데이터를 만드는 함수 모음.

서버(main.py 의 /api/...)와 단일 HTML 내보내기(tools/export_html.py)가 같은 함수를 쓴다.
센서 연동 시 이 함수들의 일부(경로 계획 · 편차 맵 · 영상)를 실제 값으로 바꿔 끼우면 된다.
"""
import json
from pathlib import Path

SCENARIOS = ("S1", "S2", "S3")
PARTS = ("A", "B", "C")
_cache = {}


def _memo(key, fn):
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


def scenario(sid, full=False):
    """SCEN.build + 셀별 로봇 경로 계획(planWin) + 계층 간 데이터 흐름(CODES.build).
    full=True 는 원본과 숫자 대조용 전체 출력 (용량이 크다)."""
    from sim import flows, geom, kin, plan, scen
    if sid not in scen.DEF:
        raise KeyError(sid)

    def make():
        sc = scen.build(sid)
        for c in sc["wins"]:
            for w in sc["wins"][c]:
                w["plan"] = plan.to_json(plan.plan_win(w), full)
                w["dockBefore"] = plan.dock_before(w)
        consts = {"CX": scen.CX, "LANE": scen.LANE, "BAY": scen.BAY, "DOCKZ": scen.DOCKZ, "INX": scen.INX,
                  "JX": scen.JX, "STORE": scen.STORE, "RETURN": scen.RETURN, "SPEED": scen.SPEED,
                  "HOME": kin.HOME, "rois": {k: len(v) for k, v in geom.ROIS.items()},
                  "spots": {k: v["label"] for k, v in geom.SPOTS.items()}, "ANALYSIS": scen.ANALYSIS,
                  # 로봇 모델 상수는 파이썬(kin.py)이 유일한 출처다. 화면(JS)은 프레임마다 순기구학을 계산해야 하므로
                  # 식은 갖되 상수는 여기서 받고, fkCheck(파이썬이 계산한 기준값)로 로드할 때 자동 대조한다.
                  "kin": {"DH": kin.DH, "OFF": kin.OFF, "TOOLLEN": kin.TOOLLEN},
                  "fkCheck": [{"q": q, "tool": t, "pts": kin.fk(q, t)[1]} for q, t in [
                      (kin.HOME, kin.TOOLLEN["scanner"]),
                      ([0.3, -0.5, 0.8, -0.2, 0.6, 0.1], kin.TOOLLEN["camera"]),
                      ([-0.7, 0.4, -0.3, 1.1, -0.9, 0.5], kin.TOOLLEN["probe"])]]}
        return {**sc, **flows.build(sc), "consts": consts, "geom": {"rois": geom.ROIS, "spots": geom.SPOTS, "lof": geom.LOF}}

    return _memo(("scenario", sid, full), make)


def codes():
    """계층 · 공정 · 데이터 사전 D00~D30 (원본에서 tools/extract_codes.py 로 추출)"""
    return json.loads((Path(__file__).parent / "data" / "codes.json").read_text(encoding="utf-8"))


def devgrid(part):
    """시편 윗면의 CAD 대비 편차 맵 격자 [mm] (3D 스캔 결과의 가상값). v 는 행(y) 우선 1차원 배열"""
    from sim import render
    if part not in PARTS:
        raise KeyError(part)

    def make():
        g = render.dev_grid(part, 2)
        # 원본 GEOM.devGrid 는 Float32Array 로 저장한다 → 같은 32비트 값이 되도록 float32 로 반올림하고,
        # 9자리 유효숫자로 보내면(float32 왕복 보장) 화면이 Float32Array.from 으로 정확히 같은 값을 얻는다.
        import numpy as np
        g["v"] = [float(f"{np.float32(x):.9g}") for x in g["v"]]
        # 3D 모델(초음파 중첩)·점군 미리보기가 쓰는 높이 계산을 화면에서 하지 않도록 값으로 준다:
        #   높이 topZ(x, y) = 16 + bead(x) + dev(x, y)
        #   lat4 = 4 mm 격자점(x 0..300, y 0..200)의 편차 dev,  bead.l4 / bead.c2 = 4 mm 격자점 · 2 mm 격자 중심의 비드 높이(x 만의 함수)
        from sim import geom
        g["lat4"] = {"nx": 76, "ny": 51, "step": 4, "v": [geom.dev(part, ix * 4, iy * 4) for iy in range(51) for ix in range(76)]}
        g["bead"] = {"l4": [geom.bead(ix * 4) for ix in range(76)], "c2": [geom.bead((i + 0.5) * 2) for i in range(150)]}
        return g

    return _memo(("devgrid", part), make)


def spot_png(spot, sat=False):
    """2D 국부 촬영 지점의 가상 영상 (PNG 바이트). sat=True 는 반사 포화로 실패한 1차 촬영"""
    from sim import geom, render
    if spot not in geom.SPOTS:
        raise KeyError(spot)
    return _memo(("spot", spot, bool(sat)), lambda: render.spot_image(spot, bool(sat))[0])


def needed_spots():
    """세 시나리오가 쓰는 (지점, 포화 여부) 목록 — 내보내기에 넣을 영상"""
    out = []
    for sid in SCENARIOS:
        w2 = next(w for w in scenario(sid)["wins"]["2D"] if w.get("main"))
        for s in w2["shots"]:
            for sat in (0, 1):
                redo = any(x[0] == s[0] and len(x) > 2 and x[2] for x in w2["shots"])
                if (s[0], sat) not in out and (not sat or redo):
                    out.append((s[0], sat))
    return out
