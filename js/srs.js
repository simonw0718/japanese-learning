// FSRS 排程＋日期／負載工具
import * as db from './db.js';
import { DAY_H, shiftDay, dayKey, startOfDay, endOfDay, dayDiff, awayFrom, loadGate } from './day.js';
const F = window.FSRS;
const sched = F.fsrs(F.generatorParameters({ request_retention: 0.85, enable_fuzz: true, enable_short_term: false }));
const RATING = { again: F.Rating.Again, good: F.Rating.Good, easy: F.Rating.Easy };

// 日期工具與負載閘門（純函式）在 day.js；這裡轉出，舊 import 不必改
export { DAY_H, dayKey, startOfDay, endOfDay, dayDiff, loadGate };
export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 寫入序列化（避免快速連點時 meta 計數互相覆蓋）
let chain = Promise.resolve();
const lock = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
// 今日計數（meta 'daily'）：reviewed＝複習（不含首次導入）、answered＝全部作答
export async function daily() {
  const k = dayKey();
  let d = await db.getMeta('daily');
  if (!d) { // 舊資料：只在第一次從 logs 補算
    const sod = startOfDay(); const today = (await db.allLogs()).filter((l) => l.ts >= sod);
    d = { day: k, answered: today.length, reviewed: today.filter((l) => !l.isNew && l.kind !== 'read').length };
    await db.setMeta('daily', d);
  }
  return d.day === k ? d : { day: k, answered: 0, reviewed: 0 };
}
// 計數＋學習日：先讀、算好，再與卡片／log 一起在「單一交易」寫入
async function dayWrites(review) {
  const d = { ...(await daily()) }; d.answered++; if (review) d.reviewed++;
  const meta = [{ key: 'daily', value: d }];
  const days = await studiedDays(); const k = dayKey();
  if (!days.includes(k)) meta.push({ key: 'days', value: [...days, k].slice(-400) });
  return meta;
}
// 評分並存檔（每答一題就寫入）。state New 的卡（舊版文法標記）也算首次導入；聽力卡首次也計入每日上限
export const rate = (item_id, kind, name, ms = 0) => lock(async () => {
  const now = new Date();
  let rec = await db.getCard(item_id);
  const isNew = !rec || !rec.card.reps;
  if (!rec) rec = { item_id, kind, card: F.createEmptyCard(now), added: Date.now() };
  rec.kind = kind;
  rec.card = sched.next(rec.card, now, RATING[name]).card;
  await db.writeBatch({ cards: [rec], logs: [{ item_id, ts: Date.now(), rating: name, ms, kind, isNew }], meta: await dayWrites(!isNew || kind === 'listen') });
});
// 記錄作答但不進 SRS（讀解／聽解題、文法導入時的各題）
export const logOnly = (item_id, name, ms = 0) => lock(async () => {
  await db.writeBatch({ logs: [{ item_id, ts: Date.now(), rating: name, ms, kind: 'read' }], meta: await dayWrites(false) });
});
// 文法題最後出題時間（輪替用）：meta 'quizSeen' = {quizId: ts}
export const quizSeen = async () => (await db.getMeta('quizSeen', {})) || {};
export const markQuizSeen = (qid) => lock(async () => { const m = await quizSeen(); m[qid] = Date.now(); await db.setMeta('quizSeen', m); });
// 先取り（明日の分を前倒し）：meta 'ahead' = {day, n}。今日の中で何回前倒ししたか
export async function aheadN() { const a = await db.getMeta('ahead'); return a && a.day === dayKey() ? a.n : 0; }
export const goAhead = () => lock(async () => { await db.setMeta('ahead', { day: dayKey(), n: (await aheadN()) + 1 }); });
// 今日だけ新しい単語を追加（+5／+10）：meta 'extraNew' = {day, n}。負荷閘門より使用者の選択を優先
export async function extraNew() { const a = await db.getMeta('extraNew'); return a && a.day === dayKey() ? a.n : 0; }
export const addExtraNew = (k) => lock(async () => { await db.setMeta('extraNew', { day: dayKey(), n: (await extraNew()) + k }); });
// 「今日の分は完了」フラグの値（先取り中は回ごとに別キー）
export const doneKey = async () => { const n = await aheadN(); return n ? `${dayKey()}#${n}` : dayKey(); };
export async function studiedDays() { return (await db.getMeta('days', [])) || []; }
export async function markDay() {
  const days = await studiedDays(); const k = dayKey();
  if (!days.includes(k)) { days.push(k); await db.setMeta('days', days.slice(-400)); }
}
// 距離「今天以前」最後一次學習幾天（昨天 = 1；之前沒學過 = null）
export async function awayDays() { return awayFrom(await studiedDays(), dayKey()); }
// 今天的閘門：當天第一次開啟時決定並存進 meta，整天固定不變
// persist=false：資料沒載完整（離線／讀檔失敗）時只算不存，避免把錯的閘門鎖一整天
export async function todayGate(due, persist = true) {
  const day = dayKey();
  let g = await db.getMeta('gateDay');
  if (!g || g.day !== day) { const away = await awayDays(); g = { day, away, due0: due, ...loadGate(due, away) }; if (persist) await db.setMeta('gateDay', g); }
  return g;
}
// 本週（週一〜週日）學習點（以 4 點換日後的「今天」為準）
export async function weekDots() {
  const days = new Set(await studiedDays());
  const t = shiftDay(new Date()); const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7), 12);
  const names = ['月', '火', '水', '木', '金', '土', '日'];
  const today = dayKey();
  return names.map((n, i) => { const k = dayKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i, 12)); return { n, on: days.has(k), today: k === today }; });
}
// 記住了＝已進入複習狀態且穩定度約 3 週以上
export const isMemorized = (rec) => rec.kind === 'vocab' && rec.card.state === 2 && rec.card.stability >= 21;
