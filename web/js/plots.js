// 2D 그림: 편차 맵 · 가상 2D 영상 · ⑦ 탭 데이터 미리보기. 원본의 그림 코드를 옮긴 것이고,
// 영상과 편차 격자는 서버(server/sim/render.py)가 만들어 준다.
import { S, clamp, codeOf, subName, layerName, procName, mainWin } from "./state.js";

const UIF = "'Malgun Gothic',sans-serif", MONO = "Consolas,monospace";
const C = { muted: "#8b95ab", line: "#2a3350", fg: "#e6e9ef", surf: "#1d2434", bad: "#ff6b6b", good: "#3ecf8e", geo: "#4f8cff", img: "#3ecf8e", wave: "#c678dd", c3D: "#4f8cff", c2D: "#3ecf8e" };

// ---------- 자원(편차 격자 · 2D 영상) 불러오기 ----------
export const assets = { dev: {}, img: {} };

export async function loadAssets(sc) {
  const jobs = [];
  if (!assets.dev[sc.P]) jobs.push(fetch("/api/devgrid/" + sc.P).then((r) => r.json()).then((g) => { assets.dev[sc.P] = g; }));
  const w2 = sc.wins["2D"].find((w) => w.main);
  for (const s of w2.shots) for (const sat of [0, 1]) {
    const key = s[0] + (sat ? ":sat" : "");
    if (assets.img[key] || (sat && !w2.shots.some((x) => x[0] === s[0] && x[2]))) continue;
    jobs.push(fetch(`/api/spot/${s[0]}?sat=${sat}`).then((r) => r.blob()).then(createImageBitmap).then((b) => { assets.img[key] = b; }));
  }
  await Promise.all(jobs);
}
export const spotImg = (spot, sat) => assets.img[spot + (sat ? ":sat" : "")] || assets.img[spot];

// ---------- 캔버스 도우미 ----------
export function prep(cv) {
  const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(cv.clientWidth || cv.width)), H = Math.max(1, Math.round(cv.clientHeight || cv.height));
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "alphabetic";
  return { ctx, W, H };
}
export const devCol = (v) => {
  const tt = clamp(v / 1.0, -1, 1), neu = [233, 238, 240], neg = [35, 87, 201], pos = [194, 65, 12];
  const c = tt < 0 ? neu.map((n, i) => n + (neg[i] - n) * -tt) : neu.map((n, i) => n + (pos[i] - n) * tt);
  return c.map(Math.round);
};
const plateFit = (W, H) => { const sc = Math.min((W - 16) / 300, (H - 12) / 200), L = (W - 300 * sc) / 2, T = (H - 200 * sc) / 2; return { sc, L, T, X: (x) => L + x * sc, Y: (y) => T + (200 - y) * sc }; };
function plateBase(ctx, g) {
  ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(g.L, g.T, 300 * g.sc, 200 * g.sc);
  ctx.fillStyle = C.line; ctx.fillRect(g.L, g.T, 300 * g.sc, 12 * g.sc);
  ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(g.X(150), g.T); ctx.lineTo(g.X(150), g.T + 200 * g.sc); ctx.stroke(); ctx.setLineDash([]);
}
function tag(g, x, y, text, bg, fg) {
  g.font = `600 10.5px ${UIF}`;
  const tw = g.measureText(text).width + 8;
  g.fillStyle = bg; g.fillRect(x, y, tw, 15); g.fillStyle = fg; g.textAlign = "left"; g.fillText(text, x + 4, y + 11);
}

