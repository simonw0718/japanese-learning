#!/usr/bin/env python3
"""VOICEVOX 候選聲音試聽：同一組句子用多個聲音合成 → doc/voice-samples/（m4a＋index.html）
需先啟動本機引擎：~/Developer/voicevox_engine/engine/run --port 50021
用法：python3 tools/voicevox_samples.py
"""
import json, subprocess, tempfile, urllib.parse, urllib.request
from pathlib import Path

ENGINE = "http://127.0.0.1:50021"
OUT = Path(__file__).resolve().parent.parent / "doc" / "voice-samples"
VOICES = [  # (style id, 顯示名, 條款摘要)
    (14, "冥鳴ひまり", "商用・非商用 OK／クレジット「VOICEVOX:冥鳴ひまり」"),
    (2, "四国めたん（ノーマル）", "商用・非商用 OK／クレジット「VOICEVOX:四国めたん」"),
    (11, "玄野武宏", "商用・非商用 OK／クレジット「VOICEVOX:玄野武宏」"),
    (52, "雀松朱司", "商用・非商用 OK／クレジット「VOICEVOX:雀松朱司」"),
    (13, "青山龍星", "個人 OK；企業が関わる場合は事前確認／クレジット必須・省略不可"),
    (30, "No.7（アナウンス）", "非商用のみ（商用は事前確認）／クレジット「VOICEVOX:No.7」"),
    (31, "No.7（読み聞かせ）", "同上"),
]
TEXTS = [
    ("単語", "しめきり"),
    ("文法例文", "健康のために、毎日階段を使うようにしています。"),
    ("敬語の会話", "お世話になっております。営業部の佐藤様はいらっしゃいますでしょうか。"),
    ("読解", "近年、テレワークの普及により、働き方は大きく変わりつつある。"),
]


def synth(text, speaker, dst):
    q = urllib.parse.urlencode({"text": text, "speaker": speaker})
    query = urllib.request.urlopen(urllib.request.Request(f"{ENGINE}/audio_query?{q}", method="POST")).read()
    wav = urllib.request.urlopen(urllib.request.Request(f"{ENGINE}/synthesis?speaker={speaker}", data=query,
                                                         headers={"Content-Type": "application/json"})).read()
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(wav); f.flush()
        subprocess.run(["afconvert", f.name, "-o", str(dst), "-f", "m4af", "-d", "aac", "-b", "48000"], check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for sid, name, terms in VOICES:
        cells = []
        for i, (label, text) in enumerate(TEXTS):
            fn = f"s{sid}_{i}.m4a"
            synth(text, sid, OUT / fn)
            cells.append(f'<td><audio controls preload="none" src="{fn}"></audio></td>')
        rows.append(f"<tr><th>{name}</th>{''.join(cells)}<td class=t>{terms}</td></tr>")
    head = "".join(f"<th>{l}<br><small>{t}</small></th>" for l, t in TEXTS)
    (OUT / "index.html").write_text(f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>VOICEVOX 試聽</title><style>body{{font-family:-apple-system,"Hiragino Sans",sans-serif;margin:16px;background:#f6f1e7;color:#2b2a28}}
table{{border-collapse:collapse;font-size:14px}}td,th{{border:1px solid #ddd;padding:6px;vertical-align:top}}audio{{width:150px}}.t{{font-size:12px;max-width:220px}}
@media (prefers-color-scheme:dark){{body{{background:#1c1b19;color:#ece7dc}}td,th{{border-color:#3a3834}}}}</style>
<h1>VOICEVOX 候選聲音試聽</h1><p>同樣 4 句，請選 1–2 個（女聲／男聲可分給會話不同角色）。條款來自引擎內附的各角色規約（2026-10-22 讀取）。</p>
<div style="overflow-x:auto"><table><tr><th>聲音</th>{head}<th>條款</th></tr>{''.join(rows)}</table></div>
<p>VOICEVOX:冥鳴ひまり／四国めたん／玄野武宏／雀松朱司／青山龍星／No.7</p>""", encoding="utf-8")
    print("done", OUT)


if __name__ == "__main__":
    main()
