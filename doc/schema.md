# 資料 schema（app 與內容共用的合約）

所有內容檔在 `data/`，UTF-8 JSON。頂層皆為 `{"src": {...}, "items": [...]}`。
**分檔**：`data/manifest.json` 的 `sets` 列出每類由哪些檔組成（grammar、quiz、dialogues、reading、vocab_n3、vocab_n2、vocab_extra）。app、sw.js、validate.py 都依此載入；新增檔案只要列進 manifest。
**文法↔題目**：題目以 `target:[文法id]` 連到文法；app 會把 target 指向該文法的題目自動併入（`quiz_ids` 可省）。

## vocab_extra_*.json（單字補充，依 id 併入單字）
```json
{"id":"v-n3-b9720e","meaning_zh":"禮節、規矩","note_zh":"多用於正式場合",
 "examples":[{"ja":"食事の作法を子どもに教える。","ruby":"食事{しょくじ}の作法{さほう}を子{こ}どもに教{おし}える。","zh":"教孩子吃飯的禮儀。"}],
 "review":"ai_drafted"}
```
- `id` 必須存在於 vocab_n3/n2；`examples` 1 句即可；`note_zh` 可省。
通用欄位：`id`（穩定、不重用）、`v`（=1）、`level`（"N3"|"N2"）、`review`（"ai_drafted"|"ai_reviewed"|"human_checked"）、`tags`（陣列，可省）。

## 振假名格式（ruby）
- 欄位 `ja` 為純文字（給 TTS 與顯示）；欄位 `ruby` 為同一句加上 `漢字{かな}` 標記。
- 規則：`{}` 前緊接的連續漢字（含々）為 base。例：`会議{かいぎ}に遅{おく}れる`。
- 只標漢字；`ruby` 去掉 `{…}` 後必須與 `ja` 完全相同（validate.py 會檢查）。

## grammar.json
```json
{"id":"g-n3-001","v":1,"level":"N3","pattern":"〜わけではない","category":"否定・部分否定",
 "connect":"普通形（ナ形・名詞は〜な／である）＋わけではない",
 "meaning_ja":"全部がそうだとは言えない、と部分的に否定する。",
 "meaning_zh":"並不是…（部分否定）",
 "register":"話し言葉・書き言葉",
 "note_ja":"「〜わけがない」（絶対ない）との違いに注意。",
 "examples":[{"ja":"高いものがいつもいいわけではない。","ruby":"高{たか}いものがいつもいいわけではない。","zh":"貴的東西不一定都好。"}],
 "quiz_ids":["q-g-n3-001-1","q-g-n3-001-2"],"review":"ai_drafted"}
```
- examples ≥ 2；quiz_ids ≥ 2（題目放 quiz.json）。

### grammar 深化欄位（v1.1，皆可省；有就顯示）
```json
{"explain_ja":"3〜6文のやさしい日本語で、どんな気持ち・場面で使うか。",
 "explain_zh":"同內容的繁中說明。",
 "points":[{"ja":"主語は話し手が多い。","zh":"主詞多為說話者本人。"}],
 "forms":[{"label":"否定","ja":"〜ないようにする","ruby":"…"}],
 "compare":[{"pattern":"〜ことにする","ref":"g-n3-002","kind":"similar|confusable",
   "diff_ja":"「ことにする」は一回の決定、「ようにする」は習慣・努力。",
   "diff_zh":"…",
   "pair":[{"ja":"毎日歩くようにしている。","ruby":"…","zh":"…"},{"ja":"明日から歩くことにした。","ruby":"…","zh":"…"}]}],
 "mistakes":[{"wrong":"雨が降るようにする。","right":"雨が降らないといいなと思う。","why_ja":"…","why_zh":"…"}],
 "scene_ja":"職場・家庭でよく使う場面の一言説明"}
```
- `kind`：`similar`＝意味が近い表現、`confusable`＝形が似ていて間違えやすい表現。
- `ref`：本資料庫內的文法 ID（沒有則 null）。
- `compare` ≥ 2、`mistakes` ≥ 1、`points` 2〜4。
- 每個文法點另加 1 題「辨別題」`q-<gid>-3`（skill grammar），干擾項來自 compare 的表現。

