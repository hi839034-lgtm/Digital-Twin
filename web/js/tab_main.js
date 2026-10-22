// ① 라인 운영: 조감도 · 공정 단계 · 지금/다음 · 검사 결과
import { S, chips, esc, fmtT, flowIdx, layerName, stageAt, mainWin } from "./state.js";
import { createScene } from "./scene.js";

import { drawShape, draw2DMap, drawThumb, spotStates, spotState, confOf } from "./plots.js";
import { robotAt } from "./kin.js";

let root, scene, key = "", thumbKey = "";

// ② 표면(2D) 카드: 부품 위 촬영 부위 + 부위별 영상. 영상 칸은 상태가 바뀔 때만 다시 만든다.
function draw2D(t) {
  const st = spotStates(t), { w, spots, decided, done } = st;
  const ra = robotAt(S.sc.wins["2D"].find((x) => t >= x.t0 && t <= x.t1), S.sc.consts.HOME, t);
  const cur = ra.w === w && ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].spot : null;
  draw2DMap(root.querySelector(".map2d"), st, cur, t);
  const states = spots.map((s) => spotState(w, done, s, cur, t)), key2 = S.sid + "|" + decided + "|" + states.join(",");
  if (key2 !== thumbKey) {
    thumbKey = key2;
    const box = root.querySelector("#imgs2d");
    box.style.gridTemplateColumns = `repeat(${decided ? spots.length : 1}, minmax(0,1fr))`;
    box.innerHTML = decided
      ? spots.map((s) => `<figure style="margin:0"><canvas data-spot="${s}" style="width:100%;height:150px;display:block;background:#0b0e14;border-radius:6px"></canvas><figcaption class="muted" style="font-size:12px">${esc(S.sc.geom.spots[s].label)}</figcaption></figure>`).join("")
      : '<span class="muted">자율 분석이 촬영 부위를 정하면 부위별 영상과 결함 표시가 여기에 나타납니다</span>';
    if (decided) spots.forEach((s, k) => drawThumb(box.querySelector(`[data-spot="${s}"]`), s, states[k]));
  }
  const nd = done.size, nsh = spots.length;
  root.querySelector("#cap2d").textContent = !decided ? "2D 국부 검사 대기 · 3D 결과를 분석해 촬영 부위를 정합니다"
    : t < w.t0 ? `촬영 부위 ${nsh}곳 결정 · AMR 이송 중`
    : nd < nsh ? `촬영 ${nd}/${nsh}${states.some((s) => s.startsWith("sat")) ? " · 반사 포화로 재촬영" : ""}`
    : `부위 ${nsh}곳 · 결함 ${spots.reduce((a, s) => a + S.sc.geom.spots[s].boxes.length, 0)}건 · 신뢰도 ${confOf(S.sc.P).toFixed(2)} (규칙 기반 판정)`;
}

export default {
  id: "main", label: "① 라인 운영",
  mount(el) {
    root = el;
    root.innerHTML = `<div class="grid main-grid">
      <div class="grid" style="align-content:start">
        <div id="scene"></div>
        <div class="card"><h3>공정 단계</h3><div class="rail" id="rail"></div></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>지금 하는 일 / 결과</h3><div id="now"></div></div>
        <div class="card"><h3>다음 할 일</h3><div id="next"></div></div>
        <div class="card"><h3>검사 결과 ① 형상 ② 표면 ③ 내부 ④ QC 종합</h3><div id="qc"></div></div>
        <div class="card"><h3>최근 로그</h3><div class="log" id="log"></div></div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr));margin-top:12px">
      <div class="card"><h3>① 형상 (3D) · CAD 대비 편차 맵 <span class="muted">파랑 = 오목, 주황 = 볼록</span></h3>
        <canvas class="shape" style="width:100%;height:230px;display:block;border-radius:6px"></canvas><div class="muted" id="shape-cap" style="margin-top:6px"></div></div>
      <div class="card"><h3>② 표면 (2D) · 국부 검사</h3>
        <canvas class="map2d" style="width:100%;height:150px;display:block;border-radius:6px"></canvas>
        <div id="imgs2d" style="display:grid;gap:8px;margin-top:8px"></div><div class="muted" id="cap2d" style="margin-top:6px"></div></div>
    </div>`;
  },
  onScenario() {
    key = ""; thumbKey = "";
    const host = root.querySelector("#scene");
    host.innerHTML = "";
    scene = createScene(host);
    scene.resize();
  },
  onShow() { scene && scene.resize(); },
  resize() { scene && scene.resize(); },
  render() {
    if (!scene) return;
    scene.update();
    scene.draw();
    const sc = S.sc, t = S.t;
    root.querySelector("#shape-cap").textContent = drawShape(root.querySelector(".shape"), t);
    draw2D(t);
    const fi = flowIdx(), st = stageAt();
    const k = fi + "|" + (st && st.id) + "|" + S.sid;
    if (k === key) return;
    key = k;

    // 공정 단계
    root.querySelector("#rail").innerHTML = sc.stages.map((s) => {
      const cls = t > s.t1 ? "done" : t >= s.t0 ? "cur" : "";
      return `<div class="${cls}"><b>${esc(s.name)}</b><br><span class="muted">${fmtT(Math.max(0, s.t0))}</span></div>`;
    }).join("");

    // 지금 / 다음
    const f = sc.F[fi], nx = sc.F[fi + 1];
    const line = (x) => `<div class="big">${esc(x.label)}</div>
      <div class="muted">${esc(layerName(x.from))} → ${esc(layerName(x.to))} · ${fmtT(x.t)}</div>
      <div>${chips(x.codes, 1e9)}</div>`;
    root.querySelector("#now").innerHTML = f ? `<div>${st ? "<b>" + esc(st.name) + "</b> · " : ""}</div>` + line(f) : '<span class="muted">대기 중 — ▶ 재생을 누르세요</span>';
    root.querySelector("#next").innerHTML = nx ? line(nx) : '<span class="muted">끝</span>';

    // 검사 결과: 해당 단계가 끝나야 결과가 보인다
    const q = sc.def.qc;
    const w3 = mainWin("3D"), w2 = mainWin("2D"), wu = mainWin("UT");
    const qcDone = sc.stages.find((s) => s.id === "qc").t0 + 3;
    const row = (nm, v, at) => {
      const done = t >= at;
      return `<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0">
        <span style="min-width:64px">${nm}</span>
        <span class="pill ${done ? (v[0] === "OK" || v[0] === "PASS" ? "ok" : "ng") : "wait"}">${done ? v[0] : "대기"}</span>
        <span class="muted">${done ? esc(v[1]) : ""}</span></div>`;
    };
    root.querySelector("#qc").innerHTML =
      row("① 형상", q.shape, w3.t1) + row("② 표면", q.surf, w2.t1) + row("③ 내부", q.inner, wu.t1) +
      row("④ QC 종합", [q.pass ? "PASS" : "FAIL", q.pass ? "적재장 이송" : "반품 라인 이송 · 재작업 위치 전달"], qcDone);

    // 로그
    const evs = sc.events.filter((e) => e.t <= t + 1e-6).slice(-6).reverse();
    root.querySelector("#log").innerHTML = evs.map((e) => `<div class="${e.cls || ""}"><span class="lk">${fmtT(e.t)} ${esc(e.link || "")}</span>${esc(e.log)}</div>`).join("") || '<span class="muted">—</span>';
  },
};
