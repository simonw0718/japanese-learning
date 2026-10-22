import { h, pageHead, empty, chip, bar, wordBtn, segGroup } from '../ui.js';
import * as D from '../data.js';
import * as db from '../db.js';
import { settings, setSetting } from '../store.js';

export async function vocab({ query }) {
  const lv = query.get('lv') || 'N3';
  const [items, cards] = await Promise.all([D.vocabLevel(lv), db.allCards()]);
  const intro = new Set(cards.filter((c) => c.kind === 'vocab').map((c) => c.item_id));
  const tab = (v) => h('a', { class: 'seg' + (lv === v ? ' on' : ''), href: `#/vocab?lv=${v}`, 'aria-current': lv === v ? 'page' : null }, v + ' の一覧');
  const results = h('div');
  const batches = D.batchInfo(items, intro);
  const lvBox = segGroup(Object.entries(D.LEVEL_LABEL), () => settings().newLevel, (v) => setSetting('newLevel', v), '新しい単語の出題レベル');
  const batchList = h('div', null,
    // 出題設定（一覧の表示切替とは別）
    h('section', { class: 'card learn-box' },
      h('div', { class: 'set-row col' }, h('span', null, h('b', null, '新しい単語の出題'), h('small', { class: 'muted' }, ' / 每日新單字從哪一級出')), lvBox),
      h('a', { class: 'btn primary big', href: '#/newwords' }, '新しい単語を学ぶ')),
    h('h3', null, `${lv} の単語グループ`),
    h('p', { class: 'muted small' }, '🔒 のグループは、前のグループを学ぶと自動で開きます（100語ずつ）。/ 學完前一組會自動解鎖'),
    h('ul', { class: 'list' }, batches.map((b) => h('li', null, h('a', { class: 'row-link' + (b.unlocked ? '' : ' locked'), href: `#/vocab/${lv}/${b.batch}` },
      h('span', { class: 'row-main' }, h('b', null, `第${b.batch}群 ${b.unlocked ? '' : '🔒'}`), bar(b.intro / b.total, `第${b.batch}群の進み具合`), h('small', null, `${b.intro} / ${b.total}`)),
      h('span', { class: 'row-side' }, '›'))))));
  const update = () => {
    const q = search.value.trim();
    if (!q) return results.replaceChildren(batchList);
    const ql = q.toLowerCase();
    const hit = items.filter((v) => v.surface.includes(q) || v.reading.includes(q) || (v.meaning_en || '').toLowerCase().includes(ql) || (v.meaning_zh || '').includes(q)).slice(0, 80);
    results.replaceChildren(hit.length ? wordList(hit, intro) : empty('見つかりません。'));
  };
  const search = h('input', { class: 'search', type: 'search', placeholder: '検索（表記・読み・英語）/ 搜尋', 'aria-label': '検索', enterkeyhint: 'search', oninput: update });
  const page = h('div', { class: 'page' }, pageHead('単語'), h('div', { class: 'segs tabs', role: 'navigation', 'aria-label': '表示する単語' }, tab('N3'), tab('N2')));
  if (!items.length) { page.append(empty('単語データがまだありません。')); return page; }
  page.append(search, results);
  update();
  return page;
}

function wordList(items, intro) {
  return h('ul', { class: 'list words' }, items.map((v) => h('li', { class: 'word' },
    h('span', { class: 'row-main' }, h('b', { lang: 'ja' }, v.surface, intro.has(v.id) ? h('span', { class: 'okmark' }, ' ✓') : null), h('small', { lang: 'ja' }, v.reading + '　' + v.pos), h('span', null, v.meaning_zh || v.meaning_en)),
    wordBtn(v))));
}

export async function batch({ params }) {
  const lv = params.lv.toUpperCase();
  const [items, cards] = await Promise.all([D.vocabLevel(lv), db.allCards()]);
  const intro = new Set(cards.filter((c) => c.kind === 'vocab').map((c) => c.item_id));
  const b = items.filter((v) => String(v.batch) === params.n);
  return h('div', { class: 'page' }, pageHead(`${lv} 第${params.n}群`, `#/vocab?lv=${lv}`), b.length ? wordList(b, intro) : empty('単語がありません。'));
}
