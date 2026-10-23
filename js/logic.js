// 純函式（無 DOM／DB，可在 node 測試）：音檔 key、文法題輪替、舊題卡合併、聽力卡解鎖

// 音檔 key：FNV-1a 32bit(UTF-8 of trim) 8 位 hex ＋ code point 數 3 位 hex（須與 tools/build_audio.py 相同）
export function audioKey(text) {
  const t = String(text ?? '').trim();
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(t)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + [...t].length.toString(16).padStart(3, '0');
}

// 文法題池：該文法的 grammar 題（敬語／書き言葉等不算）
export function grammarPool(g, qMap) {
  const qs = (g.quiz_ids || []).map((id) => qMap.get(id)).filter(Boolean);
  const gq = qs.filter((q) => q.skill === 'grammar');
  return gq.length ? gq : qs.filter((q) => q.skill !== 'keigo' && q.skill !== 'kakikotoba');
}
// 練習用的穿插題：別的文法的題（正解不是本文法），避免「全部選同一個」。
// 優先 compare 裡的易混文法，其次同分類；依 g.id 固定挑選（重新整理後題組不變，才能接續）
export function mixinQuizzes(g, grammars, qMap, n = 3) {
  const byId = new Map(grammars.map((x) => [x.id, x]));
  const own = new Set(grammarPool(g, qMap).map((q) => q.id));
  const seed = [...g.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const refs = (g.compare || []).map((c) => byId.get(c.ref)).filter((x) => x && x.id !== g.id);
  const same = grammars.filter((x) => x.id !== g.id && !refs.includes(x) && (x.group || x.category) === (g.group || g.category));
  const out = [];
  for (const src of [...refs, ...same]) {
    if (out.length >= n) break;
    const pool = grammarPool(src, qMap).filter((q) => q.type !== 'convert' && !own.has(q.id) && !/どういう意味/.test(q.stem));
    if (pool.length) out.push(pool[(seed + out.length) % pool.length]);
  }
  return out;
}
// 輪替：挑最久沒出過的題（沒出過＝最優先）；同分隨機
export function pickQuiz(pool, seen = {}, rnd = Math.random) {
  if (!pool.length) return null;
  const t = (q) => seen[q.id] || 0;
  const min = Math.min(...pool.map(t));
  const c = pool.filter((q) => t(q) === min);
  return c[Math.floor(rnd() * c.length)];
}

// 舊資料遷移：kind 'quiz' 且題目屬於某文法 → 併成該文法一張卡
// cards：全部卡；quizToGrammar：Map(quizId→grammarId)；qKnown：Set(資料中存在的 quiz id)
// 回傳 { puts, dels, seen, unresolved }
export function planGrammarMerge(cards, quizToGrammar, qKnown) {
  const byId = new Map(cards.map((c) => [c.item_id, c]));
  const groups = new Map();
  const seen = {};
  let unresolved = 0;
  for (const c of cards) {
    if (c.kind !== 'quiz') continue;
    const gid = quizToGrammar.get(c.item_id);
    if (!gid) { if (!qKnown.has(c.item_id)) unresolved++; continue; }
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(c);
    if (c.card.last_review) seen[c.item_id] = new Date(c.card.last_review).getTime();
  }
  const puts = [], dels = [];
  for (const [gid, qs] of groups) {
    const old = byId.get(gid); // 舊版「已導入」標記（state New）或已存在的文法卡
    const src = old && old.card.reps > 0 ? [old, ...qs] : qs;
    const base = src.reduce((a, b) => (b.card.stability > a.card.stability ? b : a));
    const time = (d) => new Date(d).getTime();
    const card = { ...base.card,
      due: new Date(Math.min(...src.map((c) => time(c.card.due)))),
      stability: Math.max(...src.map((c) => c.card.stability || 0)),
      reps: Math.max(...src.map((c) => c.card.reps || 0)),
      lapses: Math.max(...src.map((c) => c.card.lapses || 0)) };
    const lr = src.map((c) => c.card.last_review).filter(Boolean).map(time);
    if (lr.length) card.last_review = new Date(Math.max(...lr));
    const added = Math.min(...[old, ...qs].filter(Boolean).map((c) => c.added || Date.now()));
    puts.push({ item_id: gid, kind: 'grammar', card, added });
    for (const q of qs) dels.push(q.item_id);
  }
  return { puts, dels, seen, unresolved };
}

// 聽力卡候選：讀音卡進入 Review 且穩定度 ≥ 7，還沒有 #listen 卡
export const LISTEN_SUFFIX = '#listen';
export function listenCandidates(cards, have = new Set(cards.map((c) => c.item_id))) {
  return cards.filter((c) => c.kind === 'vocab' && c.card.state === 2 && c.card.stability >= 7 && !have.has(c.item_id + LISTEN_SUFFIX))
    .sort((a, b) => b.card.stability - a.card.stability);
}

// ---- JLPT：漢字読み・表記の自動出題（單字庫 → 4 選 1）----
const hasKanjiRe = /[㐀-鿿々]/;
const VOICE = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const UNVOICE = Object.fromEntries(Object.entries(VOICE).map(([a, b]) => [b, a]));
const O_ROW = /[おこそとのほもよろごぞどぼぽょ]$/, E_ROW = /[えけせてねへめれげぜでべぺ]$/;
const SOKU_NEXT = /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/;
// 讀音的「一處變形」：清濁、長音、促音（JLPT 漢字読み典型干擾）
export function readingVariants(r) {
  const out = new Set(), ch = [...r];
  ch.forEach((c, i) => {
    const sw = VOICE[c] || UNVOICE[c];
    if (sw) out.add([...ch.slice(0, i), sw, ...ch.slice(i + 1)].join(''));
    const head = ch.slice(0, i + 1).join(''), tail = ch.slice(i + 1).join('');
    if (c === 'っ') out.add(ch.slice(0, i).join('') + tail);
    if ((c === 'う' && O_ROW.test(ch.slice(0, i).join(''))) || (c === 'い' && E_ROW.test(ch.slice(0, i).join('')))) out.add(ch.slice(0, i).join('') + tail);
    if (i < ch.length - 1 && O_ROW.test(head) && ch[i + 1] !== 'う') out.add(head + 'う' + tail);
    if (i > 0 && i < ch.length - 1 && SOKU_NEXT.test(ch[i + 1]) && c !== 'っ' && ch[i + 1] !== 'っ' && /[くちつき]/.test(c)) out.add(ch.slice(0, i).join('') + 'っ' + tail);
  });
  out.delete(r);
  return [...out];
}
const exampleWith = (v) => (v.examples || []).find((e) => e.ja && e.ja.includes(v.surface));
const pickN = (arr, n, rnd) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const mcq = (id, v, jlpt, stem, u, right, wrong, rnd, explain) => {
  const choices = pickN([right, ...wrong], 4, rnd);
  return { id, v: 1, level: v.level, skill: 'vocab', jlpt, type: 'mcq', target: [v.id], stem, u, plain: true, choices, answer: choices.indexOf(right), explain_ja: explain, gen: true };
};
// 漢字読み：題目句（有例句用例句）中的單字畫底線 → 選讀音
export function genKanjiYomi(v, vocab, rnd = Math.random) {
  if (!hasKanjiRe.test(v.surface) || v.reading === v.surface) return null;
  const bad = new Set([v.reading, ...(v.alt || [])]);
  let wrong = pickN(readingVariants(v.reading).filter((x) => !bad.has(x)), 3, rnd);
  if (wrong.length < 3) {
    const len = [...v.reading].length;
    const more = vocab.filter((w) => w.reading !== v.reading && !bad.has(w.reading) && [...w.reading].length === len && w.reading[0] === v.reading[0]).map((w) => w.reading);
    wrong = [...new Set([...wrong, ...pickN(more, 3, rnd)])].slice(0, 3);
  }
  if (wrong.length < 3) return null;
  const ex = exampleWith(v);
  return mcq(`gen-yomi-${v.id}`, v, 'kanji_yomi', ex ? ex.ja : v.surface, v.surface, v.reading, wrong, rnd, `「${v.surface}」は「${v.reading}」と読む。`);
}
// 表記：句中的讀音（平假名）畫底線 → 選正確漢字。干擾＝同音異字、共用漢字的同長詞
export function genHyoki(v, vocab, rnd = Math.random) {
  if (!hasKanjiRe.test(v.surface) || v.reading === v.surface) return null;
  const kanji = [...v.surface].filter((c) => hasKanjiRe.test(c));
  const len = [...v.surface].length;
  const homo = vocab.filter((w) => w.reading === v.reading && w.surface !== v.surface && hasKanjiRe.test(w.surface)).map((w) => w.surface);
  const share = vocab.filter((w) => w.surface !== v.surface && [...w.surface].length === len && hasKanjiRe.test(w.surface) && kanji.some((k) => w.surface.includes(k)) && !/[ぁ-ん]/.test(w.surface) === !/[ぁ-ん]/.test(v.surface)).map((w) => w.surface);
  const wrong = [...new Set([...pickN(homo, 3, rnd), ...pickN(share, 6, rnd)])].slice(0, 3);
  if (wrong.length < 3) return null;
  const ex = exampleWith(v);
  const stem = ex ? ex.ja.replace(v.surface, v.reading) : v.reading;
  return mcq(`gen-hyoki-${v.id}`, v, 'hyoki', stem, v.reading, v.surface, wrong, rnd, `「${v.reading}」は「${v.surface}」と書く。`);
}
// 敬語等の練習セット：未挑戦 → 期日が近い順。直前のセットの題と同じ group（同じ動詞・場面）は1セット1問まで
// seen: Map(id → due 時刻 ms)；last: 直前のセットの id；足りない時だけ制限をゆるめる
export function pickPractice(qs, seen = new Map(), last = [], n = 10, rnd = Math.random) {
  const mix = (a) => a.map((q) => [rnd(), q]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const fresh = mix(qs.filter((q) => !seen.has(q.id)));
  const old = mix(qs.filter((q) => seen.has(q.id))).sort((a, b) => seen.get(a.id) - seen.get(b.id));
  const lastSet = new Set(last);
  const order = [...fresh, ...old];
  const out = [], ids = new Set(), groups = new Set();
  const take = (ok) => { for (const q of order) { if (out.length >= n) return; if (!ids.has(q.id) && ok(q)) { out.push(q); ids.add(q.id); groups.add(q.group || q.id); } } };
  take((q) => !lastSet.has(q.id) && !groups.has(q.group || q.id));
  take((q) => !lastSet.has(q.id));
  take(() => true);
  return out;
}
