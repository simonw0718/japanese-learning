// JLPT 対策：題型練習（10問・解説つき）／ミニ模試（約20問・制限時間・科目別スコア）／成績
import { h, pageHead, empty, segGroup, bar, zhToggle } from '../ui.js';
import * as D from '../data.js';
import * as db from '../db.js';
import { settings, setSetting } from '../store.js';
import { createSession, JLPT_NAME, stemHtml, blankHtml } from '../session.js';
import { genKanjiYomi, genHyoki } from '../logic.js';
import { shuffle, markDay, doneKey } from '../srs.js';
import { esc, rubyHtml } from '../ruby.js';

// 題型 → 科目（得点区分：言語知識／読解／聴解）。順序＝試験の順。doukei は練習専用（模試・得点に入れない）
const TYPES = [
  ['kanji_yomi', 'moji'], ['hyoki', 'moji'], ['gokeisei', 'moji'], ['bunmyaku', 'moji'], ['iikae', 'moji'], ['yoho', 'moji'], ['doukei', 'moji'],
  ['keishiki', 'bunpo'], ['narabe', 'bunpo'], ['bunsho', 'bunpo'], ['naiyo', 'dokkai'], ['togo_r', 'dokkai'], ['joho', 'dokkai'],
  ['kadai', 'chokai'], ['point', 'chokai'], ['gaiyo', 'chokai'], ['hatsuwa', 'chokai'], ['sokuji', 'chokai'], ['togo_l', 'chokai'],
];
const PRACTICE_ONLY = new Set(['doukei']);
// 本文単位でまとめて出す題型（同じ文章の問題を続けて出す）
const PASSAGE = new Set(['naiyo', 'joho', 'bunsho', 'togo_r']);
// 1つの音声に複数の質問（統合理解・聴解）：set ごとにまとめ、質問2以降は質問1のスクリプトを使う
const GROUPED = new Set([...PASSAGE, 'point', 'togo_l']);
const GROUP = { moji: '文字・語彙', bunpo: '文法', dokkai: '読解', chokai: '聴解' };
const SCORE = { moji: 'gengo', bunpo: 'gengo', dokkai: 'dokkai', chokai: 'chokai' };
const SCORE_NAME = { gengo: '言語知識（文字・語彙・文法）', dokkai: '読解', chokai: '聴解' };
const PASS = { N3: 95, N2: 90 }; // 合格点（180点満点）、各区分 19点以上
// 既存題目の jlpt 題型（欄位なし時）
const typeOf = (q) => q.jlpt || { grammar: 'keishiki', reading: 'naiyo', listening: 'point' }[q.skill] || null;
// 試験の題型練習には「どういう意味？」型の文法題は入れない（形式判断ではないため）
const isKeishiki = (q) => q.skill === 'grammar' && !q.jlpt && /（\s*）|（　+）/.test(q.stem);

async function bank(lv) {
  const [qs, vocab, reading, dialogues] = await Promise.all([D.quizzes(), D.vocabAll(), D.reading(), D.dialogues()]);
  const vLv = vocab.filter((v) => v.level === lv);
  const rMap = D.mapById(reading), dMap = D.mapById(dialogues);
  const by = {};
  for (const q of qs) {
    if (q.level !== lv) continue;
    const t = typeOf(q);
    if (!t || (t === 'keishiki' && !isKeishiki(q))) continue;
    (by[t] ||= []).push(q);
  }
  // 読解・聴解：本文／会話ごとにまとめる（文章の文法は空欄順）
  const groups = (t, map) => {
    const m = new Map();
    for (const q of by[t] || []) { const src = map.get((q.target || [])[0]); if (src) { if (!m.has(src.id)) m.set(src.id, { src, qs: [] }); m.get(src.id).qs.push(q); } }
    const out = [...m.values()];
    out.forEach((g) => g.qs.sort((a, x) => (a.blank || 0) - (x.blank || 0)));
    return out;
  };
  const sets = new Map();
  for (const q of by.togo_l || []) { const k = q.set || q.id; if (!sets.has(k)) sets.set(k, []); sets.get(k).push(q); }
  const togoL = [...sets.values()].map((qs) => {
    qs.sort((a, x) => (a.part || 1) - (x.part || 1));
    const script = (qs.find((q) => (q.script || []).length) || {}).script || [];
    return { qs: qs.map((q) => ((q.script || []).length ? q : { ...q, script })) };
  });
  return { vocab, vLv, by, reading: groups('naiyo', rMap), joho: groups('joho', rMap), bunsho: groups('bunsho', rMap), togo_r: groups('togo_r', rMap), togo_l: togoL, listening: groups('point', dMap) };
}
const gen = (t) => t === 'kanji_yomi' || t === 'hyoki';
const count = (b, t) => (gen(t) ? b.vLv.length : GROUPED.has(t) ? groupsOf(b, t).reduce((a, g) => a + g.qs.length, 0) : (b.by[t] || []).length);
const groupsOf = (b, t) => (t === 'naiyo' ? b.reading : t === 'point' ? b.listening : b[t] || []);

