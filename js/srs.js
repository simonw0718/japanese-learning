// FSRS 排程＋日期／負載工具
import * as db from './db.js';
const F = window.FSRS;
const sched = F.fsrs(F.generatorParameters({ request_retention: 0.85, enable_fuzz: true, enable_short_term: false }));
const RATING = { again: F.Rating.Again, good: F.Rating.Good, easy: F.Rating.Easy };

// 換日時刻：凌晨 4 點（半夜學習仍算前一天）
export const DAY_H = 4;
const shift = (d) => new Date(d.getTime() - DAY_H * 3600000);
const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => { const s = shift(d); return `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`; };
export const startOfDay = (d = new Date()) => { const s = shift(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate(), DAY_H).getTime(); };
export const endOfDay = (d = new Date()) => { const s = shift(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, DAY_H).getTime() - 1; };
// 兩個 dayKey 相差幾天（用 UTC 計，避開夏令時間）
const keyNum = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const dayDiff = (a, b) => Math.round(keyNum(b) - keyNum(a));
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
async function bump(review) {
  const d = await daily(); d.answered++; if (review) d.reviewed++;
  await db.setMeta('daily', d);
}
// 評分並存檔（每答一題就寫入）。state New 的卡（舊版文法標記）也算首次導入；聽力卡首次也計入每日上限
export const rate = (item_id, kind, name, ms = 0) => lock(async () => {
  const now = new Date();
  let rec = await db.getCard(item_id);
  const isNew = !rec || !rec.card.reps;
  if (!rec) rec = { item_id, kind, card: F.createEmptyCard(now), added: Date.now() };
  rec.kind = kind;
  rec.card = sched.next(rec.card, now, RATING[name]).card;
  await db.putCard(rec);
  await db.addLog({ item_id, ts: Date.now(), rating: name, ms, kind, isNew });
  await bump(!isNew || kind === 'listen');
  await markDay();
});
// 記錄作答但不進 SRS（讀解／聽解題、文法導入時的各題）
export const logOnly = (item_id, name, ms = 0) => lock(async () => { await db.addLog({ item_id, ts: Date.now(), rating: name, ms, kind: 'read' }); await bump(false); await markDay(); });
// 文法題最後出題時間（輪替用）：meta 'quizSeen' = {quizId: ts}
export const quizSeen = async () => (await db.getMeta('quizSeen', {})) || {};
export const markQuizSeen = (qid) => lock(async () => { const m = await quizSeen(); m[qid] = Date.now(); await db.setMeta('quizSeen', m); });
export async function studiedDays() { return (await db.getMeta('days', [])) || []; }
export async function markDay() {
  const days = await studiedDays(); const k = dayKey();
  if (!days.includes(k)) { days.push(k); await db.setMeta('days', days.slice(-400)); }
}
// 距離「今天以前」最後一次學習幾天（昨天 = 1；之前沒學過 = null）
export async function awayDays() {
  const today = dayKey();
  const prev = (await studiedDays()).filter((k) => k < today).sort().pop();
  return prev ? dayDiff(prev, today) : null;
}
// 今天的閘門：當天第一次開啟時決定並存進 meta，整天固定不變
export async function todayGate(due) {
  const day = dayKey();
  let g = await db.getMeta('gateDay');
  if (!g || g.day !== day) { const away = await awayDays(); g = { day, away, due0: due, ...loadGate(due, away) }; await db.setMeta('gateDay', g); }
  return g;
}
// 負載閘門（SPEC §2）
export function loadGate(due, away) {
  if (away != null && away >= 3) return { mode: 'welcome', cap: 10, newAllowed: false, label: 'おかえりなさい。今日は10枚だけでOK / 歡迎回來，今天只複習 10 張' };
  if (due > 50) return { mode: 'debt', cap: 30, newAllowed: false, label: `還債モード：毎日30枚ずつ / 還債模式（到期 ${due}）` };
  if (due > 30) return { mode: 'busy', cap: 30, newAllowed: false, label: '復習がたまっています。新しい学習はお休み / 複習較多，暫停新卡' };
  return { mode: 'normal', cap: 30, newAllowed: true, label: '' };
}
// 本週（週一〜週日）學習點（以 4 點換日後的「今天」為準）
export async function weekDots() {
  const days = new Set(await studiedDays());
  const t = shift(new Date()); const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7), 12);
  const names = ['月', '火', '水', '木', '金', '土', '日'];
  const today = dayKey();
  return names.map((n, i) => { const k = dayKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i, 12)); return { n, on: days.has(k), today: k === today }; });
}
// 記住了＝已進入複習狀態且穩定度約 3 週以上
export const isMemorized = (rec) => rec.kind === 'vocab' && rec.card.state === 2 && rec.card.stability >= 21;
