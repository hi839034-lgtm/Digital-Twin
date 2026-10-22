// 데이터 불러오기. 서버가 있으면 /api/... 로 받고, 단일 HTML 로 내보낸 파일이면
// window.__DT_DATA__ 에 내장된 같은 경로의 데이터를 쓴다 (서버 없이 더블클릭으로 열림).
const EMBED = typeof window !== "undefined" ? window.__DT_DATA__ : null;

export const isEmbedded = !!EMBED;

export async function getJSON(path) {
  if (EMBED) {
    if (!(path in EMBED.json)) throw new Error("내장 데이터에 없음: " + path);
    return EMBED.json[path];
  }
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

export async function getBlob(path) {
  if (EMBED) {
    const b = EMBED.blob[path];
    if (!b) throw new Error("내장 데이터에 없음: " + path);
    const bin = atob(b.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: b.type });
  }
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.blob();
}
