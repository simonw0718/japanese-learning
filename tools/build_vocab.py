#!/usr/bin/env python3
"""JLPT 單字清單 → data/vocab_n3.json, data/vocab_n2.json

來源：
  tools/raw/n3.csv, n2.csv  open-anki-jlpt-decks (MIT；原始資料 Jonathan Waller / tanos.co.uk CC-BY)
  tools/raw/jmdict-common.zip  jmdict-simplified (EDRDG, CC BY-SA 4.0) — 只用來判斷「常用語」排序與詞性
  wordfreq（程式 Apache-2.0，資料 CC BY-SA 4.0）— 有安裝時用 Zipf 詞頻排序
用法：python3 tools/build_vocab.py   （需要 `pip install "wordfreq[mecab]"` 才會依詞頻排序；
      沒裝時沿用現有 data/vocab_*.json 內的 zipf 值）
剔除：tools/vocab_exclude.tsv 的表記，以及 n5.csv／n4.csv（同來源）出現過的表記，或「讀音＋第一釋義」相同者 → 來源清單混入的基礎字
      （日本、ありがとう、今日 こんにち、する＝刷る 等）不再出題。
排序：詞頻高→低，但 zipf ≥ ULTRA 的超常用字移到最後（多半早就會），每 100 字一批（batch）。
去重：去掉「～」詞綴；同讀音且第一個英文釋義相同者只留詞頻高的寫法。
ID 依 surface+reading 穩定雜湊，不因排序改變（既有學習進度不受影響）。
"""
import csv, hashlib, json, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
BATCH = 100
ULTRA = 5.6  # 超常用（N3 學習者幾乎都會）→ 排到最後
try:
    from wordfreq import zipf_frequency
except ImportError:  # 沒裝 wordfreq 時退回 JMdict 常用語排序
    zipf_frequency = None

POS_MAP = {"n": "名詞", "v1": "動詞", "v5": "動詞", "vs": "する動詞", "vk": "動詞", "vz": "動詞",
           "adj-i": "い形容詞", "adj-na": "な形容詞", "adv": "副詞", "conj": "接続詞",
           "int": "感動詞", "pn": "代名詞", "exp": "表現"}


KANA_ORDER = {}  # 表記 → JMdict 中讀音出現順序（越前面越常用），合併時決定主讀音


def load_jmdict():
    common = {}
    with zipfile.ZipFile(RAW / "jmdict-common.zip") as z:
        data = json.loads(z.read(z.namelist()[0]))
    for w in data["words"]:
        pos = w["sense"][0]["partOfSpeech"] if w["sense"] else []
        label = next((POS_MAP[k] for p in pos for k in POS_MAP if p == k or p.startswith(k + "-") or (k == "v5" and p.startswith("v5"))), "")
        for k in w["kanji"]:
            common.setdefault(k["text"], label)
            order = KANA_ORDER.setdefault(k["text"], [])
            order += [r["text"] for r in w["kana"] if r["text"] not in order]
        for k in w["kana"]:
            common.setdefault(k["text"], label)
    return common


def stable_id(level, surface, reading):
    h = hashlib.sha1(f"{surface}|{reading}".encode()).hexdigest()[:6]
    return f"v-{level.lower()}-{h}"


