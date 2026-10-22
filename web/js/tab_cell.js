// ③④⑤ 검사 셀 (3D 스캔 / 2D 비전 / 초음파): 로봇 3D · 단계 · 지금/다음 · 품질 보정 · 경로 표 · 관절각
// 로봇 경로(역기구학, 도달성, 충돌 여유)는 서버(server/sim/plan.py)가 계산해 w.plan 으로 내려준다.
import { S, amrPos, chip, esc, fmtT, layerName, winAt, mainWin, clamp } from "./state.js";
import { robotAt } from "./kin.js";
import { createCellScene } from "./cell_scene.js";

const CELLNM = { "3D": "3D 스캔", "2D": "2D 비전", UT: "초음파" };
const CFG = {
  "3D": ["6축 로봇 (근사 모델) · 받침대", "광학식 3D 스캐너 (TrackScan → NimbleTrack 협의)", "광학 트래커 · AMR 도크", "출력: 점군·편차 맵·ROI"],
  "2D": ["6축 로봇 (근사 모델)", "25 MP 컬러 카메라 (VC-25M10G-C)", "바 조명 (LV-DB2) · 암막", "출력: 이미지·결함 박스·신뢰도"],
  UT: ["6축 로봇 (근사 모델) · F/T 센서 (가정)", "PAUT 10 MHz 64소자 + 55° 웨지", "OmniScan X4 64:128PR (2차년도 도입)", "출력: FMC·TFM·지시 3D 좌표"],
};
const STEPCODES = {
  "3D": [["D02-01", "D05-01"], ["D04-01"], ["D13-01", "D11-03"], ["D12-02"], ["D15-01", "D16-02"], ["D20-05", "D20-01"], ["D22-01", "D11-03"], ["D03-01", "D18-04", "D19-01"]],
  "2D": [["D19-01", "D30-02"], ["D04-01"], ["D13-01"], ["D12-02"], ["D27-01", "D08-03"], ["D16-02", "D20-01"], ["D22-01", "D11-04"], ["D19-01", "D19-03", "D20-04"]],
  UT: [["D03-02", "D19-01"], ["D04-01"], ["D13-01", "D11-01"], ["D12-02"], ["D14-01", "D15-01"], ["D16-01", "D20-01"], ["D22-01", "D22-02"], ["D18-02", "D19-01", "D20-04"]],
};
const JCOL = ["#4f8cff", "#ffb84f", "#3ecf8e", "#ff7a45", "#c678dd", "#2fc4d6"];
const D = Math.PI / 180;
const f1 = (v) => (v * 1000).toFixed(1);

const lastWin = (c, t) => { const ws = S.sc.wins[c].filter((x) => x.t0 <= t); return ws.length ? ws[ws.length - 1] : null; };

