# Digital Twin (WP5 검사셀 디지털 트윈 모사)

시나리오 재생형 디지털 트윈. 파이썬 서버가 상태를 계산해 보내고, 브라우저(three.js)가 그린다.
나중에 실제 센서/로봇 값을 받을 때는 `server/sources.py`의 `SensorSource`만 구현하면 된다.

## 폴더 구성

| 경로 | 역할 |
|---|---|
| `server/main.py` | FastAPI 서버. `/ws` WebSocket으로 상태 전송, `web/`을 정적 서빙 |
| `server/sources.py` | 데이터 공급원. `ScenarioSource`(시나리오 재생) / `SensorSource`(센서, 미구현) |
| `server/scenarios/` | 시나리오 JSON (시간별 이벤트, AMR 경로) |
| `server/sim/` | 가상 계산 (역기구학, 도킹 보정 등) |
| `web/` | 화면 (`index.html`, `app.js`) |
| `export/` | 단일 HTML 내보내기 결과물 (예정) |
| `licenses/` | 사용 라이브러리 라이선스 (three.js, Pretendard) |
| `requirements.txt` | 파이썬 패키지 목록 |

## 실행 (Windows PowerShell)

```powershell
python -m venv dt                  # 처음 한 번 (Python 3.12)
.\dt\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server.main:app --reload
```

브라우저에서 http://127.0.0.1:8000 을 연다. (three.js를 CDN에서 받으므로 인터넷 필요)