// 最近出た題を後回し（meta jlpt_seen）
async function seenMap() { return (await db.getMeta('jlpt_seen', {})) || {}; }
const fresh = (arr, seen, idOf = (x) => x.id) => shuffle(arr).sort((a, b) => (seen[idOf(a)] || 0) - (seen[idOf(b)] || 0));
const card = (q, extra) => ({ kind: 'quiz', id: q.id, data: q, ...extra });
const passageCards = (g) => g.qs.map((q) => card(q, { passage: g.src.body, table: g.src.table, bunsho: g.src.kind === 'bunsho', passageTitle: g.src.title }));
const audioCards = (g) => g.qs.map((q) => card(q, { audio: g.src.turns.map((t) => t.ja) }));

// n 題を作る（題型ごと）
function makeCards(b, t, n, seen) {
  if (t === 'kanji_yomi' || t === 'hyoki') {
    const gen = t === 'kanji_yomi' ? genKanjiYomi : genHyoki;
    // 例文のある語を優先（文脈つきの出題になる）
    const pool = fresh(b.vLv, seen, (v) => `gen-${t === 'kanji_yomi' ? 'yomi' : 'hyoki'}-${v.id}`).sort((a, x) => (x.examples ? 1 : 0) - (a.examples ? 1 : 0));
    const out = [];
    for (const v of pool) { if (out.length >= n) break; const q = gen(v, b.vocab); if (q) out.push(card(q)); }
    return out;
  }
  if (GROUPED.has(t)) {
    const gs = fresh(groupsOf(b, t), seen, (g) => g.qs[0].id);
    const out = [];
    for (const g of gs) { if (out.length >= n) break; out.push(...(t === 'point' ? audioCards(g) : t === 'togo_l' ? g.qs.map((q) => card(q)) : passageCards(g))); }
    return out;
  }
  return fresh(b.by[t] || [], seen).slice(0, n).map((q) => card(q));
}
async function markSeen(cards) {
  const seen = await seenMap(); const now = Date.now();
  cards.forEach((c) => { seen[c.id] = now; });
  await db.setMeta('jlpt_seen', seen);
}
// 題型別の正答率（meta jlpt_stats：{ "N3:bunmyaku": [ok, n] }）
async function addStats(lv, res) {
  const s = (await db.getMeta('jlpt_stats', {})) || {};
  for (const [t, ok] of res) { const k = `${lv}:${t}`; const v = s[k] || [0, 0]; s[k] = [v[0] + (ok ? 1 : 0), v[1] + 1]; }
  await db.setMeta('jlpt_stats', s);
}

const lvNow = () => settings().jlptLevel || (settings().newLevel === 'N2' ? 'N2' : 'N3');

