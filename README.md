# Digital Twin (WP5 검사셀 디지털 트윈 모사)

시나리오 재생형 디지털 트윈. 파이썬이 시나리오 · 로봇 경로 · 형상 · 영상을 계산하고, 브라우저(three.js)가 그린다.
두 가지로 쓴다.

- **서버 모드**: 파이썬 서버를 켜고 접속. 코드·시나리오를 고치거나 나중에 센서 값을 받을 때 쓴다.
- **단일 HTML**: `export/` 의 파일을 더블클릭. 설치 · 인터넷 · 서버 모두 필요 없다.

화면은 두 가지를 함께 유지한다. 둘 다 같은 파이썬 서버 · 같은 데이터를 쓴다.

| | v1 | v2 |
|---|---|---|
| 폴더 | `web/` | `web2/` |
| 서버 주소 | `/v1/` (기존 `/` 도 같음) | `/v2/` |
| 내용 | 직접 작성한 화면 | 원본의 CSS · 구조 · 화면 코드를 가져온 화면 (원본과 같은 모습) |
| 단일 HTML | `export/DT_v1.html` | `export/DT_v2.html` |

## 폴더 구성

| 경로 | 역할 |
|---|---|
| `server/main.py` | FastAPI 서버. `/api/...` 제공, `web/` 을 정적 서빙 (`/ws` 는 센서 실시간용 예비) |
| `server/payloads.py` | 화면이 쓰는 데이터를 만드는 함수 (서버와 내보내기가 공유) |
| `server/sources.py` | 데이터 공급원. `ScenarioSource` / `SensorSource`(센서, 미구현) |
| `server/data/codes.json` | 계층 · 공정 · 데이터 사전 D00~D30 (원본에서 `tools/extract_codes.py` 로 추출) |
| `server/sim/` | 원본 이식: `geom`(시편 형상·결함) · `scen`(시나리오 생성) · `flows`(계층 간 데이터 흐름) · `kin`(6축 운동학) · `plan`(셀 로봇 경로 계획) · `render`(가상 3D 편차 맵 · 2D 영상, numpy/OpenCV) |
| `web/` | **v1 화면**: 직접 작성 (`index.html`, `style.css`, `js/` 탭별 모듈, `vendor/` three.js 0.160 · 글꼴). 접속 `/v1/` 또는 `/` |
| `web2/` | **v2 화면**: 원본의 CSS · 구조 · 화면 코드 · three.js r128 을 가져와 서버 데이터로 구동 (`adapter.js` 가 연결부). 접속 `/v2/` |
| `tools/` | `extract_codes.py`(데이터 사전 추출) · `import_original_ui.py`(원본에서 web2 만들기) · `export_html.py`(단일 HTML 만들기, v1·v2) · `fonts.py` · `subset_font.py`(글꼴 줄이기) |
| `export/` | 단일 HTML 결과물(v1, v2)과 바로가기(`Run_DT_v1.bat`, `Run_DT_v2.bat`) |
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

브라우저에서 http://127.0.0.1:8000/v1/ 또는 http://127.0.0.1:8000/v2/ (three.js · 글꼴이 저장소 안에 있어 인터넷이 필요 없다).
글꼴(`web/vendor/fonts/`)은 문구를 바꾼 뒤 `python tools/subset_font.py` 로 다시 만든다 (두 화면 공용, 단일 HTML 내보내기는 자동).

## 단일 HTML 다시 만들기

코드나 시나리오를 고친 뒤:

```powershell
python tools/export_html.py          # v1, v2 둘 다 → export/DT_v1.html, DT_v2.html
python tools/export_html.py v2       # v2 만
```

## 검증

새 화면(`/v2/`)은 원본 `WP5_InspectionDT.html` 과 같은 시나리오 · 시각 · 탭 조합에서 비교했다.
- 탭 9개 글자 내용: 시나리오 3개 × 여러 시각, 288건 모두 일치
- 2D 캔버스 그림 226개 중 224개 픽셀 일치 (나머지 2개는 글자 가장자리 2픽셀, 색 값 ±2)
- 3D 장면 60건 중 51건 일치 (나머지는 시계 기반 움직임이 있는 AMR 장면으로, 원본도 자기 자신과 같은 정도로 달라짐)

계산 모듈 대조:

원본 `WP5_InspectionDT.html` 의 계산(시나리오 · 로봇 경로 · 편차 맵 · 2D 영상)과 값이 같은지 브라우저에서 원본 코드를 직접 실행해 대조했다.
시나리오 1,172개 값 일치, 경로 14,103개 값 최대 차이 1.4e-11, 2D 영상은 픽셀 단위 일치.
