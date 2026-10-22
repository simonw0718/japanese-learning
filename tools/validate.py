#!/usr/bin/env python3
"""檢查 data/*.json 是否符合 doc/schema.md。
用法：python3 tools/validate.py [--partial]（有錯回傳 1；--partial：manifest 列了但還不存在的檔只警告，供平行撰稿時用）"""
import json, re, sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
RUBY = re.compile(r"\{[^}]*\}")
REVIEW = {"ai_drafted", "ai_reviewed", "human_checked"}
errors = []


def err(item_id, msg):
    errors.append(f"{item_id}: {msg}")


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

    JLPT = {"bunmyaku", "iikae", "yoho", "keishiki", "narabe", "sokuji", "naiyo", "point"}
    for q in quiz:
        j = q.get("jlpt")
        n = 3 if j == "sokuji" else 4
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
        if j != "sokuji":
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

    counts = {"grammar": len(grammar), "quiz": len(quiz), "dialogues": len(dialogues),
              "reading": len(reading), "vocab": len(vocab), "vocab_extra": len(extra)}
    print("件數：", counts)
    if errors:
        print(f"❌ {len(errors)} 個錯誤")
        print("\n".join(errors[:80]))
        return 1
    print("✅ 全部通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
