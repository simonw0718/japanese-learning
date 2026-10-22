// 小型 DOM 工具與共用元件
import { settings } from './store.js';
import { renderJa } from './ruby.js';
import * as tts from './tts.js';
import * as db from './db.js';

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e;
}
// replaceChildren は null を "null" という文字にしてしまう → null／false を除いてから入れる
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
export const frag = (...kids) => { const f = document.createDocumentFragment(); kids.flat(Infinity).forEach((k) => k && f.append(k)); return f; };

// 日文（含振假名）元素
export function jaEl(item, field = 'ja', tag = 'span', cls = 'ja') {
  return h(tag, { class: cls, lang: 'ja', html: renderJa(item, field) });
}
export function ttsBtn(text, label = '発音') {
  const b = h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); tts.speak(typeof text === 'function' ? text() : text); } }, '🔊');
  return b;
}
// 單字發音：有音檔用表記 key，否則合成讀音
export const wordBtn = (v, label = '発音') => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); tts.speakWord(v); } }, '🔊');
// AI作成：タップで説明（未確認の内容であること＋⚑で報告できること）
export function aiBadge(item) {
  if (!item || !item.review || item.review === 'human_checked') return null;
  return h('button', { class: 'ai-badge', type: 'button', 'aria-label': 'AI作成：説明を見る', onclick: (e) => { e.stopPropagation(); toast('AIが作った内容で、まだ人が確認していません。おかしい所は「⚑ おかしい」で教えてください。/ AI 產生、尚未人工確認', null, 5000); } }, 'AI作成');
}
export function flagBtn(id) {
  let key = null, rec = null;
  const b = h('button', { class: 'flag-btn', type: 'button', onclick: async () => {
    if (b.dataset.done) return;
    rec = { item_id: id, ts: Date.now(), note: '' };
    key = await db.addFlag(rec);
    b.dataset.done = 1; b.textContent = '⚑ 報告済み / 已回報';
    toast('報告しました。ありがとう / 已回報', { label: '取り消す', run: async () => {
      await db.delFlag(key, rec);
      delete b.dataset.done; b.textContent = '⚑ おかしい';
      toast('取り消しました / 已撤回');
    } }, 5000);
  } }, '⚑ おかしい');
  return b;
}
// 中文ヒント：設定 off なら何も出さない。on ならタップで表示。
// 文案は「中」に統一（label 引数は互換のため残すが使わない）
export function zhToggle(text) {
  if (!settings().zh || !text) return { btn: null, box: null };
  const box = h('div', { class: 'zh', hidden: true }, text);
  const btn = h('button', { class: 'zh-btn', type: 'button', 'aria-expanded': 'false', 'aria-label': '中文を表示 / 顯示中文', onclick: () => { box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden)); } }, '中');
  return { btn, box };
}
export const chip = (t, cls = '') => h('span', { class: 'chip ' + cls }, t);
export const bar = (frac, label = '進み具合') => h('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.max(0, Math.min(1, frac)) * 100) }, h('i', { style: `width:${Math.max(0, Math.min(1, frac)) * 100}%` }));
// back を省略した分頁根頁（ホーム・文法・単語・その他）は返回鍵なし
export const pageHead = (title, back, extra) => h('header', { class: 'page-head' }, back ? h('a', { class: 'back', href: back, 'aria-label': '戻る' }, '‹') : null, h('h1', null, title), extra);
export const empty = (msg) => h('p', { class: 'empty' }, msg);

let toastEl, toastT;
// action={label, run}：toast 内のボタン（取り消す等）。拇指熱區より上に出す
export function toast(msg, action, ms = 2600) {
  toastEl?.remove(); clearTimeout(toastT);
  const el = toastEl = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
    action ? h('button', { class: 'toast-act', type: 'button', onclick: () => { el.remove(); action.run(); } }, action.label) : null);
  document.body.append(el);
  toastT = setTimeout(() => el.remove(), ms);
}
// 分段鈕（aria-pressed 付き）。opts=[[value,label]]、get()=現在値、set(v)
export function segGroup(opts, get, set, label) {
  const box = h('div', { class: 'segs small', role: 'group', 'aria-label': label });
  const draw = () => box.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', class: 'seg' + (get() === v ? ' on' : ''), 'aria-pressed': String(get() === v), onclick: () => { set(v); draw(); } }, t)));
  draw();
  return box;
}
export function confirmDialog(msg, ok = 'OK', cancel = 'キャンセル / 取消') {
  return new Promise((res) => {
    const prev = document.activeElement;
    const close = (v) => { ov.remove(); prev && prev.focus && prev.focus({ preventScroll: true }); res(v); };
    const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } } },
      h('div', { class: 'dialog' }, h('p', null, msg), h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => close(false) }, cancel),
        h('button', { class: 'btn primary', onclick: () => close(true) }, ok))));
    document.body.append(ov);
    ov.querySelector('.primary').focus();
  });
}
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); // iOS Safari：立刻 revoke 會下載失敗，稍後再釋放
}

// 🎤 口説ボタン（SpeechRecognition 非対応なら null）
import * as speech from './speech.js';
export function micBtn(target) {
  if (!speech.supported) return null;
  const out = h('div', { class: 'mic-out', hidden: true });
  const btn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '話す', title: '話す', onclick: async (e) => {
    e.stopPropagation();
    btn.disabled = true; btn.textContent = '…';
    out.hidden = false; out.textContent = '聞いています… / 聆聽中';
    try {
      const said = await speech.listen();
      const pct = speech.similarity(said, target);
      out.replaceChildren(h('div', null, '認識：', h('b', null, said || '（聞き取れず）')), h('div', null, '目標：', target), h('div', { class: pct >= 80 ? 'ok' : 'ng' }, `一致度 ${pct}%`));
    } catch (err) { out.textContent = '認識できませんでした（' + err.message + '）'; }
    btn.disabled = false; btn.textContent = '🎤';
  } }, '🎤');
  return h('span', { class: 'mic' }, btn, out);
}
