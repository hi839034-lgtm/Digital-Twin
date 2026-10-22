"""시나리오 타임라인 생성기 (원본 SCEN 이식).

AMR-1이 용접 시편을 3D 스캔 → 자율 분석 → 2D 국부 → 초음파 → QC → 적재장/반품 라인으로 옮기고,
AMR-2가 다음 시편을 싣고 뒤따른다. 시나리오는 JSON이 아니라 build(sid)가 규칙 + 시드 난수로 만든다.
(도킹 오차 난수는 원본과 같은 값이 나오도록 mulberry32 를 32비트 연산 그대로 옮겼다.)
"""
import math

from . import geom

CX = {"3D": -3.4, "2D": 0.0, "UT": 3.4}
LANE, BAY, DOCKZ, INX, JX = 2.5, 3.15, 0.15, -6.6, 5.4
STORE, RETURN = [6.9, 2.5], [6.9, 4.1]
SPEED, DOCK, LOAD = 0.6, 4, 8

DEF = {
    "S1": {"name": "시나리오 1 · 용접 시편 C", "desc": "표면·내부 결함 → 반품 라인", "part": "C", "next": "A",
           "d3": {"redo": True}, "d2": {"shots": [["CR1", 0], ["CR1", 25, "redo"], ["CR2", 25]]}, "ut": {"mode": "recontact"},
           "qc": {"shape": ["NG", "비드 언더필 −0.82 mm · 언더컷 −0.47 mm"], "surf": ["NG", "기공 2 · 균열 1 · 언더필 · 언더컷"],
                  "inner": ["NG", "융합불량 지시 +5.1 dB (깊이 6.5~9.5 mm)"], "pass": False, "dest": "return"}},
    "S2": {"name": "시나리오 2 · 용접 시편 A", "desc": "정상 → 적재장", "part": "A", "next": "B",
           "d3": {"redo": False}, "d2": {"shots": [["S0", 0]]}, "ut": {"mode": "tilt"},
           "qc": {"shape": ["OK", "편차 ±0.3 mm 이내"], "surf": ["OK", "결함 없음 (신뢰도 0.93)"],
                  "inner": ["OK", "검출선(−20 dB) 이상 지시 없음"], "pass": True, "dest": "store"}},
    "S3": {"name": "시나리오 3 · 용접 시편 B", "desc": "모재 덴트 → 반품 라인", "part": "B", "next": "C",
           "d3": {"redo": False}, "d2": {"shots": [["BR1", 0], ["BR1", 25, "redo"]]}, "ut": {"mode": "none"},
           "qc": {"shape": ["NG", "모재 덴트 −1.22 mm (허용 ±0.5 mm)"], "surf": ["OK", "덴트 확인 · 균열 없음 (신뢰도 0.82)"],
                  "inner": ["OK", "지시 없음"], "pass": False, "dest": "return"}},
}

ANALYSIS = {
    "C": [["입력", "편차 맵 · ROI 2개 · CAD 용접선 정보"],
          ["ROI 분류", "R1 용접부 비드 언더필 −0.82 mm (넓이 20×36 mm) · R2 용접 토우 언더컷 −0.47 mm"],
          ["판단 규칙·점수", "표면 ROI → 2D 국부 검사 (0.92) · 용접부 형상 이상 → 내부결함 위험 → 초음파 정밀 주사 (0.86)"],
          ["결정", "경로 3D → 2D(R1·R2) → 초음파(용접선 y 40~140 mm) · 2D 촬영 포즈 2개, UT 주사 경로 생성"]],
    "A": [["입력", "편차 맵 · ROI 0개 · CAD 용접선 정보"],
          ["ROI 분류", "편차 ±0.3 mm 이내 · 이상 영역 없음"],
          ["판단 규칙·점수", "용접부 품질 기준: 표면 표준 검사 1곳 (0.55) · 내부 표준 주사 필수 (규격)"],
          ["결정", "경로 3D → 2D(비드 중앙 1곳) → 초음파(표준 주사) · 국부 촬영 생략"]],
    "B": [["입력", "편차 맵 · ROI 1개 · CAD 용접선 정보"],
          ["ROI 분류", "R1 모재 국부 덴트 −1.22 mm (허용 ±0.5 mm 초과) · 용접부 이상 없음"],
          ["판단 규칙·점수", "형상 불합격 확정 · 덴트부 균열 확인 필요 → 2D 국부 (0.88) · 용접부는 표준 주사 (규격)"],
          ["결정", "경로 3D → 2D(R1) → 초음파(표준 주사) · 결과와 무관하게 형상 NG 유지"]],
}


