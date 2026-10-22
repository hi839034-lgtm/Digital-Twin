// ⑥-2 레이어 흐름도: 세로 = 계층, 가로 = 데이터 교환 순서. 상자 = 보내는 계층의 데이터, 화살표 끝 = 받는 계층
import { S, catOf, esc, fmtT, flowIdx, procName } from "./state.js";

const ROW = 64, BW = 88, GAP = 100, X0 = 20;
const CAT = { geo: "#4f8cff", img: "#3ecf8e", wave: "#c678dd", ts: "#ffb84f", res: "#ff6b6b", meta: "#8b95ab" };
let root, key = "", scr;

export default {
  id: "swim", label: "⑥-2 레이어 흐름도",
  mount(el) {
    root = el;
    root.innerHTML = `<div class="bar2"><span class="muted">상자를 누르면 그 시점으로 이동 · 색 = 데이터 종류</span>
      <span class="legend"></span></div><div class="swim" id="sw"></div>`;
  },
  onScenario() {
    key = "";
    const L = S.codes.layers, F = S.sc.F;
    const W = X0 * 2 + F.length * GAP, H = L.length * ROW;
    const ry = (i) => i * ROW + ROW / 2;
    const names = { geo: "형상", img: "영상", wave: "파형", ts: "시계열", res: "판정·결과", meta: "메타·명령" };
    root.querySelector(".legend").innerHTML = Object.entries(CAT).map(([k, c]) => `<span><i style="background:${c}"></i>${names[k]}</span>`).join("");
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#aab3c7"/></marker></defs>`;
    for (let i = 0; i < L.length; i++) svg += `<line x1="0" x2="${W}" y1="${ry(i)}" y2="${ry(i)}" stroke="#222a3d" stroke-dasharray="3 5"/>`;
    F.forEach((f, i) => {
      const x = X0 + i * GAP, cx = x + BW / 2, col = CAT[catOf(f.codes[0])];
      if (f.from !== f.to) svg += `<line class="ln" data-i="${i}" x1="${cx}" x2="${cx}" y1="${ry(f.from) + (f.to > f.from ? 22 : -22)}" y2="${ry(f.to) + (f.to > f.from ? -4 : 4)}" stroke="#aab3c7" stroke-width="1.4" marker-end="url(#ar)"/>`;
      const first = f.codes[0] + (f.codes.length > 1 ? ` +${f.codes.length - 1}` : "");
      svg += `<g class="bx pend" data-i="${i}"><rect x="${x}" y="${ry(f.from) - 20}" width="${BW}" height="40" rx="6" fill="${col}33" stroke="${col}"/>
        <text x="${cx}" y="${ry(f.from) - 4}" text-anchor="middle" style="font-weight:700">${esc(first)}</text>
        <text x="${cx}" y="${ry(f.from) + 12}" text-anchor="middle" style="fill:#aab3c7;font-size:10px">${esc(fmtT(f.t))} ${esc(procName(f.proc))}</text>
        <title>${esc(f.label)} — ${esc(f.codes.join(", "))}</title></g>`;
    });
    svg += "</svg>";
    root.querySelector("#sw").innerHTML = `<div class="lab">${L.map((l) => `<div><b>${esc(l.name)}</b><span class="muted">${esc(l.sub)}</span></div>`).join("")}</div><div class="scr">${svg}</div>`;
    scr = root.querySelector(".scr");
    scr.addEventListener("click", (e) => {
      const g = e.target.closest(".bx");
      if (g) document.dispatchEvent(new CustomEvent("seek", { detail: S.sc.F[+g.dataset.i].t + 1e-4 }));
    });
  },
  onShow() { key = ""; },
  resize() {},
  render() {
    const fi = flowIdx(), k = fi + "|" + S.sid;
    if (k === key || !scr) return;
    key = k;
    scr.querySelectorAll(".bx").forEach((g) => { const i = +g.dataset.i; g.setAttribute("class", "bx " + (i < fi ? "" : i === fi ? "cur" : "pend")); });
    scr.querySelectorAll(".ln").forEach((l) => { l.style.opacity = +l.dataset.i <= fi ? 1 : 0.2; });
    const cur = scr.querySelector(".bx.cur");
    if (cur) {
      const x = X0 + fi * GAP;
      if (x < scr.scrollLeft + 40 || x > scr.scrollLeft + scr.clientWidth - 140) scr.scrollLeft = Math.max(0, x - scr.clientWidth / 2);
    }
  },
};
