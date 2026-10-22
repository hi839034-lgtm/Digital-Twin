/* 연결부: 파이썬 서버의 데이터를 원본 화면 코드(ui.js)가 기대하는 전역 객체 KIN · GEOM · SCEN · CODES 로 만든다.
 *
 * 계산(시나리오 · 로봇 경로 · 편차 맵 · 2D 영상)은 모두 서버(server/sim)가 하고, 여기서는 받은 값을 같은 모양으로 담기만 한다.
 * 아래 순수 함수(fk · makeCtx · summary · tipError · amrPos · topZ/dev)는 화면이 그림을 그릴 때 값마다 바로 쓰는 짧은 계산이라
 * 원본 core 와 같은 코드를 그대로 둔다 (서버의 sim/kin.py · geom.py 와 같은 식).
 *
 * 데이터 경로: 서버 모드는 /api/... 를 부르고, 단일 HTML 로 내보낸 파일은 window.__DT_DATA__ 의 같은 키를 쓴다.
 */
(function () {
  'use strict';
  const EMBED = window.__DT_DATA__ || null;
  const getJSON = async (p) => {
    if (EMBED) { if (!(p in EMBED.json)) throw new Error('내장 데이터에 없음: ' + p); return EMBED.json[p]; }
    const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json();
  };
  const getBlob = async (p) => {
    if (EMBED) { const b = EMBED.blob[p]; if (!b) throw new Error('내장 데이터에 없음: ' + p); const bin = atob(b.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: b.type }); }
    const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.blob();
  };

  const PI = Math.PI, D2R = PI / 180;

  /* ---------------- KIN (그리기에 필요한 순수 함수만) ---------------- */
  const DH = [[0.40, 0, PI / 2], [0, 0.80, 0], [0, 0, PI / 2], [0.70, 0, -PI / 2], [0, 0, PI / 2], [0.15, 0, 0]];
  const OFF = [0, PI / 2, 0, 0, 0, 0];
  function mul(A, B) { const C = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c]; C[r * 4 + c] = s; } return C; }
  function dh(t, d, a, al) { const ct = Math.cos(t), st = Math.sin(t), ca = Math.cos(al), sa = Math.sin(al); return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1]; }
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function fk(q, tool) {
    let T = I4; const pts = [[0, 0, 0]];
    for (let i = 0; i < 6; i++) { T = mul(T, dh(q[i] + OFF[i], DH[i][0], DH[i][1], DH[i][2])); pts.push([T[3], T[7], T[11]]); }
    T = mul(T, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, tool, 0, 0, 0, 1]); pts.push([T[3], T[7], T[11]]);
    return { T, pts };
  }
  const AMR0 = { min: [0.425, -0.55, -0.46], max: [1.175, 0.55, 0] };
  function makeCtx(pose) {
    pose = pose || { dx: 0, dy: 0, dth: 0 };
    const c = Math.cos(pose.dth), s = Math.sin(pose.dth);
    const P2W = (x, y, z) => { const u = (x - 150) / 1000, v = (y - 100) / 1000; return [0.80 + pose.dx + c * u - s * v, pose.dy + s * u + c * v, z / 1000]; };
    const rot = d => [c * d[0] - s * d[1], s * d[0] + c * d[1], d[2]];
    const aabb = (x0, y0, z0, x1, y1, z1) => { const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(q => P2W(q[0], q[1], 0)); return { min: [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), z0 / 1000], max: [Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1])), z1 / 1000] }; };
    const AMR = { min: [AMR0.min[0] + pose.dx, AMR0.min[1] + pose.dy, AMR0.min[2]], max: [AMR0.max[0] + pose.dx, AMR0.max[1] + pose.dy, AMR0.max[2]] };
    const PLATE = aabb(0, 0, 0, 300, 200, 16), FLANGE = aabb(0, 188, 16, 300, 200, 96);
    return { pose, P2W, rot, AMR, PLATE, FLANGE, OBST: [['AMR·지그', AMR], ['판재', PLATE], ['플랜지', FLANGE]] };
  }
  function summary(sp) {
    const inner = sp.res.filter(x => x.inner); const ok = inner.filter(x => x.reach).length;
    let mc = { d: 1e9, link: '', obj: '' }; sp.res.forEach(x => { if (x.clear.d < mc.d) mc = x.clear; if (x.trans && x.trans.d < mc.d) mc = x.trans; });
    return { n: inner.length, ok, minClear: mc };
  }
  function tipError(sp, ctxAct) {
    let mx = 0; sp.res.filter(x => x.inner).forEach(x => { const a = ctxAct.P2W(...x.target.part); const e = Math.hypot(x.tip[0] - a[0], x.tip[1] - a[1]) * 1000; if (e > mx) mx = e; });
    return mx;
  }

  /* ---------------- GEOM (형상 · 결함 자료는 서버, topZ/dev 는 3D 메시를 그릴 때 값마다 쓰는 식) ---------------- */
  const WX = 150, WH = 9.5, BH = 2.0;
  const bead = x => { const d = (x - WX) / WH; return Math.abs(d) < 1 ? BH * (1 - d * d) : 0; };
  function devComp(part, x, y) {
    if (part === 'B') { const r2 = (x - 70) ** 2 + (y - 110) ** 2; return [-1.2 * Math.exp(-r2 / (2 * 9 * 9))]; }
    if (part === 'C') {
      const u = (x - WX) / WH, out = [0, 0, 0, 0, 0];
      if (Math.abs(u) < 1 && y > 50 && y < 90) out[0] = -0.8 * Math.sin(Math.PI * (y - 50) / 40) * (1 - u * u);
      const toe = Math.abs(x - (WX + WH)); if (toe < 1.4 && y > 118 && y < 146) out[1] = -0.75 * (1 - toe / 1.4) * Math.sin(Math.PI * (y - 118) / 28);
      [[147, 70], [152.5, 78]].forEach((c, k) => { const r = Math.hypot(x - c[0], y - c[1]); if (r < 0.8) out[2 + k] = -0.5 * Math.sqrt(1 - (r / 0.8) ** 2); });
      if (Math.abs(x - 150.3) < 0.12 && y > 58 && y < 72) out[4] = -0.3;
      return out;
    }
    return [];
  }
  const dev = (part, x, y) => { let d = 0; for (const v of devComp(part, x, y)) d += v; return d; };
  const topZ = (part, x, y) => 16 + bead(x) + dev(part, x, y);

  /* ---------------- SCEN.amrPos ---------------- */
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const plen = p => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; };
  let CONSTS = null;
  function amrPos(amr, t) {
    for (const s of amr.segs) {
      if (t < s.t0 || t > s.t1) continue;
      if (s.kind !== 'move') return { p: s.pos, seg: s };
      const L = plen(s.pts); let d = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0) * L;
      for (let i = 1; i < s.pts.length; i++) { const l = dist(s.pts[i - 1], s.pts[i]); if (d <= l || i === s.pts.length - 1) { const u = l > 0 ? Math.min(1, d / l) : 1; return { p: [s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * u, s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * u], seg: s }; } d -= l; }
    }
    const L = amr.segs[amr.segs.length - 1]; if (L && t > L.t1) return { p: L.pos || L.pts[L.pts.length - 1], seg: { kind: 'idle' } };
    return { p: [CONSTS.INX, CONSTS.LANE], seg: { kind: 'idle' } };
  }

  /* ---------------- 서버에서 데이터 받기 ---------------- */
  (async function boot() {
    const loading = document.createElement('div');
    loading.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;font:16px sans-serif;color:#555;background:#fff;z-index:9';
    loading.textContent = '서버에서 데이터를 불러오는 중…';
    document.body.appendChild(loading);
    try {
      const SIDS = ['S1', 'S2', 'S3'];
      const [codes, ...scs] = await Promise.all([getJSON('/api/codes'), ...SIDS.map(s => getJSON(`/api/scenario/${s}?full=true`))]);
      const SCS = Object.fromEntries(SIDS.map((s, i) => [s, scs[i]]));
      CONSTS = scs[0].consts;
      const parts = ['A', 'B', 'C'];
      const grids = await Promise.all(parts.map(p => getJSON('/api/devgrid/' + p)));
      const GRID = Object.fromEntries(parts.map((p, i) => [p, grids[i]]));
      // 2D 영상: 세 시나리오가 쓰는 촬영 지점(재촬영 시 포화 영상 포함)
      const keys = new Set();
      for (const sid of SIDS) { const w = SCS[sid].wins['2D'].find(x => x.main); for (const s of w.shots) { keys.add(s[0] + ':0'); if (w.shots.some(x => x[0] === s[0] && x[2])) keys.add(s[0] + ':1'); } }
      const IMG = {};
      await Promise.all([...keys].map(async k => { const [spot, sat] = k.split(':'); IMG[spot + (sat === '1' ? ':sat' : '')] = await createImageBitmap(await getBlob(`/api/spot/${spot}?sat=${sat}`)); }));

      /* ---- 전역 객체 ---- */
      const C = CONSTS;
      window.KIN = { HOME: C.HOME, D2R, TOOLLEN: { scanner: 0.22, camera: 0.16, probe: 0.13 }, fk, makeCtx, NOM: makeCtx(), summary, tipError };
      const G = scs[0].geom;
      window.GEOM = {
        SPOTS: G.spots, ROIS: G.rois, LOF: G.lof, IMG, WX, bead, dev, devComp, topZ,
        devGrid: (part, step) => { const g = GRID[part]; return { nx: g.nx, ny: g.ny, step: g.step, v: g.v }; },
      };
      window.SCEN = {
        build: sid => JSON.parse(JSON.stringify(SCS[sid])), // 화면이 w.plan.act 등을 덧붙이므로 매번 새 사본
        amrPos, CX: C.CX, LANE: C.LANE, BAY: C.BAY, DOCKZ: C.DOCKZ, INX: C.INX, JX: C.JX, STORE: C.STORE, RETURN: C.RETURN,
        ANALYSIS: C.ANALYSIS,
      };
      // 데이터 사전: 서버 codes.json 을 원본 모양(c n f d sub st src cat ext prev)으로
      const D = codes.codes.map(x => ({ c: x.code, n: x.name, f: x.format, d: x.desc, sub: x.sub.map(s => [s.code, s.name, s.detail]), st: x.storage, src: x.source_layer, cat: x.category, ext: !!x.extension, prev: x.preview || null }));
      const BY = Object.fromEntries(D.map(x => [x.c, x]));
      const PROCS = codes.processes.map(p => [p.id, p.name]);
      window.CODES = {
        LAYERS: codes.layers.map(l => ({ id: l.id, n: l.name, s: l.sub, role: l.role, sw: l.sw, io: l.io })),
        PROCS, PN: Object.fromEntries(PROCS), CAT: codes.categories, D, BY,
        subName: sc => { const d = BY[sc.slice(0, 3)]; const s = d && d.sub.find(x => x[0] === sc); return s ? s[1] : d ? d.n : sc; },
        catOf: sc => (BY[sc.slice(0, 3)] || { cat: 'meta' }).cat,
        build: SC => ({ F: SC.F, H: SC.H }), // 계층 간 데이터 흐름은 서버(sim/flows.py)가 시나리오와 함께 준다
      };
      loading.remove();
      const s = document.createElement('script'); s.src = 'ui.js'; document.body.appendChild(s);
    } catch (e) {
      loading.textContent = '데이터를 불러오지 못했습니다: ' + e.message;
      loading.style.color = '#c00';
    }
  })();
})();
