#!/usr/bin/env python3
"""檢查 data/*.json 是否符合 doc/schema.md，並檢查音檔、sw.js。
用法：python3 tools/validate.py [--partial] [--strict]
  有錯回傳 1。--partial：manifest 列了但還不存在的檔只警告（平行撰稿時用）
  警告（不算失敗）：孤兒音檔、尚未錄音的句子、sw.js 不是最新。--strict：sw.js 不是最新也算錯"""
import json, re, sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
RUBY = re.compile(r"\{[^}]*\}")
REVIEW = {"ai_drafted", "ai_reviewed", "human_checked"}
ROOT = DATA.parent
errors, warnings = [], []


def err(item_id, msg):
    errors.append(f"{item_id}: {msg}")


def warn(msg):
    warnings.append(msg)


MANIFEST = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))["sets"]


def load(name):
    """依 data/manifest.json 載入一個 set（可能由多個檔組成）"""
    items = []
    for f in MANIFEST.get(name, []):
        p = DATA / f
        if not p.exists():
            if "--partial" in sys.argv:
                print(f"⚠ 尚未存在：{f}")
            else:
                err(f, "檔案不存在（manifest 有列）")
            continue
        try:
            items += json.loads(p.read_text(encoding="utf-8"))["items"]
        except Exception as e:  # noqa: BLE001
            err(f, f"JSON 讀取失敗 {e}")
    return items


def check_ruby(item_id, ja, ruby):
    if ruby is None:
        return
    if RUBY.sub("", ruby) != ja:
        err(item_id, f"ruby 去標記後與 ja 不同：{ruby!r} vs {ja!r}")
    for m in re.finditer(r"(.?)\{", ruby):
        if not re.match(r"[一-鿿々〆ヶ]", m.group(1)):
            err(item_id, f"ruby 的 {{}} 前面不是漢字：{ruby!r}")
            break


VOCAB_ID = re.compile(r"^v-(n3|n2)-[0-9a-f]{6}$")


def check_vocab(vocab):
    """vocab_n3／n2（build_vocab.py 產生）的欄位"""
    for v in vocab:
        vid = v.get("id", "?")
        m = VOCAB_ID.match(vid)
        if not m:
            err(vid, "vocab id 格式需為 v-<n3|n2>-6 位 hex")
        if v.get("level") not in ("N3", "N2") or (m and m.group(1).upper() != v.get("level")):
            err(vid, f"level 不正確或與 id 不符：{v.get('level')}")
        for k in ("surface", "reading", "meaning_en"):
            if not isinstance(v.get(k), str) or not v.get(k).strip():
                err(vid, f"缺 {k}")
        if not isinstance(v.get("pos"), str):  # 詞性可為空字串（來源沒有）
            err(vid, "pos 需為字串")
        if not isinstance(v.get("batch"), int) or v["batch"] < 1:
            err(vid, "batch 需為 ≥1 的整數")
        if re.search(r"[()（）{}]", (v.get("surface") or "") + (v.get("reading") or "")):
            err(vid, f"表記／讀音混入註記：{v.get('surface')} / {v.get('reading')}")
        if v.get("alt") is not None and not (isinstance(v["alt"], list) and all(isinstance(a, str) and a for a in v["alt"])):
            err(vid, "alt 需為字串陣列")


# ---- v1.4 新題型（doc/schema.md「v1.4 新增」）----
V14_QID = re.compile(r"^q-j-(gokeisei|bunsho|joho|gaiyo|hatsuwa|doukei|togo_r|kadai|togo_l)-(n3|n2)-\d{3}$")
FW_BLANK = re.compile(r"［([１-５])］")
READ_KIND = {"long": r"^r-long-n2-\d{3}$", "togo": r"^r-togo-(n3|n2)-\d{3}$", "joho": r"^r-joho-(n3|n2)-\d{3}$", "bunsho": r"^r-bunsho-(n3|n2)-\d{3}$"}
V14_SKILL = {"gokeisei": "vocab", "bunsho": "grammar", "joho": "reading", "gaiyo": "listening", "hatsuwa": "listening", "doukei": "vocab",
             "togo_r": "reading", "kadai": "listening", "togo_l": "listening"}  # v1.5 追加
SPK = {"F", "M", "F2", "M2"}
READINGS = {}


def fw(n):
    return chr(0xFF10 + n)


