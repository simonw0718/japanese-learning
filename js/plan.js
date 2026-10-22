// 今日計畫：把資料＋進度算成首頁／各 session 需要的清單
import * as db from './db.js';
import * as D from './data.js';
import { settings } from './store.js';
import { newPerToday } from './day.js';
import { endOfDay, startOfDay, shuffle, todayGate, daily, studiedDays, isMemorized, quizSeen } from './srs.js';
import { grammarPool, pickQuiz, planGrammarMerge, listenCandidates, LISTEN_SUFFIX } from './logic.js';

const LISTEN_PER_DAY = 5;

// 一次性遷移：舊版每題一張的文法題卡 → 每個文法點一張卡（資料缺檔時下次再試）
let migrated = null;
export const migrate = () => (migrated ||= (async () => {
  if (await db.getMeta('mig_grammar_v1')) return;
  const [grammar, quizzes, cards] = await Promise.all([D.grammar(), D.quizzes(), db.allCards()]);
  if (!grammar.length) return;
  const qMap = D.mapById(quizzes), q2g = new Map();
  for (const g of grammar) for (const q of grammarPool(g, qMap)) if (!q2g.has(q.id)) q2g.set(q.id, g.id);
  const { puts, dels, seen, unresolved } = planGrammarMerge(cards, q2g, new Set(qMap.keys()));
  if (puts.length || dels.length) {
    await db.replaceCards(puts, dels);
    await db.setMeta('quizSeen', { ...seen, ...(await quizSeen()) });
  }
  if (!unresolved) await db.setMeta('mig_grammar_v1', Date.now());
})().catch((e) => { console.warn('migrate', e); }));

// 文法卡 → 復習時出的那一題（最久沒出過的）
export function grammarCard(g, qMap, seen) {
  const q = pickQuiz(grammarPool(g, qMap), seen);
  return q ? { kind: 'grammar', id: g.id, data: q, gram: g } : null;
}

export async function buildPlan() {
  await migrate();
  const [vocab, quizzes, grammar, dialogues, cards, seen] = await Promise.all([D.vocabAll(), D.quizzes(), D.grammar(), D.dialogues(), db.allCards(), quizSeen()]);
  const vMap = D.mapById(vocab), qMap = D.mapById(quizzes), gMap = D.mapById(grammar);
  const listenOn = settings().listenCards !== false;
  const baseId = (id) => id.slice(0, -LISTEN_SUFFIX.length);
  const valid = (c) => (c.kind === 'vocab' && vMap.has(c.item_id)) || (c.kind === 'quiz' && qMap.has(c.item_id))
    || (c.kind === 'grammar' && gMap.has(c.item_id) && grammarPool(gMap.get(c.item_id), qMap).length > 0)
    || (c.kind === 'listen' && listenOn && vMap.has(baseId(c.item_id)));
  const eod = endOfDay();
  const due = cards.filter(valid).filter((c) => c.card.due.getTime() <= eod).sort((a, b) => a.card.due - b.card.due);
  const gate = await todayGate(due.length, D.loadOk() && vocab.length > 0 && quizzes.length > 0);
  const away = gate.away;
  const today = await daily(); // 今日已複習幾張（每日上限，非每次 session）
  const remaining = Math.max(0, gate.cap - today.reviewed);
  const toCard = (c) => c.kind === 'grammar' ? grammarCard(gMap.get(c.item_id), qMap, seen)
    : c.kind === 'listen' ? { kind: 'listen', id: c.item_id, data: vMap.get(baseId(c.item_id)) }
    : { kind: c.kind, id: c.item_id, data: c.kind === 'vocab' ? vMap.get(c.item_id) : qMap.get(c.item_id) };
  const dueList = due.slice(0, remaining).map(toCard).filter(Boolean);
  const sod = startOfDay();
  // 聽力卡解鎖：讀音卡穩定後，每天最多 5 張，佔每日復習上限
  const listenToday = cards.filter((c) => c.kind === 'listen' && c.added >= sod).length;
  const listenRoom = listenOn && gate.newAllowed ? Math.min(LISTEN_PER_DAY - listenToday, remaining - dueList.length) : 0;
  const listenNew = listenRoom > 0 ? listenCandidates(cards).filter((c) => vMap.has(c.item_id)).slice(0, listenRoom)
    .map((c) => ({ kind: 'listen', id: c.item_id + LISTEN_SUFFIX, data: vMap.get(c.item_id), isNew: true })) : [];
  const dueCards = shuffle([...dueList, ...listenNew]); // 交錯：單字與題目混排
  const introduced = new Set(cards.map((c) => c.item_id));
  const newVocabToday = cards.filter((c) => c.kind === 'vocab' && c.added >= sod).length;
  const gCards = cards.filter((c) => c.kind === 'grammar' && gMap.has(c.item_id));
  const grammarToday = gCards.filter((c) => c.added >= sod).length;
  const lv = settings().newLevel;
  const newLeft = gate.newAllowed ? Math.max(0, newPerToday(settings()) - newVocabToday) : 0;
  const newWords = D.newWordsFor(lv, vocab, introduced, newLeft).map((v) => ({ kind: 'vocab', id: v.id, data: v, isNew: true }));
  const gLv = lv === 'N2' ? 'N2' : 'N3'; // 混合時文法仍先 N3
  const gOrder = [...grammar.filter((g) => g.level === gLv), ...grammar.filter((g) => g.level !== gLv)];
  const nextGrammar = gate.newAllowed && grammarToday < 1 ? gOrder.find((g) => !introduced.has(g.id)) || null : null;
  const days = await studiedDays();
  const nextDialogue = dialogues.length ? dialogues[days.length % dialogues.length] : null;
  return {
    gate, away, due: due.length, dueCards, remaining, reviewedToday: today.reviewed, answeredToday: today.answered, newWords, newVocabToday, grammarToday, nextGrammar, nextDialogue,
    vocab, quizzes, grammar, dialogues, cards, introduced, vMap, qMap,
    memorized: cards.filter(isMemorized).length,
    grammarDone: gCards.length, // 文法覆蓋率＝已排程的文法卡／文法總數
    grammarTotal: grammar.length,
  };
}
