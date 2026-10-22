# Digital Twin (WP5 검사셀 디지털 트윈 모사)

시나리오 재생형 디지털 트윈. 파이썬 서버가 상태를 계산해 보내고, 브라우저(three.js)가 그린다.
나중에 실제 센서/로봇 값을 받을 때는 `server/sources.py`의 `SensorSource`만 구현하면 된다.

## 폴더 구성

| 경로 | 역할 |
|---|---|
| `server/main.py` | FastAPI 서버. `/api/scenario/{S1,S2,S3}` · `/api/codes` 제공, `web/`을 정적 서빙 (`/ws` 는 센서 실시간용 예비) |
| `server/sources.py` | 데이터 공급원. `ScenarioSource` / `SensorSource`(센서, 미구현) |
| `server/data/codes.json` | 계층 · 공정 · 데이터 사전 D00~D30 (원본에서 `tools/extract_codes.py` 로 추출) |
| `server/sim/` | 원본 이식: `geom`(시편 형상·결함) · `scen`(시나리오 생성) · `flows`(계층 간 데이터 흐름) · `kin`(6축 운동학) · `plan`(셀 로봇 경로 계획) |
| `web/` | 화면 (`index.html`, `style.css`, `js/` 탭별 모듈) |
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
