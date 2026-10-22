# 內容撰寫指南（給撰稿 agent）

學習者：台灣上班族、爸爸，N3 複習→N2。介面日文；中文一律**繁體（台灣用語）**。
格式合約：[schema.md](schema.md)。檔案清單：`data/manifest.json`（新檔要列入對應 set）。

## 共通規則
1. **原創**：不可複製任何教科書或網站文字。文法名稱屬事實可用；說明、例句、對話、題目必須自己寫。
2. **ID**：照指派表，不可自創、不可重用。
3. **review**：新寫的一律 `"ai_drafted"`。
4. **場景**：職場、取引先、家庭、育兒、學校聯絡、通勤、醫院、鄰居、行政手續等生活化場景。
5. **振假名（最常出錯）**：`ruby` = `ja` 中每段漢字後加 `{かな}`；去掉所有 `{…}` 必須與 `ja` 完全相同；送假名放外面（`遅{おく}れる`）；所有漢字都標；讀音要正確。`{}` 只能出現在 `ruby`／`stem_ruby`。
6. **選擇題**：4 個不重複選項、**只有一個說得通的答案**（干擾項在該句中必須明確錯，不能只是「比較不自然」）。`explain_ja` 說明正解理由＋最容易誤選的干擾項為何錯；`explain_zh` 同內容中文。答案位置 0–3 要平均分布。
7. **難度**：例句詞彙不超過該級太多；`explain_ja` 用 N3 讀得懂的日文。
8. 檔案用 python3 腳本產生（`json.dump(..., ensure_ascii=False, indent=2)`），腳本放 scratchpad，不放 `data/`。
9. 完成後跑 `python3 tools/validate.py`，必須 ✅。

## 文法點（grammar_*.json）
- 欄位：`id, v, level, pattern, category, connect, meaning_ja, meaning_zh, register, note_ja, examples(≥3), explain_ja, explain_zh, points(2–4), forms(1–4), compare(≥2：至少 1 個 similar＋1 個 confusable), mistakes(≥1), scene_ja, review`。`quiz_ids` 可省（題目用 `target` 連結）。
- `compare.ref`：若該表現在 `doc/grammar-plan.tsv` 或現有 `data/grammar_*.json` 有 ID 就填，否則 null。
- `mistakes`：寫華人學習者真實會犯的錯（中文直譯、助詞、接續、語體混用）。
- 參考開源教學的**架構**（Hanabira 的 formation／short／long explanation、Tae Kim 的「為什麼這樣說」、Imabi 的語感說明），內容自寫。

## 文法題（quiz_grammar_*.json）
- 每個新文法點 5 題：id `q-<文法id>-1`〜`-5`，`skill:"grammar"`，`target:[文法id]`。
- 題型分配：2 題意思／接續填空、2 題情境填空、1 題辨別題（干擾項來自 compare）。
- 同一點的 5 題句子、情境不可重複。
