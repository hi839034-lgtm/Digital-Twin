"""실행: 저장소 폴더에서  uvicorn server.main:app --reload  (아니면 server 폴더에서 uvicorn main:app)
브라우저: http://127.0.0.1:8000
"""
import asyncio
import json
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).parent))  # sim, sources 를 어디서 실행해도 찾게
from sources import ScenarioSource, list_scenarios, load_scenario  # noqa: E402

WEB_DIR = Path(__file__).parent.parent / "web"
app = FastAPI(title="WP5 Inspection DT")


@app.get("/api/scenarios")
def scenarios():
    return list_scenarios()


_scenario_cache = {}


@app.get("/api/scenario/{sid}")
def scenario(sid: str, full: bool = False):
    """원본 SCEN.build + planWin(로봇 경로 계획) + CODES.build 결과 전체 (타임라인 재생은 브라우저가 한다).
    full=true 는 원본과 숫자 대조용 전체 출력 (용량이 크다)."""
    from sim import flows, geom, kin, plan, scen
    if sid not in scen.DEF:
        raise HTTPException(404, f"unknown scenario {sid}")
    if (sid, full) not in _scenario_cache:
        sc = scen.build(sid)
        for c in sc["wins"]:
            for w in sc["wins"][c]:
                w["plan"] = plan.to_json(plan.plan_win(w), full)
        consts = {"CX": scen.CX, "LANE": scen.LANE, "BAY": scen.BAY, "DOCKZ": scen.DOCKZ, "INX": scen.INX,
                  "JX": scen.JX, "STORE": scen.STORE, "RETURN": scen.RETURN, "SPEED": scen.SPEED,
                  "HOME": kin.HOME, "rois": {k: len(v) for k, v in geom.ROIS.items()}, "spots": {k: v["label"] for k, v in geom.SPOTS.items()}}
        _scenario_cache[(sid, full)] = {**sc, **flows.build(sc), "consts": consts,
                                        "geom": {"rois": geom.ROIS, "spots": geom.SPOTS, "lof": geom.LOF}}
    return _scenario_cache[(sid, full)]


_img_cache = {}


@app.get("/api/devgrid/{part}")
def devgrid(part: str):
    """시편 윗면의 CAD 대비 편차 맵 격자 [mm] (3D 스캔 결과의 가상값). v 는 행(y) 우선 1차원 배열"""
    from sim import render
    if part not in ("A", "B", "C"):
        raise HTTPException(404, f"unknown part {part}")
    g = render.dev_grid(part, 2)
    g["v"] = [round(x, 5) for x in g["v"]]
    return g


@app.get("/api/spot/{spot}")
def spot_image(spot: str, sat: int = 0):
    """2D 국부 촬영 지점의 가상 영상 (PNG). sat=1 은 반사 포화로 실패한 1차 촬영"""
    from fastapi.responses import Response
    from sim import geom, render
    if spot not in geom.SPOTS:
        raise HTTPException(404, f"unknown spot {spot}")
    key = (spot, bool(sat))
    if key not in _img_cache:
        _img_cache[key] = render.spot_image(spot, bool(sat))[0]
    return Response(_img_cache[key], media_type="image/png", headers={"Cache-Control": "no-cache"})


@app.get("/api/codes")
def codes():
    """계층 · 공정 · 데이터 사전 D00~D30 (원본에서 tools/extract_codes.py 로 추출)"""
    return json.loads((Path(__file__).parent / "data" / "codes.json").read_text(encoding="utf-8"))


@app.websocket("/ws")
async def ws(sock: WebSocket):
    """클라이언트 명령: {cmd: load|play|pause|seek|speed, ...}  서버는 상태를 계속 보낸다."""
    await sock.accept()
    src = ScenarioSource(load_scenario("s1"))
    t, speed, playing = 0.0, 1.0, False
    dt = 1 / 30

    async def pump():
        nonlocal t
        while True:
            if playing:
                t = min(t + dt * speed, src.duration)
            await sock.send_json(src.state_at(t))
            await asyncio.sleep(dt)

    task = asyncio.create_task(pump())
    try:
        while True:
            msg = await sock.receive_json()
            cmd = msg.get("cmd")
            if cmd == "load":
                src = ScenarioSource(load_scenario(msg["id"]))
                t = 0.0
            elif cmd == "play":
                playing = True
            elif cmd == "pause":
                playing = False
            elif cmd == "seek":
                t = float(msg["t"])
            elif cmd == "speed":
                speed = float(msg["value"])
    except WebSocketDisconnect:
        pass
    finally:
        task.cancel()


# 맨 마지막에 둔다 (위의 /api, /ws 가 먼저 매칭되도록)
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
