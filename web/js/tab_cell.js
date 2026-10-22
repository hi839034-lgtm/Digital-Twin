// ③④⑤ 검사 셀 (3D 스캔 / 2D 비전 / 초음파): 작업 구간 · 도킹 오차 · 이 셀에서 오간 데이터
// 경로 생성 · 도달성 · 관절각은 로봇 운동학(KIN) 이식 후 이 탭에 추가한다.
import { S, chips, esc, fmtT, layerName, winAt, mainWin } from "./state.js";

const INFO = {
  "3D": "3D 스캐너가 시편 표면 점군을 만들고 CAD 대비 편차 맵과 ROI를 낸다. 커버리지가 부족하면 경사 패스(P4·P5)를 더해 재스캔한다.",
  "2D": "3D에서 나온 ROI 위치로 카메라 포즈를 만들어 국부 촬영한다. 반사로 포화되면 카메라·조명을 25° 기울여 재촬영한다.",
  UT: "3D 용접선·표면 법선으로 주사 경로를 만들어 PAUT로 내부를 검사한다. 후면 에코가 낮으면 재접촉하거나 자세를 보정해 재주사한다.",
};

export function cellTab(c, label) {
  let root, key = "";
  return {
    id: c, label,
    mount(el) { root = el; },
    onScenario() { key = ""; },
    onShow() {},
    resize() {},
    render() {
      const sc = S.sc, t = S.t;
      const w = winAt(c), k = (w ? w.t0 : "-") + "|" + sc.F.filter((f) => f.proc === c && f.t <= t).length + "|" + sc.events.filter((e) => e.cell === c && e.t <= t).length + "|" + S.sid;
      if (k === key) return;
      key = k;
      const mm = (v) => (v * 1000).toFixed(2), dg = (v) => ((v * 180) / Math.PI).toFixed(3);
      const wins = sc.wins[c].map((x) => {
        const st = t < x.t0 ? "pend" : t <= x.t1 ? "cur" : "";
        const extra = c === "2D" ? `촬영 ${x.shots.length}회` : c === "UT" && x.main ? ({ recontact: "접촉 불량 → 재접촉", tilt: "기울어짐 → 자세 보정", none: "—" })[x.mode] : c === "3D" && x.main && x.redo ? "커버리지 미달 → 재스캔" : "—";
        return `<tr class="${st}"><td>${x.amr}</td><td>${x.job} · 시편 ${x.part}</td><td>${fmtT(x.t0)}–${fmtT(x.t1)}</td>
          <td>${mm(x.pose.dx)}, ${mm(x.pose.dy)}, ${dg(x.pose.dth)}</td><td>${mm(x.pose.dx - x.est.dx)}, ${mm(x.pose.dy - x.est.dy)}</td><td>${x.redo ? "재측정" : "—"}</td><td>${esc(extra)}</td></tr>`;
      }).join("");
      const evs = sc.events.filter((e) => e.cell === c && e.t <= t).reverse();
      const flows = sc.F.filter((f) => f.proc === c && f.t <= t).reverse();
      const mw = mainWin(c);
      root.innerHTML = `<div class="grid" style="gap:12px">
        <div class="card"><h3>${esc(label)} 개요</h3><div>${esc(INFO[c])}</div>
          <div class="muted" style="margin-top:6px">상태: ${w ? `<span class="pill ok">작업 중 (${esc(w.job)} · 시편 ${w.part})</span>` : '<span class="pill wait">비어 있음</span>'}
          · 주 작업 구간 ${fmtT(mw.t0)}–${fmtT(mw.t1)}</div></div>
        <div class="card"><h3>작업 구간 · 도킹 오차</h3><table><tr><th>AMR</th><th>작업</th><th>구간</th><th>도킹 오차 dx,dy [mm], dθ [°]</th><th>정합 후 잔차 [mm]</th><th>재측정</th><th>비고</th></tr>${wins}</table></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
          <div class="card"><h3>이 셀에서 일어난 일</h3><div class="log">${evs.map((e) => `<div class="${e.cls || ""}"><span class="lk">${fmtT(e.t)}</span>${esc(e.log)}</div>`).join("") || '<span class="muted">—</span>'}</div></div>
          <div class="card"><h3>이 셀에서 오간 데이터</h3><div class="log">${flows.map((f) => `<div><span class="lk">${fmtT(f.t)}</span>${esc(layerName(f.from))} → ${esc(layerName(f.to))}<br>${esc(f.label)} ${chips(f.codes, 1e9)}</div>`).join("") || '<span class="muted">—</span>'}</div></div>
        </div>
        <div class="card muted">로봇 경로 · 도달성 · 관절각은 운동학 모듈(KIN) 이식 후 이 탭에 추가됩니다.</div>
      </div>`;
    },
  };
}
