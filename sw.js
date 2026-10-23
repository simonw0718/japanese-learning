// Service worker：VERSION 與 SHELL_FILES 由 tools/bump_sw.py 產生（改檔後執行一次）
// VERSION 格式 <hash>-a<n>：n 為音檔快取版本，只有手動改 n 才會清掉已下載的音檔
const VERSION = '399a18ad-a1';
const SHELL = `jp-shell-${VERSION}`;
const DATA = `jp-data-${VERSION}`;
const AUDIO = `jp-audio-${VERSION.split('-a').pop()}`;
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const SHELL_FILES = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'vendor/ts-fsrs.umd.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/icon.svg', 'js/backup.js', 'js/data.js', 'js/day.js', 'js/db.js', 'js/logic.js', 'js/main.js', 'js/offline.js',
  'js/plan.js', 'js/router.js', 'js/ruby.js', 'js/session.js', 'js/speech.js', 'js/srs.js', 'js/store.js', 'js/tts.js', 'js/ui.js',
  'js/views/dialogue.js', 'js/views/grammar.js', 'js/views/home.js', 'js/views/jlpt.js', 'js/views/keigo.js', 'js/views/more.js',
  'js/views/reading.js', 'js/views/review.js', 'js/views/settings.js', 'js/views/vocab.js'];
// 資料檔清單來自 data/manifest.json（新增內容檔不必改 sw.js）
const dataFiles = () => fetch(req('data/manifest.json')).then((r) => r.json()).then((m) => ['data/manifest.json', ...[...new Set(Object.values(m.sets || {}).flat())].map((f) => `data/${f}`)]);

// cache:'reload' 繞過 HTTP 快取，確保拿到新版
const req = (f) => new Request(f, { cache: 'reload' });
// 外殼檔缺一個就讓安裝失敗（舊版 SW 繼續服務）；資料檔失敗只警告（缺檔時 app 仍可用）
const addShell = () => caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map(req)));
const addData = () => Promise.all([caches.open(DATA), dataFiles().catch(() => [])]).then(([c, files]) =>
  Promise.all([...files, 'audio/manifest.json'].map((f) => c.add(req(f)).catch((err) => console.warn('precache data failed', f, err)))));

self.addEventListener('install', (e) => { e.waitUntil(Promise.all([addShell(), addData()])); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA, AUDIO].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

async function swr(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}
// 白名單：只快取外殼檔（SHELL_FILES）＋ data/ ＋ icons/；其他（音檔以外的雜項、tools/、doc/…）直接走網路、不進快取
const SCOPE = new URL('./', self.location).pathname;
const SHELL_SET = new Set(SHELL_FILES.map((f) => (f === './' ? '' : f)));
const relPath = (url) => (url.pathname.startsWith(SCOPE) ? url.pathname.slice(SCOPE.length) : null);
const cacheable = (p) => p != null && (SHELL_SET.has(p) || /^(data|icons)\//.test(p));
async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try { const r = await fetch(req); if (r.ok) cache.put(req, r.clone()); return r; } catch (e) { return (await cache.match('index.html')) || Response.error(); }
}
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try { const r = await fetch(req); if (r.ok) cache.put(req, r.clone()); return r; } catch (e) { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
}
// 音檔：用到才下載、存進 AUDIO 快取；Safari 會送 Range 請求 → 從完整檔切出 206
async function audio(request) {
  const url = request.url.split('#')[0];
  const cache = await caches.open(AUDIO);
  let full = await cache.match(url);
  if (!full) {
    try { const r = await fetch(url); if (!r.ok || r.status !== 200) return r; await cache.put(url, r.clone()); full = r; } catch (e) { return Response.error(); }
  }
  const range = request.headers.get('range');
  if (!range) return full;
  const buf = await full.clone().arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; } // bytes=-N
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${buf.byteLength}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': full.headers.get('Content-Type') || 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/audio\/[^/]+\.m4a$/.test(url.pathname)) return e.respondWith(audio(req));
  if (/\/(data|tools\/fixtures)\/[^/]+\.json$/.test(url.pathname) || /\/audio\/manifest\.json$/.test(url.pathname)) return e.respondWith(swr(req, DATA));
  if (!cacheable(relPath(url))) { // 白名單外：直接走網路、不快取（離線時頁面導覽退回 index.html）
    if (req.mode === 'navigate') e.respondWith(fetch(req).catch(async () => (await caches.match('index.html')) || Response.error()));
    return;
  }
  e.respondWith(DEV ? networkFirst(req) : cacheFirst(req));
});
