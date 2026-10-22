#!/usr/bin/env python3
"""預錄音檔：用 VOICEVOX（本機引擎）為內容產生 audio/<key>.m4a 與 audio/manifest.json

聲音：冥鳴ひまり（主要）＋玄野武宏（會話中「自分」以外的角色）。授權整理見 doc/voice-terms.md。
需先啟動引擎：~/Developer/voicevox_engine/engine/run --host 127.0.0.1 --port 50021
用法：python3 tools/build_audio.py [--vocab N] [--jobs 3] [--dry-run] [--prune]
  --vocab N   每級單字前 N 個（依詞頻）也錄單字發音（預設全部：瀏覽器語音在 Apple 裝置＝Apple 聲音，不可用）
  --dry-run   只列出：句數、尚未錄音數、孤兒音檔數（不合成、不寫檔）
  --prune     刪除 audio/ 中不在清單的孤兒音檔（先列出再刪；搭配 --dry-run 只列出）
已存在的檔案會略過（可重跑、可中斷）。key 規則必須與 js/tts.js 相同：
  FNV-1a 32bit(UTF-8 of text.strip()) 8 位 hex ＋ 字數（code points）3 位 hex
單字依「讀音」合成（避免 TTS 把漢字讀錯），但以「表記」計算 key（app 播放時傳入的是表記）。
不使用 macOS 系統語音（Kyoko 等）：Apple 條款僅限個人使用，不可公開散布。
"""
import argparse, json, subprocess, sys, tempfile, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, OUT = ROOT / "data", ROOT / "audio"
ENGINE = "http://127.0.0.1:50021"
MAIN, OTHER = 14, 11  # VOICEVOX style id：冥鳴ひまり／玄野武宏
CREDIT = "VOICEVOX:冥鳴ひまり／VOICEVOX:玄野武宏"


def key(text):
    t = text.strip()
    h = 0x811C9DC5
    for b in t.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}{len(t):03x}"


def load(name):
    sets = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))["sets"]
    items = []
    for f in sets.get(name, []):
        p = DATA / f
        if p.exists():
            items += json.loads(p.read_text(encoding="utf-8"))["items"]
    return items


def collect(n_vocab):
    """回傳 {顯示文字: (要合成的文字, style id)}"""
    texts = {}
    add = lambda t, say=None, sp=MAIN: t and t.strip() and texts.setdefault(t.strip(), ((say or t).strip(), sp))
    for d in load("dialogues"):
        for t in d.get("turns", []):  # 自分＝主要聲音，其他角色＝男聲
            me = t.get("role") == "me" if t.get("role") else t.get("spk") == d.get("me")
            add(t["ja"], sp=MAIN if me else OTHER)
    for r in load("reading"):
        if r.get("kind") == "bunsho":  # 文章の文法：本文有空格，不錄
            continue
        for s in r.get("body", []):  # joho 只錄說明文（table 不錄）
            add(s["ja"])
    for g in load("grammar"):
        for e in g.get("examples", []):
            add(e["ja"])
        for c in g.get("compare", []):
            for e in c.get("pair", []):
                add(e["ja"])
        for m in g.get("mistakes", []):
            add(m.get("right"))
        for f in g.get("forms", []):  # 「〜」は読ませない
            add(f.get("ja"), (f.get("ja") or "").replace("〜", "").replace("～", ""))
    for x in load("vocab_extra"):
        for e in x.get("examples", []):
            add(e["ja"])
    for q in load("quiz"):  # JLPT：即時応答（問い＝男聲、返事＝女聲）、並べ替えの完成文
        if q.get("jlpt") == "sokuji":
            add(q.get("prompt_ja"), sp=OTHER)
            for c in q.get("choices", []):
                add(c)
        if q.get("jlpt") == "narabe" and q.get("full_ja"):
            add(q["full_ja"].replace("　", ""))
        if q.get("jlpt") == "gaiyo":  # 概要理解：script（F＝冥鳴ひまり、M＝玄野武宏）＋聽完後的問題
            for line in q.get("script", []):
                add(line.get("ja"), sp=OTHER if line.get("spk") == "M" else MAIN)
            add(q.get("stem"))
        if q.get("jlpt") == "hatsuwa":  # 発話表現：情境（男聲旁白）＋3 個說法（女聲）
            add(q.get("situation_ja"), sp=OTHER)
            for c in q.get("choices", []):
                add(c)
        if q.get("jlpt") == "doukei":
            add(q.get("stem"))
    add("こんにちは。日本語ふくしゅうへようこそ。")  # 設定頁の「テスト」
    for lv in ("vocab_n3", "vocab_n2"):
        for v in load(lv)[:n_vocab]:
            add(v["surface"], v["reading"])
    return texts


def synth(text, speaker):
    q = urllib.parse.urlencode({"text": text, "speaker": speaker})
    query = json.loads(urllib.request.urlopen(urllib.request.Request(f"{ENGINE}/audio_query?{q}", method="POST")).read())
    query["prePhonemeLength"] = query["postPhonemeLength"] = 0.05  # 前後靜音縮短，連續播放較順
    req = urllib.request.Request(f"{ENGINE}/synthesis?speaker={speaker}", data=json.dumps(query).encode(),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req).read()


def render(item):
    text, (say_text, speaker) = item
    dst = OUT / f"{key(text)}.m4a"
    if dst.exists():
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        wav.write_bytes(synth(say_text, speaker))
        subprocess.run(["afconvert", str(wav), "-o", str(dst), "-f", "m4af", "-d", "aac", "-b", "40000"], check=True)
    return 1


def orphans(keys):
    return sorted(p for p in OUT.glob("*.m4a") if p.stem not in keys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab", type=int, default=100000)
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--prune", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    texts = collect(a.vocab)
    keys = {key(t) for t in texts}
    if a.prune and a.vocab != ap.get_default("vocab"):
        sys.exit("--prune 需用完整清單（不可與 --vocab 併用，否則會刪掉單字音檔）")
    if a.dry_run:
        todo = [t for t in texts if not (OUT / f"{key(t)}.m4a").exists()]
        orph = orphans(keys)
        print(f"文字 {len(texts)}，尚未錄音 {len(todo)}，孤兒音檔 {len(orph)}")
        for t in todo[:10]:
            print("  未錄：", t[:40])
        for p in orph[:10] if not a.prune else orph:
            print("  孤兒：", p.name)
        return
    if a.prune:
        orph = orphans(keys)
        for p in orph:
            print("刪除：", p.name)
        for p in orph:
            p.unlink()
        print(f"已刪除孤兒音檔 {len(orph)} 個")
    made = 0
    with ThreadPoolExecutor(a.jobs) as ex:
        for i, n in enumerate(ex.map(render, texts.items()), 1):
            made += n
            if i % 200 == 0:
                print(f"{i}/{len(texts)}", file=sys.stderr)
    keys = sorted(keys)
    size = sum((OUT / f"{k}.m4a").stat().st_size for k in keys if (OUT / f"{k}.m4a").exists())
    # bytes：app「全部音檔下載」顯示大小用
    (OUT / "manifest.json").write_text(json.dumps({"voice": CREDIT, "bytes": size, "keys": keys}, separators=(",", ":")), encoding="utf-8")
    print(f"文字 {len(texts)}，新產生 {made}，音檔合計 {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