// ---------- ① 3D 형상 편차 맵 (스캔이 진행되면 아래부터 채워진다) ----------
let off = null, offRows = -1, offPart = "";
export function drawShape(cv, t) {
  const sc = S.sc, w = mainWin("3D"), P = sc.P, g = assets.dev[P];
  const { ctx, W, H } = prep(cv);
  ctx.fillStyle = C.surf; ctx.fillRect(0, 0, W, H);
  if (!g) return "";
  const prog = clamp((t - w.t0) / (w.t1 - w.t0), 0, 1), rows = Math.floor(g.ny * prog);
  const s = Math.min((W - 14) / 300, (H - 10) / 200), L = (W - 300 * s) / 2, T = (H - 200 * s) / 2;
  if (!off || offRows !== rows || offPart !== P) {
    off = off || document.createElement("canvas");
    off.width = g.nx; off.height = g.ny;
    const oc = off.getContext("2d"), id = oc.createImageData(g.nx, g.ny);
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = ((g.ny - 1 - j) * g.nx + i) * 4;
      if (j < rows) { const c = devCol(g.v[j * g.nx + i]); id.data[k] = c[0]; id.data[k + 1] = c[1]; id.data[k + 2] = c[2]; id.data[k + 3] = 255; }
    }
    oc.putImageData(id, 0, 0); offRows = rows; offPart = P;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, L, T + 12 * s, 300 * s, 188 * s);
  ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(L, T, 300 * s, 200 * s);
  ctx.fillStyle = C.line; ctx.fillRect(L, T, 300 * s, 12 * s);
  ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L + 150 * s, T); ctx.lineTo(L + 150 * s, T + 200 * s); ctx.stroke(); ctx.setLineDash([]);
  if (t >= w.t0 && t < w.t1) { const yy = T + 12 * s + 188 * s * (1 - prog); ctx.strokeStyle = C.c3D; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + 300 * s, yy); ctx.stroke(); }
  const done = t >= w.t1, Y = (y) => T + (200 - y) * s, ROI = sc.geom.rois[P];
  if (done) ROI.forEach((r) => {
    ctx.strokeStyle = "#14203a"; ctx.lineWidth = 1.8; ctx.strokeRect(L + r.x[0] * s - 2, Y(r.y[1]) - 2, (r.x[1] - r.x[0]) * s + 4, (r.y[1] - r.y[0]) * s + 4);
    ctx.fillStyle = "#14203a"; ctx.font = `600 11px ${UIF}`; ctx.textAlign = "left"; ctx.fillText(`${r.id} ${r.kind}`, L + r.x[1] * s + 5, Y(r.y[1]) + 10);
  });
  ctx.fillStyle = "#cfd6e6"; ctx.font = `11px ${UIF}`; ctx.textAlign = "left";
  ctx.fillText("플랜지", L + 4, T + 12 * s - 2);
  ctx.fillStyle = "#5a6478"; ctx.fillText("용접선", L + 150 * s + 4, T + 12 * s + 13);
  return t < w.t0 ? "3D 스캔 대기 · 측정이 진행되면 편차 맵이 아래부터 채워집니다"
    : !done ? `스캔 중 ${(prog * 100).toFixed(0)}% · 점군 생성${w.redo && t >= w.redoAt ? " · 커버리지 미달 → 경사 패스 추가" : ""}`
    : `커버리지 100% · ${ROI.length ? ROI.map((r) => `${r.id} ${r.kind} ${r.min} mm`).join(" · ") : "편차 ±0.3 mm 이내 · ROI 없음"}`;
}