def check_v14_reading(r):
    READINGS[r["id"]] = r
    kind = r.get("kind")
    if kind is None:
        return
    if kind not in READ_KIND:
        return err(r["id"], f"reading kind 不正確：{kind}")
    if not re.match(READ_KIND[kind], r["id"]):
        err(r["id"], f"{kind} 的 id 格式不符（{READ_KIND[kind]}）")
    if not r.get("body"):
        err(r["id"], "缺 body")
    if kind == "joho":
        t = r.get("table")
        if not isinstance(t, dict) or not isinstance(t.get("cols"), list) or not t["cols"] or not isinstance(t.get("rows"), list) or not t["rows"]:
            err(r["id"], "joho 需有 table{caption, cols[], rows[[]]}")
        else:
            if not all(isinstance(c, str) for c in t["cols"]):
                err(r["id"], "table.cols 需為字串")
            for i, row in enumerate(t["rows"]):
                if not isinstance(row, list) or len(row) != len(t["cols"]) or not all(isinstance(c, str) for c in row):
                    err(r["id"], f"table.rows[{i}] 欄數需等於 cols（{len(t['cols'])}）且為字串")
            cells = [t.get("caption") or ""] + t["cols"] + [c for row in t["rows"] if isinstance(row, list) for c in row]
            if any(isinstance(c, str) and RUBY.search(c) for c in cells):
                err(r["id"], "table 不加 ruby")
    if kind == "togo":
        parts = [s.get("part") for s in r.get("body", [])]
        if any(p not in ("A", "B") for p in parts) or parts != sorted(parts) or set(parts) != {"A", "B"}:
            err(r["id"], "togo 的 body 需全部標 part A／B，且 A 在前")
    if kind == "bunsho":
        text = "".join(s.get("ja", "") for s in r.get("body", []))
        nums = [int(m.translate({0xFF10 + i: str(i) for i in range(10)})) for m in FW_BLANK.findall(text)]
        if not nums or sorted(nums) != list(range(1, len(nums) + 1)):
            err(r["id"], f"bunsho 空格需為 ［１］〜［n］ 各一次（目前 {nums}）")
        if re.search(r"［[1-5]］|\[[1-5１-５]\]", text):
            err(r["id"], "空格請用全形 ［１］（半形數字或括號）")


def check_v14_quiz(q, ids):
    j, qid = q.get("jlpt"), q["id"]
    tg = q.get("target", [])
    if j in V14_SKILL:
        if not V14_QID.match(qid):
            err(qid, f"id 格式需為 q-j-{j}-<n3|n2>-NNN")
        if q.get("skill") != V14_SKILL[j]:
            err(qid, f"{j} 的 skill 需為 {V14_SKILL[j]}")
        if V14_QID.match(qid) and V14_QID.match(qid).group(2).upper() != q.get("level"):
            err(qid, "id 的等級與 level 不符")
    if j == "gokeisei":
        if "（　　）" not in q.get("stem", ""):
            err(qid, "gokeisei stem 需含（　　）")
    elif j in ("bunsho", "joho", "togo_r"):
        kind = "togo" if j == "togo_r" else j
        r = READINGS.get(tg[0]) if len(tg) == 1 else None
        if not r or r.get("kind") != kind:
            return err(qid, f"{j} 的 target 需為 1 篇 kind={kind} 的讀解（r-{kind}-…）")
        if j == "bunsho":
            b = q.get("blank")
            if not isinstance(b, int) or not 1 <= b <= 5:
                return err(qid, "bunsho 需有 blank（1–5）")
            mark = f"［{fw(b)}］"
            if mark not in "".join(s.get("ja", "") for s in r.get("body", [])):
                err(qid, f"本文沒有 {mark}")
            if q.get("stem") != mark:
                err(qid, f"bunsho stem 需為 {mark}")
    elif j in ("gaiyo", "kadai", "togo_l"):
        sc = q.get("script")
        if j == "togo_l" and (not q.get("set") or q.get("part") not in (1, 2)):
            err(qid, "togo_l 需有 set 與 part（1／2）")
        if not isinstance(sc, list) or (not sc and not (j == "togo_l" and q.get("part") == 2)):
            err(qid, f"{j} 需有 script[]（togo_l 質問2 可為空，沿用質問1）")
        for line in sc or []:
            if line.get("spk") not in (SPK if j != "gaiyo" else ("F", "M")):
                err(qid, f"script spk 不正確：{line.get('spk')}")
            if not line.get("ja"):
                err(qid, "script 缺 ja")
            check_ruby(qid, line.get("ja", ""), line.get("ruby"))
        if not q.get("stem"):
            err(qid, "gaiyo 缺 stem（聽完後的問題）")
    elif j == "hatsuwa":
        if not q.get("situation_ja"):
            err(qid, "hatsuwa 缺 situation_ja")
        check_ruby(qid, q.get("situation_ja", ""), q.get("situation_ruby"))
        if q.get("choices_ruby") is None:
            err(qid, "hatsuwa 缺 choices_ruby")
    elif j == "doukei":
        if q.get("stem", "").count(q.get("u") or "\0") != 1:
            err(qid, "doukei 的 u 必須在 stem 中恰出現一次")
        if q.get("choices_lang") != "zh":
            err(qid, "doukei 需 choices_lang:\"zh\"")
        if q.get("choices_ruby") is not None:
            err(qid, "doukei 的 choices 是中文，不加 choices_ruby")
    elif j is None and q.get("skill") == "reading" and tg and str(tg[0]).startswith("r-long-"):
        if not re.match(r"^q-r-long-n2-\d{3}-\d+$", qid):
            err(qid, "長文題 id 需為 q-r-long-n2-NNN-k")


