/* 연결부: 파이썬 서버의 데이터를 원본 화면 코드(ui.js)가 기대하는 전역 객체 KIN · GEOM · SCEN · CODES 로 만든다.
 *
 * 계산은 모두 서버(server/sim)가 하고, 여기서는 받은 값을 같은 모양으로 담기만 한다.
 *   - 경로 요약 · 툴 끝 오차 · 촬영 지점 좌표: 서버가 w.plan.segs[].stats / spotW 로 계산해 준다 (JS 에 식 없음)
 *   - 높이(topZ) · 편차(dev): 서버가 준 값 격자(/api/devgrid 의 lat4 · bead)에서 읽는다 (JS 에 식 없음)
 * 화면이 프레임마다 직접 돌려야 하는 계산은 두 가지뿐이다.
 *   - 순기구학 fk (로봇 자세 → 링크 위치): 식은 여기, 모델 상수(DH · OFF · TOOLLEN)는 서버. 로드할 때 서버가 계산한
 *     기준값(fkCheck)과 자동 대조해 두 구현이 어긋나면 콘솔에 알린다.
 *   - amrPos (서버가 준 이동 구간을 시각 t 로 보간): 화면 전용 보간이라 파이썬에는 두지 않는다.
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

  const D2R = Math.PI / 180;

  /* ---------------- KIN: 순기구학 식만 (모델 상수는 서버) ---------------- */
  let KP = null; // {DH, OFF, TOOLLEN} — 서버(sim/kin.py)가 유일한 출처
  function mul(A, B) { const C = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c]; C[r * 4 + c] = s; } return C; }
  function dh(t, d, a, al) { const ct = Math.cos(t), st = Math.sin(t), ca = Math.cos(al), sa = Math.sin(al); return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1]; }
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function fk(q, tool) {
    let T = I4; const pts = [[0, 0, 0]];
    for (let i = 0; i < 6; i++) { T = mul(T, dh(q[i] + KP.OFF[i], KP.DH[i][0], KP.DH[i][1], KP.DH[i][2])); pts.push([T[3], T[7], T[11]]); }
    T = mul(T, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, tool, 0, 0, 0, 1]); pts.push([T[3], T[7], T[11]]);
    return { T, pts };
  }
  /** 서버가 계산한 기준값과 JS fk 의 최대 차이 [m] */
  function fkMaxDiff(checks) {
    let mx = 0;
    for (const c of checks) { const p = fk(c.q, c.tool).pts; for (let i = 0; i < p.length; i++) for (let k = 0; k < 3; k++) mx = Math.max(mx, Math.abs(p[i][k] - c.pts[i][k])); }
    return mx;
  }

  /* ---------------- GEOM: 높이 · 편차는 서버가 준 값 격자에서 읽는다 (식 없음) ---------------- */
  // topZ(x, y) = 16 + bead(x) + dev(x, y).  화면이 묻는 점은 두 종류뿐이다:
  //   4 mm 격자점(3D 모델의 정점: x 0..300, y 0..200)과 2 mm 격자 중심(점군 미리보기). 그 밖의 점은 서버가 주지 않았으므로 오류로 알린다.
  let BEAD = null, LAT = null, DEVG = null;
  const near = (v, step, off) => { const k = Math.round((v - off) / step); return Math.abs(v - off - k * step) < 0.01 ? k : null; };
  const inRange = (k, n) => k !== null && k >= 0 && k < n;
  const bead = x => {
    let k = near(x, 4, 0); if (inRange(k, 76)) return BEAD.l4[k];
    k = near(x, 2, 1); if (inRange(k, 150)) return BEAD.c2[k];
    throw new Error('bead: 서버가 준 격자에 없는 x=' + x);
  };
  const dev = (part, x, y) => {
    let i = near(x, 4, 0), j = near(y, 4, 0); if (inRange(i, 76) && inRange(j, 51)) return LAT[part].v[j * 76 + i];
    i = near(x, 2, 1); j = near(y, 2, 1); if (inRange(i, 150) && inRange(j, 94)) return DEVG[part].v[j * 150 + i];
    throw new Error('dev: 서버가 준 격자에 없는 점 (' + x + ', ' + y + ')');
  };
  const topZ = (part, x, y) => 16 + bead(x) + dev(part, x, y);

  /* ---------------- SCEN.amrPos: 서버가 준 이동 구간(segs)을 시각 t 로 보간 (화면 전용) ---------------- */
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
      BEAD = grids[0].bead;                                                   // 비드 높이는 시편과 무관(x 만의 함수)
      LAT = Object.fromEntries(parts.map(p => [p, GRID[p].lat4]));
      DEVG = Object.fromEntries(parts.map(p => [p, { v: Float32Array.from(GRID[p].v) }])); // 원본과 같은 Float32Array
      // 2D 영상: 세 시나리오가 쓰는 촬영 지점(재촬영 시 포화 영상 포함)
      const keys = new Set();
      for (const sid of SIDS) { const w = SCS[sid].wins['2D'].find(x => x.main); for (const s of w.shots) { keys.add(s[0] + ':0'); if (w.shots.some(x => x[0] === s[0] && x[2])) keys.add(s[0] + ':1'); } }
      const IMG = {};
      await Promise.all([...keys].map(async k => { const [spot, sat] = k.split(':'); IMG[spot + (sat === '1' ? ':sat' : '')] = await createImageBitmap(await getBlob(`/api/spot/${spot}?sat=${sat}`)); }));

      /* ---- 전역 객체 ---- */
      const C = CONSTS;
      KP = C.kin;
      const drift = fkMaxDiff(C.fkCheck);
      if (!(drift < 1e-9)) console.error('[adapter] JS 순기구학이 서버(sim/kin.py)와 다릅니다. 최대 차이(m):', drift);
      window.KIN = { HOME: C.HOME, D2R, TOOLLEN: KP.TOOLLEN, fk };
      const G = scs[0].geom;
      window.GEOM = {
        SPOTS: G.spots, ROIS: G.rois, LOF: G.lof, IMG, dev, topZ,
        devGrid: (part, step) => { const g = GRID[part]; return { nx: g.nx, ny: g.ny, step: g.step, v: DEVG[part].v }; },
      };
      window.SCEN = {
        build: sid => JSON.parse(JSON.stringify(SCS[sid])), // 화면이 시나리오 객체에 값을 덧붙이므로 매번 새 사본
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
      const s = document.createElement('script'); const emb = document.getElementById('dt-ui'); if (emb) s.textContent = emb.textContent; else s.src = 'ui.js'; // 내보낸 단일 HTML 은 내장 ui.js 를 쓴다
      document.body.appendChild(s);
    } catch (e) {
      loading.textContent = '데이터를 불러오지 못했습니다: ' + e.message;
      loading.style.color = '#c00';
    }
  })();
})();
