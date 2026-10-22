// 語音：有預錄音檔（audio/manifest.json）就用 <audio> 播放，否則用瀏覽器語音合成
// 合成：等 voiceschanged、挑日文聲音、點擊解鎖、依句切分、取消用 token（不使用 pause/resume）
import { settings } from './store.js';
import { audioKey } from './logic.js';
const synth = window.speechSynthesis;
export const supported = !!synth;
let voices = [];
let token = 0;
const load = () => { if (synth) voices = synth.getVoices(); };

export const ready = new Promise((res) => {
  if (!synth) return res();
  load();
  if (voices.length) return res();
  synth.addEventListener('voiceschanged', () => { load(); res(); }, { once: true });
  setTimeout(() => { load(); res(); }, 1500);
});
if (synth) synth.addEventListener('voiceschanged', load);

// Apple 系統語音（Kyoko／Otoya 等）授權僅限個人使用 → 一律排除（iOS 上等於沒有合成語音，只播音檔）
const APPLE = /kyoko|otoya|hattori|o-ren|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;
export const isApple = (v) => /com\.apple/i.test(v.voiceURI || '') || APPLE.test(v.name || '');
export const jaVoices = () => voices.filter((v) => /^ja/i.test((v.lang || '').replace('_', '-')) && !isApple(v));
export const hasJaVoice = () => jaVoices().length > 0;
function score(v) {
  const n = v.name;
  return /google.*(日本語|japanese)/i.test(n) ? 2 : /microsoft/i.test(n) ? 1 : 0;
}
function pickVoice() {
  const ja = jaVoices();
  return ja.find((v) => v.name === settings().voice) || ja.sort((a, b) => score(b) - score(a))[0] || null; // null＝不合成
}
// 第一次點擊時解鎖（iOS 需要）
let unlocked = false;
export function unlock() {
  if (unlocked || !synth) return;
  unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {}
}
document.addEventListener('pointerdown', unlock, { capture: true, once: true });

const clean = (t) => String(t).replace(/\{[^}]*\}/g, '').replace(/[（(][　\s]*[）)]/g, '').trim();
export const split = (t) => clean(t).match(/[^。！？!?]+[。！？!?]*/g) || [];

// ---- 預錄音檔 ----
let keys = new Set(), audioVoice = '';
export const audioReady = fetch('audio/manifest.json').then((r) => (r.ok ? r.json() : null))
  .then((m) => { if (m && Array.isArray(m.keys)) { keys = new Set(m.keys); audioVoice = m.voice || ''; } }).catch(() => {});
export const audioInfo = () => ({ has: keys.size > 0, voice: audioVoice, n: keys.size });
function fileOf(t) {
  if (!keys.size || t == null) return null;
  for (const x of new Set([String(t).trim(), clean(t)])) { const k = audioKey(x); if (keys.has(k)) return `audio/${k}.m4a`; }
  return null;
}
export const hasAudio = (t) => !!fileOf(t);

let el = null; // 共用一個 <audio>（iOS 鎖屏時可連續播放）
const player = () => (el ||= Object.assign(new Audio(), { preload: 'auto' }));
let cut = null; // 中斷目前播放
let paused = false, resumeWait = [];
let skip = 0; // nexttrack 用：跳過目前這句
function playFile(url, rate, my) {
  return new Promise((res) => {
    if (my !== token) return res(true);
    const a = player();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; a.onended = a.onerror = null; cut = null; res(ok); };
    a.onended = () => fin(true);
    a.onerror = () => fin(false);
    cut = () => { a.pause(); fin(true); };
    a.defaultPlaybackRate = rate; // 換 src 會重設 playbackRate
    a.src = url;
    a.playbackRate = rate; a.preservesPitch = a.webkitPreservesPitch = true;
    const p = a.play();
    if (p) p.catch(() => fin(false)); // 自動播放被擋 → 退回合成
  });
}

function say(chunk, rate, my) {
  return new Promise((res) => {
    if (my !== token) return res();
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = 'ja-JP';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    let done = false;
    const fin = () => { if (!done) { done = true; clearTimeout(wd); res(); } };
    u.onend = u.onerror = fin;
    const wd = setTimeout(fin, chunk.length * 500 / rate + 4000); // Chrome 偶爾不觸發 end
    synth.speak(u);
  });
}
async function sayText(text, rate, my) {
  const s = skip;
  for (const c of split(text)) { if (my !== token || s !== skip) return; await say(c, rate, my); }
}
// 一段文字：有音檔播音檔（失敗則合成）；fallback＝合成時改唸的文字（單字用讀音）
async function sayOne(text, rate, my, fallback) {
  const f = fileOf(text);
  if (f && (await playFile(f, rate, my))) return;
  if (my !== token) return;
  // 沒有可用的非 Apple 聲音：不唸（絕不交給系統預設聲音），通知畫面
  if (!synth || !pickVoice()) { window.dispatchEvent(new CustomEvent('tts-missing', { detail: text })); return; }
  await sayText(fallback || text, rate, my);
}
function halt() { if (synth) synth.cancel(); if (cut) cut(); paused = false; resumeWait.splice(0).forEach((f) => f()); }

