// ⑦ 데이터 코드 · 저장 형식: 데이터 사전 D00–D30 · 세부 코드 · 저장 위치
import { S, catOf, esc, fmtT, layerName, sent, sentAt } from "./state.js";
import { hasPreview, preview, sampleRecord } from "./plots.js";

const STORE = { E: "엣지", O: "객체 저장소", M: "메타 DB" };
const storeText = (s) => s.replace(/[EOM]/g, (c) => STORE[c]).replace(/\+/g, " + ").replace(/→/g, " → ").replace(/,/g, ", ");
const CATN = { geo: "형상", img: "영상", wave: "파형", ts: "시계열", res: "판정 · 결과", meta: "메타 · 명령" };

let root, key = "", pick = null, q = "";

export default {
  id: "data", label: "⑦ 데이터 코드 · 저장 형식",
  mount(el) {
    root = el;
    root.innerHTML = `<div class="bar2"><input id="q" placeholder="코드 · 이름 검색 (예: D14, 점군, 초음파)" style="min-width:260px">
      <span class="muted">켜진 코드 = 지금까지 전송됨 · D27~D30 = 플랫폼 확장안</span></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);align-items:start" id="dg">
        <div class="card" style="overflow:auto;max-height:calc(100vh - 290px)"><table id="tb"></table></div>
        <div class="card" id="dt" style="position:sticky;top:0"></div></div>`;
    root.querySelector("#q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); key = ""; this.render(); });
    root.addEventListener("click", (e) => { const r = e.target.closest("[data-c]"); if (r) { pick = r.dataset.c; key = ""; this.render(); } });
  },
  onScenario() { key = ""; },
  onShow() { key = ""; },
  resize() {},
  render() {
    const t = S.t;
    const nSent = S.codes.codes.filter((d) => sent(d.code, t)).length;
    const k = nSent + "|" + pick + "|" + q + "|" + S.sid;
    if (k === key) return;
    key = k;
    const list = S.codes.codes.filter((d) => !q || (d.code + d.name + d.desc + d.format + d.sub.map((s) => s.code + s.name + s.detail).join("")).toLowerCase().includes(q));
    root.querySelector("#tb").innerHTML = `<tr><th>코드</th><th>이름</th><th>형식</th><th>종류</th><th>원천 계층</th><th>이번 시나리오 첫 전송</th></tr>` +
      list.map((d) => { const a = sentAt(d.code), on = a != null && a <= t;
        return `<tr class="click ${pick === d.code ? "sel" : ""}" data-c="${d.code}"><td><span class="chip on cat-${d.category}">${d.code}</span>${d.extension ? ' <span class="pill wait">확장</span>' : ""}</td>
          <td>${esc(d.name)}</td><td class="muted">${esc(d.format)}</td><td class="cat-${d.category}">${CATN[d.category]}</td><td class="muted">${esc(layerName(d.source_layer))}</td>
          <td>${a == null ? '<span class="muted">미사용</span>' : on ? `<span class="pill ok">${fmtT(a)}</span>` : `<span class="muted">${fmtT(a)} 예정</span>`}</td></tr>`; }).join("");
    const d = S.codes.codes.find((x) => x.code === pick);
    root.querySelector("#dt").innerHTML = d ? `<h3 style="font-size:15px;color:var(--text)"><span class="chip on cat-${d.category}">${d.code}</span> ${esc(d.name)}${d.extension ? " (플랫폼 확장안)" : ""}</h3>
      <div>${esc(d.desc)}</div>
      <table style="margin-top:8px"><tr><th>형식</th><td>${esc(d.format)}</td></tr><tr><th>저장 위치</th><td>${esc(storeText(d.storage))}</td></tr>
      <tr><th>원천 계층</th><td>${esc(layerName(d.source_layer))}</td></tr><tr><th>종류</th><td class="cat-${catOf(d.code)}">${CATN[d.category]}</td></tr></table>
      <h3 style="margin-top:12px">세부 코드 ${d.sub.length}개</h3>
      <table>${d.sub.map((s) => { const a = sentAt(s.code); return `<tr><td><span class="chip ${a != null && a <= t ? "on" : ""} cat-${d.category}">${s.code}</span></td><td>${esc(s.name)}<br><span class="muted">${esc(s.detail)}</span></td></tr>`; }).join("")}</table>
      <h3 style="margin-top:12px">${hasPreview(d) ? "데이터 미리보기" : "예시 레코드"}</h3>
      ${hasPreview(d) ? '<canvas id="dprev" style="width:100%;height:220px;display:block;border-radius:6px"></canvas>' : `<pre style="margin:0;max-height:260px;overflow:auto;background:var(--bg);padding:8px;border-radius:6px;font-size:12px">${esc(JSON.stringify(sampleRecord(d), null, 1))}</pre>`}`
      : '<span class="muted">왼쪽 표에서 코드를 누르면 세부 정보가 나옵니다.</span>';
    if (d && hasPreview(d)) preview(d, root.querySelector("#dprev"));
  },
};
