// logic.js 純函式＋音檔 key 與 tools/build_audio.py 一致
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { audioKey, grammarPool, mixinQuizzes, pickQuiz, planGrammarMerge, listenCandidates, readingVariants, genKanjiYomi, genHyoki } from '../js/logic.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLES = ['こんにちは。日本語ふくしゅうへようこそ。', '会議の時間を変えたいのですが。', '  前後に空白  ', '　全角スペース　', 'abc', '', '𠮷野家で食べた', 'ｶﾀｶﾅ・ＡＢＣ①', '改行\nあり', '「〜わけではない」（　　）'];

test('audioKey：格式＝8 位 hex＋3 位字數', () => {
  assert.match(audioKey('あ'), /^[0-9a-f]{8}001$/);
  assert.equal(audioKey(' あ '), audioKey('あ')); // trim
  assert.equal(audioKey('𠮷').slice(8), '001'); // code point 計數（非 UTF-16）
  assert.equal(audioKey(null), audioKey(''));
});
test('audioKey 與 build_audio.py key() 相同', () => {
  const py = 'import json,sys; sys.path.insert(0, "tools"); from build_audio import key; print(json.dumps([key(t) for t in json.loads(sys.stdin.read())]))';
  const r = spawnSync('python3', ['-c', py], { cwd: ROOT, input: JSON.stringify(SAMPLES), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), SAMPLES.map(audioKey));
});
test('audioKey：實際內容抽樣與 audio/manifest.json 一致（有音檔的句子）', () => {
  const py = `import json,sys; sys.path.insert(0,"tools"); import build_audio as b
t=list(b.collect(50).keys())[:400]; m=set(json.load(open("audio/manifest.json"))["keys"])
print(json.dumps([[x,b.key(x)] for x in t if b.key(x) in m][:200]))`;
  const r = spawnSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const pairs = JSON.parse(r.stdout);
  assert.ok(pairs.length > 20, '抽樣太少');
  for (const [t, k] of pairs) assert.equal(audioKey(t), k, t);
});