## quiz.json
```json
{"id":"q-g-n3-001-1","v":1,"level":"N3","skill":"grammar","type":"mcq","target":["g-n3-001"],
 "stem":"忙しいからといって、毎日運動できない（　　）。","stem_ruby":"忙{いそが}しいからといって、毎日{まいにち}運動{うんどう}できない（　　）。",
 "choices":["わけではない","わけにはいかない","ことになる","はずがない"],"answer":0,
 "explain_ja":"…","explain_zh":"…","review":"ai_drafted"}
```
- `skill`: grammar | keigo | kakikotoba | reading | listening
- `type`: mcq（choices 4 個，answer 為索引）。v1 只用 mcq。
- 敬語題 `target` 可為 `["keigo"]`；`stem` 例：「（社長が）言う → 尊敬語は？」。
- 讀解／聽解題 `target` 為 `["r-…"]` 或 `["d-…"]`。

## dialogues.json（會話＋聽解共用）
```json
{"id":"d-work-001","v":1,"level":"N3","scene":"職場","title":"会議の時間を変更する",
 "situation_ja":"上司に会議の時間変更をお願いする。","situation_zh":"請主管更改會議時間。",
 "roles":{"A":"自分","B":"課長"},"me":"A",
 "turns":[{"spk":"B","ja":"どうしたの？","ruby":"…","zh":"怎麼了？"}],
 "quiz_ids":["q-d-work-001-1"],"review":"ai_drafted"}
```

## reading.json
```json
{"id":"r-n3-001","v":1,"level":"N3","genre":"お知らせ","title":"…",
 "body":[{"ja":"…","ruby":"…","zh":"…"}],"quiz_ids":["q-r-n3-001-1"],"review":"ai_drafted"}
```

## vocab_n3.json / vocab_n2.json（由 tools/build_vocab.py 產生，勿手改）
```json
{"id":"v-n3-b9720e","v":1,"level":"N3","surface":"作法","reading":"さほう","pos":"名詞",
 "meaning_en":"manners, etiquette, propriety","common":true,"batch":1}
```

## 進度（IndexedDB，不在 data/）
- store `cards`：key=`item_id`；`{item_id, kind:"vocab"|"grammar"|"quiz", card:<ts-fsrs Card>, added}`
- store `logs`：autoIncrement；`{item_id, ts, rating, ms}`
- store `meta`：`{key, value}`，如 `days`（學習日期陣列）、`last_backup_at`、`unlocked_batch`
- store `flags`：使用者「⚑ おかしい」回報 `{item_id, ts, note}`

## JLPT 題型（v1.3，quiz 的追加欄位）
`jlpt`：題型代碼。舊題目沒有 `jlpt` 時：skill grammar→`keishiki`、reading→`naiyo`、listening→`point`。

| jlpt | 名稱 | skill | 選項數 | 專用欄位 |
|---|---|---|---|---|
| kanji_yomi | 漢字読み | （app 由單字自動出題，不放 data） | 4 | — |
| hyoki | 表記 | （同上） | 4 | — |
| bunmyaku | 文脈規定 | vocab | 4 | stem 含（　　）|
| iikae | 言い換え類義 | vocab | 4 | `u`：stem 中要畫底線的字串（恰出現一次）|
| yoho | 用法 | vocab | 4 | stem＝要考的詞；choices＝4 個句子；`choices_ruby` |
| keishiki | 文法形式判断 | grammar | 4 | （既有文法題）|
| narabe | 文の組み立て | grammar | 4 | 見下 |
| sokuji | 即時応答 | listening | **3** | 見下 |

- `target`：vocab 題填單字 id（`v-n3-…`，必須存在；詞庫沒有則 `[]`）；narabe 填文法 id；sokuji 填 `[]`。
- `choices_ruby`（可省）：與 choices 同長；每個去掉 `{…}` 後須等於對應 choice。
- **narabe**：`stem` 用 `＿＿＿` 表示空格、`＿★＿` 表示星號格，共 4 格、★ 恰 1 個；`choices`＝4 個片段；`order`＝正確語序的 choices 索引（長度 4）；`answer`＝★格那個片段的索引（＝`order[★在第幾格]`）；`full_ja`＝完整正確句（把格子依 order 填回 stem 的結果）；`full_ruby`。
- **sokuji**：`prompt_ja`／`prompt_ruby`＝聽到的一句話（男聲）；`choices`＝3 個回應（女聲），`choices_ruby` 必填；`answer` 0–2；`stem` 可省。音檔由 tools/build_audio.py 產生。
- ID：`q-j-<jlpt>-<n3|n2>-NNN`（例：`q-j-bunmyaku-n3-001`）。檔名：`data/quiz_jlpt_<jlpt>.json`。
