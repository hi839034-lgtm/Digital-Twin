// 셀 3D: 6축 로봇 · 부품(판재+플랜지) · AMR 지그 · 계획 경로. 로봇 좌표(x, y, z 위)를 three 좌표 (x, z, -y)로 바꿔 그린다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { S } from "./state.js";
import { fkPts, p2w, TOOLLEN, TOOL_OF } from "./kin.js";

const V = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const mat = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, ...o });
const LINK_COL = [0xcfd6e6, 0xcfd6e6, 0xb9c2d6, 0xb9c2d6, 0xa3adc4, 0xa3adc4, 0xff9d3b];
const LINK_R = [0.075, 0.075, 0.062, 0.055, 0.045, 0.038, 0.028];

export function createCellScene(host, cell) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
  camera.position.set(1.3, 1.3, 2.3);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.7, 0.35, -0.1);
  controls.update();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const floor = new THREE.GridHelper(4, 16, 0x2a3350, 0x1d2434);
  floor.position.set(0.8, -0.47, 0);
  scene.add(floor);

  const robot = new THREE.Group();
  const links = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(LINK_R[i], LINK_R[i], 1, 14), mat(LINK_COL[i]));
    robot.add(m);
    links.push(m);
  }
  const joints = [];
  for (let i = 0; i < 7; i++) { const j = new THREE.Mesh(new THREE.SphereGeometry(LINK_R[Math.min(i, 6)] * 1.25, 14, 10), mat(0x6b7690)); robot.add(j); joints.push(j); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.46, 20), mat(0x56607a));
  base.position.set(0, -0.23, 0);
  robot.add(base);
  const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), mat(0xff3b3b, { emissive: 0xff3b3b }));
  robot.add(tipDot);
  scene.add(robot);

  let dyn = new THREE.Group(), key = null;
  scene.add(dyn);
  const lineMat = { base: 0x4f8cff, fix: 0xffb84f };

  /** 작업 구간(w)이 바뀔 때 부품 · AMR · 경로를 다시 만든다. w 가 없으면 공칭 도킹 자세 */
  function rebuild(w) {
    scene.remove(dyn);
    dyn = new THREE.Group();
    scene.add(dyn);
    const pose = w ? w.pose : { dx: 0, dy: 0, dth: 0 };
    const add = (geo, m, p, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.copy(V(p)); o.rotation.y = ry; dyn.add(o); return o; };
    // 판재 300x200x16, 플랜지 (y 188~200, z 16~96)
    add(new THREE.BoxGeometry(0.3, 0.016, 0.2), mat(0x8e98ad), p2w(pose, 150, 100, 8), pose.dth);
    add(new THREE.BoxGeometry(0.3, 0.08, 0.012), mat(0x7a8499), p2w(pose, 150, 194, 56), pose.dth);
    // 용접 비드 (x=150 선)
    add(new THREE.BoxGeometry(0.019, 0.004, 0.2), mat(0xd9b24a), p2w(pose, 150, 100, 17), pose.dth);
    // AMR + 지그 (도킹 오차만큼 어긋나 있다)
    add(new THREE.BoxGeometry(0.75, 0.46, 1.1), mat(0x4f8cff, { transparent: true, opacity: 0.55 }), [0.8 + pose.dx, pose.dy, -0.23]);
    if (w) {
      for (const sg of w.plan.segs) {
        const pts = sg.pts.map((x) => V(x.p));
        if (pts.length < 2) { pts.forEach((p) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), mat(lineMat[sg.kind], { emissive: lineMat[sg.kind] })); d.position.copy(p); dyn.add(d); }); continue; }
        dyn.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: lineMat[sg.kind] })));
      }
    }
  }

  function update(w, q) {
    const k = w ? w.job + w.t0 : "none";
    if (k !== key) { key = k; rebuild(w); }
    const pts = fkPts(q, TOOLLEN[TOOL_OF[cell]]).map(V);
    for (let i = 0; i < 7; i++) {
      const a = pts[i], b = pts[i + 1], d = new THREE.Vector3().subVectors(b, a), L = d.length();
      links[i].position.copy(a).addScaledVector(d, 0.5);
      links[i].scale.set(1, Math.max(L, 1e-4), 1);
      if (L > 1e-6) links[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    for (let i = 0; i < 7; i++) joints[i].position.copy(pts[i + 1]);
    tipDot.position.copy(pts[7]);
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function draw() { controls.update(); renderer.render(scene, camera); }
  return { update, resize, draw };
}
