// 日期／負載閘門的純函式（無 DOM／DB，可在 node 測試）
// 換日時刻：凌晨 4 點（半夜學習仍算前一天）。以「當地牆上時鐘」判斷，夏令時間切換日也正確。
export const DAY_H = 4;
const pad2 = (n) => String(n).padStart(2, '0');
// 4 點前 → 前一天中午（只用來取年月日／星期）
export const shiftDay = (d = new Date()) => (d.getHours() < DAY_H ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12) : d);
export const dayKey = (d = new Date()) => { const s = shiftDay(d); return `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`; };
export const startOfDay = (d = new Date()) => { const s = shiftDay(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate(), DAY_H).getTime(); };
export const endOfDay = (d = new Date()) => { const s = shiftDay(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, DAY_H).getTime() - 1; };
// 兩個 dayKey 相差幾天（用 UTC 計，避開夏令時間）
const keyNum = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const dayDiff = (a, b) => Math.round(keyNum(b) - keyNum(a));
// 學習日（4 點換日後）是否為週末
export const isWeekend = (d = new Date()) => { const w = shiftDay(d).getDay(); return w === 0 || w === 6; };

// 距離「今天以前」最後一次學習幾天（昨天 = 1；之前沒學過 = null）
export function awayFrom(days, today) {
  const prev = (days || []).filter((k) => k < today).sort().pop();
  return prev ? dayDiff(prev, today) : null;
}
// 負載閘門（SPEC §2）
export function loadGate(due, away) {
  if (away != null && away >= 3) return { mode: 'welcome', cap: 10, newAllowed: false, label: 'おかえりなさい。今日は10枚だけでOK / 歡迎回來，今天只複習 10 張' };
  if (due > 50) return { mode: 'debt', cap: 30, newAllowed: false, label: `還債モード：毎日30枚ずつ / 還債模式（到期 ${due}）` };
  if (due > 30) return { mode: 'busy', cap: 30, newAllowed: false, label: '復習がたまっています。新しい学習はお休み / 複習較多，暫停新卡' };
  return { mode: 'normal', cap: 30, newAllowed: true, label: '' };
}
// 今日の新しい単語数：平日／週末（v1.4）
export const NEW_DEFAULT = { weekday: 8, weekend: 15 };
export function newPerToday(s, d = new Date()) {
  const v = isWeekend(d) ? s.newPerWeekend : s.newPerWeekday;
  const n = Number.isFinite(+v) && v !== null && v !== '' ? +v : isWeekend(d) ? NEW_DEFAULT.weekend : NEW_DEFAULT.weekday;
  return Math.max(0, Math.min(20, Math.round(n)));
}
// 設定の移行：旧 newPerDay（既定 5）を自分で変えていたら平日の値として引き継ぐ
export function migrateNewPerDay(raw) {
  const out = {};
  if (raw.newPerWeekday == null) out.newPerWeekday = raw.newPerDay != null && +raw.newPerDay !== 5 && Number.isFinite(+raw.newPerDay) ? +raw.newPerDay : NEW_DEFAULT.weekday;
  if (raw.newPerWeekend == null) out.newPerWeekend = NEW_DEFAULT.weekend;
  return out;
}