# ---------- 난수 (원본 mulberry32 와 동일한 32비트 연산) ----------
_M = 0xFFFFFFFF


def _i32(v):
    v &= _M
    return v - (1 << 32) if v & 0x80000000 else v


def _imul(a, b):
    return _i32((a & _M) * (b & _M))


def rng(seed):
    a = seed & _M

    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & _M
        ai = _i32(a)
        t = _imul(_i32(ai ^ (a >> 15)), _i32(1 | ai))
        t = _i32(_i32(t + _imul(_i32(t ^ ((t & _M) >> 7)), _i32(61 | t))) ^ t)
        return (((t ^ ((t & _M) >> 14)) & _M)) / 4294967296

    return nxt


def _dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def plen(p):
    return sum(_dist(p[i - 1], p[i]) for i in range(1, len(p)))


def _f1(v):
    return f"{v:.1f}"


def build(sid):
    d = DEF[sid]
    r = rng(ord(sid[1]) * 97)
    amrs = [{"id": "AMR-1", "segs": []}, {"id": "AMR-2", "segs": []}]
    wins = {"3D": [], "2D": [], "UT": []}
    events, data, stages = [], [], []

    def ev(t, **o):
        e = {"t": t}
        e.update(o)
        events.append(e)

    def pose():
        p = {"dx": (r() * 2 - 1) * 0.008, "dy": (r() * 2 - 1) * 0.008, "dth": (r() * 2 - 1) * 1.2 * math.pi / 180}
        est = {"dx": p["dx"] + (r() - 0.5) * 0.0006, "dy": p["dy"] + (r() - 0.5) * 0.0006,
               "dth": p["dth"] + (r() - 0.5) * 0.0015}
        return {"pose": p, "est": est}

    class Mover:
        def __init__(self, amr, start, t0):
            self.amr, self.t, self.pos = amr, t0, start

        def move(self, pts, label, job):
            p = [self.pos] + pts
            dd = plen(p)
            self.amr["segs"].append({"kind": "move", "t0": self.t, "t1": self.t + dd / SPEED, "pts": p, "label": label, "job": job})
            self.t += dd / SPEED
            self.pos = pts[-1]

        def stay(self, kind, dur, extra=None):
            s = {"kind": kind, "t0": self.t, "t1": self.t + dur, "pos": self.pos}
            s.update(extra or {})
            self.amr["segs"].append(s)
            self.t += dur

    # ---------- AMR-1 주 작업 ----------
    J, P = "J1", d["part"]
    A1 = amrs[0]
    m = Mover(A1, [INX, LANE], 0)
    ev(0, log=f"작업 접수 {J}: 용접 시편 {P} · 초기 경로 3D (이후 자율 결정)", cls="sc", link="WP1→OCS",
       msg={"type": "job.order", "job_id": J, "part_id": P, "plan": ["3D"], "level": "스크립트"})
    stages.append({"id": "in", "name": "투입", "t0": 0})
    m.stay("load", LOAD, {"job": J})
    ev(LOAD, log="AMR-1 출발 → 3D 스캔 셀", link="OCS→AMR", msg={"type": "amr.mission", "amr": "AMR-1", "job_id": J, "stop": "3D"})
    m.move([[CX["3D"], LANE], [CX["3D"], DOCKZ]], "3D 셀로", J)
    stages[0]["t1"] = m.t

    # 3D
    ps3 = pose()
    m.stay("dock", DOCK, {"job": J, "cell": "3D", **ps3})
    w3 = {"cell": "3D", "job": J, "part": P, "amr": "AMR-1", "t0": m.t, **ps3, "redo": d["d3"]["redo"], "main": True}
    w3["t1"] = w3["t0"] + 42 + (12 if w3["redo"] else 0)
    if w3["redo"]:
        w3["redoAt"] = w3["t0"] + 0.55 * (w3["t1"] - w3["t0"])
    wins["3D"].append(w3)
    m.stay("proc", w3["t1"] - w3["t0"], {"job": J, "cell": "3D", **ps3})
    stages.append({"id": "3D", "name": "3D 스캔", "t0": w3["t0"] - DOCK, "t1": w3["t1"]})
    ev(w3["t0"], cell="3D",
       log=f"3D 스캔 시작 · 도킹 오차 추정 {_f1(ps3['pose']['dx'] * 1000)}, {_f1(ps3['pose']['dy'] * 1000)} mm → 경로 보정",
       msg={"type": "inspect.request", "job_id": J, "module": "3D", "recipe": "v0" if w3["redo"] else "v1"}, link="OCS→셀")
    if w3["redo"]:
        ev(w3["redoAt"], cell="3D", redo=True, log="3D 품질 미달: 필수면 커버리지 65% → 경사 패스 P4·P5 추가", cls="ng",
           msg={"type": "quality.gate", "module": "3D", "coverage_pct": 65, "gate": "fail"}, link="셀→엣지")
        ev(w3["redoAt"] + 0.4, log="OCS 레시피 갱신: 3D 경로 v1 (P1–P5)", cls="sc", link="OCS")
    nroi = len(geom.ROIS[P])
    ev(w3["t1"], cell="3D", log=f"3D 완료 · 커버리지 100% · ROI {nroi}개", cls="ng" if nroi else "ok",
       msg={"type": "inspect.result", "module": "3D", "coverage_pct": 100, "rois": nroi, "raw_mb_at_edge": 160,
            "level": "생기원 가상 계산값 재생"}, link="엣지→서버")
    data.append({"t": w3["t1"], "stage": "3D",
                 "items": [["점군 (PLY)", "160 MB · 엣지 보관"], ["CAD 대비 편차 맵", "0.1 MB"], [f"ROI 목록 (JSON) {nroi}개", "2 KB"]],
                 "use": ["2D 촬영 포즈 생성 ← ROI 위치·표면 법선", "초음파 주사 경로 생성 ← 용접선·표면 법선", "대시보드 형상 결과"]})

    # 자율 분석 (AMR 은 도킹한 채 대기)
    ta = w3["t1"]
    m.stay("hold", 10, {"job": J, "cell": "3D", **ps3, "label": "분석 대기"})
    stages.append({"id": "an", "name": "자율 분석", "t0": ta, "t1": ta + 10})
    for i, s in enumerate(ANALYSIS[P]):
        ev(ta + 1 + i * 2.4, analysis=i, log=f"자율 분석 {i + 1}/4 · {s[0]}: {s[1]}", cls="sc", link="OCS")
    ev(ta + 10, log=f"라우팅 결정 {J}: 3D → 2D → 초음파 (규칙 기반 · 1차년도)", link="OCS→AMR",
       msg={"type": "route", "job_id": J, "next": ["2D", "UT"], "rois": [x["id"] for x in geom.ROIS[P]], "level": "스크립트"})
    m.move([[CX["3D"], LANE], [CX["2D"], LANE], [CX["2D"], DOCKZ]], "2D 셀로", J)
    leave3D = ta + 10

    # 2D
    ps2 = pose()
    m.stay("dock", DOCK, {"job": J, "cell": "2D", **ps2})
    shots = d["d2"]["shots"]
    w2 = {"cell": "2D", "job": J, "part": P, "amr": "AMR-1", "t0": m.t, **ps2, "shots": shots, "main": True}
    d_shot = 25 / max(1, len([s for s in shots if len(s) < 3 or not s[2]])) * 0.9
    w2["shotT"] = []
    tt = w2["t0"] + 2
    for s in shots:
        dd = 8 if len(s) > 2 and s[2] else max(10, d_shot)
        w2["shotT"].append([tt, tt + dd])
        tt += dd
    w2["t1"] = tt + 2
    w2["redo"] = any(len(s) > 2 and s[2] for s in shots)
    if w2["redo"]:
        w2["redoAt"] = w2["shotT"][next(i for i, s in enumerate(shots) if len(s) > 2 and s[2])][0]
    wins["2D"].append(w2)
    m.stay("proc", w2["t1"] - w2["t0"], {"job": J, "cell": "2D", **ps2})
    stages.append({"id": "2D", "name": "2D 국부", "t0": w2["t0"] - DOCK, "t1": w2["t1"]})
    ev(w2["t0"], cell="2D", log=f"2D 국부 검사 시작 · 촬영 {len(shots)}회 계획 (ROI 기반 포즈)",
       msg={"type": "inspect.request", "module": "2D", "spots": list(dict.fromkeys(s[0] for s in shots))}, link="OCS→셀")
    for i, s in enumerate(shots):
        sp = geom.SPOTS[s[0]]
        b = w2["shotT"][i][1]
        nxt_redo = i + 1 < len(shots) and len(shots[i + 1]) > 2 and shots[i + 1][2]
        if nxt_redo:
            conf = 0.04 if P == "B" else 0.20
            ev(b, cell="2D", redo=True, log=f"2D {sp['label']}: 신뢰도 {'0.04' if P == 'B' else '0.20'} (포화) → 카메라·조명 25° 기울여 재촬영",
               cls="ng", msg={"type": "quality.gate", "module": "2D", "spot": s[0], "confidence": conf, "gate": "fail"}, link="셀→엣지")
        else:
            conf = 0.93 if P == "A" else 0.82 if P == "B" else 0.74
            names = "·".join(x["t"] for x in sp["boxes"]) if sp["boxes"] else "결함 없음"
            ev(b, cell="2D", shot=i, spot=s[0], log=f"2D 촬영 완료 · {sp['label']} · {names}", cls="ng" if sp["boxes"] else "ok",
               msg={"type": "inspect.result", "module": "2D", "spot": s[0], "defects": [x["t"] for x in sp["boxes"]], "confidence": conf},
               link="엣지→서버")
    if w2["redo"]:
        ev(w2["t1"] + 0.3, log=f"OCS 레시피 갱신: 부품 {P} 2D 조명 조건 (25°)", cls="sc", link="OCS")
    nimg = len(shots)
    data.append({"t": w2["t1"], "stage": "2D",
                 "items": [[f"이미지 {nimg}장", f"{nimg * 25} MB · 엣지"], ["결함 박스·종류 (JSON)", "3 KB"], ["신뢰도·재촬영 이력", "1 KB"]],
                 "use": ["초음파 검사 범위 확인 ← 표면결함 위치", "QC 표면 판정", "대시보드 부위별 이미지"]})
    m.move([[CX["2D"], LANE], [CX["UT"], LANE], [CX["UT"], DOCKZ]], "초음파 셀로", J)
    leave2D = w2["t1"]

    # 초음파
    psu = pose()
    m.stay("dock", DOCK, {"job": J, "cell": "UT", **psu})
    mode = d["ut"]["mode"]
    wu = {"cell": "UT", "job": J, "part": P, "amr": "AMR-1", "t0": m.t, **psu, "mode": mode, "main": True}
    wu["t1"] = wu["t0"] + 75 + (15 if mode == "recontact" else 12 if mode == "tilt" else 0)
    wu["redo"] = mode != "none"
    if wu["redo"]:
        wu["redoAt"] = wu["t0"] + (0.4 if mode == "recontact" else 0.35) * (wu["t1"] - wu["t0"])
    wins["UT"].append(wu)
    m.stay("proc", wu["t1"] - wu["t0"], {"job": J, "cell": "UT", **psu})
    stages.append({"id": "UT", "name": "초음파", "t0": wu["t0"] - DOCK, "t1": wu["t1"]})
    ev(wu["t0"], cell="UT", log="초음파 검사 시작 · 3D 표면 법선·용접선으로 주사 경로 생성 (오프셋 40 mm)",
       msg={"type": "inspect.request", "module": "UT", "path": "U1", "from": ["3D 용접선", "3D 표면 법선", "2D 표면결함 위치"]}, link="OCS→셀")
    if mode == "recontact":
        ev(wu["redoAt"], cell="UT", redo=True, log="초음파 게이트 불합격: 후면 에코 28% (접촉 불량) → 재접촉·가압 증가", cls="ng",
           msg={"type": "quality.gate", "module": "UT", "backwall_fsh_pct": 28, "gate": "fail"}, link="셀→엣지")
    if mode == "tilt":
        ev(wu["redoAt"], cell="UT", redo=True, log="초음파 게이트 불합격: 후면 에코 41% (프로브 3° 기울어짐) → 자세 보정 후 재주사", cls="ng",
           msg={"type": "quality.gate", "module": "UT", "backwall_fsh_pct": 41, "gate": "fail", "cause": "probe_tilt_3deg"}, link="셀→엣지")
    lof = geom.LOF.get(P)
    ev(wu["t1"], cell="UT", log="초음파 완료 · 융합불량 지시 +5.1 dB → 3D 모델에 매핑" if lof else "초음파 완료 · 지시 없음",
       cls="ng" if lof else "ok",
       msg={"type": "inspect.result", "module": "UT",
            "indications": [{"x_mm": 146.9, "y_mm": [70, 95], "z_mm": [6.5, 9.5], "amp_db_ref": 5.1}] if lof else [],
            "raw_mb_at_edge": 1940, "level": "생기원 가상 계산값 재생"}, link="엣지→서버")
    data.append({"t": wu["t1"], "stage": "UT",
                 "items": [["FMC 원시 (HDF5)", "1.94 GB · 엣지"], ["TFM 영상", "12 MB"], [f"지시 목록 (3D 좌표) {1 if lof else 0}건", "1 KB"]],
                 "use": ["3D 모델 위 결함 매핑 ← 3D 좌표계", "QC 내부 판정", "재작업 위치 지시"]})

    # QC
    tq = wu["t1"]
    m.stay("hold", 6, {"job": J, "cell": "UT", **psu, "label": "QC 판정"})
    stages.append({"id": "qc", "name": "QC 판정", "t0": tq, "t1": tq + 6})
    q = d["qc"]
    ev(tq + 3, qc=True, log=f"QC 종합 (스크립트): 형상 {q['shape'][0]} · 표면 {q['surf'][0]} · 내부 {q['inner'][0]} → {'PASS' if q['pass'] else 'FAIL'}",
       cls="ok" if q["pass"] else "ng",
       msg={"type": "qc.result", "job_id": J, "shape": q["shape"][0], "surface": q["surf"][0], "internal": q["inner"][0],
            "pass": q["pass"], "level": "스크립트 (통합 판정은 4차년도)"}, link="OCS→WP1")
    store = q["dest"] == "store"
    ev(tq + 6, log=f"AMR-1 → {'적재장' if store else '반품 라인'}", link="OCS→AMR",
       msg={"type": "amr.mission", "amr": "AMR-1", "job_id": J, "stop": "STORE" if store else "RETURN"})
    dest = STORE if store else RETURN
    m.move([[CX["UT"], LANE], [JX, LANE], dest], "적재장으로" if store else "반품 라인으로", J)
    stages.append({"id": "out", "name": "적재장 이송" if store else "반품 이송", "t0": tq + 6, "t1": m.t + LOAD})
    m.stay("unload", LOAD, {"job": J})
    ev(m.t, log=f"{J} {'적재 완료' if store else '반품 라인 하역 · 재작업 위치 정보 전달'}", cls="ok" if q["pass"] else "ng",
       link="OCS→WP1", msg={"type": "job.closed", "job_id": J, "dest": q["dest"]})
    T = m.t + 4

    # ---------- AMR-2: 다음 시편 ----------
    A2 = amrs[1]
    n = Mover(A2, [INX, LANE], 0)
    J2, P2 = "J2", d["next"]
    n.stay("idle", 40)
    ev(40, log=f"작업 접수 {J2}: 다음 시편 {P2} · AMR-2 적재", cls="sc", link="WP1→OCS",
       msg={"type": "job.order", "job_id": J2, "part_id": P2})
    n.stay("load", LOAD, {"job": J2})
    n.move([[CX["3D"] - 1.1, LANE], [CX["3D"] - 1.1, BAY]], "3D 대기 구역", J2)
    if leave3D > n.t:
        n.stay("wait", leave3D + 2 - n.t, {"job": J2, "cell": "3D"})
        ev(n.t, log="AMR-2 3D 셀 진입 (AMR-1 이탈 후)", link="OCS→AMR")
    n.move([[CX["3D"] - 1.1, LANE], [CX["3D"], LANE], [CX["3D"], DOCKZ]], "3D 셀로", J2)
    pn = pose()
    n.stay("dock", DOCK, {"job": J2, "cell": "3D", **pn})
    wn = {"cell": "3D", "job": J2, "part": P2, "amr": "AMR-2", "t0": n.t, "t1": n.t + 42, **pn, "redo": False}
    wins["3D"].append(wn)
    n.stay("proc", 42, {"job": J2, "cell": "3D", **pn})
    ev(wn["t0"], cell="3D", log=f"3D 스캔 {J2} · 레시피 v1 적용 (재측정 없음)", link="OCS→셀",
       msg={"type": "inspect.request", "job_id": J2, "module": "3D", "recipe": "v1"})
    ev(wn["t1"], cell="3D", log=f"3D 완료 {J2} · ROI {len(geom.ROIS[P2])}개", link="엣지→서버")
    n.stay("hold", 6, {"job": J2, "cell": "3D", **pn})
    n.move([[CX["3D"], LANE], [CX["2D"] - 1.1, LANE], [CX["2D"] - 1.1, BAY]], "2D 대기 구역", J2)
    if n.t < T:
        free2 = max(n.t, leave2D + 2)
        if free2 < T - 40:
            n.stay("wait", free2 - n.t, {"job": J2, "cell": "2D"})
            n.move([[CX["2D"] - 1.1, LANE], [CX["2D"], LANE], [CX["2D"], DOCKZ]], "2D 셀로", J2)
            pn2 = pose()
            n.stay("dock", DOCK, {"job": J2, "cell": "2D", **pn2})
            sp = "S0" if P2 == "A" else "BR1" if P2 == "B" else "CR1"
            wn2 = {"cell": "2D", "job": J2, "part": P2, "amr": "AMR-2", "t0": n.t, "t1": n.t + 22, **pn2,
                   "shots": [[sp, 0 if P2 == "A" else 25]], "shotT": [[n.t + 2, n.t + 20]], "redo": False}
            wins["2D"].append(wn2)
            n.stay("proc", 22, {"job": J2, "cell": "2D", **pn2})
            ev(wn2["t0"], cell="2D", log=f"2D 국부 {J2} · 레시피 조명 조건 적용", link="OCS→셀")
            n.move([[CX["2D"], LANE], [CX["UT"] - 1.1, LANE], [CX["UT"] - 1.1, BAY]], "초음파 대기 구역", J2)
        if n.t < T:
            n.stay("wait", T - n.t, {"job": J2, "cell": "UT"})

    events.sort(key=lambda e: e["t"])
    return {"sid": sid, "def": d, "T": T, "amrs": amrs, "wins": wins, "events": events, "data": data,
            "stages": stages, "J": J, "P": P}


def amr_pos(amr, t):
    """시각 t 의 AMR 위치와 그 순간의 구간(seg)"""
    for s in amr["segs"]:
        if t < s["t0"] or t > s["t1"]:
            continue
        if s["kind"] != "move":
            return {"p": s["pos"], "seg": s}
        L = plen(s["pts"])
        dd = (t - s["t0"]) / max(1e-6, s["t1"] - s["t0"]) * L
        pts = s["pts"]
        for i in range(1, len(pts)):
            ln = _dist(pts[i - 1], pts[i])
            if dd <= ln or i == len(pts) - 1:
                u = min(1, dd / ln) if ln > 0 else 1
                return {"p": [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
                              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u], "seg": s}
            dd -= ln
    last = amr["segs"][-1] if amr["segs"] else None
    if last and t > last["t1"]:
        return {"p": last.get("pos") or last["pts"][-1], "seg": {"kind": "idle"}}
    return {"p": [INX, LANE], "seg": {"kind": "idle"}}
