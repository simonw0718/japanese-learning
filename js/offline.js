// 離線音檔：把音檔 fetch 進 Service Worker 的 AUDIO 快取（jp-audio-*），顯示進度
import { h, toast } from './ui.js';
import * as tts from './tts.js';

export const supported = typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
const abs = (u) => new URL(u, location.href).href;
const audioCacheName = async () => (await caches.keys()).find((k) => k.startsWith('jp-audio-')) || null;

// 已下載的 URL（Set of 絕對 URL）：直接看 AUDIO 快取的鍵，一次取完（比逐一 match 快）
export async function cachedUrls() {
  if (!supported) return new Set();
  try {
    const out = new Set();
    for (const k of await caches.keys()) if (k.startsWith('jp-audio-')) for (const r of await (await caches.open(k)).keys()) out.add(r.url);
    return out;
  } catch (e) { return new Set(); }
}
export async function countCached(urls) { const have = await cachedUrls(); return urls.filter((u) => have.has(abs(u))).length; }

// 依序下載（同時 jobs 個）。onProgress(done, total, fail)。stop() 回傳 true 時中止
export async function fetchAll(urls, { onProgress, stop = () => false, jobs = 4 } = {}) {
  const have = await cachedUrls();
  const todo = urls.filter((u) => !have.has(abs(u)));
  const total = urls.length;
  let done = total - todo.length, fail = 0, i = 0;
  const viaSw = !!navigator.serviceWorker.controller;
  const name = viaSw ? null : await audioCacheName(); // SW 尚未接管（首次開啟）時自己寫進快取
  if (!viaSw && !name) throw new Error('Service Worker が有効になっていません。いったん再読み込みしてください / 請重新整理後再試');
  const cache = name ? await caches.open(name) : null;
  onProgress && onProgress(done, total, fail);
  const worker = async () => {
    while (i < todo.length && !stop()) {
      const u = abs(todo[i++]);
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error(r.status);
        if (cache) await cache.put(u, r); else await r.arrayBuffer(); // SW が AUDIO に保存済み
        done++;
      } catch (e) { fail++; }
      onProgress && onProgress(done, total, fail);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
  return { done, total, fail, stopped: stop() };
}

// 「音声をダウンロード」ボタン（会話・読解・聴解ページ用）。getTexts()＝その課の全文
export function dlButton(getTexts, label = '⤓ 音声をダウンロード / 下載音檔') {
  const status = h('small', { class: 'muted dl-status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn', type: 'button', onclick: () => run() }, label);
  const box = h('div', { class: 'dl-box', hidden: true }, btn, status);
  let urls = [];
  const doneUi = () => { btn.textContent = '✓ ダウンロード済み / 已下載（オフラインで聞けます）'; btn.disabled = true; status.textContent = ''; };
  (async () => {
    if (!supported) return;
    await tts.audioReady;
    urls = [...new Set(getTexts().map((t) => tts.audioUrl(t)).filter(Boolean))];
    if (!urls.length) return;
    box.hidden = false;
    const n = await countCached(urls);
    if (n >= urls.length) doneUi(); else if (n) status.textContent = `${n} / ${urls.length} 件 保存済み`;
  })();
  async function run() {
    if (navigator.onLine === false) { toast('オフラインです。ネットにつないでから / 目前離線，請連網後再下載'); return; }
    btn.disabled = true;
    try {
      const r = await fetchAll(urls, { onProgress: (d, t) => { status.textContent = `ダウンロード中… ${d} / ${t}`; } });
      if (r.fail) { btn.disabled = false; status.textContent = `${r.done} / ${r.total} 件（失敗 ${r.fail} 件：もう一度押してください / 有 ${r.fail} 件失敗，請再按一次）`; } else doneUi();
    } catch (e) { btn.disabled = false; status.textContent = e.message; }
  }
  return box;
}

// 設定頁：全部音檔（約 N MB）
export function allAudioSection() {
  const info = tts.audioInfo();
  const mb = (b) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0);
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' }, '');
  let running = false, stopFlag = false;
  const btn = h('button', { class: 'btn', type: 'button', onclick: () => (running ? (stopFlag = true) : run()) }, `⤓ 全部の音声をダウンロード（約 ${mb(info.bytes)} MB）/ 下載全部音檔`);
  const urls = tts.allAudioUrls();
  const refresh = async () => { const n = await countCached(urls); status.textContent = `保存済み ${n} / ${urls.length} 件 / 已下載 ${n} 件`; if (n >= urls.length) { btn.textContent = '✓ 全部ダウンロード済み / 已全部下載'; btn.disabled = true; } };
  async function run() {
    if (navigator.onLine === false) { toast('オフラインです / 目前離線'); return; }
    running = true; stopFlag = false; btn.textContent = '■ 中止 / 停止';
    try {
      const r = await fetchAll(urls, { jobs: 6, stop: () => stopFlag, onProgress: (d, t, f) => { status.textContent = `ダウンロード中… ${d} / ${t}${f ? `（失敗 ${f}）` : ''}`; } });
      running = false;
      btn.textContent = `⤓ 全部の音声をダウンロード（約 ${mb(info.bytes)} MB）/ 下載全部音檔`;
      await refresh();
      if (r.fail && !r.stopped) status.textContent += ` ・ 失敗 ${r.fail} 件：もう一度押すと続きから / 再按一次從中斷處繼續`;
    } catch (e) { running = false; status.textContent = e.message; }
  }
  if (!supported || !urls.length) return h('p', { class: 'muted small' }, supported ? '音声ファイルがありません / 沒有音檔' : 'このブラウザではオフライン保存ができません / 此瀏覽器不支援離線儲存');
  refresh();
  return h('div', null,
    h('p', { class: 'muted small' }, `通勤中など電波がなくても聞けるように、音声を端末に保存します（${urls.length} 件・約 ${mb(info.bytes)} MB${info.est ? '・概算' : ''}）。Wi-Fi で。/ 下載後離線也能播放，建議用 Wi-Fi`),
    btn, status);
}