// ---- トップ ----
export async function top() {
  const lv = lvNow();
  const [b, stats, hist] = await Promise.all([bank(lv), db.getMeta('jlpt_stats', {}), db.getMeta('jlpt_hist', [])]);
  const row = (t) => {
    const n = count(b, t), st = (stats || {})[`${lv}:${t}`];
    return h('li', null, h(n ? 'a' : 'div', { class: 'row-link' + (n ? '' : ' locked'), href: n ? `#/jlpt/${lv}/drill/${t}` : null },
      h('span', { class: 'row-main' }, h('b', null, JLPT_NAME[t] + (PRACTICE_ONLY.has(t) ? '（練習）' : '')), h('small', null, n ? `${n}問` + (st ? ` ・ 正答率 ${Math.round((st[0] / st[1]) * 100)}%（${st[1]}問）` : '') + (PRACTICE_ONLY.has(t) ? ' ・ 中日同形・模試には出ません' : '') : 'まだ問題がありません')),
      n ? h('span', { class: 'row-side' }, '›') : null));
  };
  const last = (hist || []).filter((x) => x.lv === lv).slice(-5).reverse();
  return h('div', { class: 'page' }, pageHead('JLPT 対策', '#/more'),
    h('div', { class: 'set-row col' }, h('span', { class: 'muted' }, 'レベル / 等級'), segGroup([['N3', 'N3'], ['N2', 'N2']], lvNow, (v) => { setSetting('jlptLevel', v); location.reload(); }, 'JLPT レベル')),
    h('a', { class: 'btn primary big cont', href: `#/jlpt/${lv}/mini` }, h('b', null, 'ミニ模試'), h('small', null, `約30問・40分・科目別の点数 / ${lv} 迷你模擬考`)),
    h('p', { class: 'muted small' }, '題型練習：10問ずつ、すぐに答えと解説が出ます / 每次 10 題，立即看解說'),
    // データのない題型は表示しない
    Object.entries(GROUP).map(([g, name]) => { const ts = TYPES.filter(([t, x]) => x === g && count(b, t) > 0); return ts.length ? h('section', null, h('h3', null, name), h('ul', { class: 'list' }, ts.map(([t]) => row(t)))) : null; }),
    last.length ? h('section', null, h('h3', null, 'ミニ模試の記録'), h('ul', { class: 'list' }, last.map((r) => h('li', { class: 'row-link' },
      h('span', { class: 'row-main' }, h('b', null, `${r.total} / 180 点（目安）`), h('small', null, new Date(r.ts).toLocaleDateString('ja-JP') + ' ・ ' + Object.keys(SCORE_NAME).map((k) => `${SCORE_NAME[k].slice(0, 4)} ${r.sec[k] ?? '-'}`).join(' / '))),
      h('span', { class: 'row-side' + (r.pass ? ' ok' : '') }, r.pass ? '合格圏' : 'もう少し'))))) : null,
    h('p', { class: 'muted small' }, '漢字読み・表記は単語リストから自動で作る問題です。ほかは AI が作った問題で、まだ人が確認していません。/ 漢字讀法、表記為自動出題；其他為 AI 出題'));
}

// ---- 題型練習 ----
export async function drill({ params }) {
  const lv = params.lv.toUpperCase(), t = params.type;
  const wrap = h('div', { class: 'page' }, pageHead(`${JLPT_NAME[t] || t}（${lv}）`, '#/jlpt'));
  const b = await bank(lv);
  const cards = makeCards(b, t, 10, await seenMap());
  if (!cards.length) { wrap.append(empty('まだ問題がありません。')); return wrap; }
  const res = [];
  await markSeen(cards);
  wrap.append(createSession({ cards, srs: false, title: JLPT_NAME[t],
    onAnswer: (c, name) => res.push([t, name !== 'again']),
    onFinish: () => { addStats(lv, res); markDay(); },
    finishButtons: [{ label: 'もう10問', primary: true, onclick: () => location.reload() }, { label: 'JLPT 対策へ', href: '#/jlpt' }] }));
  return wrap;
}

// ---- ミニ模試 ----
// 読解・聴解・文章の文法は「本文1つ分」。データのない題型は自動で抜ける。doukei は入れない
const MINI = [['kanji_yomi', 2], ['hyoki', 2], ['gokeisei', 1], ['bunmyaku', 2], ['iikae', 1], ['yoho', 1], ['keishiki', 3], ['narabe', 2], ['bunsho', 1],
  ['naiyo', 1], ['togo_r', 1], ['joho', 1], ['kadai', 1], ['point', 1], ['gaiyo', 1], ['hatsuwa', 1], ['sokuji', 2], ['togo_l', 1]];
