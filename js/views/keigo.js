// 敬語まとめ表（data/keigo_table.json）：特別な敬語・作り方・電話の決まり文句
import { h, pageHead, empty, ttsBtn } from '../ui.js';
import { rubyHtml, strip, esc } from '../ruby.js';
import { settings } from '../store.js';
import * as D from '../data.js';

const ja = (s) => (settings().furigana ? rubyHtml(s) : esc(strip(s)));
const cell = (arr) => h('td', { lang: 'ja', html: arr.length ? arr.map(ja).join('<br>') : '—' });

export async function table() {
  const items = await D.keigoTable();
  const wrap = h('div', { class: 'page' }, pageHead('敬語のまとめ表', '#/practice/keigo'));
  if (!items.length) { wrap.append(empty('まとめ表のデータがありません。')); return wrap; }
  const by = (k) => items.filter((x) => x.kind === k);
  const head = h('tr', null, h('th', null, ''), h('th', { class: 'k-son' }, '尊敬語', h('small', null, '相手の動作')), h('th', { class: 'k-ken' }, '謙譲語', h('small', null, '自分の動作')));
  const rows = (list) => list.map((x) => h('tr', null, h('th', { lang: 'ja', html: ja(x.plain) }), cell(x.sonkei), cell(x.kenjo)));
  const notes = (list) => list.filter((x) => x.note).map((x) => h('li', { lang: 'ja', html: `<b>${ja(x.plain)}</b>：${esc(x.note)}` }));
  wrap.append(
    h('p', { class: 'muted small' }, '尊敬語＝相手（目上・お客様）を高める。謙譲語＝自分と自分のグループ（自社の人・家族）を低める。丁寧語＝です・ます／お電話・お休み。'),
    h('h3', null, '(1) 特別な敬語がある言葉'),
    h('div', { class: 'k-scroll' }, h('table', { class: 'k-table' }, h('thead', null, head.cloneNode(true)), h('tbody', null, rows(by('verb'))))),
    h('ul', { class: 'plain small' }, notes(by('verb'))),
    h('h3', null, '(2)(3) それ以外の動詞の作り方'),
    h('div', { class: 'k-scroll' }, h('table', { class: 'k-table' }, h('thead', null, head.cloneNode(true)),
      h('tbody', null, by('pattern').map((x) => h('tr', null, h('th', { lang: 'ja', html: ja(x.plain) }),
        h('td', { lang: 'ja', html: x.sonkei.map(ja).join('<br>') + `<br><small>例：${ja(x.ex_sonkei)}</small>` }),
        h('td', { lang: 'ja', html: x.kenjo.map(ja).join('<br>') + `<br><small>例：${ja(x.ex_kenjo)}</small>` })))))),
    h('ul', { class: 'plain small' }, notes(by('pattern'))),
    h('h3', null, 'ビジネス電話の決まり文句'),
    h('ul', { class: 'list' }, by('phrase').map((x) => h('li', { class: 'k-phrase' },
      h('small', null, x.scene),
      h('div', { class: 'k-phrase-ja' }, h('span', { lang: 'ja', html: ja(x.ja) }), ttsBtn(strip(x.ja))),
      x.note ? h('small', null, x.note) : null))),
    h('p', { class: 'center' }, h('a', { class: 'btn primary', href: '#/practice/keigo' }, '敬語の練習へ')));
  return wrap;
}
