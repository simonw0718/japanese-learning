// 卡片 session 引擎：單字卡＋選擇題，每答一題立即存檔
import { h, fill, jaEl, ttsBtn, wordBtn, flagBtn, aiBadge, zhToggle, chip, bar } from './ui.js';
import { esc, rubyHtml } from './ruby.js';
import { settings } from './store.js';
import * as tts from './tts.js';
import * as srs from './srs.js';
import { onLeave } from './router.js';
import { shuffle } from './srs.js';

// cards: [{kind:'vocab'|'listen'|'quiz'|'grammar', id, data, isNew?}]；grammar＝文法卡（data 為輪替出的一題）
// opts.srs=false 時題目只記 log；persistKey 有值時把進度暫存在 sessionStorage（重新整理後接續）
const ssGet = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const ssSet = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
// exam=true：模試模式（作答後不顯示正誤、直接下一題、不重出錯題）；timeLimit＝秒，時間到自動結束
export function createSession({ cards, srs: useSrs = true, finishButtons, onFinish, onAnswer, title = '', persistKey = '', exam = false, timeLimit = 0 }) {
  const root = h('div', { class: 'session' });
  let queue = [...cards];
  let i = 0, retried = new Set(), cur = null;
  let st = { total: cards.length, good: 0, easy: 0, again: 0, answered: 0 };
  const sk = persistKey && 'sess:' + persistKey;
  const saved = sk && ssGet(sk);
  if (saved && Array.isArray(saved.q)) { // 卡片集合沒變才接續
    const byId = new Map(cards.map((c) => [c.id, c]));
    const q = saved.q.map(([id, r]) => byId.get(id) && (r ? { ...byId.get(id), retry: true } : byId.get(id)));
    if (q.every(Boolean) && saved.i <= q.length) { queue = q; i = saved.i; st = saved.st; retried = new Set(saved.r || []); }
  }
  const save = (ahead = 0) => { if (sk) ssSet(sk, { q: queue.map((c) => [c.id, c.retry ? 1 : 0]), i: i + ahead, st, r: [...retried] }); }; // 答完即算這張完成

  const keyH = (e) => { if (cur && cur.key && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !document.querySelector('.overlay')) cur.key(e.key, e); };
  document.addEventListener('keydown', keyH);
  onLeave(() => document.removeEventListener('keydown', keyH));

  function show() {
    if (i >= queue.length) return finish();
    const c = queue[i];
    const t0 = Date.now();
    let moved = false; // 每張卡只前進一次（按鍵＋按鈕同時觸發時）
    const ctx = {
      retry: retried.has(c.id) && c.retry, exam,
      async record(name) {
        const ms = Date.now() - t0;
        if (!c.retry) {
          st.answered++; st[name]++;
          if (name === 'again' && !exam && !retried.has(c.id)) { retried.add(c.id); queue.push({ ...c, retry: true }); }
          if (c.kind === 'quiz' && !useSrs) await srs.logOnly(c.id, name, ms);
          else await srs.rate(c.id, c.kind, name, ms);
          if (onAnswer) onAnswer(c, name);
          save(1);
        }
      },
      next() { if (moved) return; moved = true; i++; save(); show(); },
    };
    // 文法題：記錄最後出題時間（輪替用）
    if ((c.kind === 'grammar' || c.data.skill === 'grammar') && c.data.id && !c.retry) srs.markQuizSeen(c.data.id);
    cur = c.kind === 'vocab' ? vocabCard(c, ctx) : c.kind === 'listen' ? listenCard(c, ctx) : quizCard(c, ctx);
    fill(root,
      h('div', { class: 'sess-top' }, h('span', null, title), timerEl, h('span', { class: 'sess-n' }, `${Math.min(i + 1, queue.length)} / ${queue.length}`)),
      bar(i / queue.length),
      cur.el);
    root.scrollIntoView?.({ block: 'start' });
  }

  // 計時（模試）
  const timerEl = timeLimit ? h('span', { class: 'sess-timer', role: 'timer', 'aria-live': 'off' }) : null;
  let tick = null, ended = false;
  if (timeLimit) {
    const end = Date.now() + timeLimit * 1000;
    const upd = () => { const left = Math.max(0, Math.round((end - Date.now()) / 1000)); timerEl.textContent = `残り ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; timerEl.classList.toggle('low', left <= 60); if (!left) finish(); };
    upd(); tick = setInterval(upd, 1000);
    onLeave(() => clearInterval(tick));
  }
  function finish() {
    if (ended) return; ended = true; clearInterval(tick); tts.stop();
    cur = null;
    if (sk) ssSet(sk, null);
    const acc = st.answered ? Math.round(((st.good + st.easy) / st.answered) * 100) : 0;
    const btns = finishButtons || [{ label: 'ホームへ', href: '#/home', primary: true }];
    root.replaceChildren(h('div', { class: 'done' },
      h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '〇'),
      h('h2', null, 'おつかれさま！'),
      h('p', { class: 'muted' }, `${st.answered}問 ・ 正解/覚えた ${acc}% ・ もう一度 ${st.again}`),
      h('div', { class: 'stack' }, btns.map((b) => h(b.href ? 'a' : 'button', { class: 'btn' + (b.primary ? ' primary' : ''), href: b.href, onclick: b.onclick }, b.label)))));
    if (onFinish) onFinish(st, root);
  }

  if (!queue.length) { queue.length = 0; finish(); } else show();
  return root;
}

function rateBtn(label, sub, name, cls, fn) {
  return h('button', { class: 'btn rate ' + cls, type: 'button', onclick: () => fn(name) }, h('b', null, label), h('small', null, sub));
}

// 單字卡（讀音優先）：漢字詞看表記 → 想讀音＋意思；純假名詞看意思 → 想單字。🔊 翻面後才出現（避免洩題）
const hasKanji = (t) => /[㐀-鿿豈-﫿々]/.test(t || '');
const reading = (v) => h('div', { class: 'vc-reading', lang: 'ja' }, v.reading, v.alt && v.alt.length ? h('small', { class: 'vc-alt' }, ' / ' + v.alt.join('・')) : null);
// 意思：中文為主、英文為輔
const meaning = (v) => [v.meaning_zh ? h('div', { class: 'vc-mean' }, v.meaning_zh) : null,
  v.meaning_en ? h('div', { class: v.meaning_zh ? 'vc-en muted' : 'vc-mean' }, v.meaning_en) : null];
function example(v) {
  const ex = (v.examples || [])[0];
  if (!ex || !ex.ja) return null;
  const z = zhToggle(ex.zh);
  return h('div', { class: 'vc-ex' }, h('div', { class: 'ex-line' }, jaEl(ex), ttsBtn(ex.ja), z.btn), z.box);
}
// 3 鍵自評＋翻面（單字卡、聽力卡共用）
function flipCard(c, ctx, { cls, front, back, onReveal, extraKey }) {
  const v = c.data;
  let revealed = false, busy = false;
  const backEl = h('div', { class: 'vc-back', hidden: true }, back);
  const revealBtn = h('button', { class: 'btn primary big', type: 'button', onclick: reveal }, '答えを見る');
  const done = async (name) => {
    if (busy) return; busy = true; // 連點只算一次
    rates.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    await ctx.record(name); ctx.next();
  };
  const rates = h('div', { class: 'rates', hidden: true },
    rateBtn('もう一度', '1', 'again', 'again', done), rateBtn('思い出した', '2', 'good', 'good', done), rateBtn('簡単', '3', 'easy', 'easy', done));
  // 新しい単語：もう知っている字は1タップで「簡単」扱い（しばらく出ない）
  const knownBtn = c.isNew && c.kind === 'vocab' ? h('button', { class: 'btn known-btn', type: 'button', onclick: () => done('easy') }, '知ってる / 已經會了') : null;
  function reveal() { if (revealed) return; revealed = true; backEl.hidden = false; revealBtn.hidden = true; if (knownBtn) knownBtn.hidden = true; rates.hidden = false; rates.querySelector('button:nth-child(2)').focus(); if (onReveal) onReveal(); }
  const el = h('div', { class: 'card vcard ' + (cls || '') },
    h('div', { class: 'card-tags' }, chip(v.level), c.kind === 'listen' ? chip('聞き取り') : null, c.isNew ? chip('新しい', 'accent') : null, ctx.retry ? chip('もう一度', 'accent') : null, aiBadge(v), h('span', { class: 'tags-end' }, flagBtn(v.id))),
    front, backEl, revealBtn, knownBtn, rates);
  return { el, key(k, e) {
    if (extraKey && extraKey(k, e)) return;
    if (!revealed && (k === ' ' || k === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && /^[123]$/.test(k)) { e.preventDefault(); done({ 1: 'again', 2: 'good', 3: 'easy' }[k]); }
  } };
}
function vocabCard(c, ctx) {
  const v = c.data;
  const byMean = !hasKanji(v.surface) && !!(v.meaning_zh || v.meaning_en); // 純假名詞改「看意思→想單字」
  const front = byMean
    ? h('div', { class: 'vc-front' }, h('p', { class: 'muted' }, 'この意味の言葉は？ / 這是哪個字？'), h('div', { class: 'vc-mean vc-prompt' }, v.meaning_zh || v.meaning_en),
      v.meaning_zh && v.meaning_en ? h('div', { class: 'vc-en muted' }, v.meaning_en) : null)
    : h('div', null, h('div', { class: 'vc-surface', lang: 'ja' }, v.surface), h('p', { class: 'muted small' }, '読み方と意味は？ / 讀音和意思？'));
  const back = [
    byMean ? h('div', { class: 'vc-surface', lang: 'ja' }, v.surface) : null,
    !byMean || v.reading !== v.surface ? reading(v) : null,
    h('div', { class: 'center' }, wordBtn(v)),
    byMean ? null : meaning(v),
    h('div', { class: 'muted' }, v.pos),
    v.note_zh ? h('p', { class: 'vc-note' }, '💡 ' + v.note_zh) : null,
    example(v)];
  return flipCard(c, ctx, { front, back });
}
// 聽力卡：自動播放單字 → 想意思 → 翻面看表記／讀音／意思
function listenCard(c, ctx) {
  const v = c.data;
  const play = () => tts.speakWord(v);
  const front = h('div', { class: 'vc-front' }, h('p', { class: 'muted' }, '聞いて、意味を思い出そう / 聽音想意思'),
    h('button', { class: 'btn big vc-listen', type: 'button', 'aria-label': 'もう一度聞く', onclick: play }, '🔊 もう一度'));
  const back = [h('div', { class: 'vc-surface', lang: 'ja' }, v.surface), v.reading !== v.surface ? reading(v) : null, meaning(v), h('div', { class: 'muted' }, v.pos), example(v)];
  setTimeout(play, 200);
  return flipCard(c, ctx, { cls: 'lcard', front, back, extraKey: (k, e) => { if (k === 'r') { e.preventDefault(); play(); return true; } return false; } });
}

// 題幹 HTML：振假名＋底線（u）＋並べ替えの格子。plain＝不加振假名（漢字読み・表記：避免洩題）
export function stemHtml(q) {
  const stem = q.stem || '';
  let html;
  const ruby = !q.plain && settings().furigana && q.stem_ruby;
  if (q.u && stem.includes(q.u)) {
    const s0 = stem.indexOf(q.u), s1 = s0 + q.u.length;
    // 以「ruby 單位」走一遍：漢字{かな} 或單一字元；與底線範圍重疊的單位包進 <u>
    const units = ruby ? q.stem_ruby.match(/[一-鿿々〆ヶ]+\{[^}]*\}|[\s\S]/gu) : [...stem];
    let pos = 0, out = '', open = false;
    for (const un of units) {
      const base = un.replace(/\{[^}]*\}$/, '');
      const hit = pos < s1 && pos + base.length > s0;
      if (hit && !open) { out += '<u>'; open = true; }
      if (!hit && open) { out += '</u>'; open = false; }
      out += un.includes('{') ? rubyHtml(un) : esc(un);
      pos += base.length;
    }
    html = out + (open ? '</u>' : '');
  } else html = ruby ? rubyHtml(q.stem_ruby) : esc(stem);
  return html.replace(/＿★＿/g, '<span class="slot star" aria-label="星の空欄">★</span>').replace(/＿＿＿/g, '<span class="slot" aria-label="空欄"></span>');
}
const choiceHtml = (q, k) => (q.choices_lang !== 'zh' && settings().furigana && q.choices_ruby && q.choices_ruby[k] ? rubyHtml(q.choices_ruby[k]) : esc(q.choices[k]));
const choiceLang = (q) => (q.choices_lang === 'zh' ? 'zh-Hant' : 'ja');
// 文章の文法：［１］〜［５］を空欄として表示（cur＝今の問題の空欄を強調）
const FW0 = 0xFF10;
export const blankHtml = (html, cur) => html.replace(/［([０-９])］/g, (m, d) => `<span class="blank${d.charCodeAt(0) - FW0 === cur ? ' on' : ''}" aria-label="空欄${d.charCodeAt(0) - FW0}">${d}</span>`);
// 情報検索の表（横スクロール可）
export function tableEl(t) {
  if (!t || !Array.isArray(t.cols)) return null;
  const hint = t.cols.length > 3 ? h('p', { class: 'muted small tbl-hint' }, '表は横にスクロールできます → / 表格可左右滑動') : null;
  return [hint, h('div', { class: 'tbl-wrap', tabindex: '0', role: 'region', 'aria-label': t.caption || '表' },
    h('table', { class: 'tbl', lang: 'ja' }, t.caption ? h('caption', null, t.caption) : null,
      h('thead', null, h('tr', null, t.cols.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, (t.rows || []).map((r) => h('tr', null, r.map((x, i) => h(i ? 'td' : 'th', i ? null : { scope: 'row' }, x)))))))];
}
const lineHtml = (p, cur) => blankHtml(settings().furigana && p.ruby ? rubyHtml(p.ruby) : esc(p.ja), cur);
// 讀解本文（c.passage／c.table）／聽解音檔（c.audio）
function contextEl(c) {
  if (c.passage || c.table) {
    const cur = c.data && c.data.blank;
    const box = h('div', { class: 'passage' + (c.bunsho ? ' scroll' : '') }, tableEl(c.table), (c.passage || []).map((p, i, a) => [p.part && p.part !== (a[i - 1] || {}).part ? h('p', { class: 'part-h' }, p.part) : null, h('p', { lang: 'ja', class: 'ja', html: lineHtml(p, cur) })]));
    // 同じ文章が続くので、今の空欄が見える位置まで本文だけをスクロール
    if (c.bunsho && cur) requestAnimationFrame(() => { const b = box.querySelector('.blank.on'); if (b) box.scrollTop = Math.max(0, b.offsetTop - box.clientHeight / 3); });
    return h('details', { class: 'fold passage-box', open: true }, h('summary', null, h('span', null, '本文'), h('small', { class: 'muted' }, c.passageTitle || '')), box);
  }
  if (c.audio) {
    let playing = false;
    const b = h('button', { class: 'btn big', type: 'button', onclick: async () => {
      if (playing) { tts.stop(); return; }
      playing = true; b.textContent = '■ 停止';
      await tts.playSequence(c.audio, { gap: 600, title: '聴解' });
      playing = false; b.textContent = '▶ もう一度聞く';
    } }, '▶ 会話を聞く');
    return h('div', { class: 'audio-box' }, h('p', { class: 'muted small' }, '会話を聞いてから答えてください / 先聽再作答'), b);
  }
  return null;
}

// 選擇題：正解→Good、錯誤→Again
function quizCard(c, ctx) {
  const q = c.data;
  if (q.jlpt === 'sokuji' || q.jlpt === 'hatsuwa') return sokujiCard(c, ctx);
  const gaiyo = SCRIPT_TYPES.has(q.jlpt);
  // JLPT 新題型：解說會提到選項順序（①〜④、語序 1→4），答案位置已平均 → 不打亂
  const base = q.choices.map((t, idx) => ({ t, idx }));
  const order = q.jlpt && !q.gen ? base : shuffle(base);
  let answered = false;
  const fb = h('div', { class: 'feedback', hidden: true });
  const nextBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => ctx.next() }, '次へ');
  const act = h('div', { class: 'sticky-act', hidden: true }, nextBtn); // 作答後：拇指區固定（不被分頁列擋住）
  const btns = order.map((o, n) => h('button', { class: 'choice' + (q.jlpt === 'yoho' ? ' long' : ''), type: 'button', onclick: () => pick(n) }, h('span', { class: 'ch-n' }, n + 1), h('span', { lang: choiceLang(q), html: choiceHtml(q, o.idx) }), h('span', { class: 'ch-mark', 'aria-hidden': 'true' })));
  async function pick(n) {
    if (answered) return;
    answered = true;
    const ok = order[n].idx === q.answer;
    if (ctx.exam) { btns.forEach((b) => { b.disabled = true; }); btns[n].classList.add('picked'); await ctx.record(ok ? 'good' : 'again'); setTimeout(() => ctx.next(), 250); return; }
    // 顏色之外加 ✓✗（色覺／低亮度）
    const mark = (b, t, lab) => { b.querySelector('.ch-mark').textContent = t; b.setAttribute('aria-label', lab + '：' + b.textContent); };
    btns.forEach((b, k) => { b.disabled = true; if (order[k].idx === q.answer) { b.classList.add('right'); mark(b, '✓', '正解'); } });
    if (!ok) { btns[n].classList.add('wrong'); mark(btns[n], '✗', 'あなたの答え'); }
    const zh = zhToggle(q.explain_zh);
    fill(fb, h('b', { class: ok ? 'ok' : 'ng' }, ok ? '✓ 正解！' : '✗ 残念…'),
      q.full_ja ? h('p', { lang: 'ja', class: 'full-ja' }, h('span', { html: (settings().furigana && q.full_ruby ? rubyHtml(q.full_ruby) : esc(q.full_ja)).replace(/　/g, '') }), ' ', ttsBtn(q.full_ja.replace(/　/g, ''))) : null,
      h('p', { lang: 'ja' }, q.explain_ja || ''), zh.btn, zh.box, gaiyo ? scriptEl(q) : null);
    fb.hidden = false; act.hidden = false;
    if (gaiyo) stemEl.hidden = false;
    nextBtn.focus({ preventScroll: true });
    fb.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    await ctx.record(ok ? 'good' : 'again');
  }
  const skillName = JLPT_NAME[q.jlpt] || { grammar: '文法', keigo: '敬語', kakikotoba: '書き言葉', reading: '読解', listening: '聴解', vocab: '語彙' }[q.skill] || '';
  const prompt = PROMPT[q.jlpt];
  // 概要理解：作答前は質問文も音声のみ（聞き終わったら文字でも表示）
  const stemEl = h('p', { class: 'stem' + (q.jlpt === 'yoho' ? ' yoho-word' : '') + (q.jlpt === 'bunsho' ? ' bunsho-stem' : ''), lang: 'ja', hidden: gaiyo, html: q.jlpt === 'bunsho' ? blankHtml(stemHtml(q), q.blank) + ' に入るもの' : stemHtml(q) });
  const el = h('div', { class: 'card qcard' },
    h('div', { class: 'card-tags' }, chip(skillName), chip(q.level), ctx.retry ? chip('もう一度', 'accent') : null, q.gen ? null : aiBadge(q), q.gen || ctx.exam ? null : h('span', { class: 'tags-end' }, flagBtn(q.id))),
    gaiyo ? gaiyoAudio(q, () => { stemEl.hidden = false; }) : contextEl(c),
    prompt ? h('p', { class: 'muted small q-prompt' }, prompt) : null,
    stemEl,
    h('div', { class: 'choices' }, btns), fb, act);
  return { el, key(k, e) {
    if (!answered && /^[1-4]$/.test(k)) { e.preventDefault(); pick(+k - 1); }
    else if (answered && (k === 'Enter' || k === ' ')) { e.preventDefault(); ctx.next(); }
  } };
}
export const JLPT_NAME = { kanji_yomi: '漢字読み', hyoki: '表記', bunmyaku: '文脈規定', iikae: '言い換え', yoho: '用法', keishiki: '文法形式', narabe: '並べ替え', naiyo: '内容理解', point: 'ポイント理解', sokuji: '即時応答',
  gokeisei: '語形成', bunsho: '文章の文法', joho: '情報検索', gaiyo: '概要理解', hatsuwa: '発話表現', doukei: '同形異義語',
  togo_r: '統合理解（読解）', kadai: '課題理解', togo_l: '統合理解（聴解）' };
// スクリプト（F／M…の音声）を聞いて答える聴解題型
const SCRIPT_TYPES = new Set(['gaiyo', 'kadai', 'togo_l']);
const PROMPT = {
  kanji_yomi: '＿＿の言葉の読み方として最もよいものを選んでください。',
  hyoki: '＿＿の言葉を漢字で書くとき、最もよいものを選んでください。',
  bunmyaku: '（　　）に入れるのに最もよいものを選んでください。',
  iikae: '＿＿に意味が最も近いものを選んでください。',
  yoho: '次の言葉の使い方として最もよいものを選んでください。',
  narabe: '★に入る最もよいものを選んでください。',
  gokeisei: '（　　）に入れるのに最もよいものを選んでください。',
  bunsho: '文章全体の内容を考えて、空欄に入る最もよいものを選んでください。',
  joho: '表と案内を読んで、答えとして最もよいものを選んでください。',
  gaiyo: '話を聞いて、質問に答えてください。/ 聽完回答問題',
  kadai: 'まず質問を聞いてください。それから話を聞いて、最もよいものを選んでください。/ 先聽問題再聽對話',
  togo_l: '長めの話を聞いて、最もよいものを選んでください。/ 聽完較長的內容後作答',
  togo_r: 'AとBの文章を読んで、最もよいものを選んでください。/ 讀完 A、B 兩篇文章後作答',
  doukei: '＿＿の言葉の、この文での意味として最もよいものを選んでください。/ 選出底線詞語在句中的意思（中文）',
};
// 概要理解：script（F／M の音声）＋質問を続けて再生。文字は作答後
function gaiyoAudio(q, onHeard) {
  let playing = false;
  const lines = (q.script || []).map((l) => l.ja);
  const texts = (q.jlpt === 'kadai' ? [q.stem, ...lines, q.stem] : [...lines, q.stem]).filter(Boolean);
  const again = q.jlpt === 'togo_l' && q.part > 1; // 質問2：質問1と同じ音声（自動再生しない）
  const b = h('button', { class: 'btn big', type: 'button', onclick: async () => {
    if (playing) { tts.stop(); return; }
    playing = true; b.textContent = '■ 停止';
    const ok = await tts.playSequence(texts, { gap: 500, title: JLPT_NAME[q.jlpt] });
    playing = false; b.textContent = '▶ もう一度聞く';
    if (ok) onHeard();
  } }, '▶ 聞く');
  const showQ = h('button', { class: 'btn', type: 'button', onclick: () => { onHeard(); showQ.remove(); } }, '質問を文字で見る / 顯示問題');
  if (again) { onHeard(); showQ.remove(); b.textContent = '▶ もう一度聞く'; } else setTimeout(() => b.click(), 300);
  return h('div', { class: 'audio-box' }, h('p', { class: 'muted small' }, again ? '質問1と同じ話です。もう一度聞くこともできます / 與質問1同一段音檔' : '話を聞いてから答えてください（スクリプトは答えた後に見られます）/ 先聽再作答，作答後可看逐字稿'), h('div', { class: 'ctl-row' }, b, showQ));
}
// 聴解の逐字稿（作答後）
const SPK = { F: '女', M: '男', F2: '女2', M2: '男2' };
function scriptEl(q) {
  const ruby = (l) => (settings().furigana && l.ruby ? rubyHtml(l.ruby) : esc(l.ja));
  return h('details', { class: 'fold' }, h('summary', null, h('span', null, 'スクリプト / 逐字稿')),
    h('div', { class: 'script' }, (q.script || []).map((l) => h('p', { lang: 'ja' }, h('small', { class: 'spk' }, SPK[l.spk] || '女'), h('span', { html: ruby(l) }), ' ', ttsBtn(l.ja))),
      h('p', { lang: 'ja' }, h('small', { class: 'spk' }, '質問'), h('span', { html: settings().furigana && q.stem_ruby ? rubyHtml(q.stem_ruby) : esc(q.stem) }))));
}

// 即時応答：短い発話を聞く → 3つの返事（音声）から選ぶ。文字は答えた後に表示
// 発話表現（hatsuwa）：場面の説明（文字＋音声）→ 3つの言い方（音声）から選ぶ
function sokujiCard(c, ctx) {
  const q = c.data;
  const hatsuwa = q.jlpt === 'hatsuwa';
  const lead = hatsuwa ? q.situation_ja : q.prompt_ja, leadRuby = hatsuwa ? q.situation_ruby : q.prompt_ruby;
  let answered = false, playing = false;
  const fb = h('div', { class: 'feedback', hidden: true });
  const nextBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => ctx.next() }, '次へ');
  const act = h('div', { class: 'sticky-act', hidden: true }, nextBtn);
  const txt = q.choices.map((t, k) => h('span', { lang: 'ja', class: 'ch-text', hidden: true, html: choiceHtml(q, k) }));
  const btns = q.choices.map((t, k) => h('button', { class: 'choice', type: 'button', onclick: () => pick(k) }, h('span', { class: 'ch-n' }, k + 1), txt[k], h('span', { class: 'ch-mark', 'aria-hidden': 'true' })));
  const promptTxt = h('p', { class: 'stem' + (hatsuwa ? ' situation' : ''), lang: 'ja', hidden: !hatsuwa, html: settings().furigana && leadRuby ? rubyHtml(leadRuby) : esc(lead) });
  const play = async () => {
    if (playing) { tts.stop(); return; }
    playing = true; pb.textContent = '■ 停止';
    await tts.playSequence([lead, ...q.choices], { gap: 700, title: JLPT_NAME[q.jlpt], onLine: (i) => btns.forEach((b, k) => b.classList.toggle('playing', k === i - 1)) });
    btns.forEach((b) => b.classList.remove('playing'));
    playing = false; pb.textContent = '▶ もう一度聞く';
  };
  const pb = h('button', { class: 'btn big', type: 'button', onclick: play }, '▶ 聞く');
  const showText = () => { promptTxt.hidden = false; txt.forEach((t) => { t.hidden = false; }); };
  async function pick(k) {
    if (answered) return;
    answered = true; tts.stop();
    const ok = k === q.answer;
    btns.forEach((b) => { b.disabled = true; });
    if (ctx.exam) { btns[k].classList.add('picked'); await ctx.record(ok ? 'good' : 'again'); setTimeout(() => ctx.next(), 250); return; }
    showText();
    btns[q.answer].classList.add('right'); btns[q.answer].querySelector('.ch-mark').textContent = '✓';
    if (!ok) { btns[k].classList.add('wrong'); btns[k].querySelector('.ch-mark').textContent = '✗'; }
    const zh = zhToggle(q.explain_zh);
    fill(fb, h('b', { class: ok ? 'ok' : 'ng' }, ok ? '✓ 正解！' : '✗ 残念…'), h('p', { lang: 'ja' }, q.explain_ja || ''), zh.btn, zh.box);
    fb.hidden = false; act.hidden = false;
    nextBtn.focus({ preventScroll: true });
    fb.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    await ctx.record(ok ? 'good' : 'again');
  }
  setTimeout(play, 300);
  const el = h('div', { class: 'card qcard' },
    h('div', { class: 'card-tags' }, chip(JLPT_NAME[q.jlpt]), chip(q.level), ctx.retry ? chip('もう一度', 'accent') : null, aiBadge(q), ctx.exam ? null : h('span', { class: 'tags-end' }, flagBtn(q.id))),
    h('p', { class: 'muted small q-prompt' }, hatsuwa ? '場面を聞いて、この人が言うこととして最もよいものを1〜3の中から選んでください。/ 聽情境，選出最適當的說法' : '文を聞いて、1〜3の中から最もよい返事を選んでください。/ 聽完選出最適當的回應'),
    hatsuwa ? promptTxt : null, pb, hatsuwa ? null : promptTxt, h('div', { class: 'choices' }, btns), fb, act);
  return { el, key(k, e) {
    if (!answered && /^[1-3]$/.test(k)) { e.preventDefault(); pick(+k - 1); }
    else if (!answered && k === 'r') { e.preventDefault(); play(); }
    else if (answered && (k === 'Enter' || k === ' ')) { e.preventDefault(); ctx.next(); }
  } };
}
