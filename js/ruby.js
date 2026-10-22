// 振假名：漢字{かな} → <ruby>
import { settings } from './store.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RE = /([一-鿿々〆ヶ]+)\{([^}]*)\}/g;
export function rubyHtml(s) { return esc(s).replace(RE, '<ruby>$1<rt>$2</rt></ruby>'); }
export function strip(s) { return String(s ?? '').replace(/\{[^}]*\}/g, ''); }
// item[field] 為純文字；對應的 ruby 欄位：ja→ruby、其他→field_ruby
export function renderJa(item, field = 'ja', furigana = settings().furigana) {
  const rf = field === 'ja' ? 'ruby' : field + '_ruby';
  if (furigana && item[rf]) return rubyHtml(item[rf]);
  return esc(item[field]);
}
