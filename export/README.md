# export

서버 없이 열리는 **단일 HTML 파일**을 두는 폴더 (원본 `WP5_InspectionDT.html` 과 같은 배포 형태).

| 파일 | 설명 |
|---|---|
| `WP5_InspectionDT_py_v1.html` | **v1 화면**(직접 작성). 화면 코드 · three.js · 글꼴 · 서버가 계산하는 모든 데이터가 한 파일(약 1.9 MB)에 들어 있다. |
| `WP5_InspectionDT_py_v2.html` | **v2 화면**(원본 화면 코드 + 서버 데이터). 같은 방식으로 한 파일(약 1.9 MB). |
| `Run_DT_v1.bat`, `Run_DT_v2.bat` | 각 파일을 기본 브라우저로 여는 바로가기 |

더블클릭하면 Edge · Chrome 으로 열린다. 설치도 인터넷도 서버도 필요 없다.

## 다시 만들기

코드나 시나리오를 고친 뒤에는 저장소 폴더에서 (가상환경 `dt` 를 켠 상태로):

```powershell
python tools/export_html.py        # v1, v2 둘 다
python tools/export_html.py v2     # v2 만 (v1 도 같은 방식)
```

## 만드는 방식

- 서버의 `payloads.py` 가 만드는 데이터(시나리오 3개 · 데이터 사전 · 편차 맵 · 2D 영상)를 파일 안에 JSON/base64 로 내장한다.
- 화면 모듈(`web/js/*.js`)과 three.js 는 import map 의 `data:` URL 로 연결한다.
- 화면은 `window.__DT_DATA__` 가 있으면 내장 데이터를, 없으면 서버 `/api/...` 를 쓴다 (v1 `web/js/data.js`, v2 `web2/adapter.js`).
- v2 는 원본처럼 일반 `<script>` 로 들어가고, 화면 코드(`ui.js`)는 데이터를 준비한 뒤 실행된다.

## 알아둘 점

- 값은 모두 가상 데이터다. 센서 값을 받는 실시간 연동은 서버 모드(`run_server.bat`)에서만 가능하다.
- 글꼴(Pretendard)은 이 화면에 쓰는 글자만 남겨 파일 안에 넣었다 (내보낼 때마다 현재 문구 기준으로 다시 만든다).