# ---- 音檔與 sw.js ----
def check_audio():
    am = ROOT / "audio" / "manifest.json"
    if not am.exists():
        return warn("audio/manifest.json 不存在（app 會改用合成語音）")
    try:
        keys = set(json.loads(am.read_text(encoding="utf-8"))["keys"])
    except Exception as e:  # noqa: BLE001
        return err("audio/manifest.json", f"讀取失敗 {e}")
    files = {p.stem for p in (ROOT / "audio").glob("*.m4a")}
    missing = sorted(keys - files)
    if missing:
        err("audio/manifest.json", f"{len(missing)} 個 key 沒有音檔（例：{', '.join(missing[:5])}）→ 重跑 tools/build_audio.py")
    orphans = sorted(files - keys)
    if orphans:
        warn(f"孤兒音檔 {len(orphans)} 個（不在 manifest；例：{', '.join(orphans[:3])}）→ python3 tools/build_audio.py --prune")
    try:
        import build_audio
        texts = build_audio.collect(100000)
        todo = [t for t in texts if build_audio.key(t) not in keys]
        if todo:
            warn(f"尚未錄音 {len(todo)} 句（例：{todo[0][:30]}）→ python3 tools/build_audio.py")
    except Exception as e:  # noqa: BLE001
        warn(f"無法計算未錄音句子：{e}")


def check_sw():
    try:
        import bump_sw
        msgs = bump_sw.check()
    except SystemExit as e:
        msgs = [str(e)]
    for m in msgs:
        if "import" in m or "--strict" in sys.argv:
            err("sw.js", m)
        else:
            warn(m)


