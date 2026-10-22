// ⑥ 실행 기록 · 레이어: 시스템 계층 · 공정 × 계층 데이터 맵 · 단위 공정 사이 데이터 · 실행 기록
import { S, chips, esc, fmtT, flowIdx, procName } from "./state.js";

let root, key = "", pick = null; // pick = 선택한 계층 번호

export default {
  id: "layer", label: "⑥ 실행 기록 · 레이어",
  mount(el) {
    root = el;
    root.addEventListener("click", (e) => {
      const r = e.target.closest("[data-layer]");
      if (r) { pick = pick === +r.dataset.layer ? null : +r.dataset.layer; key = ""; this.render(); }
    });
  },
  onScenario() { key = ""; pick = null; },
  onShow() { key = ""; },
  resize() {},
  render() {
    const sc = S.sc, t = S.t, fi = flowIdx();
    const k = fi + "|" + pick + "|" + S.sid;
    if (k === key) return;
    key = k;
    const L = S.codes.layers, P = S.codes.processes;
    const parent = (cs) => [...new Set(cs.map((c) => c.slice(0, 3)))];

    const layers = L.map((l, i) => `<tr class="click ${pick === i ? "sel" : ""}" data-layer="${i}"><td><b>${esc(l.name)}</b><br><span class="muted">${esc(l.sub)}</span></td>
      <td>${esc(l.role)}</td><td class="muted">${esc(l.sw)}</td></tr>`).join("");

    // 공정 × 계층: 그 공정에서 이 계층이 보낸(↑) / 받은(↓) 데이터
    const cell = (li, p) => {
      const out = sc.F.filter((f) => f.proc === p.id && f.from === li), inn = sc.F.filter((f) => f.proc === p.id && f.to === li);
      const lastT = Math.max(-1, ...out.concat(inn).map((f) => f.t));
      const on = lastT >= 0 && lastT <= t;
      const fmt = (a, mark) => (a.length ? `${mark} ${chips(parent(a.flatMap((f) => f.codes)), t)}` : "");
      return `<td class="${on ? "on" : ""}">${fmt(out, "↑")}${out.length && inn.length ? "<br>" : ""}${fmt(inn, "↓")}</td>`;
    };
    const map = `<table class="dmap"><tr><th>계층 \\ 공정</th>${P.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr>` +
      L.map((l, i) => `<tr class="click ${pick === i ? "sel" : ""}" data-layer="${i}"><th>${esc(l.name)}</th>${P.map((p) => cell(i, p)).join("")}</tr>`).join("") + "</table>";

    const H = sc.H.map((h) => `<tr class="${h.t >= 0 && h.t <= t ? "" : "pend"}"><td>${esc(procName(h.a))} → ${esc(procName(h.b))}</td><td>${chips(h.codes, t)}</td><td>${esc(h.label)}</td></tr>`).join("");

    let evs = sc.F.filter((f) => f.t <= t + 1e-6);
    if (pick != null) evs = evs.filter((f) => f.from === pick || f.to === pick);
    const log = evs.slice(-40).reverse().map((f) => `<div><span class="lk">${fmtT(f.t)}</span><b>${esc(procName(f.proc))}</b> · ${esc(L[f.from].name)} → ${esc(L[f.to].name)}<br>
      <span class="muted">${esc(f.label)}</span> ${chips(f.codes, 1e9)}</div>`).join("");

    root.innerHTML = `<div class="grid" style="gap:12px">
      <div class="card"><h3>시스템 계층 (클릭하면 그 계층의 기록만 표시)</h3><table><tr><th>계층</th><th>역할</th><th>구성 소프트웨어</th></tr>${layers}</table></div>
      <div class="card" style="overflow:auto"><h3>공정 × 계층 데이터 맵 (↑ 보냄, ↓ 받음 · 켜진 코드 = 이미 전송)</h3>${map}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
        <div class="card"><h3>단위 공정 사이 전달 데이터</h3><table><tr><th>전달</th><th>코드</th><th>내용</th></tr>${H}</table></div>
        <div class="card"><h3>실행 기록 ${pick != null ? "· " + esc(L[pick].name) : ""} (최근 40건)</h3><div class="log" style="max-height:340px;overflow:auto">${log || '<span class="muted">— 재생을 시작하세요</span>'}</div></div>
      </div></div>`;
  },
};
