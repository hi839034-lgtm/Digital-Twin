// 조감도 3D (셀 3개 + AMR 2대 + 적재장/반품 라인). 좌표는 시나리오 좌표(x, z) 그대로 쓴다.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { S, amrPos, winAt } from "./state.js";

function label(text, color = "#e6e9ef") {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 96;
  const g = cv.getContext("2d");
  g.font = "600 44px 'Malgun Gothic',sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, 256, 48);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  sp.scale.set(2.6, 0.49, 1);
  return sp;
}

export function createScene(host) {
  const C = S.sc.consts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 9.5, 9.5);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.2, 0, 1.6);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const mat = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1, ...o });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };

  box(17.5, 0.04, 8, 0.15, -0.02, 1.6, mat(0x161c2a));
  const grid = new THREE.GridHelper(18, 18, 0x2a3350, 0x1d2434);
  grid.position.set(0.15, 0.001, 1.6);
  scene.add(grid);
  box(17, 0.01, 0.08, 0.15, 0.01, C.LANE, mat(0x3a4560));   // 이동 차선

  const cellColor = { "3D": 0x3b6fd6, "2D": 0x3bb08a, UT: 0xd69a3b };
  const cellName = { "3D": "③ 3D 스캔 셀", "2D": "④ 2D 비전 셀", UT: "⑤ 초음파 셀" };
  const cells = {};
  for (const c of ["3D", "2D", "UT"]) {
    const x = C.CX[c];
    const body = box(2.5, 0.5, 1.5, x, 0.25, -0.95, mat(cellColor[c], { transparent: true, opacity: 0.55 }));
    box(0.3, 0.9, 0.3, x, 0.7, -0.95, mat(0xcfd6e6));            // 로봇 받침 (자리표시)
    box(1.1, 0.01, 0.9, x, 0.015, C.DOCKZ, mat(cellColor[c]));    // 도크
    const lb = label(cellName[c], "#" + cellColor[c].toString(16));
    lb.position.set(x, 1.5, -0.95);
    scene.add(lb);
    cells[c] = body;
  }
  box(1.6, 0.02, 1.0, ...[C.STORE[0], 0.01, C.STORE[1]], mat(0x2e8b62));
  box(1.6, 0.02, 1.0, ...[C.RETURN[0], 0.01, C.RETURN[1]], mat(0x9b3b3b));
  box(1.6, 0.02, 1.0, C.INX, 0.01, C.LANE, mat(0x4a5470));
  for (const [t, p, col] of [["적재장", C.STORE, "#3ecf8e"], ["반품 라인", C.RETURN, "#ff6b6b"], ["투입", [C.INX, C.LANE], "#8b95ab"]]) {
    const lb = label(t, col);
    lb.position.set(p[0], 0.9, p[1] + (t === "투입" ? -0.9 : 0.1) - (t === "반품 라인" ? -0.5 : 0.8));
    scene.add(lb);
  }

  const amrCol = [0x4f8cff, 0xffb84f];
  const amrs = S.sc.amrs.map((a, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.8), mat(amrCol[i]));
    body.position.y = 0.2;
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.35), mat(0xd9dde8));
    part.position.y = 0.4;
    g.add(body, part);
    const lb = label(a.id, "#" + amrCol[i].toString(16));
    lb.position.set(0, 0.95, 0);
    g.add(lb);
    scene.add(g);
    return { g, part, body, rot: 0 };
  });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update() {
    S.sc.amrs.forEach((a, i) => {
      const { p, seg } = amrPos(a, S.t);
      const o = amrs[i];
      o.g.position.set(p[0], 0, p[1]);
      if (seg.kind === "move") {
        const q = amrPos(a, S.t + 0.3).p;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-4) o.rot = -Math.atan2(q[1] - p[1], q[0] - p[0]);
      }
      o.g.rotation.y = o.rot;
      o.part.visible = !!seg.job && seg.kind !== "unload" && seg.kind !== "idle";
    });
    for (const c of ["3D", "2D", "UT"]) {
      const w = winAt(c);
      cells[c].material.opacity = w ? 0.95 : 0.55;
      cells[c].material.emissive.setHex(w ? cellColor[c] : 0x000000);
      cells[c].material.emissiveIntensity = w ? 0.35 : 0;
    }
  }

  function draw() { controls.update(); renderer.render(scene, camera); }
  return { resize, update, draw };
}
