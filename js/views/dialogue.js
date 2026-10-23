import { h, pageHead, empty, chip, aiBadge, flagBtn, ttsBtn, jaEl, zhToggle, micBtn, segGroup } from '../ui.js';
import * as D from '../data.js';
import * as db from '../db.js';
import * as tts from '../tts.js';
import { settings, setSetting } from '../store.js';
import { createSession } from '../session.js';
import { markDay, dayKey } from '../srs.js';
import { buildPlan } from '../plan.js';
import { dlButton } from '../offline.js';

// 題目本身的音檔（即時応答・発話表現・概要理解）
const listenTexts = (q) => q.jlpt === 'sokuji' ? [q.prompt_ja, ...q.choices] : q.jlpt === 'hatsuwa' ? [q.situation_ja, ...q.choices] : q.jlpt === 'gaiyo' ? [...(q.script || []).map((l) => l.ja), q.stem] : [];
const isMe = (d, t) => (t.role ? t.role === 'me' : t.spk === d.me);
async function done() { await markDay(); await db.setMeta('dlg_done', dayKey()); }

const speedSeg = () => segGroup([0.7, 0.85, 1.0].map((r) => [r, '×' + r.toFixed(2).replace(/0$/, '')]), () => settings().rate, (r) => setSetting('rate', r), '速度 / 語速');

// 一個對話泡泡：平常只露出 🔊；🎤 與「中」收進「⋯」。hidden＝角色扮演時遮住自己的台詞
function bubble(d, t, { hidden = false } = {}) {
  const me = isMe(d, t);
  const z = zhToggle(t.zh);
  const mic = micBtn(t.ja);
  const text = h('div', { class: 'b-text' }, jaEl(t));
  const extra = mic || z.btn ? h('div', { class: 'b-more', hidden: true }, mic, z.btn) : null;
  const moreBtn = extra ? h('button', { class: 'icon-btn more-btn', type: 'button', 'aria-label': 'その他の操作（話す・中文）', 'aria-expanded': 'false', onclick: (e) => { e.stopPropagation(); extra.hidden = !extra.hidden; moreBtn.setAttribute('aria-expanded', String(!extra.hidden)); } }, '⋯') : null;
  const ctl = h('div', { class: 'b-ctl' }, ttsBtn(t.ja), moreBtn, extra);
  const el = h('div', { class: 'bubble ' + (me ? 'me' : 'other') }, h('small', { class: 'spk' }, (d.roles && d.roles[t.spk]) || t.spk), text, z.box, ctl);
  if (hidden) {
    // 遮住的台詞：中文意圖提示（真正的文字，讀屏可讀）；揭曉由主按鈕「答え合わせ」控制
    const hint = h('p', { class: 'veil-hint' }, settings().zh && t.zh ? '言いたいこと：' + t.zh : 'あなたの番です。声に出して言ってみましょう。');
    el.classList.add('veiled'); ctl.hidden = true; text.setAttribute('aria-hidden', 'true');
    el.insertBefore(hint, text);
    el.reveal = () => { el.classList.remove('veiled'); ctl.hidden = false; hint.remove(); text.removeAttribute('aria-hidden'); };
  }
  return el;
}
const bubbles = (d, opts) => h('div', { class: 'chat' }, d.turns.map((t) => bubble(d, t, opts)));

// ---- 一覧 ----
const SCENE_ORDER = ['職場', '取引先', '学校', '子ども', '家庭', '友達', '近所', '病院', '区役所'];
const openScenes = new Set();
export async function list() {
  const ds = await D.dialogues();
  const rank = (s) => (SCENE_ORDER.includes(s) ? SCENE_ORDER.indexOf(s) : 99);
  const scenes = [...new Set(ds.map((d) => d.scene))].sort((a, b) => rank(a) - rank(b));
  const row = (d) => h('li', null, h('a', { class: 'row-link', href: `#/dialogue/${d.id}` },
    h('span', { class: 'row-main' }, h('b', { lang: 'ja' }, d.title), h('small', { lang: 'ja' }, d.situation_ja || '')), h('span', { class: 'row-side' }, chip(d.level))));
  return h('div', { class: 'page' }, pageHead('会話', '#/more'),
    ds.length ? scenes.map((s) => {
      const items = ds.filter((d) => d.scene === s);
      const el = h('details', { class: 'gcat', open: openScenes.has(s), ontoggle: () => (el.open ? openScenes.add(s) : openScenes.delete(s)) },
        h('summary', null, h('span', null, s), h('small', { class: 'muted' }, `${items.length}`)), h('ul', { class: 'list' }, items.map(row)));
      return el;
    }) : empty('会話データがまだありません。'));
}

