import { h, pageHead, toast, confirmDialog, download, segGroup } from '../ui.js';
import { settings, setSetting, replaceSettings } from '../store.js';
import * as db from '../db.js';
import * as tts from '../tts.js';
import * as speech from '../speech.js';
import { allAudioSection } from '../offline.js';

const sec = (title, ...kids) => h('section', { class: 'card set' }, h('h2', null, title), ...kids);
const row = (label, ctl) => h('label', { class: 'set-row' }, h('span', null, label), ctl);
function toggle(key, label) {
  const i = h('input', { type: 'checkbox', checked: settings()[key], onchange: () => setSetting(key, i.checked) });
  i.checked = settings()[key];
  return row(label, h('span', { class: 'switch' }, i, h('i', null)));
}
function segs(key, opts, label) {
  return h('div', { class: 'set-row col' }, h('span', null, label), segGroup(opts, () => settings()[key], (v) => setSetting(key, v), label));
}
function range(key, label, min, max, step, fmt = (v) => v) {
  const out = h('b', null, fmt(settings()[key]));
  const i = h('input', { type: 'range', min, max, step, value: settings()[key], oninput: () => { setSetting(key, +i.value); out.textContent = fmt(+i.value); } });
  return h('div', { class: 'set-row col' }, h('span', null, label, ' ', out), i);
}
const pad = (n) => String(n).padStart(2, '0');
// RFC 5545：TEXT 跳脫、CRLF、每行 75 bytes 折行
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const enc = new TextEncoder(); let out = '', cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 75) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
const icsTime = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
export function ics(time, plan, now = new Date()) {
  const [hh, mm] = time.split(':').map(Number);
  const st = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
  const en = new Date(st.getTime() + 15 * 60000); // 用 Date 加 15 分，自動進位到下一小時／隔天
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const desc = (plan ? plan + ' / ' : '') + '1日15分。2分だけでもOK。';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//japanese-learning//JP//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:jp-fukushuu-daily@japanese-learning`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(st)}`, `DTEND:${icsTime(en)}`,
    'RRULE:FREQ=DAILY', `SUMMARY:${icsEsc('日本語ふくしゅう')}`, `DESCRIPTION:${icsEsc(desc)}`, 'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('日本語ふくしゅう')}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}

export async function settingsView() {
  const s = settings();
  await Promise.all([tts.ready, tts.audioReady]);
  const au = tts.audioInfo();
  const voices = tts.jaVoices();
  const vSel = h('select', { 'aria-label': '音声', onchange: () => setSetting('voice', vSel.value) }, h('option', { value: '' }, '自動 / 自動'), voices.map((v) => h('option', { value: v.name }, v.name)));
  vSel.value = s.voice;
  const lastB = await db.getMeta('last_backup_at');
  const backupInfo = h('p', { class: 'muted' }, lastB ? '最終バックアップ：' + new Date(lastB).toLocaleString('ja-JP') : 'まだバックアップしていません / 尚未備份');

  const buildBackup = async () => JSON.stringify({ app: 'japanese-learning', version: 1, exported_at: new Date().toISOString(), settings: settings(), ...(await db.exportAll()) });
  const fname = () => `nihongo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const saved = async () => { await db.setMeta('last_backup_at', Date.now()); backupInfo.textContent = '最終バックアップ：たった今'; };
  const canShare = !!navigator.share;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; // 主畫面 app：下載不便，改以「共有」為主
  let persisted = null; try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) {}
  const pre = await db.getMeta('preImportBackup');
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async () => {
    const f = file.files[0]; if (!f) return;
    try {
      let d; try { d = JSON.parse(await f.text()); } catch (e) { throw new Error('JSON ではありません / 不是 JSON 檔'); }
      db.checkBackup(d);
      if (!(await confirmDialog(`今の進度を上書きして復元しますか？（カード ${d.cards.length} 枚）\n今の進度は自動で控えを残します。\n要用備份覆蓋目前進度嗎？（會自動保留目前進度的副本）`, '復元 / 還原'))) { file.value = ''; return; }
      await db.importAll(d, { settings: settings() }); if (d.settings) replaceSettings(d.settings);
      toast('復元しました / 已還原'); setTimeout(() => { location.hash = '#/home'; location.reload(); }, 800);
    } catch (e) { toast('読み込めませんでした：' + e.message); }
    file.value = '';
  } });
  const time = h('input', { type: 'time', value: s.remindTime, 'aria-label': '時刻', onchange: () => setSetting('remindTime', time.value || '20:00') });
  const plan = h('input', { type: 'text', placeholder: '例：通勤の電車で / 午休後', value: s.plan || '', 'aria-label': 'いつ学ぶ', onchange: () => setSetting('plan', plan.value) });

  return h('div', { class: 'page' }, pageHead('設定', '#/more'),
    sec('表示 / 顯示', toggle('furigana', 'ふりがな / 振假名'), toggle('zh', '中文ヒント / 中文提示'),
      segs('font', [['S', '小'], ['M', '中'], ['L', '大']], '文字サイズ / 字級')),
    sec('音声 / 語音', range('rate', '速さ / 語速', 0.5, 1.2, 0.05, (v) => '×' + (+v).toFixed(2)),
      h('p', { class: 'muted' }, au.has ? `音声ファイル：あり（${au.voice || '?'}）/ 預錄音檔 ${au.n} 件` : '音声ファイル：読み込めません（オンラインで開き直してください）/ 無法載入音檔'),
      // 予備の声：音声ファイルがない文だけ。Apple の声は使わない（一覧にも出さない）
      voices.length ? row('予備の声 / 備用聲音', vSel) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => tts.speak('こんにちは。日本語ふくしゅうへようこそ。') }, '🔊 テスト'),
      h('p', { class: 'muted small' }, '音声は VOICEVOX の録音のみ使います（端末の Apple 音声は使いません）。/ 只用 VOICEVOX 錄音，不用 Apple 系統語音')),
    au.has ? sec('オフライン音声 / 離線音檔', allAudioSection()) : null,
    sec('学習 / 學習', range('newPerWeekday', '新しい単語・平日（月〜金）/ 平日每日新單字', 0, 20, 1), range('newPerWeekend', '新しい単語・週末（土日）/ 週末每日新單字', 0, 20, 1),
      h('p', { class: 'muted small' }, '朝4時で日付が変わります。復習が多い日は自動でお休みになります。/ 凌晨 4 點換日；複習太多時自動暫停新字'),
      segs('newLevel', [['N3', 'N3'], ['N2', 'N2'], ['MIX', '混合']], '新しい単語のレベル / 新單字等級'),
      toggle('listenCards', '聞き取りカード / 聽力卡'),
      h('p', { class: 'muted small' }, '覚えた単語（約1週間安定）は「聞いて意味を思い出す」カードも追加（1日5枚まで）/ 熟悉的單字加聽音卡')),
    sec('バックアップ / 備份', backupInfo,
      h('p', { class: 'muted' }, '進度はこの端末のブラウザに保存されます。定期的に書き出してください。'),
      h('p', { class: 'muted' }, persisted == null ? '永続保存：確認できません / 無法確認持久儲存' : persisted ? '永続保存：有効（消えにくい）/ 已啟用持久儲存' : '永続保存：未許可（ブラウザが消す場合あり）/ 未啟用持久儲存'),
      h('div', { class: 'ctl-row' },
        h('button', { class: 'btn' + (standalone && canShare ? '' : ' primary'), type: 'button', onclick: async () => { download(fname(), await buildBackup()); await saved(); } }, '書き出し / 匯出'),
        canShare ? h('button', { class: 'btn' + (standalone ? ' primary' : ''), type: 'button', onclick: async () => {
          const f = new File([await buildBackup()], fname(), { type: 'application/json' });
          try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: '日本語ふくしゅう backup' }); else await navigator.share({ title: '日本語ふくしゅう backup', text: await buildBackup() }); await saved(); } catch (e) { /* 取消 */ }
        } }, '共有 / 分享') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, '読み込み / 匯入')), file,
      pre ? h('button', { class: 'btn', type: 'button', onclick: () => download(`nihongo-before-import-${new Date(pre.at).toISOString().slice(0, 10)}.json`, JSON.stringify(pre)) }, '↩ 復元前の控えを書き出す / 匯出還原前的副本') : null,
      h('button', { class: 'btn', type: 'button', onclick: async () => { download('flags.json', JSON.stringify(await db.allFlags(), null, 2)); } }, '⚑ 報告を書き出す / 匯出回報')),
    sec('リマインダー / 提醒', h('p', { class: 'muted' }, 'いつ学ぶか決めておくと続きます。毎日の通知をカレンダーに追加します。'), row('いつ / 何時', time), row('きっかけ / 情境', plan),
      h('button', { class: 'btn', type: 'button', onclick: () => download('nihongo-reminder.ics', ics(time.value || '20:00', plan.value), 'text/calendar') }, '📅 カレンダー用 .ics をダウンロード')),
    sec('ホーム画面に追加 / 加到主畫面', h('details', null, h('summary', null, 'iPhone の手順 / iPhone 步驟'),
      h('ol', null, h('li', null, 'Safari でこのページを開く'), h('li', null, '共有ボタン（□↑）をタップ'), h('li', null, '「ホーム画面に追加」を選ぶ')),
      h('p', { class: 'muted' }, '追加するとデータが消えにくくなります（Safariは7日未使用で消す場合あり）。/ 加入主畫面可降低資料被清除的風險。'))),
    sec('口説（音声認識）/ 語音辨識', h('p', { class: 'muted' }, speech.supported ? '🎤 を押すと、ブラウザの音声認識を使います。音声は端末ではなくクラウド（Apple/Google）に送られることがあります。/ 語音可能會傳送到雲端處理。' : 'このブラウザは音声認識に対応していません（🎤 は表示されません）。')),
    sec('クレジット / 授權', h('ul', { class: 'plain small' },
      h('li', null, '単語：open-anki-jlpt-decks (MIT)'), h('li', null, '単語リスト：Tanos JLPT (CC BY)'), h('li', null, '辞書：JMdict © EDRDG (CC BY-SA 4.0)'), h('li', null, 'SRS：ts-fsrs (MIT)'),
      h('li', null, '単語の頻度：wordfreq (CC BY-SA 4.0)'),
      h('li', null, '音声：VOICEVOX:冥鳴ひまり／VOICEVOX:玄野武宏（VOICEVOX で合成）'),
      h('li', null, '文法・会話・読解：オリジナル（AI作成）'))));
}
