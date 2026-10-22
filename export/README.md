# export

서버 없이 열리는 **단일 HTML 파일**을 두는 폴더 (원본 `WP5_InspectionDT.html` 과 같은 배포 형태).

| 파일 | 설명 |
|---|---|
| `WP5_InspectionDT_py.html` | 화면 코드 · three.js · 서버가 계산하는 모든 데이터가 한 파일(약 1.6 MB)에 들어 있다. 더블클릭하면 Edge · Chrome 으로 열린다. 설치도 인터넷도 서버도 필요 없다. |
| `Run_DT.bat` | 위 파일을 기본 브라우저로 여는 바로가기 |

## 다시 만들기

코드나 시나리오를 고친 뒤에는 저장소 폴더에서 (가상환경 `dt` 를 켠 상태로):

```powershell
python tools/export_html.py
```

## 만드는 방식

- 서버의 `payloads.py` 가 만드는 데이터(시나리오 3개 · 데이터 사전 · 편차 맵 · 2D 영상)를 파일 안에 JSON/base64 로 내장한다.
- 화면 모듈(`web/js/*.js`)과 three.js 는 import map 의 `data:` URL 로 연결한다.
- 화면은 `window.__DT_DATA__` 가 있으면 내장 데이터를, 없으면 서버 `/api/...` 를 쓴다 (`web/js/data.js`).

## 알아둘 점

- 값은 모두 가상 데이터다. 센서 값을 받는 실시간 연동은 서버 모드(`run_server.bat`)에서만 가능하다.
- 글꼴은 PC 에 설치된 `Malgun Gothic`(윈도우 기본)을 쓴다 (원본처럼 글꼴을 파일에 넣지는 않았다).
