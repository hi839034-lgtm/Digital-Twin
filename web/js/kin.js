// 브라우저용 로봇 도우미: 관절각 → 링크 위치(순기구학), 키프레임 보간, 부품/장애물 좌표.
// 경로 계획(역기구학)은 서버(server/sim/kin.py)가 하고, 여기서는 그 결과를 그리기만 한다.
const PI = Math.PI;
const DH = [[0.40, 0, PI / 2], [0, 0.80, 0], [0, 0, PI / 2], [0.70, 0, -PI / 2], [0, 0, PI / 2], [0.15, 0, 0]];
const OFF = [0, PI / 2, 0, 0, 0, 0];
export const TOOLLEN = { scanner: 0.22, camera: 0.16, probe: 0.13 };
export const TOOL_OF = { "3D": "scanner", "2D": "camera", UT: "probe" };

function mul(A, B) {
  const C = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c]; C[r * 4 + c] = s; }
  return C;
}
function dh(t, d, a, al) {
  const ct = Math.cos(t), st = Math.sin(t), ca = Math.cos(al), sa = Math.sin(al);
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1];
}
/** 베이스 · 관절 6개 · 공구 끝, 모두 8점 (로봇 좌표 [m], z 위) */
export function fkPts(q, tool) {
  let T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pts = [[0, 0, 0]];
  for (let i = 0; i < 6; i++) { T = mul(T, dh(q[i] + OFF[i], DH[i][0], DH[i][1], DH[i][2])); pts.push([T[3], T[7], T[11]]); }
  T = mul(T, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, tool, 0, 0, 0, 1]);
  pts.push([T[3], T[7], T[11]]);
  return pts;
}

/** 시각 t 의 관절각: 키프레임 사이를 smoothstep 으로 보간 (원본 robotAt) */
export function robotAt(w, home, t) {
  if (!w || !(t >= w.t0 && t <= w.t1)) return { q: home, w: null, key: null, prev: null };
  const K = w.plan.K;
  for (let i = 0; i < K.length - 1; i++) {
    const a = K[i], b = K[i + 1];
    if (t <= b.t) {
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1, s = u * u * (3 - 2 * u);
      return { q: a.q.map((v, k) => v + (b.q[k] - v) * s), w, key: b, prev: a };
    }
  }
  return { q: home, w, key: null, prev: null };
}

/** 부품 좌표 [mm] → 로봇 좌표 [m] (도킹 자세 pose 반영) */
export function p2w(pose, x, y, z) {
  const c = Math.cos(pose.dth), s = Math.sin(pose.dth), u = (x - 150) / 1000, v = (y - 100) / 1000;
  return [0.8 + pose.dx + c * u - s * v, pose.dy + s * u + c * v, z / 1000];
}