export async function mini({ params }) {
  const lv = params.lv.toUpperCase();
  const wrap = h('div', { class: 'page' }, pageHead(`ミニ模試（${lv}）`, '#/jlpt'));
  const b = await bank(lv);
  const seen = await seenMap();
  // 科目順（試験と同じ）：文字・語彙 → 文法 → 読解 → 聴解。読解・聴解は本文／会話1つ分
  const cards = MINI.flatMap(([t, n]) => makeCards(b, t, n, seen).map((c) => ({ ...c, jt: t })))
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
  if (cards.length < 5) { wrap.append(empty('問題が足りません。')); return wrap; }
  const start = h('div', { class: 'card center ear' },
    h('h2', null, `ミニ模試 ${cards.length}問`),
    h('p', { class: 'muted' }, '制限時間 40分。答え合わせは最後にまとめて。聴解は音が出ます。/ 限時 40 分，最後才對答案'),
    h('button', { class: 'btn primary big', type: 'button', onclick: () => run() }, 'はじめる'));
  wrap.append(start);
  function run() {
    const res = new Map();
    markSeen(cards);
    start.replaceWith(createSession({ cards, srs: false, exam: true, timeLimit: 40 * 60, title: 'ミニ模試',
      onAnswer: (c, name) => res.set(c.id, name !== 'again'),
      onFinish: (st, root) => { root.replaceChildren(result(lv, cards, res)); markDay(); } }));
  }
  return wrap;
}

function result(lv, cards, res) {
  const sec = {}, byType = {};
  for (const c of cards) {
    const k = SCORE[TYPES.find(([t]) => t === c.jt)[1]];
    const ok = res.get(c.id) === true;
    (sec[k] ||= [0, 0]); sec[k][0] += ok ? 1 : 0; sec[k][1]++;
    (byType[c.jt] ||= [0, 0]); byType[c.jt][0] += ok ? 1 : 0; byType[c.jt][1]++;
  }
  // 各区分 60点満点に換算（目安）
  const pts = Object.fromEntries(Object.entries(sec).map(([k, [o, n]]) => [k, Math.round((o / n) * 60)]));
  const total = Object.values(pts).reduce((a, x) => a + x, 0) * (3 / Math.max(1, Object.keys(pts).length));
  const tot = Math.round(total);
  const pass = tot >= PASS[lv] && Object.values(pts).every((x) => x >= 19);
  const rec = { ts: Date.now(), lv, total: tot, sec: pts, pass };
  db.getMeta('jlpt_hist', []).then((hs) => db.setMeta('jlpt_hist', [...(hs || []), rec].slice(-30)));
  addStats(lv, cards.map((c) => [c.jt, res.get(c.id) === true]));
  const wrong = cards.filter((c) => res.get(c.id) !== true);
  return h('div', { class: 'jlpt-result' },
    h('div', { class: 'done' }, h('div', { class: 'done-mark', 'aria-hidden': 'true' }, pass ? '〇' : '△'),
      h('h2', null, `${tot} / 180 点（目安）`),
      h('p', { class: pass ? 'ok' : 'muted' }, pass ? `合格ライン（${PASS[lv]}点・各区分19点）を超えています` : `合格ライン：${PASS[lv]}点・各区分19点以上`)),
    h('section', { class: 'card' }, Object.keys(SCORE_NAME).filter((k) => sec[k]).map((k) => h('div', { class: 'sec-row' },
      h('div', { class: 'sec-head' }, h('span', null, SCORE_NAME[k]), h('b', { class: pts[k] >= 19 ? '' : 'ng' }, `${pts[k]} / 60`), h('small', { class: 'muted' }, ` （${sec[k][0]}/${sec[k][1]}問）`)),
      bar(pts[k] / 60, SCORE_NAME[k])))),
    h('section', { class: 'card' }, h('h3', null, '題型別'), h('ul', { class: 'plain small' }, Object.entries(byType).map(([t, [o, n]]) => h('li', null, `${JLPT_NAME[t]}：${o}/${n}`)))),
    wrong.length ? h('section', null, h('h3', null, `まちがえた問題（${wrong.length}）`), wrong.map(review)) : h('p', { class: 'center ok' }, '全問正解！'),
    h('p', { class: 'muted small' }, '点数は正答率からの換算で、本番の得点（等化後）とは異なります。/ 分數為依正確率換算的參考值'),
    h('div', { class: 'stack' }, h('a', { class: 'btn primary', href: '#/jlpt' }, 'JLPT 対策へ'), h('a', { class: 'btn', href: '#/home' }, 'ホームへ')));
}
// まちがえた問題：題目＋正解＋解説
function review(c) {
  const q = c.data;
  const z = zhToggle(q.explain_zh);
  const bl = q.jlpt === 'bunsho' && (c.passage || []).find((p) => p.ja.includes(`［${String.fromCharCode(0xFF10 + q.blank)}］`));
  const html = q.jlpt === 'sokuji' ? esc(q.prompt_ja) : q.jlpt === 'hatsuwa' ? esc(q.situation_ja) : bl ? blankHtml(esc(bl.ja), q.blank) : q.full_ja ? esc(q.full_ja.replace(/　/g, '')) : stemHtml(q);
  return h('div', { class: 'card mis' },
    h('small', { class: 'muted' }, JLPT_NAME[c.jt]),
    h('p', { lang: 'ja', class: 'stem-sm', html }),
    h('p', { class: 'right', lang: q.choices_lang === 'zh' ? 'zh-Hant' : 'ja' }, '✓ ', h('span', { html: q.choices_ruby && settings().furigana ? rubyHtml(q.choices_ruby[q.answer]) : esc(q.choices[q.answer]) })),
    q.explain_ja ? h('p', { class: 'muted', lang: 'ja' }, q.explain_ja) : null, z.btn, z.box);
}

