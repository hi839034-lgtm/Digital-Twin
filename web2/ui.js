/* WP5 DT 화면 코드 — 원본 WP5_InspectionDT.html 에서 가져옴 (tools/import_original_ui.py, [py] 표시한 곳만 수정) */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D = KIN.D2R;
const mmss = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const CELLS = ['3D', '2D', 'UT'];
const CELLNM = { '3D': '3D 스캔', '2D': '2D 비전', UT: '초음파' };
const TOOL = { '3D': 'scanner', '2D': 'camera', UT: 'probe' };
let sid = 'S1', SC = null, t = 0, playing = false, speed = 8, last = null, tab = 't-main';
// canvases are sized to their box at 2x for sharp text; drawing uses box (CSS px) coordinates
function prep(cv) { const w = Math.max(1, Math.round(cv.clientWidth || cv.width)), h = Math.max(1, Math.round(cv.clientHeight || cv.height)), r = 2;
  if (cv.width !== w * r || cv.height !== h * r) { cv.width = w * r; cv.height = h * r; } const ctx = cv.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, W: w, H: h }; }
// the whole GUI is a 1600x900 stage scaled to the window, so nothing scrolls; phones get a stacked layout instead
let S = 1; const PR = () => Math.min(2.5, (window.devicePixelRatio || 1) * Math.max(1, S));
function fit() { const st = $('#stage'), flow = matchMedia('(max-width: 899px), (max-height: 499px)').matches; document.documentElement.classList.toggle('flow', flow);
  if (flow) { S = 1; st.style.transform = ''; return; }
  S = Math.min(innerWidth / 1600, innerHeight / 900); st.style.transform = `translate(${((innerWidth - 1600 * S) / 2).toFixed(1)}px, ${((innerHeight - 900 * S) / 2).toFixed(1)}px) scale(${S.toFixed(4)})`; }
fit();

/* ================= shared helpers (v5) ================= */
const UIF = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif', MONOF = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
// rebuilt elements keep the blink in phase with wall-clock time
const NB = () => ` style="animation-delay:-${((performance.now() % 1200) / 1000).toFixed(2)}s"`;
const KIND = { move: '이동', wait: '대기', dock: '도킹', proc: '검사 중', hold: '판단 대기', load: '적재', unload: '하역', idle: '유휴' };
function zoneOf(p) { const [x, z] = p; if (x < -5.8) return '투입'; if (x > 6.2) return z > 3.3 ? '반품 라인' : '적재장'; if (z > 2.9) return `${x < -1.7 ? '3D' : x > 1.7 ? '초음파' : '2D'} 대기 구역`; if (z < 1.8) return `${x < -1.7 ? '3D' : x > 1.7 ? '초음파' : '2D'} 셀 도크`; return '이송 레인'; }
let FL = { F: [], H: [] }, GENT = {}, CPROC = {};
// data-code chip: dim until the code first appears in the scenario's data flow
function chip(code, opt) { const o = opt || {}; const on = o.strict ? !!o.on : (GENT[code] != null && GENT[code] <= t + 1e-6) || !!o.on;
  return `<span class="cd ${CODES.catOf(code)}${on ? ' on' : ''}${o.fill ? ' fill' : ''}" title="${code} ${CODES.subName(code)}">${code}</span>`; }
const chips = (list, opt) => list.map(c => chip(c, opt)).join('');
function curStage(tt) { return SC.stages.find(s => tt >= s.t0 && tt <= s.t1) || null; }
function curProc(tt) { const s = curStage(tt); return s ? s.id : 'amr'; }
function lastFlow(tt) { let f = null; for (const x of FL.F) { if (x.t <= tt + 1e-6) f = x; else break; } return f; }
function nnHTML(o) {
  return `<div class="nbox do now"${NB()}><span class="k">지금 하는 일</span><div>${o.now}</div>${o.nowCodes ? `<div class="chips">${chips(o.nowCodes, { on: true })}</div>` : ''}</div>` +
    `<div class="nbox nx"><span class="k">결과 · 다음 할 일</span><div class="r"><b>결과</b> ${o.res}</div><div class="r"><b>다음</b> ${o.next}${o.nextAt != null ? ` <span class="lt">${mmss(o.nextAt)}</span>` : ''}</div></div>`;
}

/* ================= robot plans ================= */
// [py] 로봇 경로 계획은 서버(server/sim/plan.py)가 계산해 w.plan = {K, segs(+stats, spotW)} 로 내려준다. 화면에서 할 일 없음.
function planWin(w) {}
function robotAt(c, tt) {
  const w = SC.wins[c].find(x => tt >= x.t0 && tt <= x.t1);
  if (!w) return { q: KIN.HOME, w: null, key: null };
  const K = w.plan.K;
  for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (tt <= b.t) { const u = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 1; const s = u * u * (3 - 2 * u); return { q: a.q.map((v, k) => v + (b.q[k] - v) * s), w, key: b, prev: a }; } }
  return { q: KIN.HOME, w, key: null };
}
function winAt(c, tt) { return SC.wins[c].find(x => tt >= x.t0 && tt <= x.t1) || null; }
function lastWin(c, tt) { const ws = SC.wins[c].filter(x => x.t0 <= tt); return ws.length ? ws[ws.length - 1] : null; }
function mainWin(c) { return SC.wins[c].find(x => x.main) || null; }

