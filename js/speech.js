// 口説：SpeechRecognition（不支援時不顯示按鈕）
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const supported = !!SR;

export function listen() {
  return new Promise((res, rej) => {
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => res(e.results[0][0].transcript);
    r.onerror = (e) => rej(new Error(e.error));
    r.onnomatch = () => res('');
    try { r.start(); } catch (e) { rej(e); }
  });
}
const norm = (s) => String(s).replace(/[\s、。！？!?,.　「」（）()\{\}]/g, '');
// 字元層級相似度（Levenshtein）
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a.length && !b.length) return 100;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.round((1 - prev[n] / Math.max(m, n)) * 100);
}
