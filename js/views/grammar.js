import { h, pageHead, empty, chip, aiBadge, flagBtn, ttsBtn, jaEl, zhToggle } from '../ui.js';
import * as D from '../data.js';
import * as db from '../db.js';
import { rate, shuffle } from '../srs.js';
import { grammarPool, mixinQuizzes } from '../logic.js';
import { createSession } from '../session.js';
import { settings } from '../store.js';

// 一覧：検索（文型・意味）＋レベル＋カテゴリ別の折りたたみ。✓＝復習に入っている
const openCats = new Set(); // 開いているカテゴリ（このページ滞在中のみ記憶）
export async function list({ query }) {
  let lv = query.get('lv') || '';
  const [gs, cards] = await Promise.all([D.grammar(), db.allCards()]);
  const done = new Set(cards.filter((c) => c.kind === 'grammar').map((c) => c.item_id));
  const nDone = gs.filter((g) => done.has(g.id)).length;
  const body = h('div');
  const segs = h('div', { class: 'segs' });
  const search = h('input', { class: 'search', type: 'search', placeholder: '検索（文型・意味・中文）/ 搜尋', 'aria-label': '検索', enterkeyhint: 'search', oninput: () => draw() });
  const row = (g) => h('li', null, h('a', { class: 'row-link', href: `#/grammar/${g.id}` },
    h('span', { class: 'row-main' }, h('b', { lang: 'ja' }, g.pattern), h('small', { lang: 'ja' }, g.meaning_ja)),
    h('span', { class: 'row-side' }, chip(g.level), done.has(g.id) ? h('span', { class: 'okmark', 'aria-label': '学習済み' }, '✓') : null)));
  function draw() {
    segs.replaceChildren(...[['全部', ''], ['N3', 'N3'], ['N2', 'N2']].map(([t, v]) => h('button', { type: 'button', class: 'seg' + (lv === v ? ' on' : ''), 'aria-pressed': String(lv === v), onclick: () => { lv = v; history.replaceState(null, '', v ? `#/grammar?lv=${v}` : '#/grammar'); draw(); } }, t)));
    const q = search.value.trim().toLowerCase();
    const shown = gs.filter((g) => (!lv || g.level === lv) && (!q || [g.pattern, g.meaning_ja, g.meaning_zh].some((x) => (x || '').toLowerCase().includes(q))));
    if (!shown.length) return body.replaceChildren(empty(gs.length ? '見つかりません。' : '文法データがまだありません。'));
    const cats = new Map();
    for (const g of shown) { const k = g.group || g.category || 'その他'; if (!cats.has(k)) cats.set(k, []); cats.get(k).push(g); }
    body.replaceChildren(...[...cats].map(([cat, items]) => {
      const d = h('details', { class: 'gcat', open: !!q || openCats.has(cat) || cats.size === 1, ontoggle: () => (d.open ? openCats.add(cat) : openCats.delete(cat)) },
        h('summary', null, h('span', null, cat), h('small', { class: 'muted' }, `${items.filter((g) => done.has(g.id)).length}/${items.length}`)),
        h('ul', { class: 'list' }, items.map(row)));
      return d;
    }));
  }
  draw();
  return h('div', { class: 'page' }, pageHead('文法', null, h('span', { class: 'muted' }, `${nDone}/${gs.length}`)), segs, search, body);
}

export async function detail({ params }) {
  const gs = await D.grammar();
  const g = gs.find((x) => x.id === params.id);
  if (!g) return h('div', { class: 'page' }, pageHead('文法', '#/grammar'), empty('見つかりません。'));
  const zh = zhToggle(g.meaning_zh);
  const qs = D.mapById(await D.quizzes());
  const quizCards = (g.quiz_ids || []).map((id) => qs.get(id)).filter(Boolean).map((q) => ({ kind: 'quiz', id: q.id, data: q }));
  return h('div', { class: 'page gram' },
    pageHead(g.pattern, '#/grammar'),
    h('div', { class: 'card' },
      h('div', { class: 'card-tags' }, chip(g.level), g.category ? chip(g.category) : null, g.register ? chip(g.register) : null, aiBadge(g), h('span', { class: 'tags-end' }, flagBtn(g.id))),
      h('h2', { class: 'pattern', lang: 'ja' }, g.pattern),
      h('dl', null, h('dt', null, '接続'), h('dd', { lang: 'ja' }, g.connect), h('dt', null, '意味'), h('dd', { lang: 'ja' }, g.meaning_ja)),
      zh.btn ? h('div', null, zh.btn, zh.box) : null,
      g.note_ja ? h('p', { class: 'note-ja', lang: 'ja' }, '💡 ' + g.note_ja) : null),
    h('h3', null, '例文'),
    h('div', { class: 'examples' }, (g.examples || []).map((ex) => {
      const z = zhToggle(ex.zh);
      return h('div', { class: 'ex' }, h('div', { class: 'ex-line' }, jaEl(ex), ttsBtn(ex.ja), z.btn), z.box);
    })),
    deepSections(g, gs),
    !(g.compare && g.compare.length) && g.contrast && g.contrast.length ? h('div', null, h('h3', null, '似ている表現'), h('ul', { class: 'plain' }, [].concat(g.contrast).map((c) => h('li', { lang: 'ja' }, typeof c === 'string' ? c : Object.values(c).join('：'))))) : null,
    // 主要動作固定在拇指區（分頁列上方）
    quizCards.length ? h('div', { class: 'sticky-act' }, h('a', { class: 'btn primary big', href: `#/grammar/${g.id}/practice` }, `練習する（${practiceSet(g, gs, qs).length}問）`)) : h('p', { class: 'muted' }, '練習問題はまだありません。'));
}

