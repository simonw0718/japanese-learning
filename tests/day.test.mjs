// 日界（凌晨 4 點）、跨月、夏令時間、閘門、新字數：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dayKey, startOfDay, endOfDay, dayDiff, awayFrom, loadGate, isWeekend, newPerToday, migrateNewPerDay } from '../js/day.js';

const L = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm); // 當地時間

test('dayKey：03:59 算前一天、04:00 算當天', () => {
  assert.equal(dayKey(L(2026, 10, 22, 3, 59)), '2026-10-21');
  assert.equal(dayKey(L(2026, 10, 22, 4, 0)), '2026-10-22');
  assert.equal(dayKey(L(2026, 10, 22, 0, 0)), '2026-10-21');
  assert.equal(dayKey(L(2026, 10, 22, 23, 59)), '2026-10-22');
});
test('dayKey：跨月、跨年', () => {
  assert.equal(dayKey(L(2026, 11, 1, 3, 59)), '2026-10-31');
  assert.equal(dayKey(L(2026, 3, 1, 2, 0)), '2026-02-28');
  assert.equal(dayKey(L(2024, 3, 1, 2, 0)), '2024-02-29'); // 閏年
  assert.equal(dayKey(L(2027, 1, 1, 3, 0)), '2026-12-31');
});
test('startOfDay／endOfDay：04:00 ～ 隔天 03:59:59.999', () => {
  assert.equal(startOfDay(L(2026, 10, 22, 3, 59)), L(2026, 10, 21, 4).getTime());
  assert.equal(startOfDay(L(2026, 10, 22, 4, 0)), L(2026, 10, 22, 4).getTime());
  assert.equal(endOfDay(L(2026, 10, 22, 10)), L(2026, 10, 23, 4).getTime() - 1);
  assert.equal(endOfDay(L(2026, 10, 31, 23)), L(2026, 11, 1, 4).getTime() - 1); // 跨月
  assert.equal(endOfDay(L(2026, 11, 1, 3, 59)), L(2026, 11, 1, 4).getTime() - 1);
});
test('dayDiff：跨月、跨年', () => {
  assert.equal(dayDiff('2026-10-31', '2026-11-01'), 1);
  assert.equal(dayDiff('2026-12-30', '2027-01-02'), 3);
  assert.equal(dayDiff('2026-03-01', '2026-02-27'), -2);
});
test('awayFrom：今天以前最後一次學習', () => {
  assert.equal(awayFrom([], '2026-10-22'), null);
  assert.equal(awayFrom(['2026-10-22'], '2026-10-22'), null); // 只有今天
  assert.equal(awayFrom(['2026-10-21', '2026-10-22'], '2026-10-22'), 1);
  assert.equal(awayFrom(['2026-10-01', '2026-10-19'], '2026-10-22'), 3);
  assert.equal(awayFrom(['2026-10-30'], '2026-11-02'), 3); // 跨月
  assert.equal(awayFrom(null, '2026-10-22'), null);
});
test('loadGate：各分支與邊界', () => {
  assert.equal(loadGate(0, null).mode, 'normal');
  assert.equal(loadGate(30, 2).mode, 'normal');
  assert.equal(loadGate(31, 0).mode, 'busy');
  assert.equal(loadGate(50, 1).mode, 'busy');
  assert.equal(loadGate(51, 1).mode, 'debt');
  assert.equal(loadGate(500, 3).mode, 'welcome'); // 漏日優先
  assert.equal(loadGate(0, 3).cap, 10);
  assert.equal(loadGate(31, null).newAllowed, false);
  assert.equal(loadGate(51, null).cap, 30);
  assert.equal(loadGate(5, 0).newAllowed, true);
  assert.match(loadGate(77, 0).label, /77/);
});
test('isWeekend／newPerToday：以 4 點換日後的星期判斷', () => {
  // 2026-10-24 是星期六
  assert.equal(isWeekend(L(2026, 10, 24, 3, 59)), false); // 還算星期五
  assert.equal(isWeekend(L(2026, 10, 24, 4, 0)), true);
  assert.equal(isWeekend(L(2026, 10, 26, 3, 0)), true); // 星期一凌晨＝星期日
  const s = { newPerWeekday: 8, newPerWeekend: 15 };
  assert.equal(newPerToday(s, L(2026, 10, 22)), 8);
  assert.equal(newPerToday(s, L(2026, 10, 25)), 15);
  assert.equal(newPerToday({ newPerWeekday: 0, newPerWeekend: 99 }, L(2026, 10, 25)), 20); // 上限 20
  assert.equal(newPerToday({ newPerWeekday: 0 }, L(2026, 10, 22)), 0);
  assert.equal(newPerToday({}, L(2026, 10, 22)), 8);
});
test('migrateNewPerDay：舊自訂值沿用為平日', () => {
  assert.deepEqual(migrateNewPerDay({}), { newPerWeekday: 8, newPerWeekend: 15 });
  assert.deepEqual(migrateNewPerDay({ newPerDay: 5 }), { newPerWeekday: 8, newPerWeekend: 15 }); // 舊預設＝沒改過
  assert.deepEqual(migrateNewPerDay({ newPerDay: 10 }), { newPerWeekday: 10, newPerWeekend: 15 });
  assert.deepEqual(migrateNewPerDay({ newPerDay: 0 }), { newPerWeekday: 0, newPerWeekend: 15 });
  assert.deepEqual(migrateNewPerDay({ newPerDay: 3, newPerWeekday: 6, newPerWeekend: 12 }), {});
});

// 夏令時間：另開子行程設定 TZ（同一行程內切換 TZ 不可靠）
const DST = `
import { dayKey, startOfDay, endOfDay } from ${JSON.stringify(new URL('../js/day.js', import.meta.url).href)};
const L = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
const out = {
  spring0359: dayKey(L(2026, 3, 8, 3, 59)), spring0400: dayKey(L(2026, 3, 8, 4, 0)), spring0430: dayKey(L(2026, 3, 8, 4, 30)),
  fall0300: dayKey(L(2026, 11, 1, 3, 0)), fall0359: dayKey(L(2026, 11, 1, 3, 59)), fall0400: dayKey(L(2026, 11, 1, 4, 0)),
  springLenH: (endOfDay(L(2026, 3, 8, 12)) + 1 - startOfDay(L(2026, 3, 8, 12))) / 3600000,
  fallLenH: (endOfDay(L(2026, 11, 1, 12)) + 1 - startOfDay(L(2026, 11, 1, 12))) / 3600000,
  springStartH: new Date(startOfDay(L(2026, 3, 8, 12))).getHours(),
};
console.log(JSON.stringify(out));`;
test('夏令時間（America/New_York）：切換日的 03:59／04:00', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', DST], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.spring0359, '2026-03-07');
  assert.equal(o.spring0400, '2026-03-08');
  assert.equal(o.spring0430, '2026-03-08');
  assert.equal(o.fall0300, '2026-10-31');
  assert.equal(o.fall0359, '2026-10-31');
  assert.equal(o.fall0400, '2026-11-01');
  assert.equal(o.springLenH, 24); // 03-08 04:00 → 03-09 04:00（跳過的一小時在 02 點，不在區間內）
  assert.equal(o.fallLenH, 24);
  assert.equal(o.springStartH, 4);
});