/* ================= scenario switching ================= */
function setScenario(s) {
  sid = s; SC = SCEN.build(s); CELLS.forEach(c => SC.wins[c].forEach(planWin)); t = 0; playing = false; last = null;
  FL = CODES.build(SC); GENT = {}; CPROC = {};
  FL.F.forEach(f => f.codes.forEach(c => { [c, c.slice(0, 3)].forEach(k => { if (GENT[k] == null || f.t < GENT[k]) GENT[k] = f.t; });
    const k = c.slice(0, 3), p = CPROC[k] || (CPROC[k] = { prod: [], use: [], t: f.t }); p.t = Math.min(p.t, f.t);
    const L = f.from === 4 ? p.use : p.prod; if (!L.includes(f.proc)) L.push(f.proc); }));
  FL.H.forEach(hh => hh.codes.forEach(c => { const p = CPROC[c.slice(0, 3)]; if (p && hh.a !== 'amr' && !p.use.includes(hh.b)) p.use.push(hh.b); }));
  const fd = FL.F.find(f => f.proc === 'amr' && f.codes.includes('D29-01')); FL.H.forEach(hh => { if (hh.a === 'amr') hh.t = fd ? fd.t : -1; });
  const ord = Object.fromEntries(CODES.PROCS.map(([p], i) => [p, i])); for (const k in CPROC) { CPROC[k].prod.sort((a, b) => ord[a] - ord[b]); CPROC[k].use.sort((a, b) => ord[a] - ord[b]); }
  document.querySelectorAll('.scen').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === s));
  $('#scen-desc').textContent = `${SC.def.name} — ${SC.def.desc}`;
  DB.reset(); V3.reset(); AMRT.reset(); DATAT.reset(); SWIM.reset(); updBtn(); render();
}
document.querySelectorAll('.scen').forEach(b => b.addEventListener('click', () => setScenario(b.dataset.s)));
function updBtn() { $('#play').textContent = playing ? '일시정지' : (t >= SC.T ? '다시 재생' : '재생'); }
$('#play').addEventListener('click', () => { if (t >= SC.T) { t = 0; V3.reset(); } playing = !playing; last = null; updBtn(); if (playing) schedule(); });
$('#restart').addEventListener('click', () => { t = 0; playing = false; V3.reset(); updBtn(); render(); });
$('#speed').addEventListener('change', e => { speed = +e.target.value; });
// next frame via rAF, with a timer fallback where animation frames are throttled; whichever fires first wins
function schedule() { let done = false; const go = ts => { if (done) return; done = true; clearTimeout(to); loop(ts); }; const to = setTimeout(() => go(performance.now()), 100); requestAnimationFrame(go); }
function loop(ts) { if (!playing) return; if (last != null) t = Math.min(SC.T, t + (ts - last) / 1000 * speed); last = ts; render(); if (t >= SC.T) { playing = false; updBtn(); return; } schedule(); }
$('#tl').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); t = clamp((e.clientX - r.left) / r.width, 0, 1) * SC.T; V3.reset(); updBtn(); render(); });
function drawTL() {
  const { ctx, W, H } = prep($('#tl')); const bh = H - 12;
  const col = { in: '--g-move', '3D': '--c3D', an: '--ops', '2D': '--c2D', UT: '--cUT', qc: '--fg', out: '--g-move' };
  ctx.fillStyle = css('--surface-2'); ctx.fillRect(0, 2, W, bh);
  for (const s of SC.stages) { const x0 = s.t0 / SC.T * W, x1 = (s.t1 || s.t0) / SC.T * W; ctx.fillStyle = css(col[s.id]); ctx.globalAlpha = t >= s.t0 && t <= s.t1 ? 1 : 0.5; ctx.fillRect(x0 + 1, 2, Math.max(2, x1 - x0 - 2), bh); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--on-chip'); ctx.font = '600 11px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (x1 - x0 > 46) ctx.fillText(s.name, (x0 + x1) / 2, 2 + bh / 2 + 1); }
  for (const e of SC.events) if (e.redo) { const x = e.t / SC.T * W; ctx.fillStyle = css('--bad'); ctx.beginPath(); ctx.moveTo(x, H - 10); ctx.lineTo(x + 5, H); ctx.lineTo(x - 5, H); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = css('--fg'); ctx.fillRect(t / SC.T * W - 1, 0, 2, bh + 4);
  $('#tlabel').textContent = `${mmss(t)} / ${mmss(SC.T)} (가상 시간)`;
}

/* ================= state ================= */
function stateAt(tt) {
  const st = { logs: [], msgs: [], an: -1, redo: 0, qc: false, shots: new Set(), links: {} };
  for (const e of SC.events) { if (e.t > tt + 1e-9) break; if (e.log) st.logs.push(e); if (e.msg) st.msgs.push(e); if (e.analysis != null) st.an = Math.max(st.an, e.analysis); if (e.redo) st.redo++; if (e.qc) st.qc = true; if (e.spot) st.shots.add(e.spot); if (e.link) { const L = st.links[e.link] || { n: 0, t: -99 }; L.n++; L.t = e.t; st.links[e.link] = L; } }
  return st;
}

/* ================= main tab: line overview & staged dashboard ================= */
const DB = (function () {
  let devCache = {}, imgCache = {};
  function reset() { $('#an-steps').innerHTML = ''; thumbKey = ''; }
  function rail(st) {
    const A = SCEN.ANALYSIS[SC.P]; const sa = SC.stages.find(s => s.id === 'an'); const inAn = t >= sa.t0 && t <= sa.t1; const cur = inAn ? Math.min(3, st.an + 1) : -1;
    $('#an-steps').innerHTML = A.map((s, i) => `<div class="an${i <= st.an ? ' on' : ''}${i === cur ? ' now' : ''}"${i === cur ? NB() : ''}><span class="ln">${i + 1}</span><div><b>${s[0]}</b>${i <= st.an ? s[1] : i === cur ? '분석 중…' : '…'}</div></div>`).join('');
    $('#an-state').textContent = t < sa.t0 ? '3D 결과 대기' : t <= sa.t1 ? '분석 중' : '결정 완료';
    $('#amr-mini').textContent = SC.amrs.map(m => { const s = SCEN.amrPos(m, t).seg; return `${m.id} ${s.kind === 'move' && s.label ? s.label : KIND[s.kind] || '유휴'}`; }).join(' · ');
  }
  function flowStrip() {
    $('#flow').innerHTML = SC.stages.map((s, i) => { const done = t > s.t1, cur = t >= s.t0 && t <= s.t1; const redo = SC.events.some(e => e.redo && e.t >= s.t0 && e.t <= Math.min(t, s.t1));
      return `${i ? '<span class="farr">›</span>' : ''}<div class="fstep${done ? ' done' : ''}${cur ? ' now' : ''}${redo ? ' redo' : ''}"${cur ? NB() : ''}><b>${s.name}</b><span>${cur ? `${mmss(t - s.t0)} 진행${redo ? ' · 보정' : ''}` : done ? (redo ? '보정 후 완료' : '완료') : `${mmss(s.t0)} 시작`}</span></div>`; }).join('');
  }
  const NEXT = {
    in: () => '시편 적재 → 3D 스캔 셀로 이송',
    '3D': () => '3D 셀 도킹 → 러프 스캔 정합 → CAD 법선 경로로 스캔',
    an: () => '3D 결과(편차 맵 · ROI)로 다음 공정 · 촬영 위치 · 주사 범위 결정',
    '2D': () => `2D 국부 촬영 · ${[...new Set(mainWin('2D').shots.map(s => GEOM.SPOTS[s[0]].label.split(' ')[0]))].join(' · ')}`,
    UT: () => '초음파 접촉 주사 · 용접선 y 40–140 mm',
    qc: () => 'QC 종합 판정 · 형상 · 표면 · 내부',
    out: () => SC.def.qc.dest === 'store' ? '적재장으로 이송 · 적재' : '반품 라인으로 이송 · 재작업 위치 전달' };
  function stageNow(s, st) {
    const a1 = SCEN.amrPos(SC.amrs[0], t).seg;
    if (s.id === 'in') return t < 8 ? `작업지시 ${SC.J} 접수 · AMR-1에 용접 시편 ${SC.P} 적재` : 'AMR-1 → 3D 스캔 셀 이송';
    if (s.id === 'an') return st.an < 0 ? 'OCS가 3D 결과(편차 맵 · ROI)를 받아 분석 준비' : st.an >= 3 ? 'OCS 결정 확정 · 2D 촬영 포즈와 UT 주사 경로 생성' : `OCS 자율 분석 ${st.an + 2}/4 진행 · 직전 단계 "${SCEN.ANALYSIS[SC.P][st.an][0]}" 완료`;
    if (s.id === 'qc') return '형상 · 표면 · 내부 결과 종합 → QC 판정';
    if (s.id === 'out') return `AMR-1 → ${SC.def.qc.dest === 'store' ? '적재장' : '반품 라인'} ${a1.kind === 'unload' ? '하역' : '이송 중'}`;
    const c = s.id, w = mainWin(c);
    if (t < w.t0) return `AMR-1 ${CELLNM[c]} 셀 도킹 · 러프 스캔으로 도킹 오차 추정`;
    if (t > w.t1) return `${CELLNM[c]} 결과 정리 · 다음 공정으로 전달`;
    if (c === '3D' && w.redo && t >= w.redoAt && t < w.redoAt + 2.5) return '커버리지 65% < 95% → 플랜지면 경사 30° 패스 P4·P5 경로 재생성';
    if (c === '2D' && w.redo) { const i = w.shots.findIndex(x => x[2]); if (t >= w.shotT[i - 1][1] && t < w.shotT[i][0] + 1.5) return `반사 포화 (신뢰도 ${SC.P === 'B' ? '0.04' : '0.20'}) → 카메라 · 조명 25° 기울여 재촬영`; }
    if (c === 'UT' && w.redo && t >= w.redoAt && t < w.redoAt + 6) return w.mode === 'tilt' ? '후면 에코 41% (프로브 3° 기울어짐) → 툴 축을 법선에 재정렬해 재주사' : '후면 에코 28% (접촉 불량) → 프로브를 들어 올려 재접촉 · 가압 증가';
    const ra = robotAt(c, t); const lbl = ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].label : '접근 · 이탈';
    return `${CELLNM[c]} · ${lbl}`;
  }
  function nowNext(st) {
    const s = curStage(t); let now;
    if (s) now = stageNow(s, st); else { const a1 = SCEN.amrPos(SC.amrs[0], t); now = t >= SC.stages[SC.stages.length - 1].t1 ? `${SC.J} 종료 · 결과 보고 완료 (${zoneOf(a1.p)})` : `AMR-1 ${a1.seg.label || '이동'} 이송 중 · ${zoneOf(a1.p)}`; }
    const nx = SC.stages.find(x => x.t0 > t);
    const res = [...SC.events].reverse().find(e => e.t <= t && e.msg && /result|gate|route|qc|closed/.test(e.msg.type));
    const lf = lastFlow(t);
    return { now, nowCodes: lf && t - lf.t < 6 ? lf.codes : null, res: res ? res.log : '아직 결과 없음', next: nx ? NEXT[nx.id]() : `다음 시편 ${SC.def.next} (AMR-2) 이어서 진행`, nextAt: nx ? nx.t0 : null };
  }
  const devCol = v => { const tt = clamp(v / 1.0, -1, 1); const neu = [233, 238, 240], neg = [35, 87, 201], pos = [194, 65, 12]; const c = tt < 0 ? neu.map((n, i) => n + (neg[i] - n) * -tt) : neu.map((n, i) => n + (pos[i] - n) * tt); return c.map(Math.round); };
  function shape() {
    const w = mainWin('3D'); const { ctx, W, H } = prep($('#db-3d')); ctx.fillStyle = css('--surface-2'); ctx.fillRect(0, 0, W, H);
    const prog = clamp((t - w.t0) / (w.t1 - w.t0), 0, 1); const sc = Math.min((W - 14) / 300, (H - 10) / 200), L = (W - 300 * sc) / 2, T = (H - 200 * sc) / 2;
    if (!devCache[SC.P]) devCache[SC.P] = GEOM.devGrid(SC.P, 2); const g = devCache[SC.P];
    const off = document.createElement('canvas'); off.width = g.nx; off.height = g.ny; const oc = off.getContext('2d'); const id = oc.createImageData(g.nx, g.ny); const rows = Math.floor(g.ny * prog);
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = ((g.ny - 1 - j) * g.nx + i) * 4; if (j < rows) { const c = devCol(g.v[j * g.nx + i]); id.data[k] = c[0]; id.data[k + 1] = c[1]; id.data[k + 2] = c[2]; id.data[k + 3] = 255; } else id.data[k + 3] = 0; }
    oc.putImageData(id, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, L, T + 12 * sc, 300 * sc, 188 * sc); ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1; ctx.strokeRect(L, T, 300 * sc, 200 * sc); ctx.fillStyle = css('--line'); ctx.fillRect(L, T, 300 * sc, 12 * sc);
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L + 150 * sc, T); ctx.lineTo(L + 150 * sc, T + 200 * sc); ctx.stroke(); ctx.setLineDash([]);
    if (t >= w.t0 && t < w.t1) { const yy = T + 12 * sc + 188 * sc * (1 - prog); ctx.strokeStyle = css('--c3D'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + 300 * sc, yy); ctx.stroke(); }
    const done = t >= w.t1; const Y = y => T + (200 - y) * sc;
    if (done) GEOM.ROIS[SC.P].forEach(r => { ctx.strokeStyle = css('--fg'); ctx.lineWidth = 1.5; ctx.strokeRect(L + r.x[0] * sc - 2, Y(r.y[1]) - 2, (r.x[1] - r.x[0]) * sc + 4, (r.y[1] - r.y[0]) * sc + 4); ctx.fillStyle = css('--fg'); ctx.font = '600 11px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`${r.id} ${r.kind}`, L + r.x[1] * sc + 5, Y(r.y[1]) + 10); });
    ctx.fillStyle = css('--muted'); ctx.font = '11px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('플랜지', L + 4, T + 12 * sc - 2); ctx.fillText('용접선', L + 150 * sc + 4, T + 12 * sc + 13);
    $('#db-3d-cap').textContent = t < w.t0 ? '3D 스캔 대기 · 측정이 진행되면 편차 맵이 아래부터 채워집니다' : !done ? `스캔 중 ${(prog * 100).toFixed(0)}% · 점군 생성${w.redo && t >= w.redoAt ? ' · 커버리지 미달 → 경사 패스 추가' : ''}` : `커버리지 100% · ${GEOM.ROIS[SC.P].length ? GEOM.ROIS[SC.P].map(r => `${r.id} ${r.kind} ${r.min} mm`).join(' · ') : '편차 ±0.3 mm 이내 · ROI 없음'}`;
  }
  const CONF = { A: 0.93, B: 0.82, C: 0.74 };
  function spotImg(spot, sat) { // [py] 2D 영상은 서버(server/sim/render.py)가 만든 PNG 를 쓴다
    const key = spot + (sat ? ':sat' : ''); if (imgCache[key]) return imgCache[key];
    const bm = GEOM.IMG[key]; const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0); return imgCache[key] = cv; }
  let thumbKey = '';
  function spotState(w, st, spn, cur) {
    if (st.shots.has(spn)) return 'done';
    const i0 = w.shots.findIndex(s => s[0] === spn), nx = w.shots[i0 + 1];
    if (nx && nx[0] === spn && nx[2] && t >= w.shotT[i0][1]) return spn === cur ? 'sat-run' : 'sat';
    return spn === cur ? 'run' : 'wait';
  }
  function tag(g, x, y, text, bg, fg) { g.font = '600 10.5px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; const tw = g.measureText(text).width + 8; g.fillStyle = bg; g.fillRect(x, y, tw, 15); g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(text, x + 4, y + 11); }
  function surface(st) {
    const w = mainWin('2D'); const spots = [...new Set(w.shots.map(s => s[0]))];
    const decided = st.an >= 3;
    const { ctx, W, H } = prep($('#db-2d-map')); ctx.fillStyle = css('--surface-2'); ctx.fillRect(0, 0, W, H);
    const sc = Math.min((W - 8) / 300, (H - 6) / 200), L = (W - 300 * sc) / 2, T = (H - 200 * sc) / 2, Y = y => T + (200 - y) * sc;
    ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1; ctx.strokeRect(L, T, 300 * sc, 200 * sc); ctx.fillStyle = css('--line'); ctx.fillRect(L, T, 300 * sc, 12 * sc);
    ctx.strokeStyle = css('--bad'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L + 150 * sc, T); ctx.lineTo(L + 150 * sc, T + 200 * sc); ctx.stroke(); ctx.setLineDash([]);
    const ra = robotAt('2D', t); const cur = ra.w === w && ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].spot : null;
    if (decided) spots.forEach(spn => { const sp = GEOM.SPOTS[spn]; const s = spotState(w, st, spn, cur); const on = s === 'run' || s === 'sat-run';
      ctx.strokeStyle = on ? css('--c2D') : s === 'done' ? css('--fg') : css('--muted'); ctx.lineWidth = on ? 2.5 : 1.4; ctx.setLineDash(s === 'wait' ? [3, 3] : []);
      ctx.strokeRect(L + sp.x[0] * sc, Y(sp.y[1]), (sp.x[1] - sp.x[0]) * sc, (sp.y[1] - sp.y[0]) * sc); ctx.setLineDash([]); ctx.fillStyle = css('--fg'); ctx.font = '600 10.5px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.fillText(sp.label.split(' ')[0], L + sp.x[1] * sc + 2, Y(sp.y[1]) + 9); });
    const states = spots.map(spn => spotState(w, st, spn, cur)); const key = sid + '|' + decided + '|' + states.join(',');
    if (key !== thumbKey) {
      thumbKey = key; const box = $('#db-2d-imgs'); box.style.gridTemplateColumns = `repeat(${decided ? spots.length : 1}, minmax(0,1fr))`;
      box.innerHTML = decided ? spots.map(spn => `<figure class="thumb"><div class="cv"><canvas id="th-${spn}"></canvas></div><figcaption>${GEOM.SPOTS[spn].label}</figcaption></figure>`).join('') : '<p class="note">자율 분석이 촬영 부위를 정하면 부위별 영상과 결함 표시가 여기에 나타납니다</p>';
      if (decided) spots.forEach((spn, k) => { const c = $('#th-' + spn); if (!c) return; const { ctx: g, W: cw, H: ch } = prep(c); const sp = GEOM.SPOTS[spn]; const s = states[k];
        const ar = (sp.y[1] - sp.y[0]) / (sp.x[1] - sp.x[0]); const iw = Math.min(cw, ch * ar), ih = iw / ar, ix = (cw - iw) / 2, iy = (ch - ih) / 2;
        if (s === 'wait' || s === 'run') { g.fillStyle = css('--surface-2'); g.fillRect(ix, iy, iw, ih); g.fillStyle = css('--muted'); g.font = '12px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.fillText(s === 'run' ? '촬영 중…' : '촬영 대기', cw / 2, ch / 2); return; }
        if (s === 'sat' || s === 'sat-run') { g.drawImage(spotImg(spn, true), ix, iy, iw, ih); tag(g, ix + 3, iy + 3, `1차 · 반사 포화 · 신뢰도 ${SC.P === 'B' ? '0.04' : '0.20'}`, '#C2410C', '#fff'); tag(g, ix + 3, iy + ih - 19, s === 'sat-run' ? '25° 기울여 재촬영 중…' : '재촬영 대기', 'rgba(0,0,0,.65)', '#fff'); return; }
        g.drawImage(spotImg(spn), ix, iy, iw, ih);
        const U = y => ix + (y - sp.y[0]) / (sp.y[1] - sp.y[0]) * iw, V = x => iy + (x - sp.x[0]) / (sp.x[1] - sp.x[0]) * ih;
        sp.boxes.forEach(b => { const col = b.t === '덴트' || b.t === '언더필' ? '#FFB020' : '#FF4D4D'; g.strokeStyle = col; g.lineWidth = 1.8; g.setLineDash(b.dash ? [5, 3] : []); g.strokeRect(U(b.y[0]), V(b.x[0]), U(b.y[1]) - U(b.y[0]), V(b.x[1]) - V(b.x[0])); g.setLineDash([]);
          tag(g, U(b.y[0]), Math.max(iy, V(b.x[0]) - 17), b.t, col, '#111'); });
        if (!sp.boxes.length) tag(g, ix + 3, iy + 3, '결함 없음', 'rgba(46,125,79,.9)', '#fff');
        tag(g, ix + 3, iy + ih - 19, `신뢰도 ${CONF[sp.part].toFixed(2)}${w.shots.some(x => x[0] === spn && x[2]) ? ' · 재촬영' : ''}`, 'rgba(0,0,0,.65)', '#fff'); });
    }
    const nd = st.shots.size;
    $('#db-2d-cap').textContent = !decided ? '2D 국부 검사 대기 · 3D 결과를 분석해 촬영 부위를 정합니다' : t < w.t0 ? `촬영 부위 ${spots.length}곳 결정 · AMR 이송 중` : nd < spots.length ? `촬영 ${nd}/${spots.length}${states.some(s => s.startsWith('sat')) ? ' · 반사 포화로 재촬영' : ''}` : `부위 ${spots.length}곳 · 결함 ${spots.reduce((a, s) => a + GEOM.SPOTS[s].boxes.length, 0)}건 · 신뢰도 ${CONF[SC.P].toFixed(2)} (규칙 기반 판정)`;
  }
  function qc(st) {
    const q = SC.def.qc; const el = $('#db-qc');
    if (!st.qc) { el.innerHTML = '<p class="cap">모든 검사가 끝나면 세 결과를 종합합니다</p><div class="crit"><div>형상 (3D): CAD 대비 편차 ±0.5 mm 이내</div><div>표면 (2D): 균열·기공·언더컷 0건</div><div>내부 (초음파): −20 dB 검출선 초과 지시 없음</div><div>모두 OK → 적재장 · 하나라도 NG → 반품 라인</div></div>'; return; }
    const row = (nm, v) => `<div class="qrow"><span>${nm}</span><span class="pill ${v[0] === 'OK' ? 'ok' : 'ng'}">${v[0]}</span><span class="muted">${v[1]}</span></div>`;
    const am = SCEN.amrPos(SC.amrs[0], t); const arrived = am.seg.kind === 'unload' || am.seg.kind === 'idle' && t > SC.stages.find(s => s.id === 'out').t0;
    el.innerHTML = row('형상 (3D)', q.shape) + row('표면 (2D)', q.surf) + row('내부 (초음파)', q.inner) +
      `<div class="qfinal ${q.pass ? 'ok' : 'ng'}"><b>QC ${q.pass ? 'PASS' : 'FAIL'}</b><span>${q.pass ? '적재장' : '반품 라인'}으로 ${arrived ? '이송 완료' : '이송 중'} · AMR-1</span></div>`;
  }
  const DL = {
    '3D': [['D03-01', 'D18-04', 'D19-01', 'D20-05'], '자율 분석 · 2D 촬영 포즈 · UT 주사 경로 (D13-01)'],
    '2D': [['D27-01', 'D19-01', 'D19-03', 'D20-04'], 'UT 주사 범위 확인 · QC 표면 판정'],
    UT: [['D14-01', 'D18-02', 'D19-01', 'D20-04'], '3D 모델 결함 매핑 · QC 내부 판정 · 재작업 위치'],
    qc: [['D21-01', 'D21-02', 'D23-01'], 'WP1 품질 기록 · AMR 목적지 (D28-01)'] };
  function lineage(st) {
    const done = { '3D': t >= mainWin('3D').t1 + 0.5, '2D': t >= mainWin('2D').t1, UT: t >= mainWin('UT').t1 + 0.5, qc: st.qc };
    for (const k in DL) { const el = $('#ln-' + k); el.className = 'dline' + (done[k] ? ' on' : '');
      el.innerHTML = `<div class="chips"><b>생성</b>${chips(DL[k][0], { strict: true, on: done[k] })}</div><div><b>활용</b>${DL[k][1]}</div>`; }
  }
  function feed() {
    const fl = FL.F.filter(f => f.t <= t + 1e-6);
    $('#log').innerHTML = fl.slice(-11).reverse().map((f, i) => { const hot = i === 0 && t - f.t < 5; return `<li class="${hot ? 'nowbg' : ''}"${hot ? NB() : ''} title="${f.label}"><span class="lt">${mmss(f.t)}</span>${chips(f.codes, { on: true })} ${CODES.PN[f.proc]} · ${f.label}</li>`; }).join('') || '<li>재생을 누르면 공정 사이에 오가는 데이터가 쌓입니다</li>';
  }
  function panels() {
    for (const c of CELLS) {
      const w = winAt(c, t); const ra = robotAt(c, t); let state = '대기', cls = 'idle', job = '—', m1 = '', prog = 0, mine = false;
      const hold = SC.amrs.map(a => SCEN.amrPos(a, t).seg).find(s => (s.kind === 'dock' || s.kind === 'hold') && s.cell === c);
      if (w) { prog = (t - w.t0) / (w.t1 - w.t0); job = `${w.job} · 시편 ${w.part} (${w.amr})`; const red = w.redo && t >= w.redoAt; state = red ? '보정·재측정' : '검사'; cls = red ? 'redo' : 'run'; m1 = ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].label : '접근·이탈'; mine = w.job === SC.J; }
      else if (hold) { job = hold.job; state = hold.kind === 'hold' ? (c === '3D' ? '자율 분석' : c === 'UT' ? 'QC 판정' : '대기') : '도킹·정합'; cls = 'run'; m1 = hold.kind === 'hold' ? (c === '3D' ? 'OCS가 다음 공정 결정 중' : '형상·표면·내부 결과 종합') : 'AMR 정렬 · 도킹 오차 추정'; mine = hold.job === SC.J; }
      const el = $('#ov-' + c); el.classList.toggle('now', mine);
      el.innerHTML = `<div class="ovh"><span class="dot" style="background:var(--c${c})"></span><b>${CELLNM[c]}</b><span class="ovj">${job}</span><span class="pill ${cls}">${state}</span></div><div class="ovbar"><i style="width:${(prog * 100).toFixed(0)}%"></i></div><div class="ovm">${m1 || '&nbsp;'}</div>`;
    }
  }
  function pills(st) {
    const set = (id, txt, cls) => { const el = $(id); el.textContent = txt; el.className = 'pill ' + cls; };
    for (const c of CELLS) { const w = mainWin(c); set('#st-' + c, t < w.t0 ? '대기' : t <= w.t1 ? (w.redo && t >= w.redoAt ? '보정·재측정' : '측정 중') : '완료', t < w.t0 ? '' : t <= w.t1 ? (w.redo && t >= w.redoAt ? 'redo' : 'run') : 'ok');
      const s = SC.stages.find(x => x.id === c); $('#dc-' + c).classList.toggle('now', t >= s.t0 && t <= s.t1); }
    set('#st-qc', st.qc ? (SC.def.qc.pass ? 'PASS' : 'FAIL') : '대기', st.qc ? (SC.def.qc.pass ? 'ok' : 'ng') : '');
    const q = SC.stages.find(x => x.id === 'qc'), o = SC.stages.find(x => x.id === 'out'); $('#dc-qc').classList.toggle('now', t >= q.t0 && t <= o.t1);
  }
  function render(st) { rail(st); flowStrip(); $('#nn-main').innerHTML = nnHTML(nowNext(st)); pills(st); shape(); surface(st); qc(st); lineage(st); feed(); panels(); UTV.update(); }
  return { render, reset, nowNext, spotImg, devCol };
})();

/* ================= UT superimposed on 3D model (mini renderer) ================= */
const UTV = (function () {
  let R = null, plate = null, strip = null, stripTex = null, stripCv = null, lof = null, lastKey = '';
  const P = (x, y, z) => new THREE.Vector3(x / 100 - 1.5, z / 100 * 2, -(y / 100 - 1));
  function init() {
    if (R || typeof THREE === 'undefined') return !!R;
    const host = $('#db-ut'); const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2)); host.prepend(ren.domElement);
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(36, 1, 0.01, 50); cam.position.set(0.9, 2.6, 3.2);
    const ctl = new THREE.OrbitControls(cam, ren.domElement); ctl.target.set(0, 0.2, 0); ctl.update(); ctl.addEventListener('change', () => draw());
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667780, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(2, 4, 3); scene.add(dl);
    R = { ren, scene, cam, ctl, host }; new ResizeObserver(() => { size(); draw(); }).observe(host); size(); return true;
  }
  function size() { if (!R) return; const w = R.host.clientWidth, h = R.host.clientHeight; if (!w || !h) return; R.ren.setPixelRatio(PR()); R.ren.setSize(w, h, false); R.ren.domElement.style.width = '100%'; R.ren.domElement.style.height = '100%'; R.cam.aspect = w / h; R.cam.updateProjectionMatrix(); }
  function buildPart() {
    if (plate) { R.scene.remove(plate); plate.geometry.dispose(); } if (strip) { R.scene.remove(strip); } if (lof) { R.scene.remove(lof); lof = null; }
    const nx = 75, ny = 50; const g = new THREE.PlaneGeometry(3, 2, nx, ny); g.rotateX(-Math.PI / 2); const pos = g.attributes.position; const cols = [];
    for (let i = 0; i < pos.count; i++) { const X = pos.getX(i), Z = pos.getZ(i); const x = (X + 1.5) * 100, y = (-Z + 1) * 100; pos.setY(i, GEOM.topZ(SC.P, x, y) / 100 * 2); const d = GEOM.dev(SC.P, x, y); const c = clamp(d, -1, 1); const neu = [0.80, 0.84, 0.86], neg = [0.14, 0.34, 0.79]; const cc = c < 0 ? neu.map((n, k) => n + (neg[k] - n) * -c) : neu; cols.push(...cc); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    plate = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 1 })); R.scene.add(plate);
    const side = new THREE.Mesh(new THREE.BoxGeometry(3, 0.32, 2), new THREE.MeshStandardMaterial({ color: 0x8d979c, transparent: true, opacity: 0.35 })); side.position.y = 0.16; plate.add(side);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x9aa3a8, transparent: true, opacity: 0.6 })); fl.position.copy(P(150, 194, 56)); plate.add(fl);
    stripCv = document.createElement('canvas'); stripCv.width = 64; stripCv.height = 200; stripTex = new THREE.CanvasTexture(stripCv);
    strip = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.0), new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    strip.rotation.x = -Math.PI / 2; strip.position.copy(P(150, 90, 19.5)); R.scene.add(strip);
    const L = GEOM.LOF[SC.P];
    if (L) { lof = new THREE.Mesh(new THREE.BoxGeometry((L.x[1] - L.x[0]) / 100 + 0.02, (L.z[1] - L.z[0]) / 100 * 2, (L.y[1] - L.y[0]) / 100), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.85 })); lof.position.copy(P((L.x[0] + L.x[1]) / 2, (L.y[0] + L.y[1]) / 2, 16 - (L.z[0] + L.z[1]) / 2)); lof.visible = false; R.scene.add(lof); }
  }
  let stripKey = '';
  function paintStrip(good, bad) {
    const k = (good ? good.map(v => v.toFixed(0)).join('-') : 'n') + '|' + (bad ? bad.map(v => v.toFixed(0)).join('-') : 'n'); if (k === stripKey) return; stripKey = k;
    const g = stripCv.getContext('2d'); g.clearRect(0, 0, 64, 200); const L = GEOM.LOF[SC.P];
    for (let j = 0; j < 200; j++) { const y = 140 - j * 100 / 200; const inG = good && y >= good[0] && y <= good[1], inB = !inG && bad && y >= bad[0] && y <= bad[1]; if (!inG && !inB) continue;
      for (let i = 0; i < 64; i++) { const x = 130 + i * 40 / 64; const nz = 0.05 * Math.sin(i * 1.7 + j * 0.9) ** 2;
        if (inB) { g.fillStyle = `rgba(128,138,143,${0.35 + nz * 4})`; g.fillRect(i, j, 1, 1); continue; }
        let a = 0.08 + nz; if (L && y >= L.y[0] && y <= L.y[1] && Math.abs(x - 147) < 3.5) a = 0.95 - Math.abs(x - 147) * 0.12;
        const c = a > 0.6 ? [255, 59, 48] : a > 0.3 ? [255, 176, 32] : [46, 204, 113]; g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.25 + a * 0.7})`; g.fillRect(i, j, 1, 1); } }
    stripTex.needsUpdate = true;
  }
  // where the probe has scanned (part y, mm), per robot segment
  function scanY(w, seg) {
    const ra = robotAt('UT', t); if (ra.w !== w) return null;
    const C = w.plan.K.filter(k => k.contact && k.part && k.part[2] < 16.5 && (seg == null || k.seg === seg));
    const past = C.filter(k => k.t <= t); if (!past.length) return null;
    let y = past[past.length - 1].part[1]; const nx = C.find(k => k.t > t);
    if (nx && ra.key === nx && ra.prev && ra.prev.contact && ra.prev.part && ra.prev.part[2] < 16.5) y = ra.prev.part[1] + (nx.part[1] - ra.prev.part[1]) * clamp((t - ra.prev.t) / (nx.t - ra.prev.t), 0, 1);
    return y;
  }
  function utCoverage(w) {
    if (t < w.t0) return { good: null, bad: null, bw: null };
    if (t > w.t1) return { good: [40, 140], bad: null, bw: w.mode === 'tilt' ? 78 : w.mode === 'recontact' ? 75 : 76 };
    if (w.mode === 'tilt') { if (t < w.redoAt + 3) { const y = scanY(w, 0); return { good: null, bad: y ? [40, y] : null, bw: 41 }; } const y = scanY(w, 1); return { good: y ? [40, y] : null, bad: null, bw: 78 }; }
    const y = scanY(w, null);
    if (w.mode === 'recontact') { if (t < w.redoAt + 4.5) return { good: y ? [40, Math.min(y, 80)] : null, bad: y && y > 80 ? [80, y] : null, bw: t < w.redoAt ? (y && y > 80 ? 28 : 74) : 28 }; return { good: y ? [40, y] : null, bad: null, bw: 75 }; }
    return { good: y ? [40, y] : null, bad: null, bw: 76 };
  }
  function update() {
    if (tab !== 't-main') return; if (!init()) return;
    const w = mainWin('UT'), w3 = mainWin('3D');
    if (sid !== lastKey) { buildPart(); lastKey = sid; stripKey = ''; }
    const cov = utCoverage(w); paintStrip(cov.good, cov.bad);
    const has3D = t >= w3.t1; plate.visible = has3D; strip.visible = t >= w.t0; plate.material.opacity = t >= w.t0 ? 0.55 : 1;
    if (lof) lof.visible = !!(cov.good && cov.good[1] >= 82);
    const yy = cov.good ? cov.good[1] : cov.bad ? cov.bad[1] : 40;
    $('#db-ut-cap').textContent = !has3D ? '3D 스캔이 끝나면 스캔 모델이 생성되고, 초음파 결과를 그 위에 겹쳐 표시합니다' : t < w.t0 ? '3D 스캔 모델 생성 · 초음파 검사 대기' : t <= w.t1 ? `주사 중 · y ${yy.toFixed(0)} mm · 후면 에코 ${cov.bw}%${cov.bad ? ' (기준 50% 미달 → 회색 = 재취득 대상)' : ''}` : GEOM.LOF[SC.P] ? '융합불량 지시 +5.1 dB · 깊이 6.5~9.5 mm · y 70~95 mm → 3D 모델 좌표에 매핑' : '검출선(−20 dB) 이상 지시 없음 · 용접선 y 40~140 mm 전 구간 정상';
    draw();
  }
  function draw() { if (R && tab === 't-main') R.ren.render(R.scene, R.cam); }
  return { update, resize: () => { size(); draw(); } };
})();

/* ================= platform 3D scene (shared by all tabs) ================= */
const V3 = (function () {
  let R = null; const robots = {}, amrs = {}, fx = {}, pathG = {}, pads = {}; let pathKey = {}, amrG = null, amrKey = '', amrMk = [], moved = false;
  const r2w = (c, p) => new THREE.Vector3(SCEN.CX[c] + p[1], 0.46 + p[2], -0.65 + p[0]);
  function sprite(text, bg, scale) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = bg || 'rgba(19,32,38,0.82)'; g.fillRect(0, 20, 512, 88); g.fillStyle = '#ffffff'; g.font = '600 52px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); sp.scale.set(scale || 1.2, (scale || 1.2) / 4, 1); return sp; }
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.1 }, o || {}));
  function boxAt(scene, w, h, d, x, y, z, m) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; }
  function init() {
    if (R) return true;
    if (typeof THREE === 'undefined') { document.querySelectorAll('.scene').forEach(s => { if (!s.querySelector('.note')) s.insertAdjacentHTML('beforeend', '<p class="note" style="padding:16px">3D 라이브러리를 불러오지 못했습니다.</p>'); }); return false; }
    const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdde5e8); const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
    const ctl = new THREE.OrbitControls(cam, ren.domElement); ctl.addEventListener('change', () => { overlays(); draw(); }); ctl.addEventListener('start', () => { moved = true; });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556670, 0.85)); const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(-3, 9, 6); scene.add(dl);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat(0xdfe5e7, { roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.2); scene.add(floor);
    const yel = mat(0xe8b923), teal = new THREE.MeshBasicMaterial({ color: 0x0b7a85 });
    boxAt(scene, 14.6, 0.005, 0.06, 0, 0.003, 1.62, yel);
    for (let x = -7; x < 5.4; x += 0.5) boxAt(scene, 0.28, 0.004, 0.04, x, 0.004, SCEN.LANE, teal);
    for (const [p, nm, col, bg, k] of [[[SCEN.INX, SCEN.LANE], '투입', 0xb9c4c9, null, 'in'], [SCEN.STORE, '적재장 (QC 합격)', 0x9bd3ae, 'rgba(46,125,79,0.9)', 'store'], [SCEN.RETURN, '반품 라인 (QC 불합격)', 0xf2b8a2, 'rgba(194,65,12,0.9)', 'return']]) { const pd = boxAt(scene, 1.4, 0.02, 1.0, p[0], 0.01, p[1], mat(col)); if (k !== 'in') pads[k] = pd; const sp = sprite(nm, bg, 1.5); sp.position.set(p[0], 0.95, p[1] + 0.2); scene.add(sp); }
    const meshM = mat(0xffffff, { transparent: true, opacity: 0.16, side: THREE.DoubleSide }), curtain = mat(0x15191b, { transparent: true, opacity: 0.93, side: THREE.DoubleSide });
    const ped = mat(0x3e4a50), link = mat(0x2f5fd0, { roughness: 0.45 }), jnt = mat(0x234aa8, { roughness: 0.45 }), cab = mat(0xa7b0b4);
    for (const c of CELLS) {
      const cx = SCEN.CX[c], pm = c === '2D' ? curtain : meshM;
      for (const [x, z] of [[cx - 1.6, -1.6], [cx + 1.6, -1.6], [cx - 1.6, 1.25], [cx + 1.6, 1.25], [cx, -1.6]]) boxAt(scene, 0.07, 1.9, 0.07, x, 0.95, z, yel);
      boxAt(scene, 3.2, 1.7, 0.02, cx, 1.0, -1.6, pm); boxAt(scene, 0.02, 1.7, 2.85, cx - 1.6, 1.0, -0.175, pm); boxAt(scene, 0.02, 1.7, 2.85, cx + 1.6, 1.0, -0.175, pm);
      boxAt(scene, 0.25, 0.45, 0.18, cx - 1.72, 1.15, 0.4, cab); boxAt(scene, 0.5, 0.46, 0.5, cx, 0.23, -0.65, ped);
      const sp = sprite(CELLNM[c] + ' 셀', null, 1.5); sp.position.set(cx, 2.1, -1.6); scene.add(sp);
      const rb = { links: [], joints: [] };
      [0.085, 0.07, 0.055].forEach(r => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 20), link); scene.add(m); rb.links.push(m); });
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.013, 18, 14), jnt); scene.add(m); rb.joints.push(m); }
      rb.tool = new THREE.Mesh(new THREE.CylinderGeometry(c === 'UT' ? 0.022 : 0.03, c === 'UT' ? 0.022 : 0.03, 1, 14), mat(0x50585c)); scene.add(rb.tool);
      rb.head = c === '3D' ? new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.11), mat(0x3a4044)) : c === '2D' ? new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })) : new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.05, 12), mat(0xc49a3a));
      scene.add(rb.head); robots[c] = rb;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(c === '3D' ? 0.16 : 0.12, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: c === '3D' ? 0x3b82f6 : 0xf5b331, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })); cone.visible = false; scene.add(cone);
      const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x2ecc71, size: 0.03 })); scene.add(dots);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); ring.visible = false; scene.add(ring);
      fx[c] = { cone, dots, pts: [], ring };
      pathG[c] = new THREE.Group(); scene.add(pathG[c]);
      if (c === '3D') { const lg = mat(0x2a2f33); [[-0.12, 0.08], [0.12, 0.08], [0, -0.14]].forEach(([dx, dz]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), lg); l.position.set(cx + 1.05 + dx, 0.75, -1.15 + dz); scene.add(l); }); boxAt(scene, 0.55, 0.08, 0.1, cx + 1.05, 1.52, -1.15, lg); }
      if (c === 'UT') { boxAt(scene, 0.5, 0.75, 0.35, cx + 1.15, 0.375, -1.15, cab); for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), mat(0x50585c)); p.position.set(cx + 0.98 + i * 0.11, 0.82, -1.15); scene.add(p); }
        boxAt(scene, 0.45, 0.6, 0.35, cx + 1.2, 0.3, 0.75, cab); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ color: 0x0b7a85 })); scr.position.set(cx + 1.2, 0.85, 0.94); scene.add(scr); }
    }
    for (const m of ['AMR-1', 'AMR-2']) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.75), mat(0xf4f6f7)); body.position.y = 0.17; g.add(body);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.77), mat(0x2a2f33)); band.position.y = 0.13; g.add(band);
      const plateM = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.7), mat(0x9aa3a8, { metalness: 0.3 })); plateM.position.y = 0.34; g.add(plateM);
      [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), yel); p.position.set(x, 0.42, z); g.add(p); });
      const part = new THREE.Group();
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.34), mat(0x6b767b)); riser.position.y = 0.41; part.add(riser);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.016, 0.3), mat(0xb3bcc0, { metalness: 0.5, roughness: 0.4 })); pl.position.y = 0.468; part.add(pl);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.3), mat(0xa4adb1, { metalness: 0.5 })); fl.position.set(0.094, 0.516, 0); part.add(fl);
      const bd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.016), new THREE.MeshBasicMaterial({ color: 0xc2410c })); bd.position.set(0, 0.478, 0); part.add(bd);
      g.add(part); const lab = sprite(m, m === 'AMR-1' ? 'rgba(11,122,133,0.92)' : 'rgba(19,32,38,0.82)', 0.8); lab.position.y = 0.95; g.add(lab);
      scene.add(g); amrs[m] = { g, part, lab };
    }
    R = { ren, scene, cam, ctl };
    document.querySelectorAll('.scene').forEach(h => new ResizeObserver(() => { size(); if (!moved) frame(); draw(); }).observe(h));
    return true;
  }
  function host() { return $('#scene-' + (tab === 't-main' ? 'main' : tab.slice(2))); }
  function attach() {
    if (!init()) return; const h = host(); if (!h) return; if (R.ren.domElement.parentNode !== h) h.prepend(R.ren.domElement);
    moved = false; size(); frame();
  }
  function frame() {
    const hh = host(); if (!hh) return; const asp = hh.clientWidth && hh.clientHeight ? hh.clientWidth / hh.clientHeight : 1.65;
    if (tab === 't-main') { const f = clamp(0.86 * 2.37 / asp, 0.86, 2.4); R.ctl.target.set(0.3, 0.3, 1.75); R.cam.position.set(0.3, 0.3 + 11.2 * f, 1.75 + 8.2 * f); }
    else if (tab === 't-AMR') { const f = clamp(1.15 / asp, 1, 2.2); R.ctl.target.set(0.25, 0, 1.45); R.cam.position.set(0.25, 12.6 * f, 1.45 + 7.2 * f); }
    else { const c = tab.slice(2), cx = SCEN.CX[c], f = clamp(1.14 / asp, 1, 1.8); R.ctl.target.set(cx, 0.6, -0.3); R.cam.position.set(cx + 1.25 * f, 0.6 + 1.6 * f, -0.3 + 2.85 * f); }
    R.ctl.update();
  }
  function size() { if (!R) return; const h = host(); if (!h) return; const w = h.clientWidth, hh = h.clientHeight; if (!w || !hh) return; R.ren.setPixelRatio(PR()); R.ren.setSize(w, hh, false); R.ren.domElement.style.width = '100%'; R.ren.domElement.style.height = '100%'; R.cam.aspect = w / hh; R.cam.updateProjectionMatrix(); }
  function seg(mesh, A, B) { const d = new THREE.Vector3().subVectors(B, A); const L = d.length(); mesh.position.copy(A).addScaledVector(d, 0.5); mesh.scale.set(1, Math.max(L, 1e-4), 1); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); }
  function buildPaths(c, w) {
    const G = pathG[c]; while (G.children.length) { const o = G.children.pop(); o.traverse(x => x.geometry && x.geometry.dispose()); }
    if (!w) return;
    const gen = w.t0 + (c === '3D' ? 1.5 : 1.0);
    w.plan.segs.forEach(sg => { const inner = sg.res.res.filter(r => r.inner); const pts = inner.map(r => r2w(c, r.target.p)); if (!pts.length) return;
      const col = sg.kind === 'fix' ? 0xe08a00 : 0x0b7a85; const sub = new THREE.Group(); sub.userData.showAt = sg.kind === 'fix' ? w.redoAt + 0.5 : gen;
      if (pts.length > 1) sub.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
      inner.forEach((r, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(pts[i]); sub.add(m);
        const z = r.target.R.z, L = c === 'UT' ? 0.06 : 0.09; const back = r2w(c, [r.target.p[0] - z[0] * L, r.target.p[1] - z[1] * L, r.target.p[2] - z[2] * L]);
        sub.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[i], back]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 }))); });
      if (c === '2D') { const tip = r2w(c, inner[0].tip); const tg = r2w(c, sg.spotW /* [py] 서버 계산값 */); const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tip, tg]), new THREE.LineDashedMaterial({ color: col, dashSize: 0.02, gapSize: 0.015 })); ln.computeLineDistances(); sub.add(ln); }
      G.add(sub); });
    if (c === 'UT' && w.mode === 'recontact') { const kp = w.plan.K.find(k => k.press); if (kp) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 24), new THREE.MeshBasicMaterial({ color: 0xe08a00 })); m.position.copy(r2w(c, kp.tip)); m.rotation.x = Math.PI / 2; const sub = new THREE.Group(); sub.userData.showAt = w.redoAt; sub.add(m); G.add(sub); } }
  }
  let pk = [], pkKey = '';
  function buildPackets() {
    pk.forEach(p => R.scene.remove(p.g)); pk = [];
    const an = SC.stages.find(s => s.id === 'an'), d2 = SC.data.find(d => d.stage === '2D'), du = SC.data.find(d => d.stage === 'UT');
    const dest = SC.def.qc.dest === 'store' ? SCEN.STORE : SCEN.RETURN; const top = c => new THREE.Vector3(SCEN.CX[c], 1.95, -0.2);
    [[top('3D'), top('2D'), an.t0 + 5, 'ROI·표면 법선 → 2D 포즈', 0x2f6fe0], [top('3D'), top('UT'), an.t0 + 5, '용접선·법선 → 주사 경로', 0x2f6fe0],
     [top('2D'), top('UT'), d2.t, '표면결함 위치 → 초음파', 0xd99a12], [top('UT'), new THREE.Vector3(dest[0], 0.9, dest[1]), du.t + 3, 'QC 결과 · 이송 지시', 0x1e9e5a]].forEach(([A, B, t0, label, col]) => {
      const g = new THREE.Group(); const curve = new THREE.QuadraticBezierCurve3(A, new THREE.Vector3((A.x + B.x) / 2, Math.max(A.y, B.y) + 1.1, (A.z + B.z) / 2), B);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineDashedMaterial({ color: col, dashSize: 0.12, gapSize: 0.08 })); line.computeLineDistances(); g.add(line);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: col })); g.add(ball);
      const sp = sprite(label, null, 1.7); g.add(sp); g.visible = false; R.scene.add(g); pk.push({ g, curve, ball, sp, t0, dur: 14 }); });
  }
  function update() {
    if (!R || !host()) return;
    for (const c of CELLS) {
      const ra = robotAt(c, t); const f = KIN.fk(ra.q, KIN.TOOLLEN[TOOL[c]]); const P = f.pts.map(p => r2w(c, p)); const rb = robots[c];
      seg(rb.links[0], P[1], P[2]); seg(rb.links[1], P[3], P[4]); seg(rb.links[2], P[5], P[6]); seg(rb.tool, P[6], P[7]);
      [P[1], P[2], P[4], P[6]].forEach((q, i) => rb.joints[i].position.copy(q));
      const dir = new THREE.Vector3().subVectors(P[7], P[6]).normalize(); rb.head.position.copy(P[7]); rb.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, c === '2D' ? 0 : 1, c === '2D' ? 1 : 0), dir);
      const F = fx[c], k = ra.key; const sensing = ra.w && k && k.seg >= 0 && c !== 'UT';
      if (sensing) { const L = c === '3D' ? 0.25 : 0.285; F.cone.visible = true; F.cone.scale.set(1, L, 1); F.cone.position.copy(P[7]).addScaledVector(dir, L / 2); F.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); } else F.cone.visible = false;
      if (c === 'UT') { if (!ra.w) { if (F.pts.length) { F.pts = []; F.dots.geometry.dispose(); F.dots.geometry = new THREE.BufferGeometry(); } } else if (k && k.contact && ra.prev && ra.prev.contact && playing) { F.pts.push(P[7].clone()); if (F.pts.length > 500) F.pts.shift(); F.dots.geometry.dispose(); F.dots.geometry = new THREE.BufferGeometry().setFromPoints(F.pts); } }
      const pw = ra.w || lastWin(c, t) || mainWin(c); const key = sid + (pw ? pw.job : '-'); if (pathKey[c] !== key) { buildPaths(c, pw); pathKey[c] = key; }
      pathG[c].visible = tab === 't-' + c; pathG[c].children.forEach(g => { g.visible = !pw || t > pw.t1 || t < pw.t0 || t >= g.userData.showAt; });
      if (ra.w && k && k.seg >= 0 && k.tip) { F.ring.visible = tab === 't-' + c; F.ring.position.copy(r2w(c, k.tip)); F.ring.lookAt(R.cam.position); } else F.ring.visible = false;
    }
    for (const m of SC.amrs) {
      const p = SCEN.amrPos(m, t); const A = amrs[m.id]; let x = p.p[0], z = p.p[1], rot = 0; const s = p.seg;
      if ((s.kind === 'dock' || s.kind === 'proc' || s.kind === 'hold') && s.pose) { x += s.pose.dy; z += s.pose.dx; rot = s.pose.dth; }
      A.g.position.set(x, 0, z); A.g.rotation.y = rot; A.part.visible = !!(s.job && s.kind !== 'idle'); A.lab.visible = tab === 't-main' || tab === 't-AMR';
    }
    if (amrKey !== sid) { buildAMR(); amrKey = sid; }
    amrG.visible = tab === 't-AMR'; const pul = 1 + 0.12 * Math.sin(performance.now() / 180);
    SC.amrs.forEach((m, i) => { const p = SCEN.amrPos(m, t), s = p.seg; const tg = s.kind === 'move' ? s.pts[s.pts.length - 1] : p.p; amrMk[i].position.set(tg[0], 0.05, tg[1]); amrMk[i].scale.set(pul, pul, pul); amrMk[i].visible = s.kind !== 'idle'; });
    if (pkKey !== sid) { buildPackets(); pkKey = sid; }
    pk.forEach(p => { const u = (t - p.t0) / p.dur; p.g.visible = tab === 't-main' && u >= 0 && u <= 1; if (p.g.visible) { p.ball.position.copy(p.curve.getPoint(clamp(u, 0, 1))); p.sp.position.copy(p.ball.position).add(new THREE.Vector3(0, 0.32, 0)); } });
    const qe = SC.events.find(e => e.qc); for (const k in pads) pads[k].material.emissive.setHex(qe && t >= qe.t && SC.def.qc.dest === k ? (k === 'store' ? 0x1f6b3a : 0x7a2a08) : 0x000000);
    draw(); overlays();
  }
  // AMR tab overlay: planned routes, docking-error arrows (x20), next-stop rings
  function buildAMR() {
    if (amrG) { R.scene.remove(amrG); amrG.traverse(x => x.geometry && x.geometry.dispose()); }
    amrG = new THREE.Group(); amrMk = []; const COLS = [0x0b7a85, 0x6a4c9f];
    SC.amrs.forEach((a, ai) => {
      const pts = []; a.segs.filter(s => s.kind === 'move').forEach(s => s.pts.forEach(p => pts.push(new THREE.Vector3(p[0], 0.03 + ai * 0.01, p[1] + (ai ? 0.09 : -0.09)))));
      if (pts.length > 1) { const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: COLS[ai], dashSize: 0.18, gapSize: 0.1 })); ln.computeLineDistances(); amrG.add(ln); }
      a.segs.filter(s => s.kind === 'dock' && s.pose).forEach(s => { const cx = SCEN.CX[s.cell], z0 = SCEN.DOCKZ; const A = new THREE.Vector3(cx, 0.07, z0), B = new THREE.Vector3(cx + s.pose.dy * 20, 0.07, z0 + s.pose.dx * 20);
        amrG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), new THREE.LineBasicMaterial({ color: 0xff3b30 })));
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); tip.position.copy(B); amrG.add(tip); });
      const mk = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: COLS[ai] })); mk.rotation.x = Math.PI / 2; mk.position.y = 0.05; amrG.add(mk); amrMk.push(mk);
    });
    R.scene.add(amrG);
  }
  function reset() { amrKey = ''; for (const c in fx) { fx[c].pts = []; if (R) { fx[c].dots.geometry.dispose(); fx[c].dots.geometry = new THREE.BufferGeometry(); } } pathKey = {}; pkKey = ''; }
  function overlays() {}
  function draw() { if (R) R.ren.render(R.scene, R.cam); }
  return { attach, update, reset, draw, resize: () => { size(); if (R && !moved) frame(); draw(); }, _R: () => R };
})();

/* ================= cell tabs ================= */
const CFG = {
  '3D': ['6축 로봇 (근사 모델) · 받침대', '광학식 3D 스캐너 (TrackScan → NimbleTrack 협의)', '광학 트래커 · AMR 도크', '출력: 점군·편차 맵·ROI'],
  '2D': ['6축 로봇 (근사 모델)', '25 MP 컬러 카메라 (VC-25M10G-C)', '바 조명 (LV-DB2) · 암막', '출력: 이미지·결함 박스·신뢰도'],
  UT: ['6축 로봇 (근사 모델) · F/T 센서 (가정)', 'PAUT 10 MHz 64소자 + 55° 웨지', 'OmniScan X4 64:128PR (2차년도 도입)', '출력: FMC·TFM·지시 3D 좌표']};
function stepsFor(c, w) {
  if (!w) return [];
  const r = w.redo, ra = w.redoAt, fix = w.plan.segs.find(s => s.kind === 'fix');
  const pts = w.plan.segs.reduce((a, s) => a + s.res.res.filter(x => x.inner).length, 0);
  const sm = w.plan.segs.map(s => s.stats); /* [py] 서버 계산값 */ const minC = Math.min(...sm.map(s => s.minClear.d)) * 1000; const allOk = sm.every(s => s.ok === s.n);
  const exec0 = w.t0 + 3, execEnd = w.t1 - 3;
  const S = (name, detail, a, b, fail) => ({ name, detail, a, b, fail });
  if (c === '3D') return [
    S('입력', 'CAD · 검사 필수면 (상면·비드·플랜지면)', w.t0, w.t0),
    S('도킹 오차 추정', `러프 스캔 정합: ${(w.pose.dx * 1000).toFixed(1)}, ${(w.pose.dy * 1000).toFixed(1)} mm, ${(w.pose.dth / D).toFixed(2)}°`, w.t0, w.t0 + 1.5),
    S('경로 생성', `CAD 법선 기반 ${r ? 'v0 상면 3패스' : 'v1 5패스 (레시피)'} · ${r ? 21 : 35}점 · 스탠드오프 250 mm`, w.t0 + 1.5, w.t0 + 2.5),
    S('도달성·충돌 검증', `${allOk ? '전 점 도달' : '도달 불가 있음'} · 최소 여유 ${minC.toFixed(0)} mm`, w.t0 + 2.5, exec0),
    S('스캔 실행', '스캐너 자세 = 표면 법선 · 점 간격 2 mm', exec0, r ? ra : execEnd),
    S('품질 판단', r ? '필수면 커버리지 65% < 95% → 미달 (플랜지면 경사각 초과·모서리 가림)' : '필수면 커버리지 100% → 통과', r ? ra : execEnd, r ? ra + 0.5 : execEnd, r),
    S('보정', r ? '플랜지면 법선 기준 경사 30° 패스 P4·P5 추가 (14점) → 재스캔 → 100%' : '해당 없음 (1회 통과)', r ? ra + 0.5 : null, r ? execEnd : null),
    S('출력', `점군 160 MB (엣지) · 편차 맵 · ROI ${GEOM.ROIS[w.part].length}개 → OCS`, w.t1 - 1, w.t1)];
  if (c === '2D') { const red = w.shots.findIndex(s => s[2]);
    return [
    S('입력', `3D ROI ${GEOM.ROIS[w.part].length}개 · 표면 법선`, w.t0, w.t0),
    S('도킹 오차 추정', `${(w.pose.dx * 1000).toFixed(1)}, ${(w.pose.dy * 1000).toFixed(1)} mm · 경로 변환`, w.t0, w.t0 + 1),
    S('촬영 포즈 생성', `ROI 중심·법선 기준 작동거리 285 mm · ${w.shots.length}회`, w.t0 + 1, w.t0 + 1.8),
    S('도달성 검증', `${allOk ? '전 포즈 도달' : '도달 불가'} · 최소 여유 ${minC.toFixed(0)} mm`, w.t0 + 1.8, w.shotT[0][0]),
    S('촬영', w.shots.map(s => GEOM.SPOTS[s[0]].label.split(' ')[0] + (s[2] ? ' 재촬영' : '')).join(' → '), w.shotT[0][0], w.shotT[w.shotT.length - 1][1]),
    S('품질 판단', red >= 0 ? `촬영 #1 신뢰도 ${w.part === 'B' ? '0.04' : '0.20'} < 0.70 (반사 포화) → 미달` : `신뢰도 ${({ A: '0.93', B: '0.82', C: '0.74' })[w.part]} ≥ 0.70 → 통과`, red >= 0 ? w.shotT[red - 1][1] : w.shotT[0][1], red >= 0 ? w.shotT[red - 1][1] + 0.5 : w.shotT[0][1], red >= 0),
    S('보정', red >= 0 ? `카메라·조명 25° 기울임 (조명 입사각 변경) → 재촬영 신뢰도 ${w.part === 'B' ? '0.82' : '0.74'}` : '해당 없음 (1회 통과)', red >= 0 ? w.shotT[red][0] : null, red >= 0 ? w.shotT[red][1] : null),
    S('출력', '이미지 · 결함 박스(JSON) · 신뢰도 → OCS', w.t1 - 1, w.t1)]; }
  return [
    S('입력', '3D 용접선·표면 법선 · 2D 표면결함 위치', w.t0, w.t0),
    S('도킹 오차 추정', `${(w.pose.dx * 1000).toFixed(1)}, ${(w.pose.dy * 1000).toFixed(1)} mm · 경로 변환`, w.t0, w.t0 + 1),
    S('주사 경로 생성', '인덱스 오프셋 40 mm · y 40~140 mm · 섹터 45–70° (검사 설계 커버리지 100%)', w.t0 + 1, w.t0 + 2),
    S('도달성·간섭 검증', `${allOk ? '전 점 도달' : '도달 불가'} · 최소 여유 ${minC.toFixed(0)} mm (원안 y≤160은 플랜지 −7 mm → y≤140)`, w.t0 + 2, exec0),
    S('접근·접촉·주사', 'FMC 취득 (64소자, 1 mm 피치)', exec0, r ? ra : execEnd),
    S('품질 게이트', w.mode === 'recontact' ? '후면 에코 28% < 50% → 접촉 불량' : w.mode === 'tilt' ? '후면 에코 41% < 50% → 프로브 3° 기울어짐' : '후면 에코 76% · SNR 35 dB → 통과', r ? ra : execEnd, r ? ra + 0.5 : execEnd, r),
    S('보정', w.mode === 'recontact' ? '프로브 12 mm 들어 올린 뒤 재접촉 · 가압 증가 → 75%' : w.mode === 'tilt' ? '툴 자세를 표면 법선에 재정렬 → 재주사 → 78%' : '해당 없음 (1회 통과)', r ? ra + 0.5 : null, r ? execEnd : null),
    S('출력', 'TFM · 지시 3D 좌표 → OCS (3D 모델 매핑)', w.t1 - 1, w.t1)];
}
const JCOL = ['#2F6FE0', '#C98A0A', '#1E9E5A', '#C2410C', '#6A4C9F', '#0B7A85'];
function jointPlot(c, w, cv) {
  const { ctx, W, H } = prep(cv); if (!w) return;
  if (!w._jq) { w._jq = []; const n = 180; for (let i = 0; i <= n; i++) { const tt = w.t0 + (w.t1 - w.t0) * i / n; w._jq.push([tt, robotAt(c, tt).q]); } }
  const L = 34, R = W - 8, T = 16, B = H - 16, X = tt => L + (tt - w.t0) / (w.t1 - w.t0) * (R - L), Y = q => T + (1 - (q + Math.PI) / (2 * Math.PI)) * (B - T);
  ctx.font = '10.5px ui-monospace,Menlo,Consolas,monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  [-180, -90, 0, 90, 180].forEach(d => { const y = Y(d * D); ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.fillStyle = css('--muted'); ctx.fillText(d + '°', L - 4, y); });
  if (w.redo) { const x = X(w.redoAt); ctx.strokeStyle = css('--bad'); ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); ctx.setLineDash([]); }
  for (let j = 0; j < 6; j++) { ctx.strokeStyle = JCOL[j]; ctx.lineWidth = 1.6; ctx.beginPath(); w._jq.forEach(([tt, q], i) => { const x = X(tt), y = Y(clamp(q[j], -Math.PI, Math.PI)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
  ctx.textAlign = 'left'; ctx.font = '600 10.5px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; for (let j = 0; j < 6; j++) { ctx.fillStyle = JCOL[j]; ctx.fillText('J' + (j + 1), L + j * 30, 7); }
  ctx.fillStyle = css('--muted'); ctx.font = '10.5px ui-monospace,Menlo,Consolas,monospace'; ctx.textAlign = 'left'; ctx.fillText(mmss(w.t0), L, H - 6); ctx.textAlign = 'right'; ctx.fillText(mmss(w.t1), R, H - 6);
  if (t >= w.t0 && t <= w.t1) { const x = X(t); ctx.fillStyle = css('--fg'); ctx.fillRect(x - 1, T - 2, 2, B - T + 4); }
}


/* ================= cell tabs: now/next + data codes per step ================= */
const STEPCODES = {
  '3D': [['D02-01', 'D05-01'], ['D04-01'], ['D13-01', 'D11-03'], ['D12-02'], ['D15-01', 'D16-02'], ['D20-05', 'D20-01'], ['D22-01', 'D11-03'], ['D03-01', 'D18-04', 'D19-01']],
  '2D': [['D19-01', 'D30-02'], ['D04-01'], ['D13-01'], ['D12-02'], ['D27-01', 'D08-03'], ['D16-02', 'D20-01'], ['D22-01', 'D11-04'], ['D19-01', 'D19-03', 'D20-04']],
  UT: [['D03-02', 'D19-01'], ['D04-01'], ['D13-01', 'D11-01'], ['D12-02'], ['D14-01', 'D15-01'], ['D16-01', 'D20-01'], ['D22-01', 'D22-02'], ['D18-02', 'D19-01', 'D20-04']] };
function stepState(s, ra, w) { let st = ''; if (s.a == null) st = 'skip'; else if (t >= (s.b != null ? s.b : s.a) && t >= s.a) st = s.fail ? 'fail' : 'done'; else if (t >= s.a) st = 'run'; if (!ra.w && w && t > w.t1) st = s.a == null ? 'skip' : s.fail ? 'fail' : 'done'; return st; }
function nowNextCell(c, w, steps, sts, ra) {
  const nw = SC.wins[c].find(x => x.t0 > t);
  if (!w) return { now: '대기', res: '—', next: nw ? `${nw.job} 검사` : '—', nextAt: nw ? nw.t0 : null };
  const ri = sts.indexOf('run'); const di = sts.map((x, i) => x === 'done' || x === 'fail' ? i : -1).filter(i => i >= 0).pop();
  let now;
  if (ra.w) now = ri >= 0 ? `${steps[ri].name} · ${steps[ri].detail}` : (ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].label : '접근 · 이탈');
  else { const hold = SC.amrs.map(a => SCEN.amrPos(a, t).seg).find(s => (s.kind === 'dock' || s.kind === 'hold') && s.cell === c);
    now = hold ? (hold.kind === 'dock' ? `${hold.job} AMR 도킹 · 러프 스캔으로 도킹 오차 추정` : c === '3D' ? `${hold.job} 자율 분석 대기 (OCS가 다음 공정 결정 중)` : c === 'UT' ? `${hold.job} QC 판정 대기` : `${hold.job} 대기`) : nw ? `대기 · ${nw.job} 도착 예정` : '대기 · 이 시나리오의 작업 완료'; }
  const res = di != null ? `${steps[di].name}: ${steps[di].detail}` : '아직 결과 없음';
  const ni = sts.findIndex((x, i) => x === '' && steps[i].a != null);
  const inW = ra.w || t < w.t0;
  return { now, nowCodes: ri >= 0 ? STEPCODES[c][ri] : null, res, next: ni >= 0 && inW ? steps[ni].name : nw ? `${nw.job} (시편 ${nw.part}, ${nw.amr}) 검사` : '없음', nextAt: ni >= 0 && inW ? steps[ni].a : nw ? nw.t0 : null };
}
function cellTab(c) {
  const ra = robotAt(c, t); const w = ra.w || lastWin(c, t) || mainWin(c); const root = $('#t-' + c);
  root.querySelector('.cfg').innerHTML = CFG[c].map(x => `<li>${x}</li>`).join('');
  root.querySelector('.job').textContent = w ? `${ra.w ? '현재' : '최근'} 작업 ${w.job} · 시편 ${w.part} · ${w.amr}` : '작업 없음';
  const steps = stepsFor(c, w); const sts = steps.map(s => stepState(s, ra, w));
  root.querySelector('.nn').innerHTML = nnHTML(nowNextCell(c, w, steps, sts, ra));
  root.querySelector('.steps').innerHTML = steps.map((s, i) => { const st = sts[i]; const run = st === 'run';
    return `<li class="${st}${run ? ' now' : ''}"${run ? NB() : ''}><span class="n">${i + 1}</span><div><b>${s.name}</b> <span class="chips" style="display:inline-flex">${chips(STEPCODES[c][i], { strict: true, on: st === 'run' || st === 'done' || st === 'fail' })}</span><div class="muted">${s.detail}</div></div></li>`; }).join('');
  const qm = root.querySelector('.qfix');
  if (w && w.redo) {
    const past = t >= w.redoAt; const M = c === '3D' ? ['필수면 커버리지', 65, 100, '%', 95] : c === '2D' ? ['판정 신뢰도', w.part === 'B' ? 4 : 20, w.part === 'B' ? 82 : 74, '', 70] : ['후면 에코 (FSH)', w.mode === 'tilt' ? 41 : 28, w.mode === 'tilt' ? 78 : 75, '%', 50];
    const after = t >= w.t1 - 3 || (!ra.w && t > w.t1);
    const what = c === '3D' ? '경로 추가 · 플랜지면 법선 기준 경사 30° 패스 2개 (주황 선)' : c === '2D' ? '자세 변경 · 카메라·조명을 25° 기울여 조명 입사각을 바꾸고 위치를 120 mm 옮김 (주황 점)' : w.mode === 'tilt' ? '자세 보정 · 툴 축을 표면 법선에 재정렬해 재주사 (주황 선)' : '위치 보정 · 프로브를 12 mm 들어 올린 뒤 재접촉, 가압 증가';
    const fmt = v => c === '2D' ? (v / 100).toFixed(2) : v + M[3];
    qm.innerHTML = `<div class="qbar"><span>${M[0]}</span><div class="bars"><div class="b0" style="width:${M[1]}%"></div><div class="thr" style="left:${M[4]}%"></div></div><b class="ng">${past ? fmt(M[1]) : '측정 중'}</b></div>
      <div class="qbar"><span>보정 후</span><div class="bars"><div class="b1" style="width:${after ? M[2] : 0}%"></div><div class="thr" style="left:${M[4]}%"></div></div><b class="ok">${after ? fmt(M[2]) : '—'}</b></div>
      <p class="${past ? '' : 'muted'}">${past ? what : '품질 판단 전'} <span class="chips" style="display:inline-flex">${chips(['D20-01', 'D22-01', 'D23-02'], { strict: true, on: past })}</span></p>`;
  } else qm.innerHTML = `<p class="muted">${w ? '이 시나리오에서는 품질 기준을 1회에 통과해 보정 없이 진행합니다.' : '—'}</p>`;
  root.querySelector('.ptab').innerHTML = w ? w.plan.segs.map(sg => { const s = sg.stats; const e = sg.stats.tipErr; /* [py] 서버 계산값 */ const v = s.ok < s.n ? '도달 불가' : s.minClear.d < 0 ? 'NG' : s.minClear.d < 0.02 ? '주의' : 'OK';
    return `<tr><td><span class="sw" style="background:${sg.kind === 'fix' ? 'var(--warn)' : 'var(--accent)'}"></span>${sg.label}</td><td class="num">${s.ok}/${s.n}</td><td class="num">${(s.minClear.d * 1000).toFixed(0)} mm</td><td class="num">${e.toFixed(1)} mm</td><td><span class="pill ${v === 'OK' ? 'ok' : v === '주의' ? 'warn' : 'ng'}">${v}</span></td></tr>`; }).join('') : '';
  jointPlot(c, w, root.querySelector('.jplot'));
  root.querySelector('.covl').textContent = ra.w ? `${CELLNM[c]} 셀 · ${w.job} · ${ra.key && ra.key.seg >= 0 ? w.plan.segs[ra.key.seg].label : ra.key && ra.key.lift ? '재접촉 (들어 올림)' : '접근·이탈'}` : `${CELLNM[c]} 셀 · 대기`;
}

/* ================= AMR tab ================= */
const AMRT = (function () {
  let sel = 0, dockCache = {};
  document.querySelectorAll('.amrsel').forEach(b => b.addEventListener('click', () => { sel = +b.dataset.a; document.querySelectorAll('.amrsel').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); }));
  const segTxt = s => s.kind === 'move' ? (s.label || '이동') : s.kind === 'dock' ? `${s.cell} 셀 도킹` : s.kind === 'proc' ? `${s.cell} 셀 검사 중` : s.kind === 'hold' ? `${s.cell} 셀 ${s.label || '판단 대기'}` : s.kind === 'wait' ? `${s.cell || ''} 대기 구역 대기` : KIND[s.kind] || '유휴';
  const batt = (m, i, tt) => { let b = i ? 88 : 96; for (const s of m.segs) { if (s.t0 > tt) break; b -= (Math.min(tt, s.t1) - s.t0) * (s.kind === 'move' ? 0.02 : 0.004); } return b; };
  // docking error per stop, and tool-tip error with / without the 3D registration correction
  function docks() {
    if (dockCache[sid]) return dockCache[sid]; const rows = [];
    SC.amrs.forEach(m => m.segs.filter(s => s.kind === 'dock' && s.pose).forEach(s => { const w = SC.wins[s.cell].find(x => x.job === s.job); if (!w) return;
      const after = w.plan.segs[0].stats.tipErr; /* [py] 서버 계산값 */
      const sp = w.shots ? GEOM.SPOTS[w.shots[0][0]] : null;
      const before = w.dockBefore; // [py] 보정 전 툴 끝 오차는 서버(sim/plan.py dock_before)가 계산한다
      rows.push({ amr: m.id, cell: s.cell, job: s.job, t0: s.t0, t1: s.t1, pose: w.pose, est: w.est, before, after }); }));
    rows.sort((a, b) => a.t0 - b.t0); return dockCache[sid] = rows;
  }
  function render() {
    const root = $('#t-AMR'); const a1 = SCEN.amrPos(SC.amrs[0], t), a2 = SCEN.amrPos(SC.amrs[1], t);
    const af = FL.F.filter(f => f.proc === 'amr' && f.t <= t + 1e-6).pop(); const m = SC.amrs[sel]; const ns = m.segs.find(s => s.t0 > t);
    $('#nn-AMR').innerHTML = nnHTML({ now: `AMR-1 · ${segTxt(a1.seg)} (${zoneOf(a1.p)})<br>AMR-2 · ${segTxt(a2.seg)} (${zoneOf(a2.p)})`, nowCodes: ['D29-01'].concat(a1.seg.kind === 'dock' || a2.seg.kind === 'dock' ? ['D28-02', 'D04-01'] : a1.seg.kind === 'move' ? ['D28-01'] : []), res: af ? af.label : '아직 미션 없음', next: ns ? `${m.id} · ${segTxt(ns)}` : `${m.id} 미션 없음`, nextAt: ns ? ns.t0 : null });
    $('#fleet').innerHTML = SC.amrs.map((mm, i) => { const p = SCEN.amrPos(mm, t), s = p.seg; const mine = i === 0 && s.kind !== 'idle';
      return `<tr${mine ? ` class="nowbg"${NB()}` : ''}><td class="mono">${mm.id}</td><td><span class="pill ${s.kind === 'wait' ? 'warn' : s.kind === 'proc' || s.kind === 'move' ? 'run' : s.kind === 'idle' ? 'na' : ''}">${KIND[s.kind] || '유휴'}</span></td><td>${s.job && s.kind !== 'idle' ? s.job : '—'}</td><td>${zoneOf(p.p)}</td><td class="num">${s.kind === 'move' ? '0.60' : '0.00'} m/s</td><td class="num">${batt(mm, i, t).toFixed(0)}%</td></tr>`; }).join('');
    $('#mlist').innerHTML = m.segs.map(s => { const st = t > s.t1 ? 'done' : t >= s.t0 ? 'run' : ''; const cs = s.kind === 'dock' ? ['D28-02', 'D04-01'] : s.kind === 'move' ? ['D28-01', 'D29-01'] : s.kind === 'load' || s.kind === 'unload' ? ['D28-02'] : ['D29-01'];
      return `<li class="${st}${st === 'run' ? ' now' : ''}"${st === 'run' ? NB() : ''}><span class="lt">${mmss(s.t0)}–${mmss(s.t1)}</span><span class="pill ${s.kind === 'move' ? 'run' : s.kind === 'wait' ? 'warn' : ''}">${KIND[s.kind] || s.kind}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${segTxt(s)}${s.job ? ` · ${s.job}` : ''}</span><span class="chips" style="flex-wrap:nowrap">${chips(cs, { strict: true, on: st !== '' })}</span></li>`; }).join('');
    $('#docks').innerHTML = docks().map(r => { const st = t > r.t1 ? 'done' : t >= r.t0 ? 'run' : ''; const res = Math.hypot(r.est.dx - r.pose.dx, r.est.dy - r.pose.dy) * 1000;
      return `<tr${st === 'run' ? ` class="nowbg"${NB()}` : st ? '' : ' style="opacity:.45"'}><td>${r.amr} · ${r.cell} <span class="muted">${r.job}</span></td><td class="num">${(r.pose.dx * 1000).toFixed(1)} · ${(r.pose.dy * 1000).toFixed(1)} mm</td><td class="num">${(r.pose.dth / D).toFixed(2)}°</td><td class="num">${res.toFixed(2)} mm</td><td class="num">${r.before.toFixed(1)} → <b>${r.after.toFixed(1)}</b> mm</td></tr>`; }).join('');
    gantt();
    const ev = SC.events.filter(e => e.t <= t && e.msg && /amr|job/.test(e.msg.type)).slice(-2).reverse().map(e => JSON.stringify(Object.assign({ t: Math.round(e.t), code: e.msg.type === 'amr.mission' ? 'D28-01' : e.msg.type === 'job.closed' ? 'D28-02' : 'D01-01' }, e.msg)));
    const tel = SC.amrs.map(mm => { const p = SCEN.amrPos(mm, t); let x = p.p[0], z = p.p[1], th = 0; if (p.seg.pose && /dock|proc|hold/.test(p.seg.kind)) { x += p.seg.pose.dy; z += p.seg.pose.dx; th = p.seg.pose.dth; } return JSON.stringify({ code: 'D29-01', amr: mm.id, x: +x.toFixed(3), y: +z.toFixed(3), theta_deg: +(th / D).toFixed(2), v: p.seg.kind === 'move' ? 0.6 : 0 }); });
    $('#amr-msgs').textContent = tel.concat(ev).join('\n');
    root.querySelector('.covl').textContent = `AMR 물류 · AMR-1 ${segTxt(a1.seg)} · AMR-2 ${segTxt(a2.seg)}`;
  }
  function gantt() {
    const { ctx, W, H } = prep($('#amr-gantt')); const L = 50, Rr = W - 8, X = tt => L + tt / SC.T * (Rr - L), lh = Math.min(24, (H - 30) / 2);
    const COL = { move: '--g-move', dock: '--c3D', proc: '--accent', hold: '--ops', wait: '--warn', load: '--ops-soft', unload: '--ops-soft' };
    SC.amrs.forEach((mm, i) => { const y = 4 + i * (lh + 6); ctx.fillStyle = css('--fg'); ctx.font = `600 11px ${UIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(mm.id, 2, y + lh / 2);
      mm.segs.forEach(s => { if (!COL[s.kind]) return; ctx.fillStyle = css(COL[s.kind]); ctx.globalAlpha = t >= s.t0 ? 1 : 0.4; ctx.fillRect(X(s.t0), y, Math.max(1, X(s.t1) - X(s.t0) - 0.6), lh); ctx.globalAlpha = 1; }); });
    ctx.fillStyle = css('--muted'); ctx.font = `10px ${MONOF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; for (let s = 0; s <= SC.T; s += 60) ctx.fillText(mmss(s), X(s), H - 14);
    const lg = [['move', '이동'], ['dock', '도킹'], ['proc', '검사'], ['hold', '판단 대기'], ['wait', '대기'], ['load', '적재·하역']]; let x = L; ctx.font = `10.5px ${UIF}`; ctx.textAlign = 'left';
    lg.forEach(([k, n]) => { ctx.fillStyle = css(COL[k]); ctx.fillRect(x, H - 9, 9, 7); ctx.fillStyle = css('--muted'); ctx.fillText(n, x + 12, H - 2); x += 14 + ctx.measureText(n).width + 10; });
    ctx.fillStyle = css('--fg'); ctx.fillRect(X(t) - 1, 0, 2, H - 26);
  }
  return { render, docks, reset: () => { dockCache = {}; } };
})();

/* ================= execution log by layer ================= */
const LAYT = (function () {
  let sel = -1, DM = null, dmKey = '';
  function dmap() { // per scenario: codes each layer sends / receives in each unit process
    if (dmKey === sid) return DM; DM = CODES.LAYERS.map((l, i) => Object.fromEntries(CODES.PROCS.map(([pid]) => { const m = new Map(); FL.F.forEach(f => { if (f.proc !== pid || (f.from !== i && f.to !== i)) return; f.codes.forEach(c => { const k = c.slice(0, 3); const o = m.get(k) || { rcv: false, t: 1e9, subs: new Set() }; if (f.to === i) o.rcv = true; o.t = Math.min(o.t, f.t); o.subs.add(c); m.set(k, o); }); }); return [pid, [...m]]; })));
    dmKey = sid; return DM;
  }
  function render() {
    const L = CODES.LAYERS, lf = lastFlow(t), cp = curProc(t), hotF = lf && t - lf.t < 8 ? lf : null;
    $('#nn-layer').innerHTML = nnHTML(DB.nowNext(stateAt(t)));
    $('#lstack').innerHTML = L.map((l, i) => { const snd = hotF && hotF.from === i, rcv = hotF && hotF.to === i;
      return `<div class="layer${sel === i ? ' sel' : ''}${snd || rcv ? ' now' : ''}" data-l="${i}" role="button" tabindex="0"${snd || rcv ? NB() : ''}><div class="lh"><b>${l.n}</b><small>${l.s}</small>${snd ? '<span class="io snd">보냄</span>' : rcv ? '<span class="io rcv">받음</span>' : ''}</div><div class="lr" title="${l.sw} · ${l.io}">${l.role}</div></div>`; }).join('');
    $('#lstack').querySelectorAll('.layer').forEach(e => { const f = () => { const i = +e.dataset.l; sel = sel === i ? -1 : i; render(); }; e.addEventListener('click', f); e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); f(); } }); });
    const recent = FL.F.filter(f => f.t <= t + 1e-6).slice(-2).reverse();
    $('#xcur').innerHTML = recent.length ? recent.map((f, k) => `<div class="nbox${k === 0 ? ' do now' : ''}"${k === 0 ? NB() : ''}><div><span class="lt">${mmss(f.t)}</span><b>${CODES.PN[f.proc]}</b> · ${f.label}</div><div class="r">${L[f.from].n} → ${L[f.to].n}</div>${f.codes.map(c => `<div class="r">${chip(c, { on: true })} ${CODES.subName(c)} <span class="muted">· ${CODES.BY[c.slice(0, 3)].f} · ${CODES.BY[c.slice(0, 3)].st}</span></div>`).join('')}</div>`).join('') : '<p class="note">재생하면 계층 사이에 오가는 데이터가 여기에 표시됩니다</p>';
    const M = dmap(); let h = '<div class="ph"></div>' + CODES.PROCS.map(([id, nm]) => `<div class="ph${id === cp ? ' now' : ''}"${id === cp ? NB() : ''}>${nm}</div>`).join('');
    L.forEach((l, i) => { h += `<div class="lhd"${sel === i ? ' style="background:var(--ops-soft)"' : ''}>${l.n}<small>${l.s}</small></div>`;
      CODES.PROCS.forEach(([pid]) => { h += `<div class="cell${pid === cp ? ' curc' : ''}"${sel >= 0 && sel !== i ? ' style="opacity:.3"' : ''}>${M[i][pid].map(([k, o]) => { const on = o.t <= t + 1e-6; return `<span class="cd ${CODES.catOf(k)}${on ? ' on' : ''}${on && o.rcv ? ' fill' : ''}" title="${k} ${CODES.BY[k].n} · ${[...o.subs].map(c => c + ' ' + CODES.subName(c)).join(', ')}${o.rcv ? ' (받음)' : ' (보냄)'}">${k}</span>`; }).join('')}</div>`; }); });
    $('#dmap').innerHTML = h;
    $('#hlist').innerHTML = FL.H.map(hh => { const done = hh.t >= 0 && t >= hh.t; const cur = cp === hh.b && hh.a !== 'amr';
      return `<div class="hl${done ? ' done' : ''}${cur ? ' now' : ''}"${cur ? NB() : ''}><b>${CODES.PN[hh.a]} → ${hh.a === 'amr' ? '각 셀' : CODES.PN[hh.b]}</b><span><span class="chips" style="display:inline-flex">${chips(hh.codes, { strict: true, on: done })}</span> ${hh.label}</span></div>`; }).join('');
    const all = FL.F.filter(f => f.t <= t + 1e-6 && (sel < 0 || f.from === sel || f.to === sel)); const short = n => n.replace(/^\d+ /, '');
    $('#flog-n').textContent = `${all.length}건 / 전체 ${FL.F.length}건${sel >= 0 ? ` · ${L[sel].n} 관련만` : ''}`;
    $('#flog').innerHTML = all.slice(-11).reverse().map((f, k) => { const hot = k === 0 && t - f.t < 6; return `<li class="${hot ? 'nowbg' : ''}"${hot ? NB() : ''}><span class="lt">${mmss(f.t)}</span><span>${CODES.PN[f.proc]}</span><span class="muted">${short(L[f.from].n)} → ${short(L[f.to].n)}</span><span>${chips(f.codes, { on: true })} ${f.label}</span></li>`; }).join('') || '<li>재생을 누르면 실행 기록이 쌓입니다</li>';
  }
  return { render };
})();