const Q = (id, skill, extra = {}) => ({ id, skill, stem: `${id}（　）`, ...extra });
test('grammarPool：只取 grammar 題；沒有時退回非敬語／書き言葉', () => {
  const qMap = new Map([Q('a', 'grammar'), Q('b', 'keigo'), Q('c', 'reading')].map((q) => [q.id, q]));
  assert.deepEqual(grammarPool({ quiz_ids: ['a', 'b', 'c', 'zz'] }, qMap).map((q) => q.id), ['a']);
  assert.deepEqual(grammarPool({ quiz_ids: ['b', 'c'] }, qMap).map((q) => q.id), ['c']);
  assert.deepEqual(grammarPool({}, qMap), []);
});
test('pickQuiz：最久沒出的優先；空池回 null', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickQuiz([], {}), null);
  assert.equal(pickQuiz(pool, { a: 5, b: 1, c: 3 }).id, 'b');
  assert.equal(pickQuiz(pool, { a: 5 }, () => 0).id, 'b');
  assert.equal(pickQuiz(pool, { a: 5 }, () => 0.99).id, 'c');
});
test('mixinQuizzes：compare 參照優先、不含本文法的題、結果固定', () => {
  const qs = [Q('q1', 'grammar'), Q('q2', 'grammar'), Q('q3', 'grammar'), Q('q4', 'grammar', { stem: 'どういう意味？' })];
  const qMap = new Map(qs.map((q) => [q.id, q]));
  const g1 = { id: 'g1', category: 'X', quiz_ids: ['q1'], compare: [{ ref: 'g3' }] };
  const g2 = { id: 'g2', category: 'X', quiz_ids: ['q2'] };
  const g3 = { id: 'g3', category: 'Y', quiz_ids: ['q3', 'q4'] };
  const out = mixinQuizzes(g1, [g1, g2, g3], qMap, 3);
  assert.deepEqual(out.map((q) => q.id), ['q3', 'q2']);
  assert.deepEqual(mixinQuizzes(g1, [g1, g2, g3], qMap, 3), out);
});
test('planGrammarMerge：舊題卡併成文法卡', () => {
  const d = (s) => new Date(s);
  const cards = [
    { item_id: 'q1', kind: 'quiz', card: { due: d('2026-10-10'), stability: 3, reps: 2, lapses: 1, last_review: d('2026-10-01') }, added: 100 },
    { item_id: 'q2', kind: 'quiz', card: { due: d('2026-10-05'), stability: 9, reps: 4, lapses: 0, last_review: d('2026-10-03') }, added: 50 },
    { item_id: 'qx', kind: 'quiz', card: { due: d('2026-10-05'), stability: 1, reps: 1, lapses: 0 }, added: 1 },
    { item_id: 'v1', kind: 'vocab', card: { due: d('2026-10-05'), stability: 1, reps: 1 }, added: 1 },
  ];
  const r = planGrammarMerge(cards, new Map([['q1', 'g1'], ['q2', 'g1']]), new Set(['q1', 'q2']));
  assert.equal(r.unresolved, 1); // qx 不在資料
  assert.deepEqual(r.dels.sort(), ['q1', 'q2']);
  assert.equal(r.puts.length, 1);
  const g = r.puts[0];
  assert.equal(g.item_id, 'g1'); assert.equal(g.kind, 'grammar'); assert.equal(g.added, 50);
  assert.equal(g.card.stability, 9); assert.equal(g.card.reps, 4); assert.equal(g.card.lapses, 1);
  assert.equal(g.card.due.toISOString(), d('2026-10-05').toISOString());
  assert.equal(g.card.last_review.toISOString(), d('2026-10-03').toISOString());
  assert.deepEqual(Object.keys(r.seen).sort(), ['q1', 'q2']);
});
test('listenCandidates：Review 且穩定度 ≥7、未有聽力卡', () => {
  const c = (id, state, stability) => ({ item_id: id, kind: 'vocab', card: { state, stability } });
  const cards = [c('a', 2, 10), c('b', 2, 6), c('c', 1, 30), c('d', 2, 20), { item_id: 'd#listen', kind: 'listen', card: { state: 2, stability: 1 } }];
  assert.deepEqual(listenCandidates(cards).map((x) => x.item_id), ['a']);
});
test('readingVariants：清濁、長音、促音的一處變形', () => {
  const v = readingVariants('がっこう');
  assert.ok(v.includes('かっこう'));
  assert.ok(v.includes('がこう'));
  assert.ok(v.includes('がっこ'));
  assert.ok(!v.includes('がっこう'));
});
test('genKanjiYomi／genHyoki：正解在選項中、選項 4 個不重複', () => {
  const vocab = [
    { id: 'v1', level: 'N3', surface: '学校', reading: 'がっこう', examples: [{ ja: '学校へ行く。' }] },
    { id: 'v2', level: 'N3', surface: '学生', reading: 'がくせい' }, { id: 'v3', level: 'N3', surface: '学者', reading: 'がくしゃ' },
    { id: 'v4', level: 'N3', surface: '校長', reading: 'こうちょう' }, { id: 'v5', level: 'N3', surface: '高校', reading: 'こうこう' },
  ];
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const y = genKanjiYomi(vocab[0], vocab, rnd);
  assert.equal(y.stem, '学校へ行く。'); assert.equal(y.u, '学校');
  assert.equal(y.choices.length, 4); assert.equal(new Set(y.choices).size, 4); assert.equal(y.choices[y.answer], 'がっこう');
  const hq = genHyoki(vocab[0], vocab, rnd);
  assert.equal(hq.stem, 'がっこうへ行く。');
  assert.equal(hq.choices[hq.answer], '学校'); assert.equal(new Set(hq.choices).size, 4);
  assert.equal(genKanjiYomi({ id: 'k', surface: 'かな', reading: 'かな' }, vocab), null);
});
