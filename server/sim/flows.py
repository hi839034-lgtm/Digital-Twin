"""시나리오 하나에 대한 계층 간 데이터 교환 흐름 (원본 CODES.build 이식).

F: [{t, proc, from, to, codes, label}]  from/to 는 계층 번호(0~6, server/data/codes.json 의 layers 순서)
H: 단위 공정 사이 전달 [{a, b, codes, label, t}]
"""
from . import geom


def build(SC):
    F = []
    P, J = SC["P"], SC["J"]

    def add(t, proc, frm, to, codes, label):
        F.append({"t": t, "proc": proc, "from": frm, "to": to, "codes": codes, "label": label})

    def win(c):
        return next(x for x in SC["wins"][c] if x.get("main"))

    def st(i):
        return next(s for s in SC["stages"] if s["id"] == i)

    w3, w2, wu = win("3D"), win("2D"), win("UT")
    an, qc, out = st("an"), st("qc"), st("out")
    nroi = len(geom.ROIS[P])
    lof = geom.LOF.get(P)
    q = SC["def"]["qc"]

    def mm(w):  # 도킹 오차 추정값 표기 (원본의 toFixed(1))
        return f"{w['pose']['dx'] * 1000:.1f}, {w['pose']['dy'] * 1000:.1f}"

    add(0, "in", 0, 1, ["D01-01", "D01-02"], f"작업지시 {J} · 용접 시편 {P}")
    add(0.4, "in", 0, 2, ["D02-01", "D02-02"], "CAD · 도면 → DT 모델")
    add(0.8, "in", 1, 4, ["D00-01", "D00-02"], "공통 ID 발급 (job · part · attempt)")
    add(1.2, "in", 1, 3, ["D05-01", "D05-02", "D24-02"], "검사 대상 · 판정 기준 · 재검 정책")

    # AMR (두 대 모두)
    for e in SC["events"]:
        if e.get("msg") and e["msg"]["type"] == "amr.mission":
            add(e["t"], "amr", 1, 5, ["D28-01"], f"{e['msg']['amr']} 이송 미션 → {e['msg']['stop']}")
    for a in SC["amrs"]:
        for s in a["segs"]:
            if s["kind"] == "load" and s.get("job"):
                add(s["t0"], "amr", 5, 1, ["D28-02", "D29-01"], f"{a['id']} 적재 ({s['job']})")
            if s["kind"] == "dock":
                add(s["t0"], "amr", 6, 5, ["D29-01", "D28-02"], f"{a['id']} {s['cell']} 도크 도착 ({s['job']})")
            if s["kind"] == "unload":
                add(s["t0"], "amr", 5, 1, ["D28-02"], f"{a['id']} 하역 ({s['job']})")

    # 3D
    add(w3["t0"], "3D", 3, 2, ["D04-01"], f"도킹 오차 추정 {mm(w3)} mm")
    add(w3["t0"] + 1, "3D", 1, 5, ["D11-03", "D08-04"], f"3D 스캔 레시피 {'v0 (상면 3패스)' if w3['redo'] else 'v1 (5패스)'}")
    add(w3["t0"] + 2, "3D", 2, 5, ["D13-01", "D12-02"], "스캔 경로 · 간섭 검증 결과 → 로봇")
    add(w3["t0"] + 6, "3D", 6, 5, ["D15-01", "D16-02"], "로봇 TCP · 점 밀도 수집")
    if w3["redo"]:
        add(w3["redoAt"], "3D", 3, 1, ["D20-01", "D20-05", "D22-01"], "커버리지 65% < 95% → 재스캔 요청")
        add(w3["redoAt"] + 0.4, "3D", 1, 5, ["D11-03", "D22-02"], "레시피 v1 · 경사 패스 P4·P5")
        add(w3["redoAt"] + 0.6, "3D", 2, 5, ["D13-01"], "보정 경로 (경사 30°) → 로봇")
    add(w3["t1"], "3D", 6, 5, ["D03-01"], "표면 점군 PLY 160 MB → 엣지 보관")
    add(w3["t1"] + 0.2, "3D", 5, 4, ["D26-01"], "원시 파일 기록 (URI · 해시)")
    add(w3["t1"] + 0.4, "3D", 3, 1, ["D03-02", "D18-04", "D19-01", "D20-05"], f"편차 맵 · ROI {nroi}개 · 커버리지 100%")

    # 자율 분석
    add(an["t0"] + 0.5, "an", 4, 3, ["D03-02", "D18-04", "D02-02"], "3D 결과 · CAD 용접선 입력")
    add(an["t0"] + 1.2, "an", 1, 3, ["D24-03"], "라우팅 규칙 (1차: 규칙 기반)")
    add(an["t0"] + 3.4, "an", 3, 1, ["D19-01", "D19-03"], "ROI 분류 결과")
    add(an["t0"] + 5.8, "an", 3, 1, ["D30-03"], "판단 근거 · 점수")
    add(an["t0"] + 8.2, "an", 1, 2, ["D30-01", "D30-02"], "라우팅 · 촬영 · 주사 대상 결정")
    add(an["t1"], "an", 2, 5, ["D13-01", "D11-04"], "2D 촬영 포즈 · UT 주사 경로 생성 → 셀")

    # 2D
    add(w2["t0"], "2D", 3, 2, ["D04-01"], f"도킹 오차 추정 {mm(w2)} mm")
    add(w2["t0"] + 0.5, "2D", 4, 3, ["D19-01"], f"3D ROI {nroi}개 → 촬영 대상")
    add(w2["t0"] + 1, "2D", 1, 5, ["D11-04", "D08-03"], "조명 레시피 · 노출")
    shots = w2["shots"]
    for i, s in enumerate(shots):
        a, b = w2["shotT"][i]
        sp = geom.SPOTS[s[0]]
        tilted = s[1]
        add(a + 1, "2D", 6, 5, ["D27-01", "D27-02"], f"{sp['label'].split(' ')[0]} 촬영{' (25°)' if tilted else ' (수직)'}")
        if i + 1 < len(shots) and len(shots[i + 1]) > 2 and shots[i + 1][2]:
            add(b, "2D", 5, 3, ["D16-02"], "반사 포화 · 신뢰도 미달")
            add(b + 0.2, "2D", 3, 1, ["D20-01", "D22-01"], "재촬영 요청 (조명 입사각 변경)")
            add(b + 0.4, "2D", 1, 5, ["D11-04", "D22-02"], "카메라 · 조명 25° 기울임")
        else:
            add(b, "2D", 3, 1, ["D19-01", "D19-03", "D20-04"], f"결함 {len(sp['boxes'])}건 · 신뢰도")
    add(w2["t1"], "2D", 5, 4, ["D26-01"], f"영상 {len(shots)}장 파일 기록")

    # UT
    add(wu["t0"], "UT", 3, 2, ["D04-01"], f"도킹 오차 추정 {mm(wu)} mm")
    add(wu["t0"] + 0.5, "UT", 4, 3, ["D03-02", "D19-01"], "용접선 (3D) · 표면결함 위치 (2D)")
    add(wu["t0"] + 1, "UT", 1, 5, ["D11-01", "D11-02", "D07-01", "D08-01"], "주사 조건 · 프로브 · 취득 설정")
    add(wu["t0"] + 1.5, "UT", 2, 3, ["D10-01", "D06-01"], "초음파 DT 예측 · 물성 (초음파 DT 연계)")
    add(wu["t0"] + 2, "UT", 2, 5, ["D13-01"], "주사 경로 (오프셋 40 mm) → 로봇")
    add(wu["t0"] + 6, "UT", 6, 5, ["D15-01", "D16-01", "D16-03"], "TCP · 접촉 · 가압 수집")
    if wu["redo"]:
        tilt = wu["mode"] == "tilt"
        add(wu["redoAt"], "UT", 3, 1, ["D16-01", "D20-01", "D22-01"], "후면 에코 41% → 자세 보정 요청" if tilt else "후면 에코 28% → 재접촉 요청")
        add(wu["redoAt"] + 0.5, "UT", 1, 5, ["D22-02"], "툴 축 법선 재정렬 · 재주사" if tilt else "들어 올림 → 재접촉 · 가압 증가")
    add(wu["t1"], "UT", 6, 5, ["D14-01"], "FMC 원시 1.94 GB → 엣지 보관")
    add(wu["t1"] + 0.2, "UT", 5, 4, ["D26-01"], "원시 파일 기록")
    add(wu["t1"] + 0.4, "UT", 3, 1, ["D18-02", "D19-01", "D19-02", "D20-04"],
        "융합불량 지시 +5.1 dB · 3D 좌표 매핑" if lof else "지시 없음 · TFM")

    # QC 와 종료
    add(qc["t0"] + 1, "qc", 4, 1, ["D19-01", "D20-04", "D20-05"], "형상 · 표면 · 내부 결과 취합")
    add(qc["t0"] + 3, "qc", 1, 0, ["D21-01", "D21-02"], f"QC {'PASS' if q['pass'] else 'FAIL'} → WP1")
    add(qc["t0"] + 3.5, "qc", 1, 4, ["D23-01", "D23-02"], "시도 계보 · 재검 효과 기록")
    add(out["t1"] - 0.5, "out", 1, 0, ["D21-03", "D26-02"], f"보고서 · 전송 ({'적재 완료' if q['dest'] == 'store' else '반품 · 재작업 위치'})")
    F.sort(key=lambda f: f["t"])

    # 단위 공정 사이 전달
    hand = [
        ("in", "3D", ["D01-01", "D02-01", "D05-01", "D28-01"], "작업지시 · CAD · 필수면 · 이송 미션"),
        ("3D", "an", ["D03-02", "D18-04", "D19-01", "D20-05"], "형상 요약 · 편차 맵 · ROI · 커버리지"),
        ("an", "2D", ["D30-02", "D13-01", "D11-04"], "촬영 대상 · 포즈 · 조명 레시피"),
        ("an", "UT", ["D30-02", "D13-01", "D03-02"], "주사 범위 · 경로 · 용접선"),
        ("2D", "UT", ["D19-01"], "표면결함 위치 → 주사 범위 확인"),
        ("UT", "qc", ["D19-01", "D19-02", "D20-04"], "내부 지시 · 크기 · 신뢰도"),
        ("qc", "out", ["D21-01", "D21-02", "D28-01"], "판정 · 결함 목록 · 목적지"),
        ("amr", "3D", ["D28-02", "D29-01", "D04-01"], "도착 · 위치 → 도킹 오차 정합 (각 셀 공통)"),
    ]
    H = []
    for a, b, codes, label in hand:
        t = max((f["t"] for f in F if f["proc"] == a and any(c in f["codes"] for c in codes)), default=-1)
        H.append({"a": a, "b": b, "codes": codes, "label": label, "t": t})
    return {"F": F, "H": H}
