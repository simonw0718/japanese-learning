// 備份檔檢查（純函式，可在 node 測試）。錯誤訊息日／中雙語，指出第幾筆、哪個 id、哪個欄位。
export const STORE_NAMES = ['cards', 'logs', 'meta', 'flags'];
const KINDS = new Set(['vocab', 'grammar', 'quiz', 'listen']);
const okDate = (v) => v != null && v !== '' && !Number.isNaN(new Date(v).getTime());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 致命錯誤直接丟出；資料錯誤最多列 5 筆
export function checkBackup(d) {
  if (!d || typeof d !== 'object' || d.app !== 'japanese-learning') throw new Error('このアプリのバックアップではありません / 不是本 app 的備份');
  if (d.version !== 1) throw new Error(`対応していない版です（version ${d.version}）/ 不支援的備份版本`);
  if (!STORE_NAMES.every((k) => d[k] == null || Array.isArray(d[k])) || !Array.isArray(d.cards)) throw new Error('形式が違います / 格式錯誤');
  const errs = [];
  const bad = (msg) => { errs.push(msg); };
  const seen = new Set(), dup = new Set();
  d.cards.forEach((c, i) => {
    const at = `カード${i + 1}件目${c && c.item_id ? `（${c.item_id}）` : ''} / 第 ${i + 1} 張卡`;
    if (!c || typeof c !== 'object') return bad(`${at}：空です / 空白`);
    if (typeof c.item_id !== 'string' || !c.item_id) return bad(`${at}：item_id がありません / 缺 item_id`);
    if (seen.has(c.item_id)) dup.add(c.item_id); seen.add(c.item_id);
    if (c.kind != null && !KINDS.has(c.kind)) bad(`${at}：kind「${c.kind}」が不明 / 未知的 kind`);
    const k = c.card;
    if (!k || typeof k !== 'object') return bad(`${at}：card がありません / 缺 card`);
    if (!okDate(k.due)) bad(`${at}：due の日付が読めません（${JSON.stringify(k.due)}）/ due 日期無法解析`);
    if (k.last_review != null && !okDate(k.last_review)) bad(`${at}：last_review の日付が読めません / last_review 日期無法解析`);
    if (!Number.isInteger(k.state) || k.state < 0 || k.state > 3) bad(`${at}：state は 0〜3（${JSON.stringify(k.state)}）/ state 需為 0–3`);
    for (const f of ['stability', 'difficulty', 'reps', 'lapses']) if (k[f] != null && (!isNum(k[f]) || k[f] < 0)) bad(`${at}：${f} が不正（${JSON.stringify(k[f])}）/ ${f} 數值錯誤`);
    if (c.added != null && !isNum(c.added)) bad(`${at}：added が不正 / added 錯誤`);
  });
  if (dup.size) bad(`item_id が重複しています / item_id 重複：${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ` …他${dup.size - 5}件` : ''}`);
  (d.logs || []).forEach((l, i) => { if (!l || typeof l.item_id !== 'string' || !isNum(l.ts)) bad(`ログ${i + 1}件目：item_id／ts が不正 / 第 ${i + 1} 筆紀錄格式錯誤`); });
  const mk = new Set();
  (d.meta || []).forEach((m, i) => {
    if (!m || typeof m.key !== 'string' || !m.key) return bad(`meta ${i + 1}件目：key がありません / 缺 key`);
    if (mk.has(m.key)) bad(`meta「${m.key}」が重複 / meta 重複`); mk.add(m.key);
  });
  if (errs.length) {
    const more = errs.length > 5 ? `\n…ほか ${errs.length - 5} 件 / 另有 ${errs.length - 5} 筆` : '';
    throw new Error(`データが壊れています / 資料損毀（${errs.length}件）\n` + errs.slice(0, 5).join('\n') + more);
  }
  return true;
}