function stepsFor(c, w) {
  if (!w) return [];
  const C = S.sc.consts, r = w.redo, ra = w.redoAt;
  const sm = w.plan.segs.map((s) => s.stats);
  const minC = Math.min(...sm.map((s) => s.minClear.d)) * 1000, allOk = sm.every((s) => s.ok === s.n);
  const exec0 = w.t0 + 3, execEnd = w.t1 - 3;
  const nroi = C.rois[w.part];
  const St = (name, detail, a, b, fail) => ({ name, detail, a, b, fail });
  const pose = `${f1(w.pose.dx)}, ${f1(w.pose.dy)} mm`;
  if (c === "3D") return [
    St("입력", "CAD · 검사 필수면 (상면·비드·플랜지면)", w.t0, w.t0),
    St("도킹 오차 추정", `러프 스캔 정합: ${pose}, ${(w.pose.dth / D).toFixed(2)}°`, w.t0, w.t0 + 1.5),
    St("경로 생성", `CAD 법선 기반 ${r ? "v0 상면 3패스" : "v1 5패스 (레시피)"} · ${r ? 21 : 35}점 · 스탠드오프 250 mm`, w.t0 + 1.5, w.t0 + 2.5),
    St("도달성·충돌 검증", `${allOk ? "전 점 도달" : "도달 불가 있음"} · 최소 여유 ${minC.toFixed(0)} mm`, w.t0 + 2.5, exec0),
    St("스캔 실행", "스캐너 자세 = 표면 법선 · 점 간격 2 mm", exec0, r ? ra : execEnd),
    St("품질 판단", r ? "필수면 커버리지 65% < 95% → 미달 (플랜지면 경사각 초과·모서리 가림)" : "필수면 커버리지 100% → 통과", r ? ra : execEnd, r ? ra + 0.5 : execEnd, r),
    St("보정", r ? "플랜지면 법선 기준 경사 30° 패스 P4·P5 추가 (14점) → 재스캔 → 100%" : "해당 없음 (1회 통과)", r ? ra + 0.5 : null, r ? execEnd : null),
    St("출력", `점군 160 MB (엣지) · 편차 맵 · ROI ${nroi}개 → OCS`, w.t1 - 1, w.t1)];
  if (c === "2D") {
    const red = w.shots.findIndex((s) => s[2]);
    const conf = { A: "0.93", B: "0.82", C: "0.74" }[w.part];
    return [
      St("입력", `3D ROI ${nroi}개 · 표면 법선`, w.t0, w.t0),
      St("도킹 오차 추정", `${pose} · 경로 변환`, w.t0, w.t0 + 1),
      St("촬영 포즈 생성", `ROI 중심·법선 기준 작동거리 285 mm · ${w.shots.length}회`, w.t0 + 1, w.t0 + 1.8),
      St("도달성 검증", `${allOk ? "전 포즈 도달" : "도달 불가"} · 최소 여유 ${minC.toFixed(0)} mm`, w.t0 + 1.8, w.shotT[0][0]),
      St("촬영", w.shots.map((s) => C.spots[s[0]].split(" ")[0] + (s[2] ? " 재촬영" : "")).join(" → "), w.shotT[0][0], w.shotT[w.shotT.length - 1][1]),
      St("품질 판단", red >= 0 ? `촬영 #1 신뢰도 ${w.part === "B" ? "0.04" : "0.20"} < 0.70 (반사 포화) → 미달` : `신뢰도 ${conf} ≥ 0.70 → 통과`,
        red >= 0 ? w.shotT[red - 1][1] : w.shotT[0][1], red >= 0 ? w.shotT[red - 1][1] + 0.5 : w.shotT[0][1], red >= 0),
      St("보정", red >= 0 ? `카메라·조명 25° 기울임 (조명 입사각 변경) → 재촬영 신뢰도 ${w.part === "B" ? "0.82" : "0.74"}` : "해당 없음 (1회 통과)", red >= 0 ? w.shotT[red][0] : null, red >= 0 ? w.shotT[red][1] : null),
      St("출력", "이미지 · 결함 박스(JSON) · 신뢰도 → OCS", w.t1 - 1, w.t1)];
  }
  return [
    St("입력", "3D 용접선·표면 법선 · 2D 표면결함 위치", w.t0, w.t0),
    St("도킹 오차 추정", `${pose} · 경로 변환`, w.t0, w.t0 + 1),
    St("주사 경로 생성", "인덱스 오프셋 40 mm · y 40~140 mm · 섹터 45–70° (검사 설계 커버리지 100%)", w.t0 + 1, w.t0 + 2),
    St("도달성·간섭 검증", `${allOk ? "전 점 도달" : "도달 불가"} · 최소 여유 ${minC.toFixed(0)} mm (원안 y≤160은 플랜지 −7 mm → y≤140)`, w.t0 + 2, exec0),
    St("접근·접촉·주사", "FMC 취득 (64소자, 1 mm 피치)", exec0, r ? ra : execEnd),
    St("품질 게이트", w.mode === "recontact" ? "후면 에코 28% < 50% → 접촉 불량" : w.mode === "tilt" ? "후면 에코 41% < 50% → 프로브 3° 기울어짐" : "후면 에코 76% · SNR 35 dB → 통과", r ? ra : execEnd, r ? ra + 0.5 : execEnd, r),
    St("보정", w.mode === "recontact" ? "프로브 12 mm 들어 올린 뒤 재접촉 · 가압 증가 → 75%" : w.mode === "tilt" ? "툴 자세를 표면 법선에 재정렬 → 재주사 → 78%" : "해당 없음 (1회 통과)", r ? ra + 0.5 : null, r ? execEnd : null),
    St("출력", "TFM · 지시 3D 좌표 → OCS (3D 모델 매핑)", w.t1 - 1, w.t1)];
}

