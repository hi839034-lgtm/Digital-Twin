# Digital Twin (WP5 검사셀 디지털 트윈 모사)

시나리오 재생형 디지털 트윈. 파이썬이 시나리오 · 로봇 경로 · 형상 · 영상을 계산하고, 브라우저(three.js)가 그린다.
두 가지로 쓴다.

- **서버 모드**: 파이썬 서버를 켜고 접속. 코드·시나리오를 고치거나 나중에 센서 값을 받을 때 쓴다.
- **단일 HTML**: `export/WP5_InspectionDT_py.html` 을 더블클릭. 설치 · 인터넷 · 서버 모두 필요 없다.

## 폴더 구성

| 경로 | 역할 |
|---|---|
| `server/main.py` | FastAPI 서버. `/api/...` 제공, `web/` 을 정적 서빙 (`/ws` 는 센서 실시간용 예비) |
| `server/payloads.py` | 화면이 쓰는 데이터를 만드는 함수 (서버와 내보내기가 공유) |
| `server/sources.py` | 데이터 공급원. `ScenarioSource` / `SensorSource`(센서, 미구현) |
| `server/data/codes.json` | 계층 · 공정 · 데이터 사전 D00~D30 (원본에서 `tools/extract_codes.py` 로 추출) |
| `server/sim/` | 원본 이식: `geom`(시편 형상·결함) · `scen`(시나리오 생성) · `flows`(계층 간 데이터 흐름) · `kin`(6축 운동학) · `plan`(셀 로봇 경로 계획) · `render`(가상 3D 편차 맵 · 2D 영상, numpy/OpenCV) |
| `web/` | 화면 (`index.html`, `style.css`, `js/` 탭별 모듈, `vendor/three/` three.js 로컬 사본) |
| `tools/` | `extract_codes.py`(데이터 사전 추출) · `export_html.py`(단일 HTML 만들기) |
| `export/` | 단일 HTML 결과물과 바로가기 |
| `licenses/` | 사용 라이브러리 라이선스 (three.js, Pretendard) |
| `run_server.bat` | 서버를 켜고 브라우저를 여는 바로가기 |
| `requirements.txt` | 파이썬 패키지 목록 |

## 실행 (Windows)

처음 한 번 (Python 3.12):

```powershell
python -m venv dt
.\dt\Scripts\Activate.ps1
pip install -r requirements.txt
```

서버 모드 — `run_server.bat` 를 더블클릭하거나:

```powershell
.\dt\Scripts\Activate.ps1
uvicorn server.main:app --reload
```

브라우저에서 http://127.0.0.1:8000 (three.js 는 `web/vendor/` 에 있어 인터넷이 필요 없다).

## 단일 HTML 다시 만들기

코드나 시나리오를 고친 뒤:

```powershell
python tools/export_html.py     # → export/WP5_InspectionDT_py.html
```

## 검증

원본 `WP5_InspectionDT.html` 의 계산(시나리오 · 로봇 경로 · 편차 맵 · 2D 영상)과 값이 같은지 브라우저에서 원본 코드를 직접 실행해 대조했다.
시나리오 1,172개 값 일치, 경로 14,103개 값 최대 차이 1.4e-11, 2D 영상은 픽셀 단위 일치.