async function find(id) { return (await D.dialogues()).find((x) => x.id === id); }
const missing = (back) => h('div', { class: 'page' }, pageHead('会話', back), empty('見つかりません。'));

// ---- 詳細（跟讀）----
export async function detail({ params }) {
  const d = await find(params.id);
  if (!d) return missing('#/dialogues');
  const chat = bubbles(d);
  const els = [...chat.children];
  const sz = zhToggle(d.situation_zh);
  let playing = false;
  const playBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); return; }
    playing = true; playBtn.textContent = '■ 停止';
    const ok = await tts.playSequence(d.turns.map((t) => t.ja), { title: d.title, onLine: (i) => { els.forEach((e, k) => e.classList.toggle('playing', k === i)); els[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
    els.forEach((e) => e.classList.remove('playing'));
    playing = false; playBtn.textContent = '▶ 全部再生';
    if (ok) done();
  } }, '▶ 全部再生');
  return h('div', { class: 'page' }, pageHead(d.title, '#/dialogues'),
    h('div', { class: 'card-tags' }, chip(d.scene), chip(d.level), aiBadge(d)),
    h('p', { lang: 'ja' }, d.situation_ja || ''), sz.btn ? h('div', null, sz.btn, sz.box) : null,
    h('div', { class: 'ctl-row' }, playBtn, speedSeg()),
    h('div', { class: 'ctl-row' }, h('a', { class: 'btn', href: `#/dialogue/${d.id}/roleplay` }, '🎭 ロールプレイ'), h('a', { class: 'btn', href: `#/dialogue/${d.id}/listening` }, '👂 聴解')),
    dlButton(() => d.turns.map((t) => t.ja)),
    chat, h('div', { class: 'card-foot' }, flagBtn(d.id)));
}

// ---- ロールプレイ：自分の台詞を隠す → 言ってみる →「答え合わせ」→「次へ」（先作答再看答案）----
export async function roleplay({ params }) {
  const d = await find(params.id);
  if (!d) return missing('#/dialogues');
  const chat = h('div', { class: 'chat' });
  let idx = -1, pending = null; // pending＝まだ答え合わせしていない自分の台詞
  const last = () => idx >= d.turns.length - 1;
  const next = h('button', { class: 'btn primary big', type: 'button', onclick: step }, 'はじめる');
  const help = h('p', { class: 'muted small center', 'aria-live': 'polite' }, '');
  function finish() {
    act.replaceWith(h('div', { class: 'done' }, h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '〇'), h('h2', null, 'おつかれさま！'), h('a', { class: 'btn primary', href: '#/dialogue/' + d.id }, '会話にもどる')));
    done();
  }
  function step() {
    if (pending) { // 答え合わせ：台詞を見せて正しい発音を聞く
      const t = d.turns[idx];
      pending.reveal(); pending = null;
      tts.speak(t.ja);
      next.textContent = last() ? '終わる' : '次へ';
      help.textContent = '';
      return;
    }
    if (last()) return finish();
    idx++;
    const t = d.turns[idx];
    const me = isMe(d, t);
    const b = bubble(d, t, { hidden: me });
    chat.append(b); b.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (me) { pending = b; next.textContent = '答え合わせ'; help.textContent = 'あなたの番：声に出して言ってから、答え合わせ / 先說出口再對答案'; }
    else { next.textContent = last() ? '終わる' : '次へ'; help.textContent = ''; tts.speak(t.ja); }
  }
  const act = h('div', { class: 'sticky-act' }, help, next);
  return h('div', { class: 'page' }, pageHead('ロールプレイ', '#/dialogue/' + d.id),
    h('p', { class: 'muted' }, 'あいての台詞を聞いて、自分の台詞を言ってみましょう。'),
    h('div', { class: 'ctl-row' }, speedSeg()), chat, act);
}

// ---- 聴解：文字なしで聞く → 問題 → 文字起こし ----
export async function listening({ params }) {
  const d = await find(params.id);
  if (!d) return missing('#/dialogues');
  const qs = D.mapById(await D.quizzes());
  const cards = (d.quiz_ids || []).map((id) => qs.get(id)).filter(Boolean).map((q) => ({ kind: 'quiz', id: q.id, data: q }));
  const body = h('div');
  const transcript = () => body.replaceChildren(h('h3', null, '文字起こし'), bubbles(d), h('a', { class: 'btn primary', href: '#/dialogue/' + d.id }, '会話にもどる'));
  let playing = false;
  const play = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); return; }
    playing = true; play.textContent = '■ 停止';
    await tts.playSequence(d.turns.map((t) => t.ja), { gap: 700, title: '聴解' });
    playing = false; play.textContent = '▶ もう一度聞く';
  } }, '▶ 再生');
  const toQ = h('button', { class: 'btn', type: 'button', onclick: () => {
    tts.stop();
    if (!cards.length) { done(); return transcript(); }
    body.replaceChildren(createSession({ cards, srs: false, title: '聴解', finishButtons: [{ label: '文字起こしを見る', primary: true, onclick: transcript }], onFinish: () => done() }));
  } }, cards.length ? '問題へ' : '文字起こしを見る');
  body.append(h('div', { class: 'card center' }, h('p', null, '👂 文字を見ずに聞きましょう'), h('div', { class: 'ctl-row' }, speedSeg()), play, toQ),
    dlButton(() => [...d.turns.map((t) => t.ja), ...cards.flatMap((c) => listenTexts(c.data))]));
  return h('div', { class: 'page' }, pageHead('聴解 · ' + d.title, '#/dialogue/' + d.id), body);
}

