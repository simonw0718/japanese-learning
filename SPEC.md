# SPEC v1.0 — 日本語ふくしゅう（N3→N2 複習網站）

狀態：定版 v1.0（已經 agent 審查修訂）｜日期：2026-10-22
變更：v0.1 → v1.0 見文末「修訂紀錄」。

## 0. 使用者設定（已確認）
| 項目 | 決定 |
|---|---|
| 程度 | N3 複習 → 衝 N2 |
| 時間 | 平日 15 分／天，手機為主；週末加量為「選擇性」 |
| 發音 | 只用瀏覽器 Web Speech API |
| 介面語言 | 全日文；中文提示點開；設定／備份等關鍵操作雙語 |
| 託管 | 目標全靜態（GitHub Pages），v1 本機可跑 |
| 參考教材 | TRY! N3/N2：只在本機 `doc/reference-index/` 作私人對照，不上線、不複製內容 |

## 1. 學習方法 → 設計規則
| ID | 方法 | 根據 | 設計規則 |
|---|---|---|---|
| M1 | 間隔重複 | Cepeda 2006；FSRS | FSRS 排程，目標保留率 0.85（省負載） |
| M2 | 提取練習 | Roediger & Karpicke 2006 | 先作答再看答案；沒有「只看」模式 |
| M3 | 交錯 | Rohrer 2012 | 復習時文法／單字／敬語混排 |
| M4 | 情境例句＋雙重編碼 | Paivio；句子挖礦 | 單字、文法一律附例句＋發音 |
| M5 | 跟讀 | Hamada 2016 | 會話逐句播放，0.7/0.85/1.0 倍速 |
| M6 | 可理解輸入 | Krashen；Nation | 讀解略低於程度＋理解題 |
| M7 | 實施意圖 | Gollwitzer 1999 | 設定「通勤時／午休後」if-then 計畫；行事曆提醒 |
| M8 | 輸出 | Swain | 敬語轉換、書面語改寫、角色扮演 |

## 2. 負載控制（關鍵）
| 規則 | 值 |
|---|---|
| 新單字／天 | 預設 5（可調 0–10） |
| 新文法／天 | 1 |
| 復習時間盒 | 約 8 分或 30 張先到者為止 |
| 負載閘門 | 到期 >30 → 新卡 0；>50 → 還債模式（每日只出 30 張） |
| 漏日復原 | 離開 ≥3 天：不顯示積欠，「おかえり」只出 10 張 |
| 單字庫 | 依頻率分批解鎖（每批 100 字），不一次全開 |
| 評分鍵 | 3 鍵：もう一度／思い出した／簡単 |

## 3. 每日流程（「きょうの練習」，每步可獨立完成、可換順序）
1. 復習（約 8 分）
2. 新しい文法 1 點（說明→例句→2 題）
3. 新しい単語 5 張
4. 聞く・話す：1 段會話跟讀
- **2 分鐘模式**：5 張到期卡＋1 句跟讀，即算「今天有學」
- **耳だけモード**：只聽會話（通勤、哄睡時）
- 激勵：「本週 7 天中學了 N 天」（不用會歸零的連勝）；累計記住單字數、文法覆蓋率

## 4. 功能模組
| ID | 模組 | v1 內容量 | 練習形式 |
|---|---|---|---|
| F1 | ホーム（今日） | 流程＋本週天數＋2 分模式 | — |
| F2 | 文法 | N3 20 點、N2 10 點 | 選擇、填空 |
| F3 | 単語 | N3、N2 開源清單（分批解鎖） | 日→讀音＋意味，3 鍵自評 |
| F4 | 敬語 | 20 題 | 轉換、場面選擇 |
| F5 | 書き言葉 | 12 題 | 改寫選擇 |
| F6 | 会話 | 4 段（職場、取引先、學校、醫院） | 跟讀、角色扮演（遮自己台詞） |
| F7 | 読解 | 3 篇 | 選擇題、振假名開關 |
| F8 | 聴解 | 共用會話資料，只聽不看 → 作答 | 聽後作答、逐字稿 |
| F9 | 口説（加分） | SpeechRecognition 可用時比對；否則自評 | 不列入驗收 |
| F10 | 設定 | 振假名、中文提示、語速、字級、新卡數、備份匯出入、.ics | — |

