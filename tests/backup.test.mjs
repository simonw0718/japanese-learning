// 備份匯入檢查（js/backup.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBackup } from '../js/backup.js';

const card = (id, extra = {}) => ({ item_id: id, kind: 'vocab', card: { due: '2026-10-22T04:00:00.000Z', stability: 3.2, difficulty: 5, reps: 2, lapses: 0, state: 2, last_review: '2026-10-20T01:00:00.000Z', ...extra }, added: 1 });
const ok = (over = {}) => ({ app: 'japanese-learning', version: 1, cards: [card('v-1'), card('g-1')], logs: [{ item_id: 'v-1', ts: 1, rating: 'good' }], meta: [{ key: 'days', value: [] }], flags: [], ...over });

test('正常的備份通過', () => { assert.equal(checkBackup(ok()), true); });
test('不是本 app／版本不符／格式錯', () => {
  assert.throws(() => checkBackup(null), /このアプリのバックアップではありません/);
  assert.throws(() => checkBackup({ ...ok(), app: 'x' }), /不是本 app/);
  assert.throws(() => checkBackup(ok({ version: 2 })), /version 2/);
  assert.throws(() => checkBackup(ok({ cards: {} })), /格式錯誤/);
  assert.throws(() => checkBackup(ok({ logs: 'x' })), /格式錯誤/);
});
test('日期無法解析', () => {
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { due: 'not a date' })] })), /due の日付が読めません.*v-1|v-1.*due/s);
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { due: null })] })), /due/);
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { last_review: 'xx' })] })), /last_review/);
});
test('state 範圍與數值', () => {
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { state: 4 })] })), /state は 0〜3/);
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { state: '2' })] })), /state/);
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { stability: -1 })] })), /stability/);
  assert.throws(() => checkBackup(ok({ cards: [card('v-1', { reps: NaN })] })), /reps/);
});
test('重複 item_id／meta key', () => {
  assert.throws(() => checkBackup(ok({ cards: [card('v-1'), card('v-1')] })), /重複.*v-1/s);
  assert.throws(() => checkBackup(ok({ meta: [{ key: 'a' }, { key: 'a' }] })), /meta「a」が重複/);
});
test('缺欄位與錯誤筆數上限', () => {
  assert.throws(() => checkBackup(ok({ cards: [{ card: {} }] })), /item_id がありません/);
  assert.throws(() => checkBackup(ok({ cards: [{ item_id: 'x' }] })), /card がありません/);
  assert.throws(() => checkBackup(ok({ cards: [card('x', {}), { ...card('y'), kind: 'zzz' }] })), /kind「zzz」/);
  assert.throws(() => checkBackup(ok({ logs: [{ item_id: 'a' }] })), /ログ1件目/);
  const many = Array.from({ length: 9 }, (_, i) => card('c' + i, { state: 9 }));
  assert.throws(() => checkBackup(ok({ cards: many })), (e) => /（9件）/.test(e.message) && /ほか 4 件/.test(e.message));
});
test('app 實際匯出的格式（Date 物件 JSON 化後）可通過', () => {
  const real = { app: 'japanese-learning', version: 1, exported_at: new Date().toISOString(), settings: {}, cards: [{ item_id: 'v-n3-1', kind: 'vocab', card: { due: new Date(), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: new Date() }, added: Date.now() }], logs: [], meta: [], flags: [] };
  assert.equal(checkBackup(JSON.parse(JSON.stringify(real))), true);
});