// ---- 耳だけモード：播放清單（一段播完自動接下一段；段數可設、可循環；鎖屏續播）----
const EAR_COUNTS = [[1, '1段'], [3, '3段'], [5, '5段'], [0, 'ずっと']]; // 0＝循環
export async function listenOnly({ params, query }) {
  const back = query?.get('from') === 'more' ? '#/more' : '#/home';
  const ds = await D.dialogues();
  if (!ds.length) return h('div', { class: 'page' }, pageHead('耳だけモード', back), empty('会話データがまだありません。'));
  const plan = await buildPlan();
  let cur = Math.max(0, ds.indexOf(ds.find((x) => x.id === params.id) || plan.nextDialogue || ds[0]));
  let playing = false, marked = false, run = 0;
  const groups = ds.map((d) => ({ title: d.title, texts: d.turns.map((t) => t.ja) }));
  const count = () => settings().earCount ?? 3;
  const title = h('h2', { lang: 'ja' }), scene = h('p', { class: 'muted' });
  const status = h('p', { class: 'listen-status', 'aria-live': 'polite' }, '');
  const text = h('div', { class: 'chat', hidden: true });
  const drawDlg = () => { const d = ds[cur]; title.textContent = d.title; scene.textContent = d.scene; text.replaceChildren(...d.turns.map((t) => bubble(d, t))); };
  const idle = (msg) => { playing = false; btn.textContent = '▶ 再生'; status.textContent = msg || ''; [...text.children].forEach((e) => e.classList.remove('playing')); };
  const btn = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); idle(); return; }
    playing = true; btn.textContent = '■ 停止';
    const my = ++run;
    const n = count() || Infinity, total = count() ? `/${count()}` : '';
    let k = 0;
    const played = await tts.playPlaylist(groups, { start: cur, count: n, gap: 800,
      onGroup: (gi, i) => { cur = gi; k = i; drawDlg(); },
      onLine: (i) => { status.textContent = `${k + 1}${total} 段目 ・ ${i + 1} / ${ds[cur].turns.length}`; [...text.children].forEach((e, j) => e.classList.toggle('playing', j === i)); },
      onGroupDone: async () => { if (!marked) { marked = true; await done(); } } });
    if (my !== run) return; // 已重新開始播放
    if (played && played >= n) { cur = (cur + 1) % ds.length; drawDlg(); }
    idle(played ? `${played}段 聞きました。今日は学習できました！` : '');
  } }, '▶ 再生');
  const tog = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => { text.hidden = !text.hidden; tog.setAttribute('aria-pressed', String(!text.hidden)); tog.textContent = text.hidden ? '文字を見る' : '文字を隠す'; } }, '文字を見る');
  const other = h('button', { class: 'btn', type: 'button', onclick: () => { tts.stop(); cur = (cur + 1) % ds.length; drawDlg(); idle(); } }, '次の会話');
  drawDlg();
  return h('div', { class: 'page listen' }, pageHead('耳だけモード', back),
    h('div', { class: 'card center ear' }, h('div', { class: 'ear-ic', 'aria-hidden': 'true' }, '🎧'), title, scene, btn, status),
    h('div', { class: 'set-row col' }, h('span', { class: 'muted' }, '続けて聞く数 / 連續播放段數'), segGroup(EAR_COUNTS, count, (v) => setSetting('earCount', v), '続けて聞く数')),
    h('div', { class: 'set-row col' }, h('span', { class: 'muted' }, '速さ / 語速'), speedSeg()),
    h('p', { class: 'muted small' }, '画面を消しても続けて再生します（音声ファイルがある場合）。/ 鎖屏也會繼續播放'),
    h('div', { class: 'ctl-row' }, tog, other),
    dlButton(() => ds.flatMap((d) => d.turns.map((t) => t.ja)), '⤓ 全部の会話をダウンロード（オフライン用）/ 下載全部會話'), text);
}