/* ================= data code dictionary ================= */
const DATAT = (function () {
  let pick = null, dKey = '';
  const stTxt = s => s.replace('E→O', '엣지에서 객체 저장소로 이동').replace(/E/g, '엣지').replace(/O/g, '객체 저장소').replace(/M/g, '메타 DB').replace(/\+/g, ' + ');
  function render() {
    const lf = lastFlow(t); const cur = pick || (lf ? lf.codes[0].slice(0, 3) : 'D01');
    const hot = new Set(lf && t - lf.t < 6 ? lf.codes.map(c => c.slice(0, 3)) : []); const ph = NB();
    $('#dict').innerHTML = CODES.D.map(d => { const p = CPROC[d.c] || { prod: [], use: [], t: null }; const on = p.t != null && p.t <= t + 1e-6;
      return `<tr class="pick${d.c === cur ? ' sel' : ''}${hot.has(d.c) ? ' nowbg' : ''}" data-c="${d.c}" tabindex="0"${hot.has(d.c) ? ph : ''}><td class="cdc"><span class="cd on fill ${d.cat}">${d.c}</span></td><td>${d.n}${d.ext ? ' <span class="chip ext">확장</span>' : ''}</td><td>${d.f}</td><td class="mono">${d.st}</td><td>${CODES.LAYERS[d.src].n.replace(/^\d+ /, '')}</td><td class="stg">${p.prod.map(x => CODES.PN[x]).join(' · ') || '—'}</td><td class="stg">${p.use.map(x => CODES.PN[x]).join(' · ') || '—'}</td><td>${p.t == null ? '<span class="muted">이번 시나리오 없음</span>' : on ? `● ${mmss(p.t)} 생성` : `<span class="muted">○ ${mmss(p.t)} 예정</span>`}</td></tr>`; }).join('');
    $('#dict').querySelectorAll('tr.pick').forEach(tr => { const f = () => { pick = tr.dataset.c; dKey = ''; render(); }; tr.addEventListener('click', f); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }); });
    const key = `${sid}|${cur}|${Math.floor(t)}|${!!pick}`; if (key !== dKey) { dKey = key; detail(cur); }
  }
  function detail(code) {
    const d = CODES.BY[code]; const fl = FL.F.filter(f => f.codes.some(c => c.slice(0, 3) === code)); const short = n => n.replace(/^\d+ /, '');
    $('#detail').innerHTML = `<div class="hrow"><h2><span class="cd on fill ${d.cat}">${d.c}</span> ${d.n}</h2>${d.ext ? '<span class="chip ext">플랫폼 확장(안)</span>' : '<span class="chip calc">초음파 DT와 공통 코드</span>'}<button class="btn ghost sm" id="dauto"${pick ? '' : ' hidden'}>자동 따라가기</button></div>
      <div class="xrow"><span class="muted">형식 · 종류</span><span>${d.f} · ${CODES.CAT[d.cat]}</span></div>
      <div class="xrow"><span class="muted">설명</span><span>${d.d}</span></div>
      <div class="xrow"><span class="muted">소스 · 저장</span><span>${CODES.LAYERS[d.src].n} · <b>${d.st}</b> <span class="muted">(${stTxt(d.st)})</span></span></div>
      <div style="display:grid;gap:5px;min-height:0;grid-template-rows:auto auto minmax(0,1fr)">
        <table class="sublist"><thead><tr><th>세부 코드</th><th>이름</th><th>내용 · 예</th><th>이번 시나리오</th></tr></thead><tbody>${d.sub.map(s => { const tt = GENT[s[0]]; return `<tr><td class="mono">${s[0]}</td><td>${s[1]}</td><td>${s[2]}</td><td>${tt == null ? '—' : tt <= t + 1e-6 ? `● ${mmss(tt)}` : `<span class="muted">○ ${mmss(tt)}</span>`}</td></tr>`; }).join('')}</tbody></table>
        <div class="xrow"><span class="muted">흐름</span><span>${fl.slice(0, 4).map(f => `<span class="lt">${mmss(f.t)}</span>${CODES.PN[f.proc]} · ${short(CODES.LAYERS[f.from].n)} → ${short(CODES.LAYERS[f.to].n)}`).join('<br>') || '이번 시나리오에서 오가지 않음'}${fl.length > 4 ? `<br><span class="muted">외 ${fl.length - 4}건</span>` : ''}</span></div>
        ${d.prev ? '<div class="prev cv"><canvas id="dprev" aria-label="데이터 미리보기"></canvas></div>' : `<pre class="prev" aria-label="예시 레코드">${JSON.stringify(sample(d, fl), null, 1).replace(/</g, '&lt;')}</pre>`}</div>
      <div class="legendrow"><b>저장</b> E 현장 엣지 · O 서버 객체 저장소 · M 서버 메타 DB <b>종류</b>${Object.entries(CODES.CAT).map(([k, v]) => `<span class="cd on fill ${k}">${v}</span>`).join('')}</div>`;
    const b = $('#dauto'); if (b) b.addEventListener('click', () => { pick = null; dKey = ''; render(); });
    if (d.prev) preview(d, $('#dprev'));
  }
  // example record for metadata codes (structure of the data contract message, values from this scenario)
  function sample(d, fl) {
    const last = fl.filter(x => x.t <= t + 1e-6).pop() || fl[0]; const code = last ? last.codes.find(c => c.slice(0, 3) === d.c) : d.sub[0][0];
    const o = { code, name: CODES.subName(code), job_id: SC.J, part_id: `WELD-${SC.P}-16T`, attempt: 1 };
    if (last) Object.assign(o, { t_s: +last.t.toFixed(1), process: CODES.PN[last.proc], from_layer: CODES.LAYERS[last.from].n, to_layer: CODES.LAYERS[last.to].n, summary: last.label });
    const sub = d.sub.find(x => x[0] === code); if (sub) o.content = sub[2];
    o.format = d.f; o.storage = d.st; o.level = d.ext ? '플랫폼 확장(안) · 1차년도 예시' : 'WP5 데이터 계약 v0.1 · 1차년도 예시'; return o;
  }
  return { render, reset: () => { pick = null; dKey = ''; } };
})();