export async function speak(text, rate = settings().rate, fallback) {
  const my = ++token;
  halt();
  await sayOne(text, rate, my, fallback);
}
// 單字：音檔以表記為 key；沒有音檔時合成「讀音」（避免漢字誤讀）
export const speakWord = (v, rate) => speak(v.surface || v.reading, rate, v.reading);

// ---- 連續播放（會話全部再生／耳だけ／全文を聞く）----
const waitResume = () => (paused ? new Promise((r) => resumeWait.push(r)) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let owner = 0; // 目前擁有 Media Session 的序列
const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
function mediaSession() {
  if (!ms) return { line() {}, end() {} };
  const set = (k, f) => { try { ms.setActionHandler(k, f); } catch (e) {} };
  set('play', () => { paused = false; ms.playbackState = 'playing'; if (el && el.src && el.paused && cut) el.play().catch(() => {}); if (synth) synth.resume(); resumeWait.splice(0).forEach((f) => f()); });
  set('pause', () => { paused = true; ms.playbackState = 'paused'; if (el) el.pause(); if (synth) synth.pause(); });
  set('nexttrack', () => { skip++; paused = false; if (cut) cut(); else if (synth) synth.cancel(); resumeWait.splice(0).forEach((f) => f()); });
  ms.playbackState = 'playing';
  return {
    line(title, texts, i) { try { ms.metadata = new MediaMetadata({ title: clean(texts[i]).slice(0, 60), artist: '日本語ふくしゅう', album: `${title || ''} ${i + 1}/${texts.length}`.trim() }); } catch (e) {} },
    end() { ['play', 'pause', 'nexttrack'].forEach((k) => set(k, null)); ms.playbackState = 'none'; },
  };
}
// 鎖屏（頁面隱藏）時不等間隔：計時器可能被暫停，直接接下一句
const pause = (t, nextText) => (t && !(hasAudio(nextText) && document.visibilityState === "hidden") ? sleep(t) : null);
async function runLines(texts, { rate, gap, onLine, title }, my, m) {
  for (let i = 0; i < texts.length; i++) {
    if (my !== token) return false;
    await waitResume();
    if (my !== token) return false;
    if (onLine) onLine(i);
    m.line(title, texts, i);
    await sayOne(texts[i], rate, my);
    await waitResume();
    await pause(gap, texts[i + 1]);
  }
  return my === token;
}
// 依序播放多句；onLine(i) 通知目前句；回傳 true 表示完整播完
export async function playSequence(texts, { rate = settings().rate, gap = 450, onLine, title = '' } = {}) {
  const my = ++token;
  halt();
  owner = my;
  const m = mediaSession();
  try { return await runLines(texts, { rate, gap, onLine, title }, my, m); } finally { if (owner === my) m.end(); }
}
// 播放清單（耳だけ）：groups=[{title, texts}]，從 start 開始依序播 count 段（Infinity＝循環）
// 同一個 token／Media Session 連續播放，鎖屏時也能接下一段。onGroup(gi, n)、onGroupDone(gi, n)
export async function playPlaylist(groups, { start = 0, count = 1, rate = settings().rate, gap = 800, groupGap = 1600, onGroup, onLine, onGroupDone } = {}) {
  if (!groups.length) return 0;
  const my = ++token;
  halt();
  owner = my;
  const m = mediaSession();
  let n = 0;
  try {
    while (n < count && my === token) {
      const gi = (start + n) % groups.length, g = groups[gi];
      if (onGroup) onGroup(gi, n);
      if (!(await runLines(g.texts, { rate, gap, onLine, title: g.title }, my, m))) break;
      n++;
      if (onGroupDone) onGroupDone(gi, n);
      if (n < count) await pause(groupGap, groups[(start + n) % groups.length].texts[0]);
    }
    return n;
  } finally { if (owner === my) m.end(); }
}
export const speakSeq = playSequence; // 舊名

export function stop() { token++; halt(); }
