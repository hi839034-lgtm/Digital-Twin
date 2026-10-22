// ① 라인 운영: 조감도 · 공정 단계 · 지금/다음 · 검사 결과
import { S, chips, esc, fmtT, flowIdx, layerName, stageAt, mainWin } from "./state.js";
import { createScene } from "./scene.js";

let root, scene, key = "";

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
    </div>`;
  },
  onScenario() {
    key = "";
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
