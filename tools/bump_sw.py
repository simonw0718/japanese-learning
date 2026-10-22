#!/usr/bin/env python3
"""更新 sw.js：重寫 SHELL_FILES（外殼檔清單）並把 VERSION 設為內容雜湊。

用法：python3 tools/bump_sw.py
- 掃描 index.html、app.css、manifest.webmanifest、vendor/、icons/、js/**/*.js
- VERSION = <外殼檔＋data（依 data/manifest.json）＋audio/manifest.json 的 sha1 前 8 碼>-a<n>
  （-a<n> 為音檔快取版本，沿用原值；要清掉使用者已下載的音檔才手動 +1）
- 若某 js 檔 import 的檔案不在清單中（不存在）→ 非零結束
"""
import hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
IMPORT_RE = re.compile(r"""(?:\bimport\s+(?:[^'"]*?\s+from\s+)?|\bimport\s*\(\s*|\bexport\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]""")


def shell_files():
    files = [p for p in ("index.html", "app.css", "manifest.webmanifest") if (ROOT / p).exists()]
    for d in ("vendor", "icons"):
        files += sorted(str(p.relative_to(ROOT)) for p in (ROOT / d).rglob("*") if p.is_file() and not p.name.startswith("."))
    js = sorted(str(p.relative_to(ROOT)) for p in (ROOT / "js").rglob("*.js"))
    js.sort(key=lambda s: (s.count("/"), s))  # js/*.js 在前，js/views/ 在後
    return files + js


def check_imports(files):
    have, bad = set(files), []
    for f in files:
        if not f.endswith(".js"):
            continue
        src = (ROOT / f).read_text(encoding="utf-8")
        for spec in IMPORT_RE.findall(src):
            if not spec.startswith("."):
                continue
            target = (ROOT / f).parent.joinpath(spec).resolve()
            rel = target.relative_to(ROOT).as_posix() if target.is_relative_to(ROOT) else str(target)
            if rel not in have:
                bad.append(f"{f} → {spec}")
    return bad


def data_files():
    m = ROOT / "data" / "manifest.json"
    out = [m] if m.exists() else []
    if m.exists():
        sets = json.loads(m.read_text(encoding="utf-8")).get("sets", {})
        for f in sorted({x for v in sets.values() for x in v}):
            out.append(ROOT / "data" / f)
    out.append(ROOT / "audio" / "manifest.json")
    return out


def main():
    files = shell_files()
    bad = check_imports(files)
    h = hashlib.sha1()
    for f in files:
        h.update(f.encode() + b"\0" + (ROOT / f).read_bytes())
    for p in data_files():
        if p.exists():  # 缺檔（內容製作中）略過
            h.update(p.relative_to(ROOT).as_posix().encode() + b"\0" + p.read_bytes())
    sw = SW.read_text(encoding="utf-8")
    m = re.search(r"const VERSION = '([^']*)';", sw)
    if not m:
        sys.exit("sw.js：找不到 VERSION")
    suf = re.search(r"-a(\d+)$", m.group(1))
    version = f"{h.hexdigest()[:8]}-a{suf.group(1) if suf else '1'}"
    lines, cur = [], "const SHELL_FILES = ['./',"
    for f in files:
        item = f" '{f}',"
        if len(cur) + len(item) > 150:
            lines.append(cur)
            cur = ""
        cur += item
    lines.append(cur.rstrip(",") + "];")
    block = "\n ".join(lines)
    sw2 = re.sub(r"const SHELL_FILES = \[.*?\];", lambda _: block, sw, count=1, flags=re.S)
    sw2 = sw2.replace(m.group(0), f"const VERSION = '{version}';", 1)
    if bad:  # 有缺檔就不改 sw.js
        print("import 的檔案不在外殼清單：", *bad, sep="\n  ", file=sys.stderr)
        sys.exit(1)
    if sw2 != sw:
        SW.write_text(sw2, encoding="utf-8")
    print(version)


if __name__ == "__main__":
    main()
