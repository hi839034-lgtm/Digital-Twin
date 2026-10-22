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


@app.get("/api/scenario/{sid}")
def scenario(sid: str):
    """원본 SCEN.build + CODES.build 결과 전체 (타임라인 재생은 브라우저가 한다)"""
    from sim import flows, scen
    if sid not in scen.DEF:
        raise HTTPException(404, f"unknown scenario {sid}")
    sc = scen.build(sid)
    return {**sc, **flows.build(sc)}


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
