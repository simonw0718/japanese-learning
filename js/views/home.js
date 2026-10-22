import { h } from '../ui.js';
import { buildPlan } from '../plan.js';
import * as db from '../db.js';
import { weekDots, dayKey } from '../srs.js';
import { settings } from '../store.js';
import * as D from '../data.js';

function flow(icon, title, sub, href, { done = false, off = false } = {}) {
  return h(off ? 'div' : 'a', { class: 'flow' + (done ? ' done' : '') + (off ? ' off' : ''), href: off ? null : href },
    h('span', { class: 'flow-ic', 'aria-hidden': 'true' }, done ? '✓' : icon),
    h('span', { class: 'flow-tx' }, h('b', null, title), h('small', null, sub)),
    off ? null : h('span', { class: 'flow-go', 'aria-hidden': 'true' }, '›'));
}

export async function home() {
  const p = await buildPlan();
  const dots = await weekDots();
  const todayN = p.answeredToday; // meta 計數，不必每次讀全部 log
  const dlgDone = (await db.getMeta('dlg_done')) === dayKey();
  const lastBackup = await db.getMeta('last_backup_at');
  const hasProgress = p.cards.length > 0;
  const backupOld = hasProgress && (!lastBackup || Date.now() - lastBackup > 7 * 86400000);
  const g = p.gate;

  const capDone = p.due > 0 && p.remaining === 0; // 今日上限已達
  const reviewSub = capDone ? '今日の分は完了 / 今日份已完成' : g.mode === 'welcome' ? `おかえり！${p.dueCards.length}枚だけ` : p.due ? `${p.dueCards.length}枚（約${Math.max(1, Math.round(p.dueCards.length * 0.27))}分）` : '今日の復習はありません';
  const wk = dots.filter((d) => d.on).length;
  const gHref = p.nextGrammar ? `#/grammar/${p.nextGrammar.id}` : '#/grammar';
  // つづける：次の未完了ステップ（復習→新しい文法→新しい単語→会話）
  const steps = [
    p.dueCards.length && { href: '#/review', label: '復習', sub: `${p.dueCards.length}枚（約${Math.max(1, Math.round(p.dueCards.length * 0.27))}分）` },
    p.nextGrammar && { href: gHref, label: '新しい文法', sub: p.nextGrammar.pattern },
    p.newWords.length && { href: '#/newwords', label: '新しい単語', sub: `${p.newWords.length}語` },
    p.nextDialogue && !dlgDone && { href: `#/dialogue/${p.nextDialogue.id}`, label: '会話', sub: p.nextDialogue.title },
  ].filter(Boolean);
  const nx = steps[0];
  const cont = nx
    ? h('a', { class: 'btn primary big cont', href: nx.href }, h('span', null, h('b', null, 'つづける'), h('small', null, ' / 繼續今天的練習')), h('small', { class: 'cont-sub' }, `次：${nx.label} ・ ${nx.sub}`))
    : h('div', { class: 'card cont-done' }, h('b', null, '〇 今日の練習はぜんぶ完了！'), h('p', { class: 'muted' }, 'おつかれさま。聞き流すなら耳だけモードへ。/ 今天的練習都完成了'));
  const stat = (n, label) => h('div', null, h('b', { class: 'big-n' }, n), h('small', null, label));
  const el = h('div', { class: 'home' },
    h('header', { class: 'home-head' }, h('div', null, h('h1', null, 'きょうの練習'), h('p', { class: 'muted' }, new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }))), h('div', { class: 'seal', 'aria-hidden': 'true' }, '習')),
    g.label ? h('div', { class: 'note' }, g.label) : null,
    cont,
    h('div', { class: 'flows' },
      flow('復', '復習', reviewSub + (todayN ? `・今日 ${todayN}回答` : ''), '#/review', { done: capDone || (p.due === 0 && todayN > 0) }),
      flow('文', '新しい文法 1', p.nextGrammar ? p.nextGrammar.pattern : p.grammarToday ? '今日の分は完了' : p.grammarTotal ? (g.newAllowed ? 'すべて学習済み' : '復習を優先しましょう') : 'データがありません', gHref, { done: p.grammarToday > 0 && !p.nextGrammar, off: !p.nextGrammar && !p.grammarToday && !p.grammarTotal }),
      flow('単', `新しい単語 ${p.newWords.length || ''}`.trim(), p.newWords.length ? `${p.newWords.length}語（${D.LEVEL_LABEL[settings().newLevel] || settings().newLevel}）` : p.newVocabToday ? `今日 ${p.newVocabToday}語 完了` : g.newAllowed ? 'データがありません' : '復習を優先しましょう', '#/newwords', { done: p.newVocabToday > 0 && !p.newWords.length, off: !p.newWords.length && !p.newVocabToday }),
      flow('話', '会話 1段', p.nextDialogue ? p.nextDialogue.title : 'データがありません', p.nextDialogue ? `#/dialogue/${p.nextDialogue.id}` : '#/dialogues', { done: dlgDone, off: !p.nextDialogue })),
    h('div', { class: 'quick' },
      h('a', { class: 'btn', href: '#/quick' }, '⏱ 2分だけ'),
      h('a', { class: 'btn', href: '#/listen' }, '🎧 耳だけ'),
      h('a', { class: 'btn', href: '#/jlpt' }, '📝 JLPT')),
    // 正向統計：今天做了多少、本週幾天（不顯示總量分母）
    h('section', { class: 'card week' },
      h('div', { class: 'week-row', role: 'img', 'aria-label': `今週 ${wk}日 学びました` }, dots.map((d) => h('div', { class: 'dot' + (d.on ? ' on' : '') + (d.today ? ' today' : '') }, h('i', null, d.on ? '●' : '○'), h('span', null, d.n)))),
      h('div', { class: 'totals' },
        stat(todayN, '今日の回答数'), stat(p.newVocabToday, '今日の新しい単語'), stat(`${wk}日`, '今週の日数'), stat(p.memorized, '記憶した単語'))),
    backupOld ? h('a', { class: 'backup-link', href: '#/settings' }, lastBackup ? '💾 バックアップは7日以上前です / 建議備份 ›' : '💾 進度のバックアップを取っておきましょう / 建議備份 ›') : null,
    p.vocab.length === 0 && p.grammar.length === 0 ? h('p', { class: 'empty' }, 'データファイルが見つかりません（data/）。?fixtures=1 でテスト用データを読み込めます。') : null);
  return el;
}