def load_basic():
    """N5＋N4：回傳 (表記集合, (讀音, 第一釋義) 集合)"""
    surf, sense = set(), set()
    for f in ("n5.csv", "n4.csv"):
        with open(RAW / f, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                surf.add(r["expression"].strip())
                sense.add((r["reading"].strip(), r["meaning"].split(",")[0].strip().lower()))
    ex = ROOT / "tools" / "vocab_exclude.tsv"  # 人工剔除（招呼語等 N5/N4 清單沒收錄的基礎字）
    if ex.exists():
        surf |= {l.split("\t")[0].strip() for l in ex.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")}
    return surf, sense


def cached_zipf():
    """沒裝 wordfreq 時：沿用上次產生的 zipf（以 id 對應）"""
    z = {}
    for lv in ("n3", "n2"):
        p = ROOT / "data" / f"vocab_{lv}.json"
        if p.exists():
            for x in json.loads(p.read_text(encoding="utf-8"))["items"]:
                if "zipf" in x:
                    z[x["id"]] = x["zipf"]
    return z


# 原始清單的表記混入註記（「(かん)」「(な)」「(～がはえる)」）：顯示用改乾淨；id 仍依原始 surface+reading 計算，進度不變
SURFACE_FIX = {
    "v-n3-fff432": ("しまった", "しまった", "感動詞"), "v-n3-18e2d3": ("よろしく", "よろしく", "感動詞"),
    "v-n3-9ae1e1": ("すみません", "すみません", "感動詞"), "v-n3-03172b": ("はあ", "はあ", "感動詞"),
    "v-n3-e791d5": ("ある", "ある", "動詞"), "v-n2-5c3c3e": ("それはいけませんね", "それはいけませんね", "感動詞"),
    "v-n2-725247": ("はい", "はい", "感動詞"), "v-n2-4eac40": ("ミリ", "ミリ", "名詞"),
    "v-n2-e20f6d": ("失礼しました", "しつれいしました", "感動詞"), "v-n2-fbe48a": ("しめた", "しめた", "感動詞"),
    "v-n2-ad3cf8": ("アイデア", "アイデア", "名詞"), "v-n2-da8f8a": ("下品", "げひん", "な形容詞"),
    "v-n2-bb1488": ("どういたしまして", "どういたしまして", "感動詞"), "v-n2-32c1fc": ("朗らか", "ほがらか", "な形容詞"),
    "v-n2-568482": ("じゅうたん", "じゅうたん", "名詞"), "v-n2-f3b305": ("第一", "だいいち", "副詞"),
    "v-n2-b68048": ("紅葉", "こうよう", "名詞"), "v-n2-401687": ("かび", "かび", "名詞"),
    "v-n2-9a574d": ("四角", "しかく", "名詞"), "v-n2-91e09b": ("差す", "さす", "動詞"),
    "v-n2-fc2789": ("率直", "そっちょく", "な形容詞"), "v-n2-d3c29d": ("田んぼ", "たんぼ", "名詞"),
    "v-n2-639d6f": ("しいんと", "しいんと", "副詞"), "v-n2-d7eedf": ("しわ", "しわ", "名詞"),
}


def build(level, csv_name, common, exclude=set(), basic=(set(), set()), zcache=None):
    rows, seen, dropped = [], set(), []
    with open(RAW / csv_name, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            surface, reading = r["expression"].strip(), r["reading"].strip()
            key = (surface, reading)
            if not surface or key in seen or key in exclude or surface[0] in "～〜" or surface[-1] in "～〜":
                continue
            seen.add(key)
            if surface in basic[0] or (reading, r["meaning"].split(",")[0].strip().lower()) in basic[1]:
                dropped.append(stable_id(level, surface, reading))
                continue
            rows.append({
                "id": stable_id(level, surface, reading), "v": 1, "level": level,
                "surface": surface, "reading": reading,
                "pos": common.get(surface, common.get(reading, "")),
                "meaning_en": r["meaning"].strip(),
                "common": surface in common or reading in common,
            })
    if zipf_frequency or zcache:
        for x in rows:
            x["zipf"] = round(zipf_frequency(x["surface"], "ja"), 2) if zipf_frequency else zcache.get(x["id"], 0.0)
        # 單字元詞（と、日、中…）的詞頻多來自助詞或複合詞的一部分，排序時降權；超常用字排最後
        rank = lambda x: x["zipf"] - (1.5 if len(x["surface"]) == 1 else 0) - (10 if x["zipf"] >= ULTRA else 0)
        rows.sort(key=lambda x: -rank(x))
        best, by_surface = {}, {}
        for x in rows:  # 同讀音＋同第一釋義 → 只留詞頻最高的寫法
            best.setdefault((x["reading"], x["meaning_en"].split(",")[0].strip().lower()), x)
        rows = [x for x in rows if best.get((x["reading"], x["meaning_en"].split(",")[0].strip().lower())) is x]
        # 同寫法不同讀音（日本 にほん／にっぽん）→ 併成一張卡，主讀音取讀音本身詞頻較高者
        kana_rank = lambda x: (KANA_ORDER.get(x["surface"], []) + [x["reading"]]).index(x["reading"])
        rows.sort(key=lambda x: (-rank(x), kana_rank(x)))
        sense = lambda x: x["meaning_en"].split(",")[0].strip().lower()
        for x in rows:  # 只有意思相同才合併（分 ふん／ぶん 意思不同 → 分開兩張）
            k = (x["surface"], sense(x))
            if k in by_surface:
                by_surface[k].setdefault("alt", []).append(x["reading"])
            else:
                by_surface[k] = x
        rows = [x for x in rows if by_surface[(x["surface"], sense(x))] is x]
    else:
        rows.sort(key=lambda x: (not x["common"]))  # stable: 常用語在前，其餘維持原順序
    for i, x in enumerate(rows):
        x["batch"] = i // BATCH + 1
        if x["id"] in SURFACE_FIX:
            x["surface"], x["reading"], x["pos"] = SURFACE_FIX[x["id"]]
    return rows, seen, dropped


def remap_extra(all_rows, keep_ids=()):
    """單字合併或主讀音改變後，把 vocab_extra 的舊 id 轉到新 id（依表記＋讀音）"""
    old = {}
    for lv, f in (("N3", "n3.csv"), ("N2", "n2.csv")):
        with open(RAW / f, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                sr = (r["expression"].strip(), r["reading"].strip())
                old[stable_id(lv, *sr)] = sr
    by_reading = {}
    for x in all_rows:
        for rd in [x["reading"]] + x.get("alt", []):
            by_reading.setdefault((x["surface"], rd), x["id"])
    ids = {x["id"] for x in all_rows} | set(keep_ids)  # 被剔除的基礎字：補充資料保留（日後還原用）
    for p in sorted((ROOT / "data").glob("vocab_extra_*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        taken, keep, moved = {x["id"] for x in d["items"] if x["id"] in ids}, [], 0
        for x in d["items"]:
            if x["id"] not in ids:
                new = by_reading.get(old.get(x["id"], (None, None)))
                if not new or new in taken:
                    continue  # 對不到或新 id 已有補充 → 丟棄
                x["id"], moved = new, moved + 1
                taken.add(new)
            keep.append(x)
        if moved or len(keep) != len(d["items"]):
            d["items"] = keep
            p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{p.name}: 轉移 {moved}，保留 {len(keep)}")


def main():
    common = load_jmdict()
    basic, zc = load_basic(), (None if zipf_frequency else cached_zipf())
    n3, n3keys, d3 = build("N3", "n3.csv", common, basic=basic, zcache=zc)
    n2, _, d2 = build("N2", "n2.csv", common, exclude=n3keys, basic=basic, zcache=zc)  # N2 清單去掉已在 N3 的字
    print("剔除 N5/N4 重複：N3", len(d3), "／N2", len(d2))
    # 被剔除字的 id：validate.py 允許 vocab_extra 保留它們的補充資料
    (ROOT / "tools" / "vocab_retired.txt").write_text("\n".join(sorted(d3 + d2)) + "\n", encoding="utf-8")
    src = {"name": "open-anki-jlpt-decks (MIT) / tanos.co.uk JLPT lists (CC BY) / JMdict EDRDG (CC BY-SA 4.0)",
           "url": "https://github.com/jamsinclair/open-anki-jlpt-decks"}
    for level, rows in (("n3", n3), ("n2", n2)):
        out = {"src": src, "items": rows}
        (ROOT / "data" / f"vocab_{level}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(level, len(rows), "words,", sum(r["common"] for r in rows), "common,", rows[-1]["batch"], "batches")
    remap_extra(n3 + n2, d3 + d2)


if __name__ == "__main__":
    main()