function stepState(s, ra, w, t) {
  let st = "";
  if (s.a == null) st = "skip";
  else if (t >= (s.b != null ? s.b : s.a) && t >= s.a) st = s.fail ? "fail" : "done";
  else if (t >= s.a) st = "run";
  if (!ra.w && w && t > w.t1) st = s.a == null ? "skip" : s.fail ? "fail" : "done";
  return st;
}

export function cellTab(c, label) {
  let root, scene, key = "", jw = null, jq = null;

  const jointPlot = (w, t) => {
    const cv = root.querySelector(".jplot"), dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!w) { g.fillStyle = "#8b95ab"; g.font = "12px Pretendard,sans-serif"; g.fillText("작업 없음", 10, 20); return; }
    if (jw !== w) { jw = w; jq = []; const n = 180; for (let i = 0; i <= n; i++) { const tt = w.t0 + ((w.t1 - w.t0) * i) / n; jq.push([tt, robotAt(w, S.sc.consts.HOME, tt).q]); } }
    const L = 34, R = W - 8, T = 16, B = H - 16, X = (tt) => L + ((tt - w.t0) / (w.t1 - w.t0)) * (R - L), Y = (q) => T + (1 - (q + Math.PI) / (2 * Math.PI)) * (B - T);
    g.font = "10.5px Consolas,monospace"; g.textBaseline = "middle"; g.textAlign = "right";
    [-180, -90, 0, 90, 180].forEach((d) => { const y = Y(d * D); g.strokeStyle = "#2a3350"; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillStyle = "#8b95ab"; g.fillText(d + "°", L - 4, y); });
    if (w.redo) { const x = X(w.redoAt); g.strokeStyle = "#ff6b6b"; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); g.setLineDash([]); }
    for (let j = 0; j < 6; j++) { g.strokeStyle = JCOL[j]; g.lineWidth = 1.6; g.beginPath(); jq.forEach(([tt, q], i) => { const x = X(tt), y = Y(clamp(q[j], -Math.PI, Math.PI)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.textAlign = "left"; for (let j = 0; j < 6; j++) { g.fillStyle = JCOL[j]; g.fillText("J" + (j + 1), L + j * 30, 7); }
    g.fillStyle = "#8b95ab"; g.textAlign = "left"; g.fillText(fmtT(w.t0), L, H - 6); g.textAlign = "right"; g.fillText(fmtT(w.t1), R, H - 6);
    if (t >= w.t0 && t <= w.t1) { const x = X(t); g.fillStyle = "#fff"; g.fillRect(x - 1, T - 2, 2, B - T + 4); }
  };

  return {
    id: c, label,
    mount(el) {
      root = el;
      root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr);align-items:start">
        <div class="grid" style="align-content:start">
          <div class="card"><h3>셀 3D · <span class="covl"></span></h3><div class="cellscene"></div></div>
          <div class="card"><h3>로봇 관절각 J1–J6 (점선 = 품질 판단 시점)</h3><canvas class="jplot"></canvas></div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><h3>구성 · <span class="job"></span></h3><ul class="cfg" style="margin:0;padding-left:18px"></ul></div>
          <div class="card"><h3>지금 / 다음</h3><div class="nn"></div></div>
          <div class="card"><h3>처리 단계</h3><ol class="steps"></ol></div>
          <div class="card"><h3>품질 판단 → 보정</h3><div class="qfix"></div></div>
          <div class="card"><h3>경로 묶음별 도달 · 충돌 여유 · 끝점 오차</h3><table><thead><tr><th>경로</th><th>도달</th><th>최소 여유</th><th>끝점 오차</th><th>판정</th></tr></thead><tbody class="ptab"></tbody></table></div>
        </div></div>`;
    },
    onScenario() {
      key = ""; jw = null;
      const host = root.querySelector(".cellscene");
      host.innerHTML = "";
      scene = createCellScene(host, c);
      scene.resize();
    },
    onShow() { key = ""; scene && scene.resize(); },
    resize() { scene && scene.resize(); },
    render() {
      if (!scene) return;
      const t = S.t, home = S.sc.consts.HOME;
      const ra = robotAt(winAt(c, t), home, t);
      const w = ra.w || lastWin(c, t) || mainWin(c);
      scene.update(w, ra.q);
      scene.draw();
      jointPlot(w, t);

      const steps = stepsFor(c, w), sts = steps.map((s) => stepState(s, ra, w, t));
      const nw = S.sc.wins[c].find((x) => x.t0 > t);
      const hold = S.sc.amrs.map((a) => amrPos(a, t).seg).find((s) => (s.kind === "dock" || s.kind === "hold") && s.cell === c);
      const segi = ra.key ? ra.key.seg : -1;
      const k = [w && w.job + w.t0, sts.join(""), ra.w ? "r" : "i", segi, ra.key && ra.key.lift ? "L" : "", hold ? hold.kind : "", nw ? nw.t0 : "-", S.sid].join("|");
      root.querySelector(".covl").textContent = ra.w ? `${CELLNM[c]} 셀 · ${w.job} · ${segi >= 0 ? w.plan.segs[segi].label : ra.key && ra.key.lift ? "재접촉 (들어 올림)" : "접근·이탈"}` : `${CELLNM[c]} 셀 · 대기`;
      if (k === key) return;
      key = k;

      root.querySelector(".cfg").innerHTML = CFG[c].map((x) => `<li>${esc(x)}</li>`).join("");
      root.querySelector(".job").textContent = w ? `${ra.w ? "현재" : "최근"} 작업 ${w.job} · 시편 ${w.part} · ${w.amr}` : "작업 없음";

      // 지금 / 다음
      const ri = sts.indexOf("run");
      const di = sts.map((x, i) => (x === "done" || x === "fail" ? i : -1)).filter((i) => i >= 0).pop();
      let now, nowCodes = null, res, next, nextAt;
      if (!w) { now = "대기"; res = "—"; next = nw ? `${nw.job} 검사` : "—"; nextAt = nw ? nw.t0 : null; }
      else {
        if (ra.w) now = ri >= 0 ? `${steps[ri].name} · ${steps[ri].detail}` : segi >= 0 ? w.plan.segs[segi].label : "접근 · 이탈";
        else now = hold ? (hold.kind === "dock" ? `${hold.job} AMR 도킹 · 러프 스캔으로 도킹 오차 추정` : c === "3D" ? `${hold.job} 자율 분석 대기 (OCS가 다음 공정 결정 중)` : c === "UT" ? `${hold.job} QC 판정 대기` : `${hold.job} 대기`) : nw ? `대기 · ${nw.job} 도착 예정` : "대기 · 이 시나리오의 작업 완료";
        nowCodes = ri >= 0 ? STEPCODES[c][ri] : null;
        res = di != null ? `${steps[di].name}: ${steps[di].detail}` : "아직 결과 없음";
        const ni = sts.findIndex((x, i) => x === "" && steps[i].a != null), inW = ra.w || t < w.t0;
        next = ni >= 0 && inW ? steps[ni].name : nw ? `${nw.job} (시편 ${nw.part}, ${nw.amr}) 검사` : "없음";
        nextAt = ni >= 0 && inW ? steps[ni].a : nw ? nw.t0 : null;
      }
      root.querySelector(".nn").innerHTML = `<div class="muted">지금 하는 일</div><div class="big">${esc(now)}</div>
        ${nowCodes ? `<div>${nowCodes.map((x) => chip(x, true)).join("")}</div>` : ""}
        <div class="muted" style="margin-top:6px">결과</div><div>${esc(res)}</div>
        <div class="muted" style="margin-top:6px">다음 할 일</div><div>${esc(next)} ${nextAt != null ? `<span class="muted">(${fmtT(nextAt)})</span>` : ""}</div>`;

      root.querySelector(".steps").innerHTML = steps.map((s, i) => {
        const st = sts[i];
        return `<li class="st-${st}"><span class="n">${i + 1}</span><div><b>${esc(s.name)}</b> ${STEPCODES[c][i].map((x) => chip(x, st === "run" || st === "done" || st === "fail")).join("")}
          <div class="muted">${esc(s.detail)}</div></div></li>`;
      }).join("");

      // 품질 판단 → 보정
      const qm = root.querySelector(".qfix");
      if (w && w.redo) {
        const past = t >= w.redoAt;
        const M = c === "3D" ? ["필수면 커버리지", 65, 100, "%", 95] : c === "2D" ? ["판정 신뢰도", w.part === "B" ? 4 : 20, w.part === "B" ? 82 : 74, "", 70] : ["후면 에코 (FSH)", w.mode === "tilt" ? 41 : 28, w.mode === "tilt" ? 78 : 75, "%", 50];
        const after = t >= w.t1 - 3 || (!ra.w && t > w.t1);
        const what = c === "3D" ? "경로 추가 · 플랜지면 법선 기준 경사 30° 패스 2개 (주황 선)" : c === "2D" ? "자세 변경 · 카메라·조명을 25° 기울여 조명 입사각을 바꾸고 위치를 120 mm 옮김 (주황 점)" : w.mode === "tilt" ? "자세 보정 · 툴 축을 표면 법선에 재정렬해 재주사 (주황 선)" : "위치 보정 · 프로브를 12 mm 들어 올린 뒤 재접촉, 가압 증가";
        const fmt = (v) => (c === "2D" ? (v / 100).toFixed(2) : v + M[3]);
        qm.innerHTML = `<div class="qbar"><span>${M[0]}</span><div class="bars"><div class="b0" style="width:${M[1]}%"></div><div class="thr" style="left:${M[4]}%"></div></div><b class="ng">${past ? fmt(M[1]) : "측정 중"}</b></div>
          <div class="qbar"><span>보정 후</span><div class="bars"><div class="b1" style="width:${after ? M[2] : 0}%"></div><div class="thr" style="left:${M[4]}%"></div></div><b class="ok">${after ? fmt(M[2]) : "—"}</b></div>
          <p class="${past ? "" : "muted"}">${past ? esc(what) : "품질 판단 전"} ${["D20-01", "D22-01", "D23-02"].map((x) => chip(x, past)).join("")}</p>`;
      } else qm.innerHTML = `<p class="muted">${w ? "이 시나리오에서는 품질 기준을 1회에 통과해 보정 없이 진행합니다." : "—"}</p>`;

      // 경로 표
      root.querySelector(".ptab").innerHTML = w ? w.plan.segs.map((sg) => {
        const s = sg.stats, v = s.ok < s.n ? "도달 불가" : s.minClear.d < 0 ? "NG" : s.minClear.d < 0.02 ? "주의" : "OK";
        return `<tr><td><span class="sw" style="background:${sg.kind === "fix" ? "var(--warn)" : "var(--accent)"}"></span>${esc(sg.label)}</td><td>${s.ok}/${s.n}</td>
          <td>${(s.minClear.d * 1000).toFixed(0)} mm</td><td>${s.tipErr.toFixed(1)} mm</td><td><span class="pill ${v === "OK" ? "ok" : v === "주의" ? "wait" : "ng"}">${v}</span></td></tr>`;
      }).join("") : "";
    },
  };
}