/* ================= data previews ================= */
function plateFit(W, H) { const sc = Math.min((W - 16) / 300, (H - 12) / 200), L = (W - 300 * sc) / 2, T = (H - 200 * sc) / 2; return { sc, L, T, X: x => L + x * sc, Y: y => T + (200 - y) * sc }; }
function plateBase(ctx, g) { ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1; ctx.strokeRect(g.L, g.T, 300 * g.sc, 200 * g.sc); ctx.fillStyle = css('--line'); ctx.fillRect(g.L, g.T, 300 * g.sc, 12 * g.sc); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(g.X(150), g.T); ctx.lineTo(g.X(150), g.T + 200 * g.sc); ctx.stroke(); ctx.setLineDash([]); }
function preview(d, cv) {
  const { ctx, W, H } = prep(cv); ctx.fillStyle = css('--surface-2'); ctx.fillRect(0, 0, W, H); const Hh = H - 18;
  const cap = s => { ctx.fillStyle = css('--muted'); ctx.font = `11px ${UIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, 8, H - 6); };
  const k = d.prev;
  if (!k) { ctx.fillStyle = css('--muted'); ctx.font = `12px ${UIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${CODES.CAT[d.cat]} 데이터 (${d.f}) · 그림 미리보기 없음`, W / 2, H / 2); return; }
  const g = plateFit(W, Hh), P = SC.P;
  if (k === 'cad') { ctx.fillStyle = css('--surface'); ctx.fillRect(g.L, g.T, 300 * g.sc, 200 * g.sc); ctx.fillStyle = 'rgba(194,65,12,.25)'; ctx.fillRect(g.X(140.5), g.T + 12 * g.sc, 19 * g.sc, 188 * g.sc); plateBase(ctx, g);
    ctx.fillStyle = css('--fg'); ctx.font = `11px ${UIF}`; ctx.textAlign = 'center'; ctx.fillText('300 × 200 × 16 mm 맞대기 용접 + 플랜지', W / 2, g.T + 110 * g.sc); cap('D02-01 CAD 3D 형상 (평면도)'); return; }
  if (k === 'cloud' || k === 'dev') { const grid = GEOM.devGrid(P, 2); const off = document.createElement('canvas'); off.width = grid.nx; off.height = grid.ny; const oc = off.getContext('2d'); const id = oc.createImageData(grid.nx, grid.ny);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) { const q = ((grid.ny - 1 - j) * grid.nx + i) * 4, v = grid.v[j * grid.nx + i];
      const c = k === 'dev' ? DB.devCol(v) : (() => { const z = GEOM.topZ(P, (i + 0.5) * 2, (j + 0.5) * 2); const s = clamp(120 + (z - 16) * 50 + ((i * 7 + j * 13) % 5) * 6, 60, 230); return [s, s, s + 8]; })();
      id.data[q] = c[0]; id.data[q + 1] = c[1]; id.data[q + 2] = c[2]; id.data[q + 3] = 255; }
    oc.putImageData(id, 0, 0); ctx.imageSmoothingEnabled = k !== 'dev'; ctx.drawImage(off, g.L, g.T + 12 * g.sc, 300 * g.sc, 188 * g.sc); ctx.imageSmoothingEnabled = true; plateBase(ctx, g);
    cap(k === 'dev' ? 'D18-04 CAD 대비 편차 맵 (파랑 = 오목)' : 'D03-01 표면 점군 (높이 음영, 점 간격 2 mm)'); return; }
  if (k === 'roi') { plateBase(ctx, g); GEOM.ROIS[P].forEach(r => { ctx.strokeStyle = css('--k-geo'); ctx.lineWidth = 1.5; ctx.strokeRect(g.X(r.x[0]), g.Y(r.y[1]), (r.x[1] - r.x[0]) * g.sc, (r.y[1] - r.y[0]) * g.sc); });
    Object.values(GEOM.SPOTS).filter(s => s.part === P).forEach(s => s.boxes.forEach(b => { ctx.strokeStyle = css('--k-img'); ctx.lineWidth = 1.2; ctx.strokeRect(g.X(b.x[0]), g.Y(b.y[1]), (b.x[1] - b.x[0]) * g.sc, (b.y[1] - b.y[0]) * g.sc); }));
    const L = GEOM.LOF[P]; if (L) { ctx.fillStyle = 'rgba(194,65,12,.7)'; ctx.fillRect(g.X(L.x[0]) - 2, g.Y(L.y[1]), (L.x[1] - L.x[0]) * g.sc + 4, (L.y[1] - L.y[0]) * g.sc); }
    cap(`D19-01 지시 위치 · 파랑 3D ROI · 노랑 2D 결함 · 빨강 UT 지시${GEOM.ROIS[P].length || L ? '' : ' (시편 A: 없음)'}`); return; }
  if (k === 'img') { const w2 = mainWin('2D'); const spn = w2.shots[w2.shots.length - 1][0], sp = GEOM.SPOTS[spn]; const img = DB.spotImg(spn); const ar = img.width / img.height; const iw = Math.min(W - 16, Hh * ar), ih = iw / ar; ctx.drawImage(img, (W - iw) / 2, (Hh - ih) / 2 + 2, iw, ih); cap(`D27-01 국부 영상 · ${sp.label}`); return; }
  if (k === 'ascan') { const L = 34, R = W - 10, T = 12, B = Hh - 14, X = u => L + u / 8 * (R - L), Y = a => (T + B) / 2 - a * (B - T) / 2; ctx.strokeStyle = css('--line'); ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(R, Y(0)); ctx.stroke();
    const lof = !!GEOM.LOF[P]; ctx.strokeStyle = css('--k-wave'); ctx.lineWidth = 1.3; ctx.beginPath();
    for (let i = 0; i <= 600; i++) { const u = i / 600 * 8; const burst = (c, a) => a * Math.exp(-(((u - c) / 0.12) ** 2)) * Math.sin(2 * Math.PI * 10 * (u - c)); const n = 0.03 * Math.sin(i * 1.7) * Math.sin(i * 0.31);
      const v = burst(0.5, 0.9) + (lof ? burst(3.1, 0.62) : 0) + burst(5.4, 0.45) + n; const x = X(u), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.font = `10px ${MONOF}`; ctx.textAlign = 'center'; [0, 2, 4, 6, 8].forEach(u => ctx.fillText(u + ' µs', X(u), B + 12)); ctx.font = `10.5px ${UIF}`; ctx.fillText('웨지 계면', X(0.5), T + 4); if (lof) ctx.fillText('융합불량 지시', X(3.1), T + 4); ctx.fillText('형상 에코', X(5.4), T + 4);
    cap('D14-01 FMC 중 한 쌍의 A-scan (그림용 가상 파형 · 실계산은 초음파 DT)'); return; }
  if (k === 'joint') { jointPlot('3D', mainWin('3D'), cv); return; }
  if (k === 'path') { plateBase(ctx, g); const dot = (x, y, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(g.X(x), g.Y(y), 2.6, 0, 7); ctx.fill(); };
    mainWin('3D').plan.segs.forEach(sg => sg.res.res.filter(r => r.inner).forEach(r => dot(r.target.part[0], r.target.part[1], css('--k-geo'))));
    mainWin('2D').shots.forEach(s => { const sp = GEOM.SPOTS[s[0]]; dot(sp.c[0], sp.c[1], css('--k-img')); });
    ctx.strokeStyle = css('--k-wave'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.X(110), g.Y(40)); ctx.lineTo(g.X(110), g.Y(140)); ctx.stroke();
    cap('D13-01 궤적 · 파랑 3D 스캔 점 · 노랑 2D 촬영 중심 · 초록 UT 주사선'); return; }
  if (k === 'dock') { const rows = AMRT.docks(); const L = 40, R = W - 10, B = Hh - 16, T = 14, mx = Math.max(12, ...rows.map(r => r.before)); const bw = (R - L) / rows.length;
    rows.forEach((r, i) => { const x = L + i * bw; const hb = (B - T) * r.before / mx, ha = (B - T) * Math.max(r.after, 0.2) / mx; ctx.fillStyle = css('--bad'); ctx.globalAlpha = 0.5; ctx.fillRect(x + bw * 0.15, B - hb, bw * 0.3, hb); ctx.globalAlpha = 1; ctx.fillStyle = css('--good'); ctx.fillRect(x + bw * 0.5, B - ha, bw * 0.3, ha);
      ctx.fillStyle = css('--muted'); ctx.font = `10px ${UIF}`; ctx.textAlign = 'center'; ctx.fillText(`${r.amr.slice(-1)}·${r.cell}`, x + bw / 2, B + 12); });
    ctx.textAlign = 'left'; ctx.fillStyle = css('--muted'); ctx.fillText(`${mx.toFixed(0)} mm`, 2, T + 4); cap('D04-01 도킹별 툴 끝 오차 · 빨강 보정 전 · 초록 3D 정합 보정 후'); return; }
  if (k === 'map') { const X = x => 10 + (x + 7.4) / 15 * (W - 20), Y = z => 8 + (z + 1.8) / 6.6 * (Hh - 14);
    ctx.strokeStyle = css('--line'); CELLS.forEach(c => { const cx = SCEN.CX[c]; ctx.strokeRect(X(cx - 1.6), Y(-1.6), X(cx + 1.6) - X(cx - 1.6), Y(1.25) - Y(-1.6)); ctx.fillStyle = css('--muted'); ctx.font = `10px ${UIF}`; ctx.textAlign = 'center'; ctx.fillText(CELLNM[c], X(cx), Y(-1.2)); });
    [[SCEN.STORE, '적재장', '--good'], [SCEN.RETURN, '반품', '--bad'], [[SCEN.INX, SCEN.LANE], '투입', '--muted']].forEach(([p, n, c]) => { ctx.fillStyle = css(c); ctx.globalAlpha = 0.3; ctx.fillRect(X(p[0] - 0.7), Y(p[1] - 0.5), X(p[0] + 0.7) - X(p[0] - 0.7), Y(p[1] + 0.5) - Y(p[1] - 0.5)); ctx.globalAlpha = 1; ctx.fillStyle = css('--fg'); ctx.fillText(n, X(p[0]), Y(p[1]) + 3); });
    SC.amrs.forEach((m, i) => { ctx.strokeStyle = i ? css('--ops') : css('--accent'); ctx.lineWidth = 1.6; ctx.beginPath(); let first = true; m.segs.filter(s => s.kind === 'move').forEach(s => s.pts.forEach(p => { const x = X(p[0]), y = Y(p[1] + (i ? 0.08 : -0.08)); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; })); ctx.stroke();
      const p = SCEN.amrPos(m, t).p; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4, 0, 7); ctx.fill(); });
    cap('D29-01 위치 · 청록 AMR-1 · 보라 AMR-2 경로와 현재 위치'); return; }
}

/* ================= layer flow diagram (swimlane: layers × time) ================= */
const SWIM = (function () {
  const LCOL = ['#4A7BD0', '#C98A0A', '#8B5FBF', '#0B9A8F', '#3D7FA8', '#C2417A', '#6B7A80'];
  const TABOF = { in: 't-main', '3D': 't-3D', an: 't-main', '2D': 't-2D', UT: 't-UT', qc: 't-main', out: 't-AMR', amr: 't-AMR' };
  const DESC = {
    in: '통합 OCS의 작업지시 · CAD · 검사 기준을 받아 공통 ID를 붙이고, AMR-1에 시편을 싣습니다.',
    '3D': '도킹 오차를 러프 스캔으로 추정해 경로를 부품 좌표로 옮기고, CAD 법선 경로로 스캔해 점군 · 편차 맵 · ROI를 만듭니다. 커버리지가 모자라면 경사 패스를 더합니다.',
    an: 'OCS가 3D 결과(편차 맵 · ROI)를 규칙으로 분류해 다음 공정 순서와 2D 촬영 · UT 주사 대상을 정합니다.',
    '2D': 'ROI 중심과 표면 법선으로 촬영 포즈를 만들어 국부 영상을 찍고, 반사 포화로 신뢰도가 낮으면 조명 입사각을 바꿔 다시 찍습니다.',
    UT: '용접선 · 표면결함 위치로 주사 경로를 만들어 접촉 주사(FMC)를 하고, 후면 에코가 낮으면 재접촉 · 자세 보정 후 다시 주사합니다.',
    qc: '형상 · 표면 · 내부 결과를 모아 QC를 판정하고, 판정과 결함 목록을 WP1(통합 OCS)에 보냅니다.',
    out: 'AMR-1이 시편을 적재장이나 반품 라인으로 옮기고, 보고서 · 원시 파일 전송을 마칩니다.',
    amr: 'OCS가 AMR에 이송 미션을 주고 AMR은 적재 · 도착 · 하역 상태와 위치를 보고합니다. 도크 도착 위치는 셀마다 도킹 오차 정합에 쓰입니다.' };
  let key = '', itemsKey = '', items = [], els = [], colW = 116, pin = null;
  function ensure() { if (itemsKey !== sid) { build(); itemsKey = sid; key = ''; pin = null; } }
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  function build() {
    items = FL.F.map(f => Object.assign({ kind: 'flow' }, f));
    const add = (tt, proc, layer, label) => items.push({ t: tt, proc, from: layer, to: layer, codes: [], label, kind: 'proc' });
    const w3 = mainWin('3D'), w2 = mainWin('2D'), wu = mainWin('UT'), an = SC.stages.find(s => s.id === 'an'), qc = SC.stages.find(s => s.id === 'qc');
    add(w3.t0 + 3, '3D', 6, '3D 스캔 실행 (로봇 · 스캐너)');
    if (w3.redo) add(w3.redoAt - 0.1, '3D', 3, '커버리지 판단 → 미달');
    add(an.t0 + 2, 'an', 1, '규칙 판단 (ROI 분류 · 점수)');
    const ri = w2.shots.findIndex(s => s[2]); if (ri > 0) add(w2.shotT[ri - 1][1] - 0.1, '2D', 3, '신뢰도 판단 → 반사 포화');
    add(wu.t0 + 4, 'UT', 6, '접촉 주사 · FMC 취득');
    if (wu.redo) add(wu.redoAt - 0.1, 'UT', 3, '후면 에코 게이트 → 미달');
    add(qc.t0 + 2, 'qc', 1, 'QC 종합 판정 (규칙)');
    items.sort((a, b) => a.t - b.t);
  }
  function idx() { if (pin && Math.abs(pin.t - t) < 1e-9) return pin.i; let c = -1; items.forEach((it, i) => { if (it.t <= t + 1e-6) c = i; }); return c; }
  function step(d) { ensure(); jump(idx() + d); }
  function jump(j) { ensure(); j = clamp(j, 0, items.length - 1); t = items[j].t + 1e-4; pin = { i: j, t }; playing = false; updBtn(); V3.reset(); render(); }
  function draw() {
    const sc = $('#sw-scroll'); const H = Math.max(240, sc.clientHeight || 600), Wv = sc.clientWidth || 900; const z = +$('#sw-zoom').value;
    const n = items.length; colW = z ? 116 * z : Math.max(6, (Wv - 24) / n);
    const top = 40, lh = (H - top) / 7, W = Math.max(Wv, 24 + n * colW);
    const bw = Math.max(4, Math.min(104 * (z || 0.45), colW - 6)), bh = Math.min(42, lh - 16), showTxt = colW >= 70, showCode = colW >= 44;
    let s = '';
    for (let i = 0; i < 7; i++) s += `<rect x="0" y="${top + i * lh}" width="${W}" height="${lh}" style="fill:${i % 2 ? 'var(--surface)' : 'var(--surface-2)'}"/>`;
    let r0 = 0; for (let i = 1; i <= n; i++) { if (i === n || items[i].proc !== items[r0].proc) { const p = items[r0].proc, x0 = 12 + r0 * colW, x1 = 12 + i * colW;
      s += `<rect x="${x0 + 1}" y="3" width="${Math.max(1, x1 - x0 - 2)}" height="17" rx="4" style="fill:${p === 'amr' ? 'var(--ops-soft)' : 'var(--accent-soft)'}"/>`;
      if (x1 - x0 > 50) s += `<text x="${(x0 + x1) / 2}" y="15.5" text-anchor="middle" font-size="11" font-weight="600">${CODES.PN[p]}</text>`; r0 = i; } }
    const every = Math.ceil(60 / colW);
    items.forEach((it, i) => { const cx = 12 + i * colW + colW / 2, yS = top + it.from * lh + lh / 2, yR = top + it.to * lh + lh / 2, col = LCOL[it.from];
      let g = `<g class="sb" data-i="${i}">`;
      if (i % every === 0) g += `<text x="${cx}" y="33" text-anchor="middle" font-size="9.5" class="mono" style="fill:var(--muted)">${mmss(it.t)}</text>`;
      if (it.kind === 'flow' && it.to !== it.from) { const dir = yR > yS ? 1 : -1; g += `<line x1="${cx}" y1="${yS + dir * bh / 2}" x2="${cx}" y2="${yR - dir * 6}" stroke="${col}" stroke-width="1.6" marker-end="url(#swarr)"/><circle cx="${cx}" cy="${yR}" r="3.4" fill="${LCOL[it.to]}"/>`; }
      g += `<rect class="bx" x="${cx - bw / 2}" y="${yS - bh / 2}" width="${bw}" height="${bh}" rx="5" fill="${col}26" stroke="${col}"${it.kind === 'proc' ? ' stroke-dasharray="4 3"' : ''}/>`;
      if (showCode) g += `<text x="${cx}" y="${showTxt ? yS - 4 : yS + 3.5}" text-anchor="middle" font-size="9.5" font-weight="600" class="mono">${it.kind === 'proc' ? '처리' : it.codes.slice(0, colW >= 100 ? 2 : 1).join(' ')}</text>`;
      if (showTxt) g += `<text x="${cx}" y="${yS + 11}" text-anchor="middle" font-size="10">${trunc(it.label, Math.floor(bw / 10.2))}</text>`;
      g += `<title>${mmss(it.t)} · ${CODES.PN[it.proc]} · ${CODES.LAYERS[it.from].n}${it.kind === 'proc' ? ' 안에서 처리' : ' → ' + CODES.LAYERS[it.to].n} · ${it.label}${it.codes.length ? ' · ' + it.codes.join(' ') : ''}</title></g>`;
      s += g; });
    s += `<line id="sw-now" x1="0" y1="22" x2="0" y2="${H}" stroke-dasharray="3 3" stroke-width="1.2" style="stroke:var(--fg)"/>`;
    const svg = $('#sw-svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs><marker id="swarr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>` + s;
    els = [...svg.querySelectorAll('.sb')]; els.forEach(e => e.addEventListener('click', () => jump(+e.getAttribute('data-i'))));
    const lanes = $('#sw-lanes'); lanes.style.gridTemplateRows = `${top}px repeat(7, ${lh}px)`;
    lanes.innerHTML = '<div>계층 ↓ · 시간 →</div>' + CODES.LAYERS.map((l, i) => `<div style="border-left-color:${LCOL[i]}">${l.n}<small>${l.s}</small></div>`).join('');
  }
  function side(cur) {
    const L = CODES.LAYERS, it = items[Math.max(0, cur)], el = $('#sw-side'); if (!it) return;
    const same = items.filter(x => x.proc === it.proc), k = same.indexOf(it) + 1, nn = DB.nowNext(stateAt(t));
    const what = cur < 0 ? '▶ 재생을 누르면 공정이 진행되는 대로 데이터가 어느 계층에서 어느 계층으로 가는지 흐름도에 표시되고, 지금 하는 일과 움직인 데이터의 내용이 여기에 나옵니다.' : it.kind === 'proc' ? `처리 계층 <b>${L[it.from].n}</b> (다른 계층으로 보내지 않음)<br>${it.label}` : `보낸 계층 <b>${L[it.from].n}</b> → 받는 계층 <b>${L[it.to].n}</b><br>${it.label}`;
    el.innerHTML = `<div class="ttl2"><h2>${cur < 0 ? '재생 전' : `${CODES.PN[it.proc]} · ${mmss(it.t)}`}</h2>${cur >= 0 ? `<button class="btn ghost sm" id="sw-open">${CODES.PN[it.proc]} 탭 →</button>` : ''}</div>
      <div class="small">상자 ${cur >= 0 ? k : 0}/${same.length} (이 단계) · 전체 ${cur + 1}/${items.length}</div>
      <div class="nbox do"><span class="k">이 단계에서 하는 일</span><div>${DESC[it.proc]}</div></div>
      <div class="nbox do now"${NB()}><span class="k">지금 이 상자</span><div>${what}</div></div>
      <div class="nbox nx"><span class="k">결과 · 다음 할 일</span><div class="r"><b>결과</b> ${nn.res}</div><div class="r"><b>다음</b> ${nn.next}</div></div>
      <div class="dlist"><h3>데이터 상세</h3>${cur < 0 ? '<p class="note">—</p>' : it.kind === 'proc' ? '<p class="note">계층 안에서 처리하는 상자라 다른 계층으로 보내는 데이터가 없습니다. 처리 결과는 다음 상자에서 보냅니다.</p>' :
        `<div class="chips"><span class="pill" style="background:${LCOL[it.from]}2e;color:var(--fg)">${L[it.from].n}</span>&nbsp;→&nbsp;<span class="pill" style="background:${LCOL[it.to]}2e;color:var(--fg)">${L[it.to].n}</span></div>` +
        it.codes.map(c => { const d = CODES.BY[c.slice(0, 3)], sub = d.sub.find(x => x[0] === c), p = CPROC[d.c] || { use: [] };
          return `<div class="dcode"><div>${chip(c, { on: true, fill: true })} <b>${CODES.subName(c)}</b> <span class="muted">· ${d.n}</span></div><div class="kv"><span>형식 · 종류</span><span>${d.f} · ${CODES.CAT[d.cat]}</span><span>내용</span><span>${sub ? sub[2] : d.d}</span><span>저장</span><span>${d.st}</span><span>활용 공정</span><span>${p.use.map(x => CODES.PN[x]).join(' · ') || '—'}</span></div></div>`; }).join('')}</div>`;
    const ob = $('#sw-open'); if (ob) ob.addEventListener('click', () => showTab(TABOF[it.proc]));
  }
  // named apart from the page-wide render(): jump() and the buttons must re-render every view, not just this panel
  function renderSwim() {
    const sc = $('#sw-scroll'); const k = `${sid}|${$('#sw-zoom').value}|${sc.clientWidth}|${sc.clientHeight}`;
    ensure(); if (k !== key) { draw(); key = k; }
    const cur = idx(), dim = !!$('#sw-dim').checked;
    $('#sw-pos').textContent = `상자 ${cur + 1} / ${items.length}`; $('#sw-play').textContent = playing ? '⏸ 일시정지' : t >= SC.T ? '▶ 다시 재생' : '▶ 재생';
    els.forEach((e, i) => { const c = i === cur ? 'sb cur' : i < cur ? 'sb past' : dim ? 'sb fut' : 'sb'; if (e.getAttribute('class') !== c) e.setAttribute('class', c); });
    const nowX = cur >= 0 ? 12 + cur * colW + colW / 2 : 0, nl = $('#sw-now'); if (nl) { nl.setAttribute('x1', nowX); nl.setAttribute('x2', nowX); }
    const it = items[cur]; [...$('#sw-lanes').children].forEach((d, i) => { if (d.classList) d.classList.toggle('act', !!it && i > 0 && (it.from === i - 1 || it.to === i - 1)); });
    if ($('#sw-follow').checked && +$('#sw-zoom').value) { const target = Math.max(0, nowX - sc.clientWidth * 0.4); if (Math.abs(sc.scrollLeft - target) > 3) sc.scrollLeft = target; }
    side(cur);
  }
  $('#sw-prev').addEventListener('click', () => step(-1));
  $('#sw-next').addEventListener('click', () => step(1));
  $('#sw-play').addEventListener('click', () => { pin = null; $('#play').click(); });
  $('#sw-first').addEventListener('click', () => { t = 0; pin = null; playing = false; updBtn(); V3.reset(); render(); });
  ['#sw-zoom', '#sw-dim', '#sw-follow'].forEach(s => $(s).addEventListener('change', () => { if (tab === 't-swim') render(); }));
  return { render: renderSwim, step, reset: () => { key = ''; itemsKey = ''; pin = null; } };
})();