// ---------- ① 2D 국부 검사: 부품 위 촬영 부위 + 부위별 영상(결함 상자) ----------
const CONF = { A: 0.93, B: 0.82, C: 0.74 };
export function spotStates(t) {
  const w = mainWin("2D"), spots = [...new Set(w.shots.map((s) => s[0]))];
  const done = new Set(S.sc.events.filter((e) => e.shot != null && e.t <= t + 1e-6).map((e) => e.spot));
  const ev3 = S.sc.events.find((e) => e.analysis === 3);
  return { w, spots, done, decided: !!ev3 && t >= ev3.t };
}
export function spotState(w, done, spn, cur, t) {
  if (done.has(spn)) return "done";
  const i0 = w.shots.findIndex((s) => s[0] === spn), nx = w.shots[i0 + 1];
  if (nx && nx[0] === spn && nx[2] && t >= w.shotT[i0][1]) return spn === cur ? "sat-run" : "sat";
  return spn === cur ? "run" : "wait";
}
export function draw2DMap(cv, st, cur, t) {
  const { w, spots, decided, done } = st, { ctx, W, H } = prep(cv);
  ctx.fillStyle = C.surf; ctx.fillRect(0, 0, W, H);
  const s = Math.min((W - 8) / 300, (H - 6) / 200), L = (W - 300 * s) / 2, T = (H - 200 * s) / 2, Y = (y) => T + (200 - y) * s;
  ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(L, T, 300 * s, 200 * s);
  ctx.fillStyle = C.line; ctx.fillRect(L, T, 300 * s, 12 * s);
  ctx.strokeStyle = C.bad; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L + 150 * s, T); ctx.lineTo(L + 150 * s, T + 200 * s); ctx.stroke(); ctx.setLineDash([]);
  if (decided) spots.forEach((spn) => {
    const sp = S.sc.geom.spots[spn], stt = spotState(w, done, spn, cur, t), on = stt === "run" || stt === "sat-run";
    ctx.strokeStyle = on ? C.c2D : stt === "done" ? C.fg : C.muted; ctx.lineWidth = on ? 2.5 : 1.4; ctx.setLineDash(stt === "wait" ? [3, 3] : []);
    ctx.strokeRect(L + sp.x[0] * s, Y(sp.y[1]), (sp.x[1] - sp.x[0]) * s, (sp.y[1] - sp.y[0]) * s); ctx.setLineDash([]);
    ctx.fillStyle = C.fg; ctx.font = `600 10.5px ${UIF}`; ctx.textAlign = "left"; ctx.fillText(sp.label.split(" ")[0], L + sp.x[1] * s + 2, Y(sp.y[1]) + 9);
  });
}
export function drawThumb(c, spn, state) {
  const sp = S.sc.geom.spots[spn], { ctx: g, W: cw, H: ch } = prep(c);
  const ar = (sp.y[1] - sp.y[0]) / (sp.x[1] - sp.x[0]), iw = Math.min(cw, ch * ar), ih = iw / ar, ix = (cw - iw) / 2, iy = (ch - ih) / 2;
  if (state === "wait" || state === "run") { g.fillStyle = C.surf; g.fillRect(ix, iy, iw, ih); g.fillStyle = C.muted; g.font = `12px ${UIF}`; g.textAlign = "center"; g.fillText(state === "run" ? "촬영 중…" : "촬영 대기", cw / 2, ch / 2); return; }
  const P = S.sc.P, w = mainWin("2D");
  if (state === "sat" || state === "sat-run") {
    g.drawImage(spotImg(spn, true), ix, iy, iw, ih);
    tag(g, ix + 3, iy + 3, `1차 · 반사 포화 · 신뢰도 ${P === "B" ? "0.04" : "0.20"}`, "#C2410C", "#fff");
    tag(g, ix + 3, iy + ih - 19, state === "sat-run" ? "25° 기울여 재촬영 중…" : "재촬영 대기", "rgba(0,0,0,.65)", "#fff");
    return;
  }
  g.drawImage(spotImg(spn), ix, iy, iw, ih);
  const U = (y) => ix + ((y - sp.y[0]) / (sp.y[1] - sp.y[0])) * iw, V = (x) => iy + ((x - sp.x[0]) / (sp.x[1] - sp.x[0])) * ih;
  sp.boxes.forEach((b) => {
    const col = b.t === "덴트" || b.t === "언더필" ? "#FFB020" : "#FF4D4D";
    g.strokeStyle = col; g.lineWidth = 1.8; g.setLineDash(b.dash ? [5, 3] : []);
    g.strokeRect(U(b.y[0]), V(b.x[0]), U(b.y[1]) - U(b.y[0]), V(b.x[1]) - V(b.x[0])); g.setLineDash([]);
    tag(g, U(b.y[0]), Math.max(iy, V(b.x[0]) - 17), b.t, col, "#111");
  });
  if (!sp.boxes.length) tag(g, ix + 3, iy + 3, "결함 없음", "rgba(46,125,79,.9)", "#fff");
  tag(g, ix + 3, iy + ih - 19, `신뢰도 ${CONF[sp.part].toFixed(2)}${w.shots.some((x) => x[0] === spn && x[2]) ? " · 재촬영" : ""}`, "rgba(0,0,0,.65)", "#fff");
}
export const confOf = (P) => CONF[P];

