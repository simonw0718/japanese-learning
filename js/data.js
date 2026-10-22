// 內容資料讀取（缺檔 → 空陣列，不報錯）
import { FIXTURES } from './store.js';
const base = FIXTURES ? 'tools/fixtures/' : 'data/';
const cache = {};
let manifest = null;
const failed = new Set(); // 讀取失敗的檔（離線未快取等）
export const loadOk = () => failed.size === 0;
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
// data/manifest.json 列出每個 set 由哪些檔組成；fixtures 模式仍是一個 set 一個檔
async function filesOf(name) {
  if (FIXTURES) return [name + '.json'];
  if (!manifest) { try { manifest = (await getJson(base + 'manifest.json')).sets || {}; } catch (e) { manifest = {}; failed.add('manifest.json'); } }
  return manifest[name] || [];
}
export async function load(name) {
  if (cache[name]) return cache[name];
  cache[name] = (async () => {
    const parts = await Promise.all((await filesOf(name)).map((f) => getJson(base + f).then((d) => (Array.isArray(d.items) ? d.items : [])).catch(() => { failed.add(f); return []; })));
    return parts.flat();
  })();
  return cache[name];
}
// 單字補充（中文釋義、例句）依 id 併入
let vocabExtra = null;
async function withExtra(items) {
  if (!vocabExtra) vocabExtra = new Map((await load('vocab_extra')).map((x) => [x.id, x]));
  return items.map((v) => (vocabExtra.has(v.id) ? { ...v, ...vocabExtra.get(v.id), id: v.id } : v));
}
const merged = {};
const vocabSet = (n) => (merged[n] ||= load(n).then(withExtra));
export const vocabAll = async () => [...(await vocabSet('vocab_n3')), ...(await vocabSet('vocab_n2'))];
export const vocabLevel = async (lv) => vocabSet('vocab_' + lv.toLowerCase());
// 文法題：quiz_ids ＋ 所有 target 指向該文法的題目（新題庫不必改文法檔）
let grammarCache = null;
export const grammar = () => (grammarCache ||= Promise.all([load('grammar'), load('quiz')]).then(([gs, qs]) => {
  const byTarget = new Map();
  for (const q of qs) for (const t of q.target || []) { if (!byTarget.has(t)) byTarget.set(t, []); byTarget.get(t).push(q.id); }
  return gs.map((g) => ({ ...g, quiz_ids: [...new Set([...(g.quiz_ids || []), ...(byTarget.get(g.id) || [])])] }));
}));
export const quizzes = () => load('quiz');
export const dialogues = () => load('dialogues');
export const reading = () => load('reading');
export const mapById = (arr) => new Map(arr.map((x) => [x.id, x]));

// 單字分批：目前批 = 第一個尚未全數導入的批；≤ 目前批皆已解鎖
export function batchInfo(items, introduced) {
  const m = new Map();
  for (const it of items) {
    const b = m.get(it.batch) || { batch: it.batch, total: 0, intro: 0 };
    b.total++; if (introduced.has(it.id)) b.intro++;
    m.set(it.batch, b);
  }
  const list = [...m.values()].sort((a, b) => a.batch - b.batch);
  const cur = list.find((b) => b.intro < b.total);
  list.forEach((b) => { b.unlocked = !cur || b.batch <= cur.batch; });
  return list;
}
export function nextNewWords(items, introduced, n) {
  const sorted = items.map((v, i) => [v, i]).sort((a, b) => a[0].batch - b[0].batch || a[1] - b[1]).map((x) => x[0]);
  return sorted.filter((v) => !introduced.has(v.id)).slice(0, n);
}

export const LEVEL_LABEL = { N3: 'N3', N2: 'N2', MIX: '混合' };
// 新單字：N3／N2 單一等級，或 MIX＝N3、N2 交替出題
export function newWordsFor(lv, vocab, introduced, n) {
  if (lv !== 'MIX') return nextNewWords(vocab.filter((v) => v.level === lv), introduced, n);
  const a = nextNewWords(vocab.filter((v) => v.level === 'N3'), introduced, n);
  const b = nextNewWords(vocab.filter((v) => v.level === 'N2'), introduced, n);
  const out = [];
  for (let i = 0; out.length < n && (i < a.length || i < b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length && out.length < n) out.push(b[i]);
  }
  return out;
}
