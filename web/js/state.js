// 전역 상태와 공통 도우미. 모든 탭은 S.t (시나리오 시각, 초)만 보고 다시 그린다.
export const S = {
  sid: "S1",
  sc: null,      // /api/scenario/{sid} 결과
  codes: null,   // /api/codes 결과
  t: 0,
  playing: false,
  speed: 8,
  tab: "main",
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export const layerName = (i) => S.codes.layers[i].name;
export const procName = (id) => (S.codes.processes.find((p) => p.id === id) || { name: id }).name;
export const codeOf = (c) => S.codes.codes.find((x) => x.code === c.slice(0, 3));
export const catOf = (c) => (codeOf(c) || { category: "meta" }).category;
export const subName = (sc) => {
  const d = codeOf(sc);
  const s = d && d.sub.find((x) => x.code === sc);
  return s ? s.name : d ? d.name : sc;
};

/** 코드가 시각 t 까지 한 번이라도 전송됐으면 켠다 */
export function chip(code, on) {
  const nm = subName(code);
  return `<span class="chip cat-${catOf(code)} ${on ? "on" : ""}" title="${esc(nm)}">${code}</span>`;
}
export const chips = (list, t = S.t) => list.map((c) => chip(c, sent(c, t))).join("");

let sentCache = { sc: null, map: null };
function sentMap() {
  if (sentCache.sc !== S.sc) {
    const m = {};
    // 세부 코드(D04-01)와 그 상위 코드(D04) 모두 처음 전송된 시각을 기록
    for (const f of S.sc.F) for (const c of f.codes) for (const k of [c, c.slice(0, 3)]) if (m[k] == null || f.t < m[k]) m[k] = f.t;
    sentCache = { sc: S.sc, map: m };
  }
  return sentCache.map;
}
export const sentAt = (c) => sentMap()[c];
export const sent = (c, t = S.t) => sentMap()[c] != null && sentMap()[c] <= t + 1e-6;

export const flowIdx = (t = S.t) => {
  let c = -1;
  S.sc.F.forEach((f, i) => { if (f.t <= t + 1e-6) c = i; });
  return c;
};
export const stageAt = (t = S.t) => S.sc.stages.find((s) => t >= s.t0 && t <= s.t1) || null;
export const mainWin = (c) => S.sc.wins[c].find((w) => w.main);
export const winAt = (c, t = S.t) => S.sc.wins[c].find((w) => t >= w.t0 && t <= w.t1) || null;

// ---- AMR 위치 (원본 SCEN.amrPos 이식) ----
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; };
export function amrPos(amr, t) {
  const C = S.sc.consts;
  for (const s of amr.segs) {
    if (t < s.t0 || t > s.t1) continue;
    if (s.kind !== "move") return { p: s.pos, seg: s };
    const L = plen(s.pts);
    let d = ((t - s.t0) / Math.max(1e-6, s.t1 - s.t0)) * L;
    for (let i = 1; i < s.pts.length; i++) {
      const l = dist(s.pts[i - 1], s.pts[i]);
      if (d <= l || i === s.pts.length - 1) {
        const u = l > 0 ? Math.min(1, d / l) : 1;
        return { p: [s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * u, s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * u], seg: s };
      }
      d -= l;
    }
  }
  const L = amr.segs[amr.segs.length - 1];
  if (L && t > L.t1) return { p: L.pos || L.pts[L.pts.length - 1], seg: { kind: "idle" } };
  return { p: [C.INX, C.LANE], seg: { kind: "idle" } };
}

export const KIND = { move: "이동", dock: "도킹", proc: "검사", hold: "대기(분석/QC)", load: "적재", unload: "하역", wait: "대기", idle: "대기" };