// ---------- ⑦ 데이터 미리보기 ----------
export function preview(d, cv) {
  const { ctx, W, H } = prep(cv);
  ctx.fillStyle = C.surf; ctx.fillRect(0, 0, W, H);
  const Hh = H - 18, k = d.preview, sc = S.sc, P = sc.P;
  const cap = (s) => { ctx.fillStyle = C.muted; ctx.font = `11px ${UIF}`; ctx.textAlign = "left"; ctx.fillText(s, 8, H - 6); };
  const g = plateFit(W, Hh);
  if (k === "cad") {
    ctx.fillStyle = "#171c28"; ctx.fillRect(g.L, g.T, 300 * g.sc, 200 * g.sc);
    ctx.fillStyle = "rgba(194,65,12,.25)"; ctx.fillRect(g.X(140.5), g.T + 12 * g.sc, 19 * g.sc, 188 * g.sc); plateBase(ctx, g);
    ctx.fillStyle = C.fg; ctx.font = `11px ${UIF}`; ctx.textAlign = "center"; ctx.fillText("300 × 200 × 16 mm 맞대기 용접 + 플랜지", W / 2, g.T + 110 * g.sc);
    cap("D02-01 CAD 3D 형상 (평면도)"); return;
  }
  if (k === "cloud" || k === "dev") {
    const grid = assets.dev[P]; if (!grid) return;
    const o = document.createElement("canvas"); o.width = grid.nx; o.height = grid.ny;
    const oc = o.getContext("2d"), id = oc.createImageData(grid.nx, grid.ny);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const q = ((grid.ny - 1 - j) * grid.nx + i) * 4, v = grid.v[j * grid.nx + i];
      let c;
      if (k === "dev") c = devCol(v);
      else { const z = 16 + v + 2 * Math.max(0, 1 - ((((i + 0.5) * 2 - 150) / 9.5) ** 2)); const s = clamp(120 + (z - 16) * 50 + ((i * 7 + j * 13) % 5) * 6, 60, 230); c = [s, s, s + 8]; }
      id.data[q] = c[0]; id.data[q + 1] = c[1]; id.data[q + 2] = c[2]; id.data[q + 3] = 255;
    }
    oc.putImageData(id, 0, 0); ctx.imageSmoothingEnabled = k !== "dev"; ctx.drawImage(o, g.L, g.T + 12 * g.sc, 300 * g.sc, 188 * g.sc); ctx.imageSmoothingEnabled = true; plateBase(ctx, g);
    cap(k === "dev" ? "D18-04 CAD 대비 편차 맵 (파랑 = 오목)" : "D03-01 표면 점군 (높이 음영, 점 간격 2 mm)"); return;
  }
  if (k === "roi") {
    plateBase(ctx, g);
    sc.geom.rois[P].forEach((r) => { ctx.strokeStyle = C.geo; ctx.lineWidth = 1.5; ctx.strokeRect(g.X(r.x[0]), g.Y(r.y[1]), (r.x[1] - r.x[0]) * g.sc, (r.y[1] - r.y[0]) * g.sc); });
    Object.values(sc.geom.spots).filter((s) => s.part === P).forEach((s) => s.boxes.forEach((b) => { ctx.strokeStyle = C.img; ctx.lineWidth = 1.2; ctx.strokeRect(g.X(b.x[0]), g.Y(b.y[1]), (b.x[1] - b.x[0]) * g.sc, (b.y[1] - b.y[0]) * g.sc); }));
    const L = sc.geom.lof[P]; if (L) { ctx.fillStyle = "rgba(194,65,12,.7)"; ctx.fillRect(g.X(L.x[0]) - 2, g.Y(L.y[1]), (L.x[1] - L.x[0]) * g.sc + 4, (L.y[1] - L.y[0]) * g.sc); }
    cap(`D19-01 지시 위치 · 파랑 3D ROI · 초록 2D 결함 · 빨강 UT 지시${sc.geom.rois[P].length || L ? "" : " (시편 A: 없음)"}`); return;
  }
  if (k === "img") {
    const w2 = mainWin("2D"), spn = w2.shots[w2.shots.length - 1][0], img = spotImg(spn); if (!img) return;
    const ar = img.width / img.height, iw = Math.min(W - 16, Hh * ar), ih = iw / ar;
    ctx.drawImage(img, (W - iw) / 2, (Hh - ih) / 2 + 2, iw, ih); cap(`D27-01 국부 영상 · ${sc.geom.spots[spn].label}`); return;
  }
  if (k === "ascan") {
    const L = 34, R = W - 10, T = 12, B = Hh - 14, X = (u) => L + (u / 8) * (R - L), Y = (a) => (T + B) / 2 - (a * (B - T)) / 2;
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(R, Y(0)); ctx.stroke();
    const lof = !!sc.geom.lof[P]; ctx.strokeStyle = C.wave; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let i = 0; i <= 600; i++) {
      const u = (i / 600) * 8, burst = (c, a) => a * Math.exp(-(((u - c) / 0.12) ** 2)) * Math.sin(2 * Math.PI * 10 * (u - c)), n = 0.03 * Math.sin(i * 1.7) * Math.sin(i * 0.31);
      const v = burst(0.5, 0.9) + (lof ? burst(3.1, 0.62) : 0) + burst(5.4, 0.45) + n, x = X(u), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.fillStyle = C.muted; ctx.font = `10px ${MONO}`; ctx.textAlign = "center";
    [0, 2, 4, 6, 8].forEach((u) => ctx.fillText(u + " µs", X(u), B + 12)); ctx.font = `10.5px ${UIF}`;
    ctx.fillText("웨지 계면", X(0.5), T + 4); if (lof) ctx.fillText("융합불량 지시", X(3.1), T + 4); ctx.fillText("형상 에코", X(5.4), T + 4);
    cap("D14-01 FMC 중 한 쌍의 A-scan (그림용 가상 파형 · 실계산은 초음파 DT)"); return;
  }
  if (k === "path") {
    plateBase(ctx, g);
    const dot = (x, y, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(g.X(x), g.Y(y), 2.6, 0, 7); ctx.fill(); };
    mainWin("3D").plan.segs.forEach((sg) => sg.pts.filter((r) => r.inner).forEach((r) => dot(r.part[0], r.part[1], C.geo)));
    mainWin("2D").shots.forEach((s) => { const sp = sc.geom.spots[s[0]]; dot(sp.c[0], sp.c[1], C.img); });
    ctx.strokeStyle = C.wave; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.X(110), g.Y(40)); ctx.lineTo(g.X(110), g.Y(140)); ctx.stroke();
    cap("D13-01 궤적 · 파랑 3D 스캔 점 · 초록 2D 촬영 중심 · 보라 UT 주사선"); return;
  }
  if (k === "map") {
    const Cn = sc.consts, X = (x) => 10 + ((x + 7.4) / 15) * (W - 20), Y = (z) => 8 + ((z + 1.8) / 6.6) * (Hh - 14);
    ctx.strokeStyle = C.line; ctx.font = `10px ${UIF}`;
    ["3D", "2D", "UT"].forEach((c) => { const cx = Cn.CX[c]; ctx.strokeRect(X(cx - 1.6), Y(-1.6), X(cx + 1.6) - X(cx - 1.6), Y(1.25) - Y(-1.6)); ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.fillText(c + " 셀", X(cx), Y(-1.2)); });
    [[Cn.STORE, "적재장", C.good], [Cn.RETURN, "반품", C.bad], [[Cn.INX, Cn.LANE], "투입", C.muted]].forEach(([p, n, c]) => {
      ctx.fillStyle = c; ctx.globalAlpha = 0.3; ctx.fillRect(X(p[0] - 0.7), Y(p[1] - 0.5), X(p[0] + 0.7) - X(p[0] - 0.7), Y(p[1] + 0.5) - Y(p[1] - 0.5)); ctx.globalAlpha = 1;
      ctx.fillStyle = C.fg; ctx.textAlign = "center"; ctx.fillText(n, X(p[0]), Y(p[1]) + 3);
    });
    const AC = ["#4f8cff", "#ffb84f"];
    sc.amrs.forEach((m, i) => {
      ctx.strokeStyle = AC[i]; ctx.lineWidth = 1.6; ctx.beginPath(); let first = true;
      m.segs.filter((s) => s.kind === "move").forEach((s) => s.pts.forEach((p) => { const x = X(p[0]), y = Y(p[1] + (i ? 0.08 : -0.08)); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; })); ctx.stroke();
    });
    cap("D29-01 위치 · 파랑 AMR-1 · 주황 AMR-2 경로"); return;
  }
  ctx.fillStyle = C.muted; ctx.font = `12px ${UIF}`; ctx.textAlign = "center"; ctx.fillText(`${d.format} · 그림 미리보기 없음`, W / 2, H / 2);
}

/** 그림이 없는 메타 코드의 예시 레코드 (원본 sample) */
export function sampleRecord(d) {
  const sc = S.sc, fl = sc.F.filter((f) => f.codes.some((c) => c.slice(0, 3) === d.code));
  const last = fl.filter((x) => x.t <= S.t + 1e-6).pop() || fl[0];
  const code = last ? last.codes.find((c) => c.slice(0, 3) === d.code) : d.sub[0].code;
  const o = { code, name: subName(code), job_id: sc.J, part_id: `WELD-${sc.P}-16T`, attempt: 1 };
  if (last) Object.assign(o, { t_s: +last.t.toFixed(1), process: procName(last.proc), from_layer: layerName(last.from), to_layer: layerName(last.to), summary: last.label });
  const sub = d.sub.find((x) => x.code === code); if (sub) o.content = sub.detail;
  o.format = d.format; o.storage = d.storage;
  o.level = d.extension ? "플랫폼 확장(안) · 1차년도 예시" : "WP5 데이터 계약 v0.1 · 1차년도 예시";
  return o;
}
export const hasPreview = (d) => ["cad", "cloud", "dev", "roi", "img", "ascan", "path", "map"].includes(d.preview);
