# 日本語ふくしゅう（N3→N2 複習網站）

全靜態 PWA：每天 15 分，手機為主。規格見 [SPEC.md](SPEC.md)，資料格式見 [doc/schema.md](doc/schema.md)。

## 本機執行
```bash
cd /Users/simon/Developer/japanese-learning && python3 tools/devserver.py 8765
```
開 http://localhost:8765/（手機同 Wi-Fi：http://<電腦IP>:8765/）

## 結構
| 路徑 | 內容 |
|---|---|
| `index.html` `app.css` `js/` | App（原生 ES modules，無 build） |
| `sw.js` `manifest.webmanifest` `icons/` | PWA；改任何檔案後把 `sw.js` 的 `VERSION` +1 |
| `data/` | 內容 JSON（文法、題目、會話、讀解、單字） |
| `vendor/ts-fsrs.umd.js` | FSRS 排程（MIT） |
| `tools/` | `build_vocab.py` 單字轉檔、`validate.py` 資料檢查、`ocr.swift` 教科書 OCR、`make_icons.py` |
| `doc/reference-index/` | TRY! 目錄 OCR（**私人對照，不要部署**） |
| `doc/content-qa.tsv` | 內容審稿紀錄 |

## 維護流程
1. 加內容：照 `doc/schema.md` 改 `data/*.json`（新 ID 不重用）
2. 檢查：`python3 tools/validate.py`
3. 更新快取版本：`python3 tools/bump_sw.py`（自動重寫 `sw.js` 的外殼清單與 `VERSION`）

## 部署（之後）
GitHub Pages：推上 repo，Settings → Pages 選 main 根目錄。部署前排除 `doc/reference-index/`、`doc/referecne */`（教科書 PDF）與 `tools/raw/`。

## 授權
- 單字：open-anki-jlpt-decks（MIT），原始資料 Jonathan Waller / tanos.co.uk（CC BY）；排序參考 JMdict（EDRDG，CC BY-SA 4.0）
- ts-fsrs（MIT）
- 音聲：VOICEVOX:冥鳴ひまり／VOICEVOX:玄野武宏（`tools/build_audio.py`，引擎在 `~/Developer/voicevox_engine`；條款整理 [doc/voice-terms.md](doc/voice-terms.md)）。不使用 macOS 系統語音（僅限個人使用）
- 文法、題目、會話、讀解：原創（AI 撰寫＋AI 審稿）