def main():
    grammar, quiz = load("grammar"), load("quiz")
    dialogues, reading = load("dialogues"), load("reading")
    vocab = load("vocab_n3") + load("vocab_n2")
    extra = load("vocab_extra")
    listed = {f for fs in MANIFEST.values() for f in fs}
    for p in DATA.glob("*.json"):
        if p.name != "manifest.json" and p.name not in listed:
            err(p.name, "未列入 manifest.json（app 讀不到）")

    ids = {}
    for it in grammar + quiz + dialogues + reading + vocab:
        if it.get("id") in ids:
            err(it.get("id"), "ID 重複")
        ids[it.get("id")] = it
    quiz_ids = {q["id"] for q in quiz}
    READINGS.update({r["id"]: r for r in reading})  # 新題型的 target 檢查要先知道讀解

    for it in grammar + quiz + dialogues + reading:
        if it.get("review") not in REVIEW:
            err(it["id"], "review 欄位值不正確")
        for qid in it.get("quiz_ids", []):
            if qid not in quiz_ids:
                err(it["id"], f"quiz_ids 參照不存在：{qid}")

    for g in grammar:
        for k in ("pattern", "connect", "meaning_ja", "meaning_zh"):
            if not g.get(k):
                err(g["id"], f"缺 {k}")
        if len(g.get("examples", [])) < 2:
            err(g["id"], "例句少於 2")
        for e in g.get("examples", []):
            check_ruby(g["id"], e["ja"], e.get("ruby"))

    JLPT = {"bunmyaku", "iikae", "yoho", "keishiki", "narabe", "sokuji", "naiyo", "point",
            "gokeisei", "bunsho", "joho", "gaiyo", "hatsuwa", "doukei",  # v1.4 追加 6 種
            "togo_r", "kadai", "togo_l"}  # v1.5 追加
    for q in quiz:
        j = q.get("jlpt")
        n = 3 if j in ("sokuji", "hatsuwa") else 4
        if q.get("type") != "mcq" or len(q.get("choices", [])) != n:
            err(q["id"], f"需為 {n} 選項 mcq")
        if len(set(q.get("choices", []))) != len(q.get("choices", [])):
            err(q["id"], "選項重複")
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < n:
            err(q["id"], f"answer 需為 0–{n - 1}")
        if q.get("skill") not in {"grammar", "keigo", "kakikotoba", "reading", "listening", "vocab"}:
            err(q["id"], "skill 不正確")
        if j is not None and j not in JLPT:
            err(q["id"], f"jlpt 題型不正確：{j}")
        if j not in ("sokuji", "hatsuwa"):
            check_ruby(q["id"], q.get("stem", ""), q.get("stem_ruby"))
        if q.get("choices_ruby") is not None:
            if len(q["choices_ruby"]) != len(q.get("choices", [])):
                err(q["id"], "choices_ruby 長度不符")
            else:
                for c, cr in zip(q["choices"], q["choices_ruby"]):
                    check_ruby(q["id"], c, cr)
        if j == "iikae" and q.get("stem", "").count(q.get("u") or "\0") != 1:
            err(q["id"], "u 必須在 stem 中恰出現一次")
        if j == "narabe":
            st, order = q.get("stem", ""), q.get("order", [])
            slots = re.findall(r"＿★＿|＿＿＿", st)
            if len(slots) != 4 or slots.count("＿★＿") != 1:
                err(q["id"], "narabe stem 需 4 格且 ★ 恰 1 個")
            elif sorted(order) != [0, 1, 2, 3] or q.get("answer") != order[slots.index("＿★＿")]:
                err(q["id"], "narabe order／answer 不一致")
            else:
                it = iter(order)
                full = re.sub(r"＿★＿|＿＿＿", lambda m: q["choices"][next(it)], st)
                if full != q.get("full_ja"):
                    err(q["id"], f"narabe full_ja 與 stem＋order 不符：{full}")
                check_ruby(q["id"], q.get("full_ja", ""), q.get("full_ruby"))
        if j == "sokuji":
            if not q.get("prompt_ja"):
                err(q["id"], "sokuji 缺 prompt_ja")
            check_ruby(q["id"], q.get("prompt_ja", ""), q.get("prompt_ruby"))
            if q.get("choices_ruby") is None:
                err(q["id"], "sokuji 缺 choices_ruby")
        for t in q.get("target", []):
            if t not in ("keigo", "kakikotoba") and t not in ids:
                err(q["id"], f"target 參照不存在：{t}")
        check_v14_quiz(q, ids)

    for d in dialogues:
        if d.get("me") not in d.get("roles", {}):
            err(d["id"], "me 不在 roles")
        for t in d.get("turns", []):
            if t.get("spk") not in d.get("roles", {}):
                err(d["id"], f"turn spk 不在 roles：{t.get('spk')}")
            check_ruby(d["id"], t["ja"], t.get("ruby"))
    for r in reading:
        for s in r.get("body", []):
            check_ruby(r["id"], s["ja"], s.get("ruby"))
        check_v14_reading(r)
    check_vocab(vocab)

    vocab_ids = {v["id"] for v in vocab}
    rp = Path(__file__).resolve().parent / "vocab_retired.txt"
    retired = set(rp.read_text(encoding="utf-8").split()) if rp.exists() else set()
    seen_extra = set()
    for x in extra:
        if x.get("id") not in vocab_ids and x.get("id") not in retired:  # retired＝build_vocab 剔除的基礎字
            err(x.get("id"), "vocab_extra 的 id 不在單字庫")
        if x.get("id") in seen_extra:
            err(x.get("id"), "vocab_extra id 重複")
        seen_extra.add(x.get("id"))
        if not x.get("meaning_zh"):
            err(x.get("id"), "缺 meaning_zh")
        if x.get("review") not in REVIEW:
            err(x.get("id"), "review 欄位值不正確")
        for e in x.get("examples", []):
            check_ruby(x["id"], e.get("ja", ""), e.get("ruby"))

    for g in grammar:  # 深化欄位的振假名
        for c in g.get("compare", []):
            for e in c.get("pair", []):
                check_ruby(g["id"], e["ja"], e.get("ruby"))
        for f in g.get("forms", []):
            check_ruby(g["id"], f["ja"], f.get("ruby"))
        n_quiz = len(set(g.get("quiz_ids", [])) | {q["id"] for q in quiz if g["id"] in q.get("target", [])})
        if n_quiz < 2:
            err(g["id"], f"題目少於 2（{n_quiz}）")

    check_audio()
    check_sw()

    counts = {"grammar": len(grammar), "quiz": len(quiz), "dialogues": len(dialogues),
              "reading": len(reading), "vocab": len(vocab), "vocab_extra": len(extra)}
    print("件數：", counts)
    for w in warnings:
        print("⚠", w)
    if errors:
        print(f"❌ {len(errors)} 個錯誤")
        print("\n".join(errors[:80]))
        return 1
    print("✅ 全部通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
