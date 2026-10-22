"""셀 작업 구간(win) 하나의 로봇 경로 계획 (원본 planWin 이식).

plan = {K: 시각별 관절각 키프레임, segs: 경로 묶음(풀이 결과 · 시간 구간 · 종류 · 이름)}
로봇은 AMR 도킹 오차 '추정값'(w.est)으로 경로를 만들고, 실제 위치(w.pose)에 대해 도달 · 충돌 여유를 검사한다.
브라우저는 K 를 smoothstep 으로 보간해 관절각을 얻는다 (원본 robotAt).
"""
from . import geom, kin


def plan_win(w):
    act, plan = kin.Ctx(w["pose"]), kin.Ctx(w["est"])
    segs = []

    def add(res, span, kind, label, **extra):
        segs.append({"res": res, "span": span, "kind": kind, "label": label, **extra})

    cell = w["cell"]
    if cell == "3D":
        redo = w["redo"]
        groups = [["P1", "P2", "P3"], ["P4", "P5"]] if redo else [["P1", "P2", "P3", "P4", "P5"]]
        spans = [[w["t0"] + 3, w["redoAt"]], [w["redoAt"] + 2.5, w["t1"] - 3]] if redo else [[w["t0"] + 3, w["t1"] - 3]]
        for gi, g in enumerate(groups):
            sol = [kin.solve_path(p, kin.HOME, act) for p in kin.scan_passes(plan, g)]
            n = sum(len(s["res"]) for s in sol)
            a = spans[gi][0]
            per = (spans[gi][1] - spans[gi][0]) / n
            for s in sol:
                b = a + per * len(s["res"])
                add(s, [a, b], "fix" if gi == 1 else "base", f"{s['id']} 경사 30°" if s["id"] in ("P4", "P5") else f"{s['id']} 상면")
                a = b
    elif cell == "2D":
        for i, s in enumerate(w["shots"]):
            sp = geom.SPOTS[s[0]]
            r = kin.solve_path(kin.vision_pose(plan, sp["c"][0], sp["c"][1], s[1], f"V{i + 1}"), kin.HOME, act)
            redo = len(s) > 2 and bool(s[2])
            add(r, w["shotT"][i], "fix" if redo else "base", f"{sp['label']}{' · 25° 기울임' if s[1] else ' · 수직'}", spot=s[0], tilt=s[1])
    else:
        if w["mode"] == "tilt":
            add(kin.solve_path(kin.ut_path_t(plan, 140, "U1", 3), kin.HOME, act), [w["t0"] + 3, w["redoAt"]], "base", "U1 주사 (프로브 3° 기울어짐)")
            add(kin.solve_path(kin.ut_path_t(plan, 140, "U1", 0), kin.HOME, act), [w["redoAt"] + 3, w["t1"] - 3], "fix", "U1 재주사 (법선 정렬)")
        else:
            add(kin.solve_path(kin.ut_path_t(plan, 140, "U1", 0), kin.HOME, act), [w["t0"] + 3, w["t1"] - 3], "base", "U1 접촉 주사 (오프셋 40 mm)")

    K = [{"t": w["t0"], "q": kin.HOME, "seg": -1}]
    for si, sg in enumerate(segs):
        res = sg["res"]["res"]
        n = len(res)
        a, b = sg["span"]
        if cell == "UT" and w["mode"] == "recontact":
            k = 5
            dt1 = (w["redoAt"] - a) / k
            dt2 = (b - (w["redoAt"] + 6)) / (n - k)
            for i, r in enumerate(res):
                tt = a + dt1 * (i + 1) if i < k else w["redoAt"] + 6 + dt2 * (i - k + 1)
                K.append({"t": tt, "q": r["q"], "seg": si, "contact": r["inner"], "tip": r["tip"], "part": r["target"]["part"]})
                if i == k - 1:
                    tg = r["target"]
                    lift = kin.best_ik({"p": [tg["p"][0], tg["p"][1], tg["p"][2] + 0.012], "R": tg["R"]}, r["q"], kin.TOOLLEN["probe"])
                    K.append({"t": w["redoAt"] + 2, "q": lift["q"], "seg": si, "lift": True})
                    K.append({"t": w["redoAt"] + 4.5, "q": r["q"], "seg": si, "contact": True, "press": True, "tip": r["tip"], "part": r["target"]["part"]})
        else:
            for i, r in enumerate(res):
                K.append({"t": a + (b - a) * (i + 1) / n, "q": r["q"], "seg": si, "contact": cell == "UT" and r["inner"],
                          "tip": r["tip"], "part": r["target"]["part"]})
        if cell == "3D" and w["redo"] and si == 2:
            K.append({"t": w["redoAt"] + 0.6, "q": kin.HOME, "seg": -1, "think": True})
    K.sort(key=lambda x: x["t"])  # 안정 정렬 (JS Array.sort 와 동일)
    K.append({"t": w["t1"], "q": kin.HOME, "seg": -1})
    return {"K": K, "segs": segs, "act": act}


def seg_stats(sg, act):
    """경로 묶음의 도달 · 여유 · 끝점 오차 요약 (원본 경로 표 한 줄)"""
    s = kin.summary(sg["res"])
    return {"n": s["n"], "ok": s["ok"], "minClear": s["minClear"], "tipErr": kin.tip_error(sg["res"], act)}


def to_json(p, full=False):
    """브라우저로 보낼 형태. full=False 는 화면에 필요한 것만, full=True 는 검증용 전체."""
    if full:
        return {"K": p["K"], "segs": p["segs"]}
    segs = []
    for sg in p["segs"]:
        d = {k: v for k, v in sg.items() if k != "res"}
        d["id"] = sg["res"]["id"]
        d["tool"] = sg["res"]["tool"]
        d["stats"] = seg_stats(sg, p["act"])
        d["pts"] = [{"p": r["target"]["p"], "tip": r["tip"], "reach": r["reach"], "inner": r["inner"],
                     "clear": r["clear"]["d"]} for r in sg["res"]["res"]]
        segs.append(d)
    return {"K": p["K"], "segs": segs}