// ---- 今日の JLPT 3問（ホームの1ステップ）：本文なしで解ける題型からランダムに3問（doukei を含む）----
const DAILY_TYPES = ['kanji_yomi', 'hyoki', 'gokeisei', 'bunmyaku', 'iikae', 'yoho', 'doukei', 'keishiki', 'narabe', 'gaiyo', 'kadai', 'hatsuwa', 'sokuji'];
export const dailyDone = async () => (await db.getMeta('jlpt3_done')) === await doneKey();
export async function dailyCards(lv = lvNow(), n = 3) {
  const b = await bank(lv);
  const seen = await seenMap();
  const types = shuffle(DAILY_TYPES.filter((t) => count(b, t) > 0));
  const out = [];
  for (let k = 0; out.length < n && k < types.length * n; k++) {
    const t = types[k % types.length];
    const c = makeCards(b, t, 1 + Math.floor(k / types.length), seen).find((x) => !out.some((o) => o.id === x.id));
    if (c) out.push({ ...c, jt: t });
  }
  return out;
}
export async function daily() {
  const lv = lvNow();
  const wrap = h('div', { class: 'page' }, pageHead(`今日の JLPT 3問（${lv}）`, '#/home'));
  const cards = await dailyCards(lv);
  if (!cards.length) { wrap.append(empty('まだ問題がありません。'), h('a', { class: 'btn primary', href: '#/home' }, 'ホームへ')); return wrap; }
  const res = [];
  await markSeen(cards);
  wrap.append(h('p', { class: 'muted small' }, 'いろいろな題型から3問。答えるとすぐ解説が出ます / 隨機 3 題，作答後立即看解說'),
    createSession({ cards, srs: false, title: 'JLPT 3問',
      onAnswer: (c, name) => res.push([c.jt, name !== 'again']),
      onFinish: async () => { await markDay(); await db.setMeta('jlpt3_done', await doneKey()); addStats(lv, res); },
      finishButtons: [{ label: 'ホームへ', href: '#/home', primary: true }, { label: 'JLPT 対策へ', href: '#/jlpt' }] }));
  return wrap;
}
