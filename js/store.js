// 設定（localStorage）與全域旗標
import { migrateNewPerDay } from './day.js';
const KEY = 'jp-settings';
export const FIXTURES = /[?&]fixtures=1/.test(location.search); // 測試用資料夾旗標
const DEFAULTS = { furigana: true, zh: true, rate: 1.0, font: 'M', newPerWeekday: 8, newPerWeekend: 15, voice: '', newLevel: 'N3', remindTime: '20:00', listenCards: true };
let cur = { ...DEFAULTS };
let raw = {};
try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; Object.assign(cur, raw); } catch (e) { /* 無痕模式等 */ }
// v1.4：新字改「平日／週末」兩個值。舊 newPerDay 自己改過（≠舊預設 5）→ 沿用為平日值
if (raw.newPerWeekday == null || raw.newPerWeekend == null) { Object.assign(cur, migrateNewPerDay(raw)); try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }
// v1.3：語速預設改 1.0。舊預設 0.85 視為沒改過 → 一次性改成 1.0（使用者自己選的其他值不動）
if (!cur.rateV2) { if (cur.rate === 0.85) cur.rate = 1.0; cur.rateV2 = 1; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }

export const settings = () => cur;
export function setSetting(k, v) {
  cur[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
  applySettings();
}
export function replaceSettings(obj) {
  cur = { ...DEFAULTS, ...(obj || {}), ...migrateNewPerDay(obj || {}) }; // 舊備份的設定也移行
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
  applySettings();
}
export function applySettings() { document.documentElement.dataset.font = cur.font; }
export function lsGet(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
