import { h, pageHead } from '../ui.js';
const L = (href, t, sub) => h('li', null, h('a', { class: 'row-link', href }, h('span', { class: 'row-main' }, h('b', null, t), h('small', null, sub)), h('span', { class: 'row-side' }, '›')));
export async function more() {
  return h('div', { class: 'page' }, pageHead('その他'),
    h('ul', { class: 'list' },
      L('#/jlpt', 'JLPT 対策', '題型練習・ミニ模試（N3／N2）'),
      L('#/practice/keigo', '敬語', '尊敬語・謙譲語・場面の練習'),
      L('#/keigo/table', '敬語のまとめ表', '特別な敬語・作り方・電話の決まり文句'),
      L('#/practice/kakikotoba', '書き言葉', '書き言葉への言い換え'),
      L('#/dialogues', '会話', '跟讀・ロールプレイ・聴解'),
      L('#/listen', '耳だけモード', '会話を聞き流す'),
      L('#/reading', '読解', '短い文章と問題'),
      L('#/settings', '設定', 'ふりがな・バックアップ・リマインダー')));
}