/* ================= short guide ================= */
const GUIDE = (function () {
  let page = 'g1', built = '', SUM = null;
  const STEPS = [['in', '투입 · 작업', 'WP1 작업지시 · CAD · 검사 기준을 받아 공통 ID를 붙이고 AMR-1에 시편을 싣습니다.', 't-main'],
    ['3D', '3D 스캔', '도킹 오차를 추정해 경로를 옮기고 CAD 법선 경로로 스캔합니다. 커버리지가 모자라면 경사 패스를 더합니다.', 't-3D'],
    ['an', '자율 분석', 'OCS가 편차 맵 · ROI를 분류해 다음 공정과 2D 촬영 · UT 주사 대상을 정합니다 (1차: 규칙).', 't-main'],
    ['2D', '2D 국부', 'ROI 중심 · 법선으로 촬영 포즈를 만들고, 반사 포화면 조명 입사각을 바꿔 다시 찍습니다.', 't-2D'],
    ['UT', '초음파', '용접선을 따라 접촉 주사(FMC)하고, 후면 에코가 낮으면 재접촉 · 자세 보정 후 다시 주사합니다.', 't-UT'],
    ['qc', 'QC 판정', '형상 · 표면 · 내부 결과를 모아 판정하고 결과를 WP1에 보냅니다.', 't-main'],
    ['out', '이송 · 보고', 'PASS는 적재장, FAIL은 반품 라인으로 옮기고 재작업 위치를 전달합니다.', 't-AMR']];
  const TABS = [
    ['① 라인 운영', 't-main', ['메인 화면. 조감도 3D (드래그 회전 · 휠 확대), 셀 상태, 공정 단계, 자율 분석, 데이터 교환', '"지금 하는 일"(청록) · "결과 · 다음 할 일"(주황) 두 칸만 따라 읽어도 흐름을 알 수 있습니다', '결과창 ①–④는 단계가 끝날 때마다 채워지고, ③은 3D 스캔 모델 위에 초음파 결과를 겹칩니다', '결과창 아래 "생성 · 활용" = 만든 데이터 코드와 쓰이는 곳']],
    ['② AMR 물류', 't-AMR', ['점선 = AMR 경로, 링 = 다음 정지점, 빨간 화살표 = 도킹 오차 (20배 확대)', '미션 목록 (AMR-1 · AMR-2 전환), 관제 표, AMR 일정', '도킹 오차 → 3D 정합 보정 표: 보정 전 → 후 툴 끝 오차']],
    ['③ 3D 스캔 셀', 't-3D', ['경로 생성 → 이동 → 품질 판단 → 보정 8단계, 단계마다 쓰는 데이터 코드', '청록 = 초기 경로, 주황 = 보정 경로, 빨간 링 = 툴 끝', '보정 전 · 후 막대, 경로 검증 표 (도달 · 최소 여유 · 툴 끝 오차), 관절각']],
    ['④ 2D 비전 셀', 't-2D', ['촬영 포즈 = ROI 중심 · 법선 기준 작동거리 285 mm, 점선 = 카메라 광축', '반사 포화로 신뢰도가 미달하면 카메라 · 조명을 25° 기울여 다시 찍습니다', '결과 영상과 결함 상자는 ① 탭 결과창 ②에 나옵니다']],
    ['⑤ 초음파 셀', 't-UT', ['주사 경로 = 용접선 오프셋 40 mm · y 40–140 mm, 초록 점 = 접촉 궤적', '후면 에코 게이트 미달 → 재접촉 (시나리오 1) · 자세 보정 (시나리오 2)', '음향 해석 자체는 초음파 DT 뷰어 (WeldDT)에서 봅니다']],
    ['⑥ 실행 기록 · 레이어', 't-layer', ['시스템 계층 7개: 누르면 그 계층이 주고받은 데이터만 남습니다', '공정 × 계층 데이터 맵: 테두리 = 보냄, 채움 = 받음, 흐림 = 아직', '단위 공정 사이에 넘기는 데이터, 실행 기록 (최근 순)']],
    ['⑥-2 레이어 흐름도', 't-swim', ['세로 = 계층, 가로 = 시간. 상자 = 보내는 계층의 데이터, 화살표 끝 = 받는 계층, 점선 상자 = 계층 안 처리', '재생하면 지난 흐름은 진하게, 지금은 빛나게, 앞으로는 흐리게 표시되고 화면이 따라갑니다', '상자를 누르면 그 시점으로, ⏮ ⏭로 한 상자씩. 크기 → 전체 보기로 전체 모양']],
    ['⑦ 데이터 코드 · 저장 형식', 't-data', ['D00–D30 사전: 형식 · 저장 · 소스 계층 · 생성 / 활용 공정 · 생성 시각', '행을 누르면 세부 코드 · 흐름 · 미리보기 (그림 또는 JSON 예시)', '"자동 따라가기" = 가장 최근에 오간 데이터로 돌아가기']],
    ['⑧ 간략 설명서', 't-guide', ['이 화면. "개요 · 시나리오"와 "탭별 요령 · 용어" 두 쪽', '시나리오 카드를 누르면 그 시나리오로 바뀝니다']],
    ['공통 조작', null, ['위쪽에서 시나리오 1–3 선택 → ▶ 재생 (4× · 8× · 16×)', '타임라인 막대 클릭 = 그 시점으로 이동, ▲ = 품질 미달 → 보정', '모든 탭이 같은 시간으로 움직이고, 깜빡이는 테두리 = 지금 하는 일', '[전체 화면] 버튼 · 창 크기에 맞춰 자동 확대 · 축소 (스크롤 없음)']]];
  function summary(x) {
    const S = SCEN.build(x), d = S.def, P = S.P, W = c => S.wins[c].find(w => w.main), w3 = W('3D'), w2 = W('2D'), wu = W('UT');
    const mm = v => (v * 1000).toFixed(1), spots = [...new Set(w2.shots.map(s => s[0]))], nDef = spots.reduce((a, s) => a + GEOM.SPOTS[s].boxes.length, 0), conf = { A: '0.93', B: '0.82', C: '0.74' }[P];
    return { x, title: d.name, desc: d.desc, pass: d.qc.pass, lines: [
      `3D 스캔: 도킹 오차 ${mm(w3.pose.dx)}, ${mm(w3.pose.dy)} mm → 3D 정합 보정. ${w3.redo ? '상면 3패스 커버리지 65 % → 플랜지면 경사 30° 패스 P4·P5 추가 → 100 %' : '5패스 레시피로 커버리지 100 % (1회 통과)'} · ROI ${GEOM.ROIS[P].length}개`,
      `자율 분석: ${SCEN.ANALYSIS[P][1][1]} → ${SCEN.ANALYSIS[P][3][1]}`,
      `2D 국부: ${w2.redo ? `${GEOM.SPOTS[w2.shots[0][0]].label.split(' ')[0]} 수직 촬영 신뢰도 ${P === 'B' ? '0.04' : '0.20'} (반사 포화) → 카메라 · 조명 25° 기울여 재촬영 ${conf}` : `${GEOM.SPOTS[spots[0]].label} 촬영 · 신뢰도 ${conf}`} · 결함 ${nDef}건`,
      `초음파: ${wu.mode === 'recontact' ? '후면 에코 28 % (접촉 불량) → 들어 올려 재접촉 · 가압 증가 → 75 %' : wu.mode === 'tilt' ? '후면 에코 41 % (프로브 3° 기울어짐) → 툴 축 법선 재정렬 → 78 %' : '후면 에코 76 % (1회 통과)'} · ${GEOM.LOF[P] ? '융합불량 지시 +5.1 dB (깊이 6.5–9.5 mm)' : '지시 없음'}`,
      `QC: 형상 ${d.qc.shape[0]} · 표면 ${d.qc.surf[0]} · 내부 ${d.qc.inner[0]} → ${d.qc.pass ? 'PASS → 적재장' : 'FAIL → 반품 라인 · 재작업 위치 전달'}`,
      `AMR-2: 다음 시편 ${d.next}를 3D 셀부터 이어서 투입 · 시나리오 전체 ${mmss(S.T)}`] };
  }
  function buildStatic() {
    $('#g-steps').innerHTML = STEPS.map(s => `<div class="gstep" data-p="${s[0]}"><b>${s[1]}</b><span>${s[2]}</span><button class="gopen" data-open="${s[3]}">열기 →</button></div>`).join('');
    $('#g-tabs').innerHTML = TABS.map(c => `<div class="card gtab"><div class="hrow"><h3>${c[0]}</h3>${c[1] ? `<button class="gopen" data-open="${c[1]}">열기 →</button>` : ''}</div><ul>${c[2].map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('');
    if (!SUM) SUM = ['S1', 'S2', 'S3'].map(summary);
    $('#g-scen').innerHTML = SUM.map(m => `<div class="card gsc" data-s="${m.x}" role="button" tabindex="0"><div class="hrow"><h3>${m.title}</h3><span class="pill ${m.pass ? 'ok' : 'ng'}">${m.pass ? 'PASS' : 'FAIL'}</span></div><p class="note">${m.desc}</p><ol>${m.lines.map(l => `<li>${l}</li>`).join('')}</ol></div>`).join('');
    document.querySelectorAll('#t-guide .gopen').forEach(b => b.addEventListener('click', () => showTab(b.getAttribute('data-open'))));
    document.querySelectorAll('#g-scen .gsc').forEach(c => { const f = () => setScenario(c.getAttribute('data-s')); c.addEventListener('click', f); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }); });
  }
  function render() {
    if (!built) { buildStatic(); built = 'y'; }
    document.querySelectorAll('#g-scen .gsc').forEach(c => c.classList.toggle('cur', c.getAttribute('data-s') === sid));
    const cp = curStage(t); document.querySelectorAll('#g-steps .gstep').forEach(c => c.classList.toggle('now', !!cp && c.getAttribute('data-p') === cp.id));
  }
  document.querySelectorAll('.gpage').forEach(b => b.addEventListener('click', () => { page = b.getAttribute('data-g'); document.querySelectorAll('.gpage').forEach(x => x.setAttribute('aria-pressed', x === b)); ['g1', 'g2'].forEach(id => { $('#' + id).hidden = id !== page; }); }));
  return { render };
})();

/* ================= tabs & render ================= */
const tabs = [...document.querySelectorAll('.tab')];
const TABIDS = ['t-main', 't-AMR', 't-3D', 't-2D', 't-UT', 't-layer', 't-swim', 't-data', 't-guide'];
function showTab(id) { tab = id; tabs.forEach(b => { const on = b.getAttribute('aria-controls') === id; b.setAttribute('aria-selected', on); $('#' + b.getAttribute('aria-controls')).hidden = !on; }); try { history.replaceState(null, '', '#' + id); } catch (e) {} V3.attach(); render(); }
tabs.forEach(b => b.addEventListener('click', () => showTab(b.getAttribute('aria-controls'))));
function render() { const st = stateAt(t); drawTL(); if (tab === 't-main') DB.render(st); else if (tab === 't-AMR') AMRT.render(); else if (tab === 't-layer') LAYT.render(); else if (tab === 't-swim') SWIM.render(); else if (tab === 't-data') DATAT.render(); else if (tab === 't-guide') GUIDE.render(); else cellTab(tab.slice(2)); V3.update(); }
const retheme = () => { DB.reset(); render(); };
// step through data exchanges (boxes) from any tab; arrow keys on the layer flow tab
$('#stepPrev').addEventListener('click', () => SWIM.step(-1));
$('#stepNext').addEventListener('click', () => SWIM.step(1));
document.addEventListener('keydown', e => { if (tab !== 't-swim' || e.altKey || e.ctrlKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return; if (e.key === 'ArrowLeft') { e.preventDefault(); SWIM.step(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); SWIM.step(1); } });
// full screen for presenting (hidden where the page is not allowed to go full screen, e.g. some embeds)
const fsBtn = $('#fs'), DE = document.documentElement;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (document.fullscreenEnabled || document.webkitFullscreenEnabled) fsBtn.hidden = false;
fsBtn.addEventListener('click', () => { try { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (DE.requestFullscreen || DE.webkitRequestFullscreen).call(DE); } catch (e) {} });
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { fsBtn.textContent = fsEl() ? '창 모드' : '전체 화면'; }));
addEventListener('resize', () => { fit(); DB.reset(); UTV.resize(); V3.resize(); render(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.__plat3 = { V3, get SC() { return SC; }, get FL() { return FL; }, robotAt, stateAt, setScenario, setT: v => { t = v; }, stepsFor, render, showTab, AMRT };
const h = (location.hash || '').replace('#', '');
tab = TABIDS.includes(h) ? h : 't-main';
// start once the embedded Pretendard is ready, so canvas and 3D labels use it
function start() { setScenario('S1'); showTab(tab); }
if (document.fonts && document.fonts.ready) { let go = false; const run = () => { if (!go) { go = true; start(); } }; document.fonts.ready.then(run); setTimeout(run, 1500); } else start();
})();
