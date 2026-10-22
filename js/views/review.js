import { h, pageHead, empty } from '../ui.js';
import { createSession } from '../session.js';
import { buildPlan } from '../plan.js';
import * as db from '../db.js';
import * as D from '../data.js';
import { shuffle, markDay, dayKey } from '../srs.js';
import { micBtn, ttsBtn, jaEl } from '../ui.js';

const hint = (t) => h('div', { class: 'page' }, pageHead(t, '#/home'));

// 復習：到期的單字＋題目混排（上限由負載閘門決定，最多30）
export async function review() {
  const p = await buildPlan();
  const wrap = hint('復習');
  if (!p.dueCards.length) { wrap.append(empty(p.due ? '今日の分は完了です。続きはまた明日。/ 今日份已完成。' : '今日の復習はありません。新しい単語・文法へどうぞ。'), h('a', { class: 'btn primary', href: '#/home' }, 'ホームへ')); return wrap; }
  if (p.gate.label) wrap.append(h('div', { class: 'note' }, p.gate.label));
  wrap.append(createSession({ cards: p.dueCards, title: '復習' }));
  return wrap;
}

// 新しい単語：未導入の単語（解放済みバッチ順）
export async function newWords() {
  const p = await buildPlan();
  const wrap = hint('新しい単語');
  if (!p.newWords.length) {
    wrap.append(empty(p.gate.newAllowed ? (p.newVocabToday ? '今日の新しい単語は完了しました。' : '新しい単語はありません。') : p.gate.label), h('a', { class: 'btn primary', href: '#/home' }, 'ホームへ'));
    return wrap;
  }
  wrap.append(createSession({ cards: p.newWords, title: '新しい単語' }));
  return wrap;
}

// 2分モード：到期5枚＋1句の跟讀
export async function quick() {
  const p = await buildPlan();
  const wrap = hint('2分モード');
  let cards = p.dueCards.slice(0, 5);
  if (cards.length < 5) cards = cards.concat(p.newWords.slice(0, 5 - cards.length));
  const turns = p.nextDialogue ? p.nextDialogue.turns : [];
  const shadow = (root) => {
    if (!turns.length) { markDay(); root.replaceChildren(h('div', { class: 'done' }, h('div', { class: 'done-mark' }, '〇'), h('h2', null, '今日は学習できました！'), h('a', { class: 'btn primary', href: '#/home' }, 'ホームへ'))); return; }
    const t = turns[Math.floor(Math.random() * turns.length)];
    const mic = micBtn(t.ja);
    root.replaceChildren(h('div', { class: 'card shadow' },
      h('p', { class: 'muted' }, 'もう1つ：声に出して真似しましょう（跟讀）'),
      jaEl(t, 'ja', 'p', 'stem'), h('div', { class: 'center' }, ttsBtn(t.ja), mic),
      h('button', { class: 'btn primary', onclick: async () => { await markDay(); await db.setMeta('quick_done', dayKey()); root.replaceChildren(h('div', { class: 'done' }, h('div', { class: 'done-mark' }, '〇'), h('h2', null, '今日は学習できました！'), h('p', { class: 'muted' }, '2分でもOK。続きはまた明日。'), h('a', { class: 'btn primary', href: '#/home' }, 'ホームへ'))); } }, '言えた')));
  };
  const holder = h('div');
  // 到期カードの有無で文案を変える
  const nDue = Math.min(5, p.dueCards.length);
  wrap.append(h('p', { class: 'muted small' }, nDue >= 5 ? '復習5枚＋1文の跟讀で「今日も学習」' : nDue ? `復習${nDue}枚${cards.length > nDue ? `＋新しい単語${cards.length - nDue}語` : ''}＋1文の跟讀` : cards.length ? `今日の復習はありません。新しい単語${cards.length}語＋1文の跟讀` : '今日のカードはありません。1文だけ真似しましょう。'));
  if (!cards.length) { shadow(holder); wrap.append(holder); return wrap; }
  holder.append(createSession({ cards, title: '2分モード', onFinish: (st, root) => shadow(root), finishButtons: [] }));
  wrap.append(holder);
  return wrap;
}

// 敬語／書き言葉 練習：quiz.json から skill で抽出、作答は SRS に入る（文法題は文法カード側で排程するので log のみ）
export async function practice({ params }) {
  const skill = params.skill;
  const name = { keigo: '敬語', kakikotoba: '書き言葉', grammar: '文法' }[skill] || skill;
  const wrap = hint(name + ' 練習');
  const qs = (await D.quizzes()).filter((q) => q.skill === skill && !['bunsho', 'joho'].includes(q.jlpt)); // 本文が必要な題は除く
  if (!qs.length) { wrap.append(empty('問題データがまだありません。')); return wrap; }
  const cards = await db.allCards();
  const seen = new Set(cards.map((c) => c.item_id));
  const fresh = shuffle(qs.filter((q) => !seen.has(q.id)));
  const old = shuffle(qs.filter((q) => seen.has(q.id)));
  const pick = [...fresh, ...old].slice(0, 10).map((q) => ({ kind: 'quiz', id: q.id, data: q }));
  wrap.append(h('p', { class: 'muted' }, `全${qs.length}問中 ${qs.filter((q) => seen.has(q.id)).length}問に挑戦済み。答えた問題は復習に入ります。`),
    createSession({ cards: pick, srs: skill !== 'grammar', title: name, finishButtons: [{ label: 'もう1セット', primary: true, onclick: () => location.reload() }, { label: 'その他へ', href: '#/more' }] }));
  return wrap;
}