// 練習題組：本文法の題＋ほかの文法の題（穿插，避免全選同一個）
const practiceSet = (g, gs, qs) => [...grammarPool(g, qs).map((q) => ({ kind: 'quiz', id: q.id, data: q, own: true })),
  ...mixinQuizzes(g, gs, qs, 3).map((q) => ({ kind: 'quiz', id: q.id, data: q }))];
const missKey = (g) => 'gpmiss:' + g.id;
const ssMiss = (g, v) => { try { if (v === undefined) return sessionStorage.getItem(missKey(g)) === '1'; v ? sessionStorage.setItem(missKey(g), '1') : sessionStorage.removeItem(missKey(g)); } catch (e) {} return false; };

// 導入練習：全題を1回 → 本文法の題が全問正解なら Good、1問でも間違えたら Again で文法カードを排程（題目本身不進 SRS）
export async function practice({ params }) {
  const gs = await D.grammar();
  const g = gs.find((x) => x.id === params.id);
  if (!g) return h('div', { class: 'page' }, pageHead('練習', '#/grammar'), empty('見つかりません。'));
  const qs = D.mapById(await D.quizzes());
  const cards = shuffle(practiceSet(g, gs, qs));
  const rec = await db.getCard(g.id);
  const fresh = !rec || !rec.card.reps; // 已排程的文法再練習：只記 log，不改排程
  return h('div', { class: 'page' }, pageHead(g.pattern, `#/grammar/${g.id}`),
    h('p', { class: 'muted small' }, fresh ? '全部答えると復習に入ります / 做完後加入複習' : '練習のみ（復習の予定は変わりません）/ 僅練習'),
    createSession({ cards, srs: false, title: '文法', persistKey: 'gp-' + g.id,
      onAnswer: (c, name) => { if (c.own && name === 'again') ssMiss(g, true); }, // 穿插題答錯不影響本文法的排程
      onFinish: (st) => { const miss = ssMiss(g); ssMiss(g, false); if (fresh && st.answered) rate(g.id, 'grammar', miss ? 'again' : 'good'); },
      finishButtons: [{ label: '文法一覧へ', href: '#/grammar', primary: true }, { label: 'ホームへ', href: '#/home' }] }));
}

// 深化欄位（v1.1）：詳しい説明・ポイント・活用・比較・よくある間違い
const exLine = (ex) => { const z = zhToggle(ex.zh); return h('div', { class: 'ex' }, h('div', { class: 'ex-line' }, jaEl(ex), ttsBtn(ex.ja), z.btn), z.box); };
const plainJa = (text) => ({ ja: text });
// 深化區塊預設收合：標題列可點開（避免文法頁變成長文件）
const fold = (title, sub, ...kids) => h('details', { class: 'fold' }, h('summary', null, h('span', null, title), sub ? h('small', { class: 'muted' }, sub) : null), ...kids);
function deepSections(g, gs) {
  const out = [];
  if (g.explain_ja) {
    const z = zhToggle(g.explain_zh);
    out.push(fold('くわしい説明', '', h('div', { class: 'deep' }, h('p', { lang: 'ja' }, g.explain_ja),
      g.scene_ja ? h('p', { class: 'muted', lang: 'ja' }, '🏠 ' + g.scene_ja) : null, z.btn, z.box)));
  }
  if (g.points && g.points.length) {
    out.push(fold('使い方のポイント', `${g.points.length}つ`, h('ul', { class: 'points' }, g.points.map((pt) => {
      const z = zhToggle(pt.zh);
      return h('li', null, h('span', { lang: 'ja' }, pt.ja), z.btn, z.box);
    }))));
  }
  if (g.forms && g.forms.length) {
    out.push(fold('形のバリエーション', `${g.forms.length}つ`, h('div', { class: 'forms' }, g.forms.map((f) =>
      h('div', { class: 'form-row' }, h('span', { class: 'chip' }, f.label), jaEl(f.ruby ? f : plainJa(f.ja)), ttsBtn(f.ja))))));
  }
  if (g.compare && g.compare.length) {
    const ids = new Set(gs.map((x) => x.id));
    out.push(fold('比べてみよう', g.compare.map((c) => c.pattern).join('・'), h('div', { class: 'compare' }, g.compare.map((c) => {
      const z = zhToggle(c.diff_zh);
      const kind = c.kind === 'confusable' ? h('span', { class: 'chip warn' }, 'まちがえやすい') : h('span', { class: 'chip' }, '似ている');
      const name = c.ref && ids.has(c.ref) ? h('a', { href: `#/grammar/${c.ref}`, lang: 'ja' }, c.pattern) : h('b', { lang: 'ja' }, c.pattern);
      return h('div', { class: 'card cmp' },
        h('div', { class: 'cmp-head' }, h('b', { lang: 'ja' }, g.pattern), h('span', { class: 'muted' }, ' vs '), name, kind),
        h('p', { lang: 'ja' }, c.diff_ja), z.btn, z.box,
        (c.pair || []).map(exLine));
    }))));
  }
  if (g.mistakes && g.mistakes.length) {
    out.push(fold('よくある間違い', `${g.mistakes.length}つ`, h('div', { class: 'mistakes' }, g.mistakes.map((m) => {
      const z = zhToggle(m.why_zh);
      return h('div', { class: 'card mis' },
        h('p', { class: 'wrong', lang: 'ja' }, '✗ ', m.wrong),
        h('p', { class: 'right', lang: 'ja' }, '○ ', m.right, ' ', ttsBtn(m.right)),
        m.why_ja ? h('p', { class: 'muted', lang: 'ja' }, m.why_ja) : null, z.btn, z.box);
    }))));
  }
  return out.length ? h('div', { class: 'deep-wrap' }, out) : null;
}
