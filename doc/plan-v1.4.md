# 改版計畫 v1.4（2026-10-22）

依據：工程師審查（Sonnet，7.5/10）＋日文老師審查（Fable，N2 準備度約 40%）。
目標：修掉所有 bug → 工程防呆 → 內容補到「N2 可用」程度（準備度目標 65–70%）。
負責：Me＝主對話、Op＝Opus agent、So＝Sonnet agent、Fa＝Fable（只審稿）

## A. 快修（Me，已完成）
| ID | 項目 | 狀態 |
|---|---|---|
| A1 | ruby 標記外漏到畫面（文法誤用例、比較、選項 34 處） | ✅ |
| A2 | 資料載入失敗時閘門被鎖成 normal 一整天 → 不存檔 | ✅ |
| A3 | 單字表記混入註記 22 筆（しまった (かん)、下品(な)…）＋build_vocab 固定修正 | ✅ |
| A4 | 老師指出的內容錯誤（だけあって、考え得ない、二人きり、込む→混む、折角） | ✅ |

## B. 工程（Op ×1）
| ID | 項目 |
|---|---|
| B1 | 單元測試 `node --test`：logic.js、srs.js（日界 03:59/04:00、跨月、閘門、checkBackup） |
| B2 | validate.py：音檔清單↔檔案雙向比對、sw.js 是否最新（bump_sw `--check`）、vocab 欄位、新題型 |
| B3 | git pre-commit hook（bump_sw --check＋validate＋node --test）＋`tools/install_hooks.sh` |
| B4 | 備份匯入驗證（日期、state、重複 id）；rate() 合併為單一交易；revoke ObjectURL |
| B5 | 離線音檔：「この課の音声をダウンロード」按鈕＋連播時離線偵測提示 |
| B6 | SW：cacheFirst 只快取白名單路徑 |
| B7 | 新題型 UI：gokeisei、bunsho、joho（表格）、gaiyo（獨白音檔）、hatsuwa、doukei；長文讀解 |
| B8 | 每日流程：新字「平日／週末」兩個設定（預設 8／15）；首頁加「JLPT 3問」；中日同形異義卡 |
| B9 | build_audio.py 支援新欄位＋`--prune` 清孤兒音檔 |

## C. 內容（新檔，各 agent 只寫自己的檔）
| ID | 內容 | 量 | 檔案 | 負責 |
|---|---|---|---|---|
| C1 | N2 單字前 1000 字：中文釋義＋例句 | 2×500 | vocab_extra_n2_1/2.json | So ×2 |
| C2 | 文法 N3 +11（067–077）、N2 +60（041–100），每點 5 題 | 71 點／355 題 | grammar_f〜i＋quiz_grammar_f〜i | Op ×4 |
| C3 | N2 長文讀解 6 篇（700–900 字，各 3 題） | 6 篇 | reading_03＋quiz_reading_03 | Op |
| C4 | 情報検索 4 篇＋文章の文法 4 篇 | 8 篇 | reading_04＋quiz_reading_04 | Op |
| C5 | 聽解：概要理解 8、発話表現 8、即時応答干擾項重寫＋N2 再加 20 | 36＋改 60 | quiz_jlpt_gaiyo／hatsuwa／sokuji | Op |
| C6 | 語形成 N2 20 題＋中日同形異義 40 題 | 60 | quiz_jlpt_gokeisei／doukei | So |

## D. 收尾（Me＋Fa）
| ID | 項目 |
|---|---|
| D1 | Fable 抽審新內容（每類 15–20 條）→ 修正 |
| D2 | build_audio（VOICEVOX）→ validate → 測試 → bump_sw → 瀏覽器實測 → push |
| D3 | 更新 roadmap、交接卡 |

## 不做（本版）
- N3 後半 2633 字中文化（下一版）
- 本番模試（全長）
- 新字預設由 5 改 8／週末 15：老師建議（3600 字走完要 2 年）；可在設定改回
- Fable 抽審清單：doc/review-todo-v1.4.tsv
