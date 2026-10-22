// ② AMR 물류: 경로 지도 · 미션 목록 · 도킹 오차 → 3D 정합 보정 · AMR 일정
import { S, KIND, amrPos, esc, fmtT } from "./state.js";

let root, key = "";
const COL = ["#4f8cff", "#ffb84f"];

export default {
  id: "amr", label: "② AMR 물류",
  mount(el) {
    root = el;
    root.innerHTML = `<div class="grid" style="gap:12px">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
        <div class="card"><h3>경로 지도 (위에서 본 모습)</h3><canvas class="map" id="map"></canvas></div>
        <div class="card"><h3>AMR 일정</h3><div id="gantt"></div><div class="legend muted" style="margin-top:6px" id="lg"></div></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
        <div class="card"><h3>이송 미션</h3><div style="max-height:300px;overflow:auto"><table id="mis"></table></div></div>
        <div class="card"><h3>도킹 오차 → 3D 정합 보정 (mm, °)</h3><div style="max-height:300px;overflow:auto"><table id="dk"></table></div></div>
      </div>
    </div>`;
  },
  onScenario() {
    key = "";
    const sc = S.sc, T = sc.T;
    // 일정(간트): 시나리오마다 한 번 만든다
    root.querySelector("#gantt").innerHTML = `<div class="gantt" style="height:${sc.amrs.length * 30 + 14}px">` +
      sc.amrs.map((a, i) => `<div class="row" style="top:${i * 30 + 4}px">${a.segs.map((s) =>
        `<div class="seg k-${s.kind}" style="left:${(s.t0 / T) * 100}%;width:${Math.max(0.2, ((s.t1 - s.t0) / T) * 100)}%" title="${esc(a.id + " " + (KIND[s.kind] || s.kind) + (s.label ? " · " + s.label : "") + " " + fmtT(s.t0) + "–" + fmtT(s.t1))}">${i === 0 && s.t1 - s.t0 > 14 ? esc(s.label || KIND[s.kind]) : ""}</div>`).join("")}</div>`).join("") +
      `<div class="ph" id="gph"></div></div>`;
    root.querySelector("#lg").innerHTML = ["move", "dock", "proc", "hold", "load", "wait"].map((k) => `<span><i class="k-${k}"></i>${KIND[k]}</span>`).join("") + " · 위 AMR-1 / 아래 AMR-2";
    // 미션 표
    const rows = [];
    sc.amrs.forEach((a) => a.segs.filter((s) => s.kind === "move").forEach((s) => rows.push({ a: a.id, s })));
    rows.sort((x, y) => x.s.t0 - y.s.t0);
    root.querySelector("#mis").innerHTML = `<tr><th>AMR</th><th>목적</th><th>작업</th><th>시작</th><th>거리</th></tr>` +
      rows.map((r, i) => `<tr data-i="${i}"><td>${r.a}</td><td>${esc(r.s.label)}</td><td>${r.s.job}</td><td>${fmtT(r.s.t0)}</td><td>${((r.s.t1 - r.s.t0) * sc.consts.SPEED).toFixed(1)} m</td></tr>`).join("");
    root._rows = rows;
    // 도킹 표
    const wr = [];
    for (const c of ["3D", "2D", "UT"]) for (const w of sc.wins[c]) wr.push({ c, w });
    wr.sort((a, b) => a.w.t0 - b.w.t0);
    const mm = (v) => (v * 1000).toFixed(2), dg = (v) => ((v * 180) / Math.PI).toFixed(3);
    root.querySelector("#dk").innerHTML = `<tr><th>셀</th><th>AMR</th><th>실제 dx, dy, dθ</th><th>추정(스캔)</th><th>보정 후 잔차</th></tr>` +
      wr.map((r) => { const p = r.w.pose, e = r.w.est;
        return `<tr data-t0="${r.w.t0}"><td>${r.c}</td><td>${r.w.amr}</td><td>${mm(p.dx)}, ${mm(p.dy)}, ${dg(p.dth)}</td><td>${mm(e.dx)}, ${mm(e.dy)}, ${dg(e.dth)}</td><td>${mm(p.dx - e.dx)}, ${mm(p.dy - e.dy)}, ${dg(p.dth - e.dth)}</td></tr>`; }).join("");
  },
  onShow() {},
  resize() {},
  render() {
    const sc = S.sc, T = sc.T, t = S.t;
    const ph = root.querySelector("#gph");
    if (ph) ph.style.left = (t / T) * 100 + "%";
    // 지도 (캔버스)
    const cv = root.querySelector("#map"), dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const C = sc.consts, X0 = -8, X1 = 8.4, Z0 = -2.2, Z1 = 5.2;
    const s = Math.min(W / (X1 - X0), H / (Z1 - Z0));
    const px = (x) => (x - X0) * s + (W - (X1 - X0) * s) / 2, py = (z) => (z - Z0) * s + (H - (Z1 - Z0) * s) / 2;
    g.font = "12px 'Malgun Gothic',sans-serif";
    const cc = { "3D": "#3b6fd6", "2D": "#3bb08a", UT: "#d69a3b" };
    for (const c of ["3D", "2D", "UT"]) {
      const x = C.CX[c];
      g.fillStyle = cc[c] + "55"; g.fillRect(px(x - 1.25), py(-1.7), 2.5 * s, 1.5 * s);
      g.strokeStyle = cc[c]; g.strokeRect(px(x - 0.55), py(C.DOCKZ - 0.45), 1.1 * s, 0.9 * s);
      g.fillStyle = cc[c]; g.textAlign = "center"; g.fillText(c + " 셀", px(x), py(-1.75));
    }
    g.fillStyle = "#3a4560"; g.fillRect(px(C.INX - 0.5), py(C.LANE) - 1, (C.JX + 1.6 - C.INX) * s, 2);
    g.fillStyle = "#2e8b62"; g.fillRect(px(C.STORE[0] - 0.8), py(C.STORE[1] - 0.5), 1.6 * s, 1 * s);
    g.fillStyle = "#9b3b3b"; g.fillRect(px(C.RETURN[0] - 0.8), py(C.RETURN[1] - 0.5), 1.6 * s, 1 * s);
    g.fillStyle = "#e6e9ef"; g.fillText("적재장", px(C.STORE[0]), py(C.STORE[1]) + 4); g.fillText("반품 라인", px(C.RETURN[0]), py(C.RETURN[1]) + 4);
    g.fillStyle = "#8b95ab"; g.fillText("투입", px(C.INX), py(C.LANE) - 8);
    sc.amrs.forEach((a, i) => {
      g.strokeStyle = COL[i] + "88"; g.lineWidth = 1.5; g.setLineDash([4, 4]);
      for (const sg of a.segs) if (sg.kind === "move" && sg.t0 <= t) { g.beginPath(); sg.pts.forEach((p, k) => (k ? g.lineTo(px(p[0]), py(p[1])) : g.moveTo(px(p[0]), py(p[1])))); g.stroke(); }
      g.setLineDash([]);
      const { p, seg } = amrPos(a, t);
      g.fillStyle = COL[i]; g.fillRect(px(p[0]) - 0.55 * s, py(p[1]) - 0.4 * s, 1.1 * s, 0.8 * s);
      g.fillStyle = "#0b0e14"; g.textAlign = "center"; g.fillText(a.id, px(p[0]), py(p[1]) + 4);
      g.fillStyle = COL[i]; g.fillText(KIND[seg.kind] || seg.kind, px(p[0]), py(p[1]) - 0.55 * s);
    });
    // 표 진행 표시
    const rows = root._rows || [];
    const k = rows.map((r) => (t < r.s.t0 ? 0 : t <= r.s.t1 ? 1 : 2)).join("") + "|" + sc.wins["3D"].concat(sc.wins["2D"], sc.wins.UT).map((w) => (t >= w.t0 ? 1 : 0)).join("");
    if (k !== key) {
      key = k;
      root.querySelectorAll("#mis tr[data-i]").forEach((tr) => { const r = rows[+tr.dataset.i]; tr.className = t < r.s.t0 ? "pend" : t <= r.s.t1 ? "cur" : ""; });
      root.querySelectorAll("#dk tr[data-t0]").forEach((tr) => { tr.className = t < +tr.dataset.t0 ? "pend" : ""; });
    }
  },
};
