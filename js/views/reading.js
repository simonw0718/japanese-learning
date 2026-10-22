import { h, pageHead, empty, chip, aiBadge, flagBtn, ttsBtn, zhToggle } from '../ui.js';
import * as D from '../data.js';
import * as tts from '../tts.js';
import { renderJa } from '../ruby.js';
import { settings } from '../store.js';
import { createSession } from '../session.js';
import { markDay } from '../srs.js';

export async function list() {
  const rs = await D.reading();
  return h('div', { class: 'page' }, pageHead('読解', '#/more'),
    rs.length ? h('ul', { class: 'list' }, rs.map((r) => h('li', null, h('a', { class: 'row-link', href: `#/reading/${r.id}` },
      h('span', { class: 'row-main' }, h('b', { lang: 'ja' }, r.title), h('small', null, r.genre)), h('span', { class: 'row-side' }, chip(r.level)))))) : empty('読解データがまだありません。'));
}

export async function detail({ params }) {
  const r = (await D.reading()).find((x) => x.id === params.id);
  if (!r) return h('div', { class: 'page' }, pageHead('読解', '#/reading'), empty('見つかりません。'));
  let fur = settings().furigana;
  const qs = D.mapById(await D.quizzes());
  const cards = (r.quiz_ids || []).map((id) => qs.get(id)).filter(Boolean).map((q) => ({ kind: 'quiz', id: q.id, data: q }));
  const passage = h('div', { class: 'passage' });
  const draw = () => passage.replaceChildren(...r.body.map((s) => {
    const z = zhToggle(s.zh);
    return h('div', { class: 'sent' }, h('div', { class: 'ex-line' }, h('span', { class: 'ja', lang: 'ja', html: renderJa(s, 'ja', fur) }), ttsBtn(s.ja), z.btn), z.box);
  }));
  draw();
  const furBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': String(fur), onclick: () => { fur = !fur; furBtn.setAttribute('aria-pressed', String(fur)); furBtn.textContent = fur ? 'ふりがな：あり' : 'ふりがな：なし'; draw(); } }, fur ? 'ふりがな：あり' : 'ふりがな：なし');
  const holder = h('div');
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => { tts.stop(); holder.replaceChildren(createSession({ cards, srs: false, title: '読解', finishButtons: [{ label: '読解一覧へ', href: '#/reading', primary: true }] })); } }, '問題に答える');
  let playing = false;
  const all = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); return; }
    playing = true; all.textContent = '■ 停止';
    await tts.playSequence(r.body.map((s) => s.ja), { gap: 300, title: r.title });
    playing = false; all.textContent = '▶ 全文を聞く'; markDay();
  } }, '▶ 全文を聞く');
  holder.append(cards.length ? start : h('p', { class: 'muted' }, '問題はまだありません。'));
  return h('div', { class: 'page' }, pageHead(r.title, '#/reading'),
    h('div', { class: 'card-tags' }, chip(r.genre), chip(r.level), aiBadge(r)),
    h('div', { class: 'ctl-row' }, furBtn, all), passage, h('div', { class: 'card-foot' }, flagBtn(r.id)), holder);
}