## 5. 架構
- 純靜態：`index.html` + 原生 ES modules，無 build。
- PWA：manifest＋service worker（版本化快取名，更新時提示）。
- 儲存：**IndexedDB** 存進度（card_state、review_log）；localStorage 只存設定；`navigator.storage.persist()`；首頁每週提醒匯出備份（Web Share／下載 JSON）。
- iOS：首次引導「加到主畫面」（避免 7 天清除）。
- SRS：FSRS（ts-fsrs vendor 進 `vendor/`；不可用時自寫 FSRS 核心）。
- TTS：使用者點擊時解鎖；等待 `voiceschanged`；挑 ja-JP 聲音；長文按句切；無日語聲音時顯示引導。
- 提醒：`.ics`（RRULE 每日＋VALARM），稱「行事曆提醒」。
- 回報：每題有「⚑ おかしい」按鈕，存本機，可匯出。

```
index.html  app.css  sw.js  manifest.webmanifest
js/  main.js router.js db.js srs.js tts.js speech.js session.js ui.js views/*.js
data/ grammar.json vocab_n3.json vocab_n2.json quiz.json dialogues.json reading.json
vendor/ ts-fsrs.mjs
tools/ ocr.swift build_vocab.py validate.py
doc/reference-index/  （本機私人，不部署）
```

## 6. 資料 schema（通用欄位：id, v, level, tags, review, src）
- `review`：`ai_drafted` → `ai_reviewed` → `human_checked`；未人工確認的題目顯示小標。
- ID 穩定、不重用：`g-n3-0012`、`v-n3-0345`、`q-g-n3-0012-1`、`d-work-0003`、`r-n3-0002`。
- grammar：`pattern, connect[], meaning_ja, meaning_zh, register, examples[{id,ja,ruby,zh}], contrast[], quiz_ids[]`
- vocab：`surface, reading, pos, meaning_en, meaning_zh?, batch, src{type,license}`
- quiz：`type(mcq|fill|convert), skill(grammar|keigo|kakikotoba|reading|listening), target[], stem, choices[], answer[], explain_ja, explain_zh`
- dialogue：`scene, title, turns[{spk, role(me|other), ja, ruby, zh}], questions[]`
- reading：`genre, title, body[{ja, ruby, zh}], questions[]`
- card_state（IndexedDB）：`item_id, kind, due, stability, difficulty, reps, lapses, state, last_review`
- 振假名格式：`ruby` 欄位用 `漢字{かんじ}` 標記，前端轉 `<ruby>`。

## 7. 內容來源、授權與 QA
| 類別 | 來源 | 處理 |
|---|---|---|
| 單字 | open-anki-jlpt-decks（MIT，源自 Tanos CC-BY）＋JMdict common（CC BY-SA 4.0，排序／詞性） | `tools/build_vocab.py` 轉檔，頁尾標出處授權；v1 釋義為英文 |
| SRS | ts-fsrs 5.4.2（MIT） | `vendor/ts-fsrs.umd.js`，全域 `FSRS` |
| 外部閱讀／聽力 | NHK News Web Easy、Tadoku 免費讀本 | 只放連結 |
| 例句 | 原創為主；Tatoeba（CC-BY）備用 | 保留出處 |
| 文法／敬語／書き言葉／會話／讀解 | 原創（AI 撰寫） | 自訂功能分類，不依 TRY 順序 |

QA 流程（敬語、書き言葉、N2 文法 100% 雙審）：
1. 撰寫模型產出 → 2. 另一模型獨立審稿（自然度、語體、等級、唯一正解）→ 3. `validate.py`（schema、ID、答案索引、振假名格式）→ 4. 使用者 ⚑ 回報。

## 8. 版本規劃
- **v1（本次）**：上表全部模組最小內容量。
- v1.1：擴充 N3/N2 文法至 TRY 全量對應、更多會話。
- v1.2：讀解／聽解擴充、GitHub Pages 部署、FSRS 參數個人化。

## 9. 非目標
帳號／雲端同步、推播伺服器、AI 即時對話、漢字書寫。

## 10. 驗收標準
- 375px 寬無橫向捲動；字級可調
- 裝置有 ja-JP 語音時全部可發音；沒有時顯示引導
- 每日流程 15 分內可完成；每答一題即存檔，中斷可接續
- 重新整理後進度不遺失；可匯出／匯入
- 離線可用（安裝後）
- `tools/validate.py` 通過

## 修訂紀錄
- v1.0：加入負載閘門、2 分模式、漏日復原、週天數取代連勝；儲存改 IndexedDB＋持久化＋備份提醒；TTS／iOS 風險對策；F9 降為加分；聽解併用會話資料；加入 QA 流程與 review 狀態；TRY 對照改為僅本機。
