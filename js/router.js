// Hash router：#/grammar/:id 之類
import * as tts from './tts.js';
const routes = [];
const leave = [];
const listeners = [];
let seq = 0;
export function route(pattern, fn) { routes.push({ parts: pattern.split('/').filter(Boolean), fn }); }
export const onLeave = (fn) => leave.push(fn);
export const onRoute = (fn) => listeners.push(fn);
export const go = (hash) => { location.hash = hash; };
export const currentPath = () => (location.hash.replace(/^#/, '') || '/home').split('?')[0];

function match(segs) {
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    if (r.parts.every((p, i) => (p[0] === ':' ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]))) return { r, params };
  }
  return null;
}
export async function render(app) {
  const my = ++seq;
  leave.splice(0).forEach((f) => { try { f(); } catch (e) {} });
  tts.stop();
  const [path, q] = (location.hash.replace(/^#/, '') || '/home').split('?');
  const m = match(path.split('/').filter(Boolean)) || match(['home']);
  let node;
  try { node = await m.r.fn({ params: m.params, query: new URLSearchParams(q || '') }); }
  catch (e) { console.error(e); node = errorView(); }
  if (my !== seq) return;
  app.replaceChildren(node);
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true }); // 換頁後焦點移到主內容（讀屏從頭讀）
  listeners.forEach((f) => f(path));
}
// 錯誤畫面：不顯示技術訊息，給重新整理鍵（詳細在 console）
function errorView() {
  const box = document.createElement('div'); box.className = 'empty';
  const p = document.createElement('p'); p.textContent = 'うまく表示できませんでした。もう一度読み込んでください。/ 畫面載入失敗，請重新整理。';
  const b = document.createElement('button'); b.className = 'btn primary'; b.type = 'button'; b.textContent = '再読み込み / 重新整理';
  b.onclick = () => location.reload();
  const a = document.createElement('a'); a.className = 'btn'; a.href = '#/home'; a.textContent = 'ホームへ';
  const row = document.createElement('div'); row.className = 'center'; row.append(b, a);
  box.append(p, row);
  return box;
}
export function start(app) {
  window.addEventListener('hashchange', () => render(app));
  render(app);
}
