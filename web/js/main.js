// 앱 뼈대: 서버에서 데이터를 받아 오고, 타임라인(S.t)을 돌리며 활성 탭을 다시 그린다.
import { S, clamp, esc, fmtT } from "./state.js";
import tabMain from "./tab_main.js";
import tabAmr from "./tab_amr.js";
import { cellTab } from "./tab_cell.js";
import tabLayer from "./tab_layer.js";
import tabSwim from "./tab_swim.js";
import tabData from "./tab_data.js";
import tabGuide from "./tab_guide.js";

const $ = (s) => document.querySelector(s);
const TABS = [tabMain, tabAmr, cellTab("3D", "③ 3D 스캔 셀"), cellTab("2D", "④ 2D 비전 셀"), cellTab("UT", "⑤ 초음파 셀"), tabLayer, tabSwim, tabData, tabGuide];
const STAGE_COL = { in: "#8b95ab", "3D": "#3b6fd6", an: "#9b8cff", "2D": "#3bb08a", UT: "#d69a3b", qc: "#ff6b6b", out: "#8b95ab" };
const cache = {};

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

async function loadScenario(sid) {
  if (!cache[sid]) cache[sid] = await api("/api/scenario/" + sid);
  S.sid = sid;
  S.sc = cache[sid];
  S.t = 0;
  S.playing = false;
  drawTimeline();
  TABS.forEach((t) => t.onScenario());
  updateButtons();
}

function drawTimeline() {
  const sc = S.sc, T = sc.T;
  $("#tl").innerHTML = sc.stages.map((s) => {
    const a = Math.max(0, s.t0), b = Math.min(T, s.t1);
    return `<div class="st" style="left:${(a / T) * 100}%;width:${((b - a) / T) * 100}%;background:${STAGE_COL[s.id] || "#555"}" title="${esc(s.name)} ${fmtT(a)}–${fmtT(b)}">${esc(s.name)}</div>`;
  }).join("") + sc.events.filter((e) => e.redo || e.cls === "ng").map((e) => `<div class="tick ng" style="left:${(e.t / T) * 100}%" title="${esc(e.log)}"></div>`).join("") + '<div id="head"></div>';
}

function updateButtons() {
  $("#play").textContent = S.playing ? "⏸ 일시정지" : S.t >= S.sc.T ? "↻ 다시 재생" : "▶ 재생";
}

function seek(t, pause = false) {
  S.t = clamp(t, 0, S.sc.T);
  if (pause) S.playing = false;
  updateButtons();
}

function step(dir) {
  const F = S.sc.F;
  let j = -1;
  F.forEach((f, i) => { if (f.t <= S.t + 1e-6) j = i; });
  const tgt = dir > 0 ? F[j + 1] : (F[j] && Math.abs(F[j].t - S.t) < 1e-3 ? F[j - 1] : F[j]);
  seek(tgt ? tgt.t + 1e-4 : dir > 0 ? S.sc.T : 0, true);
}

function showTab(id) {
  S.tab = id;
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === id));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.id === "t-" + id));
  const t = TABS.find((x) => x.id === id);
  t.onShow();
  t.render();
}

let last = null;
function frame(ts) {
  if (S.playing) {
    if (last != null) S.t = Math.min(S.sc.T, S.t + ((ts - last) / 1000) * S.speed);
    last = ts;
    if (S.t >= S.sc.T) { S.playing = false; updateButtons(); }
  } else last = null;
  $("#clock").textContent = `${fmtT(S.t)} / ${fmtT(S.sc.T)}`;
  $("#head").style.left = (S.t / S.sc.T) * 100 + "%";
  TABS.find((x) => x.id === S.tab).render();
  requestAnimationFrame(frame);
}

async function start() {
  try {
    S.codes = await api("/api/codes");
    const all = await Promise.all(["S1", "S2", "S3"].map((s) => api("/api/scenario/" + s)));
    ["S1", "S2", "S3"].forEach((s, i) => (cache[s] = all[i]));
  } catch (e) {
    $("#conn").textContent = "서버 연결 실패: " + e.message;
    return;
  }
  $("#conn").textContent = "서버 연결됨";
  $("#scen").innerHTML = ["S1", "S2", "S3"].map((s) => `<option value="${s}">${esc(cache[s].def.name)}</option>`).join("");
  $("#tabs").innerHTML = TABS.map((t) => `<button role="tab" data-tab="${t.id}">${esc(t.label)}</button>`).join("");
  $("#panes").innerHTML = TABS.map((t) => `<section class="pane" id="t-${t.id}"></section>`).join("");
  TABS.forEach((t) => t.mount($("#t-" + t.id)));

  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
  $("#scen").onchange = async (e) => { await loadScenario(e.target.value); showTab(S.tab); };
  $("#play").onclick = () => { if (S.t >= S.sc.T) S.t = 0; S.playing = !S.playing; updateButtons(); };
  $("#speed").onchange = (e) => (S.speed = +e.target.value);
  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  $("#fs").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  $("#tl").addEventListener("click", (e) => { const r = $("#tl").getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * S.sc.T); });
  document.addEventListener("seek", (e) => seek(e.detail, true));
  window.addEventListener("resize", () => TABS.forEach((t) => t.resize()));
  document.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === " ") { e.preventDefault(); $("#play").click(); }
  });

  $("#speed").value = String(S.speed);
  await loadScenario("S1");
  showTab("main");
  requestAnimationFrame(frame);
}

start();
