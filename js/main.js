import { applySettings, lsGet, lsSet } from './store.js';
import { route, start, onRoute } from './router.js';
import { h, toast } from './ui.js';
import * as tts from './tts.js';
import * as db from './db.js';
import { home } from './views/home.js';
import { review, newWords, quick, practice } from './views/review.js';
import * as gram from './views/grammar.js';
import * as voc from './views/vocab.js';
import * as dlg from './views/dialogue.js';
import * as rd from './views/reading.js';
import { more } from './views/more.js';
import * as jlpt from './views/jlpt.js';
import { migrate } from './plan.js';
import { settingsView } from './views/settings.js';

applySettings();
route('/home', home);
route('/review', review);
route('/quick', quick);
route('/newwords', newWords);
route('/listen', dlg.listenOnly);
route('/listen/:id', dlg.listenOnly);
route('/grammar', gram.list);
route('/grammar/:id', gram.detail);
route('/grammar/:id/practice', gram.practice);
route('/vocab', voc.vocab);
route('/vocab/:lv/:n', voc.batch);
route('/practice/:skill', practice);
route('/dialogues', dlg.list);
route('/dialogue/:id', dlg.detail);
route('/dialogue/:id/roleplay', dlg.roleplay);
route('/dialogue/:id/listening', dlg.listening);
route('/reading', rd.list);
route('/reading/:id', rd.detail);
route('/more', more);
route('/settings', settingsView);
route('/jlpt', jlpt.top);
route('/jlpt/:lv/drill/:type', jlpt.drill);
route('/jlpt/:lv/mini', jlpt.mini);
route('/jlpt3', jlpt.daily);

// 底部分頁列
// 圖示一律用漢字一字（與首頁流程卡、朱印「習」同一套語彙）
const tabs = [['#/home', '今', 'ホーム', ['home', 'quick', 'listen', 'jlpt3']], ['#/review', '復', '復習', ['review']], ['#/grammar', '文', '文法', ['grammar']], ['#/vocab', '単', '単語', ['vocab', 'newwords']], ['#/more', '他', 'その他', []]];
const nav = h('nav', { class: 'tabbar', 'aria-label': 'メイン' }, tabs.map(([href, ic, t]) => h('a', { href }, h('i', { 'aria-hidden': 'true' }, ic), h('span', null, t))));
document.body.append(nav);
onRoute((path) => {
  const top = path.split('/')[1];
  const hit = tabs.find((t) => t[3].includes(top)) || tabs[4];
  [...nav.children].forEach((a, i) => { const on = tabs[i] === hit; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
});

const app = document.getElementById('app');
migrate().finally(() => start(app)); // 舊版文法題卡遷移完成後再畫面
db.persist();

// 沒有音檔也沒有可用的（非 Apple）日語聲音 → 一次性引導
Promise.all([tts.ready, tts.audioReady]).then(() => {
  if (tts.audioInfo().has || tts.hasJaVoice() || lsGet('tts_guide_seen')) return;
  const b = h('div', { class: 'banner' }, h('span', null, '音声ファイルが読み込めません。オンラインで一度開いてください。/ 無法載入音檔，請連網開啟一次。'),
    h('button', { class: 'btn', onclick: () => { lsSet('tts_guide_seen', '1'); b.remove(); } }, '閉じる'));
  document.body.prepend(b);
});
// 音檔がない文：Apple 音声で代用しない → 短く知らせる
let missT = 0;
// 離線＋音檔未下載：一次性明確提示（耳だけ連播等で逐句 toast を出さない）
window.addEventListener('tts-offline', () => {
  if (document.getElementById('offline-audio')) return;
  const b = h('div', { class: 'banner warn', id: 'offline-audio', role: 'alert' },
    h('span', null, 'オフラインのため、まだ保存していない音声は再生できません。オンラインのときに「音声をダウンロード」してください。/ 離線中，未下載的音檔無法播放；請連網時先下載。'),
    h('a', { class: 'btn', href: '#/settings', onclick: () => b.remove() }, '設定'),
    h('button', { class: 'btn', type: 'button', onclick: () => b.remove() }, '閉じる'));
  document.body.prepend(b);
});
window.addEventListener('tts-missing', () => { if (Date.now() - missT > 4000) { missT = Date.now(); toast('この文の音声はまだありません / 此句尚無音檔'); } });

// Service worker + 更新バナー
if ('serviceWorker' in navigator) {
  const ask = (reg) => {
    if (document.querySelector('.banner.update')) return;
    document.body.prepend(h('div', { class: 'banner update' }, h('span', null, '新しいバージョンがあります'),
      h('button', { class: 'btn primary', onclick: () => reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' }) }, '更新')));
  };
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) ask(reg); });
    });
  }).catch(() => {});
  // 只有「原本就有 controller」（＝更新）才重新載入；首次造訪被 claim 時不重載
  let reloaded = false, hadCtl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl && !reloaded) { reloaded = true; location.reload(); } hadCtl = true; });
}
