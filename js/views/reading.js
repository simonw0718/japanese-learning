import { h, fill, pageHead, empty, chip, aiBadge, flagBtn, ttsBtn, zhToggle } from '../ui.js';
import * as D from '../data.js';
import * as tts from '../tts.js';
import { renderJa } from '../ruby.js';
import { settings } from '../store.js';
import { createSession, blankHtml, tableEl } from '../session.js';
import { markDay } from '../srs.js';
import { dlButton } from '../offline.js';

// 讀解種類（v1.4）：long＝長文、joho＝情報検索（表）、bunsho＝文章の文法（空欄・音声なし）
const KIND = { long: '長文', joho: '情報検索', bunsho: '文章の文法' };
// 題目：quiz_ids ＋ target がこの文章の題（新しい題型は quiz_ids を持たない）。文章の文法は空欄順
export function questionsFor(r, quizzes) {
  const byId = D.mapById(quizzes);
  const ids = [...new Set([...(r.quiz_ids || []), ...quizzes.filter((q) => (q.target || []).includes(r.id)).map((q) => q.id)])];
  return ids.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => (a.blank || 0) - (b.blank || 0));
}

export async function list() {
  const rs = await D.reading();
  return h('div', { class: 'page' }, pageHead('読解', '#/more'),
    rs.length ? h('ul', { class: 'list' }, rs.map((r) => h('li', null, h('a', { class: 'row-link', href: `#/reading/${r.id}` },
      h('span', { class: 'row-main' }, h('b', { lang: 'ja' }, r.title), h('small', null, [r.genre, KIND[r.kind]].filter(Boolean).join(' ・ '))), h('span', { class: 'row-side' }, chip(r.level)))))) : empty('読解データがまだありません。'));
}

export async function detail({ params }) {
  const r = (await D.reading()).find((x) => x.id === params.id);
  if (!r) return h('div', { class: 'page' }, pageHead('読解', '#/reading'), empty('見つかりません。'));
  let fur = settings().furigana;
  const bunsho = r.kind === 'bunsho';
  const inCard = bunsho || r.kind === 'joho'; // 問題カードに本文（表）を添える＝本文を見ながら答える
  const cards = questionsFor(r, await D.quizzes()).map((q) => ({ kind: 'quiz', id: q.id, data: q, ...(inCard ? { passage: r.body, table: r.table, bunsho, passageTitle: r.title } : {}) }));
  const passage = h('div', { class: 'passage' });
  const draw = () => fill(passage, tableEl(r.table), r.body.map((s) => {
    const z = zhToggle(s.zh);
    // 文章の文法：空欄があるので音声なし
    return h('div', { class: 'sent' }, h('div', { class: 'ex-line' }, h('span', { class: 'ja', lang: 'ja', html: bunsho ? blankHtml(renderJa(s, 'ja', fur), 0) : renderJa(s, 'ja', fur) }), bunsho ? null : ttsBtn(s.ja), z.btn), z.box);
  }));
  draw();
  const furBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': String(fur), onclick: () => { fur = !fur; furBtn.setAttribute('aria-pressed', String(fur)); furBtn.textContent = fur ? 'ふりがな：あり' : 'ふりがな：なし'; draw(); } }, fur ? 'ふりがな：あり' : 'ふりがな：なし');
  const holder = h('div');
  const top = h('div');
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => {
    tts.stop();
    if (inCard) top.hidden = true; // 本文は各問題カードに表示
    holder.replaceChildren(createSession({ cards, srs: false, title: KIND[r.kind] || '読解', finishButtons: [{ label: '読解一覧へ', href: '#/reading', primary: true }, inCard ? { label: '本文をもう一度読む', onclick: () => { top.hidden = false; holder.replaceChildren(start); } } : null].filter(Boolean) }));
  } }, '問題に答える');
  let playing = false;
  const all = bunsho ? null : h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); return; }
    playing = true; all.textContent = '■ 停止';
    await tts.playSequence(r.body.map((s) => s.ja), { gap: 300, title: r.title });
    playing = false; all.textContent = '▶ 全文を聞く'; markDay();
  } }, '▶ 全文を聞く');
  holder.append(cards.length ? start : h('p', { class: 'muted' }, '問題はまだありません。'));
  fill(top, h('div', { class: 'ctl-row' }, furBtn, all), bunsho ? null : dlButton(() => r.body.map((s) => s.ja)), passage);
  return h('div', { class: 'page' }, pageHead(r.title, '#/reading'),
    h('div', { class: 'card-tags' }, chip(r.genre), KIND[r.kind] ? chip(KIND[r.kind]) : null, chip(r.level), aiBadge(r)),
    bunsho ? h('p', { class: 'muted small' }, '［１］〜の空欄に入る言葉を、文章の流れから考えましょう / 依上下文選出空格的詞') : null,
    top, h('div', { class: 'card-foot' }, flagBtn(r.id)), holder);
}
