// three.js 는 index.html 의 importmap 으로 CDN 에서 불러온다 (인터넷 필요). 오프라인 배포 시 로컬 파일로 교체할 것.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------- 3D 장면 ----------
const view = document.getElementById("view");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(6, 6, 8);
const renderer = new THREE.WebGLRenderer({ antialias: true });
view.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.GridHelper(20, 20, 0x3a4560, 0x232a3c));
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(5, 10, 5);
scene.add(sun);

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
box(2, 1.2, 2, 0x3b6fd6, 1.5, 0.6, -1);   // 3D 스캔 셀 (자리표시)
box(2, 1.2, 2, 0x3bb08a, 4.5, 0.6, -1);   // 2D 비전 셀
box(2, 1.2, 2, 0xd69a3b, 7.5, 0.6, -1);   // 초음파 셀
const amr = box(1, 0.4, 0.8, 0xe05555, -4, 0.2, 3);

// 2링크 로봇 팔 (평면)
const arm = new THREE.Group();
arm.position.set(1.5, 1.2, -1);
scene.add(arm);
const link1 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x999999 }));
link1.geometry.translate(0.5, 0, 0);
link2.geometry.translate(0.45, 0, 0);
arm.add(link1);
link1.add(link2);

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
(function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
})();

// ---------- 서버 연결 ----------
const $ = (id) => document.getElementById(id);
const ws = new WebSocket(`ws://${location.host}/ws`);
let playing = false;
let duration = 1;

ws.onopen = () => ($("conn").textContent = "연결됨");
ws.onclose = () => ($("conn").textContent = "연결 끊김");
ws.onmessage = (m) => apply(JSON.parse(m.data));

$("play").onclick = () => {
  playing = !playing;
  ws.send(JSON.stringify({ cmd: playing ? "play" : "pause" }));
  $("play").textContent = playing ? "⏸ 일시정지" : "▶ 재생";
};
$("speed").onchange = (e) => ws.send(JSON.stringify({ cmd: "speed", value: +e.target.value }));
$("bar").onclick = (e) => {
  const r = $("bar").getBoundingClientRect();
  ws.send(JSON.stringify({ cmd: "seek", t: ((e.clientX - r.left) / r.width) * duration }));
};

// ---------- 상태 → 화면 ----------
function apply(s) {
  duration = s.duration;
  $("fill").style.width = `${(s.t / s.duration) * 100}%`;
  $("clock").textContent = `${s.t.toFixed(1)} s`;

  amr.position.x = s.amr.x;
  amr.position.z = s.amr.z;
  arm.children[0].rotation.z = s.robot.q1;
  arm.children[0].children[0].rotation.z = s.robot.q2;

  const activeCodes = new Set(s.active.map((e) => e.code + e.t));
  $("events").innerHTML = s.events
    .map((e) => `<div class="ev ${activeCodes.has(e.code + e.t) ? "on" : ""}">
        <b>${e.code}</b> ${e.from} → ${e.to}<br>${e.label}</div>`)
    .join("");
  $("info").innerHTML = `AMR 도킹 오차: ${s.amr.dock_error.toFixed(1)} mm<br>
    로봇 관절각: q1 ${(s.robot.q1 * 57.3).toFixed(0)}°, q2 ${(s.robot.q2 * 57.3).toFixed(0)}°`;
}
