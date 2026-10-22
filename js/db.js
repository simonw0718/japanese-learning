// IndexedDB：cards / logs / meta / flags（無法使用時退回記憶體，不當機）
import { FIXTURES } from './store.js';
const NAME = FIXTURES ? 'jp-review-fixtures' : 'jp-review';
const KP = { cards: 'item_id', meta: 'key' };
const mem = { cards: new Map(), meta: new Map(), logs: [], flags: [] };
let dbp = null;

// 常駐警告列（不依賴 ui.js，避免循環 import）
function warn(msg, id) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const b = document.createElement('div'); b.className = 'banner warn'; b.id = id; b.setAttribute('role', 'alert'); b.textContent = msg;
  document.body.prepend(b);
}
const memWarn = () => warn('保存できません：このブラウザでは進度が保存されません（プライベートモード等）/ 無法儲存進度', 'db-mem');
const STORES = { cards: { keyPath: 'item_id' }, logs: { autoIncrement: true }, meta: { keyPath: 'key' }, flags: { autoIncrement: true } };
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    const fail = () => { memWarn(); res(null); };
    try {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = (e) => {
        const d = r.result;
        if (e.oldVersion < 1) for (const [n, o] of Object.entries(STORES)) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, o);
        // 之後改版：if (e.oldVersion < 2) {...}
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onversionchange = () => { d.close(); warn('別のタブで更新されました。再読み込みしてください / 已在其他分頁更新，請重新整理', 'db-vc'); };
        document.getElementById('db-blocked')?.remove();
        res(d);
      };
      r.onerror = fail;
      r.onblocked = () => warn('他のタブで開いています。閉じてください / 請關閉其他分頁的本 app', 'db-blocked'); // 等待，不退回記憶體
    } catch (e) { fail(); }
  });
  return dbp;
}
function run(store, mode, op) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = op(t.objectStore(store));
    t.oncomplete = () => res(r ? r.result : undefined);
    t.onabort = t.onerror = () => rej(t.error);
  }));
}
async function get(s, k) { return (await open()) ? run(s, 'readonly', (o) => o.get(k)) : mem[s].get(k); }
async function put(s, v) {
  if (!(await open())) { KP[s] ? mem[s].set(v[KP[s]], v) : mem[s].push(v); return; }
  return run(s, 'readwrite', (o) => o.put(v));
}
async function all(s) {
  if (!(await open())) return KP[s] ? [...mem[s].values()] : [...mem[s]];
  return run(s, 'readonly', (o) => o.getAll());
}

// 把存回來的日期還原成 Date（匯入 JSON 時為字串）
export function reviveCard(rec) {
  if (!rec || !rec.card) return rec;
  const c = rec.card;
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return rec;
}
export async function getCard(id) { return reviveCard(await get('cards', id)); }
export const putCard = (rec) => put('cards', rec);
// 一次交易：寫入 puts、刪除 dels（遷移用）
export async function replaceCards(puts, dels) {
  const db = await open();
  if (!db) { dels.forEach((k) => mem.cards.delete(k)); puts.forEach((v) => mem.cards.set(v.item_id, v)); return; }
  await new Promise((res, rej) => {
    const t = db.transaction('cards', 'readwrite'); const o = t.objectStore('cards');
    dels.forEach((k) => o.delete(k)); puts.forEach((v) => o.put(v));
    t.oncomplete = () => res(); t.onabort = t.onerror = () => rej(t.error);
  });
}
export async function allCards() { return (await all('cards')).map(reviveCard); }
export const addLog = (l) => put('logs', l);
export const allLogs = () => all('logs');
export async function getMeta(key, def = null) { const r = await get('meta', key); return r ? r.value : def; }
export const setMeta = (key, value) => put('meta', { key, value });
export const addFlag = (f) => put('flags', f);
export const allFlags = () => all('flags');
// 撤回回報（toast の「取り消す」）
export async function delFlag(key, obj) {
  if (!(await open())) { const i = mem.flags.indexOf(obj); if (i >= 0) mem.flags.splice(i, 1); return; }
  return run('flags', 'readwrite', (o) => o.delete(key));
}

const STORE_NAMES = ['cards', 'logs', 'meta', 'flags'];
const PRE = 'preImportBackup';
export async function exportAll() {
  return { cards: await all('cards'), logs: await all('logs'), meta: (await all('meta')).filter((m) => m.key !== PRE), flags: await all('flags') };
}
// 匯入前檢查：必須是本 app 的備份（settings.js 匯出時寫入 app / version）
export function checkBackup(d) {
  if (!d || d.app !== 'japanese-learning') throw new Error('このアプリのバックアップではありません / 不是本 app 的備份');
  if (d.version !== 1) throw new Error(`対応していない版です（version ${d.version}）/ 不支援的備份版本`);
  if (!STORE_NAMES.every((k) => d[k] == null || Array.isArray(d[k])) || !Array.isArray(d.cards)) throw new Error('形式が違います / 格式錯誤');
  if (!d.cards.every((c) => c && c.item_id && c.card) || !(d.meta || []).every((m) => m && m.key)) throw new Error('データが壊れています / 資料損毀');
}
// 復元：先把目前進度存成 meta 'preImportBackup'，再於單一交易內清空＋寫入（失敗則全部不變）
export async function importAll(d, extra = {}) {
  checkBackup(d);
  const pre = { at: Date.now(), app: 'japanese-learning', version: 1, ...extra, ...(await exportAll()) };
  const db = await open();
  if (!db) {
    for (const s of STORE_NAMES) KP[s] ? mem[s].clear() : (mem[s].length = 0);
    for (const s of STORE_NAMES) for (const v of d[s] || []) KP[s] ? mem[s].set(v[KP[s]], v) : mem[s].push(v);
    mem.meta.set(PRE, { key: PRE, value: pre });
    return;
  }
  await new Promise((res, rej) => {
    const t = db.transaction(STORE_NAMES, 'readwrite');
    for (const s of STORE_NAMES) {
      const o = t.objectStore(s); o.clear();
      for (const v of d[s] || []) if (!(s === 'meta' && v.key === PRE)) o.put(v);
    }
    t.objectStore('meta').put({ key: PRE, value: pre });
    t.oncomplete = () => res();
    t.onabort = t.onerror = () => rej(t.error || new Error('abort'));
  });
}
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
