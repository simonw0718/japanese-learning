#!/usr/bin/env python3
"""產生 icons/icon.svg 與 PNG（需要 Pillow；沒有就只留 SVG）。用法：python3 tools/make_icons.py"""
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(ROOT, exist_ok=True)
BG, RED, INK = '#f6f1e7', '#c8402a', '#2b2a28'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="{BG}"/>
<circle cx="256" cy="256" r="150" fill="{RED}"/>
<text x="256" y="305" font-size="170" text-anchor="middle" fill="{BG}" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700">習</text></svg>'''
open(os.path.join(ROOT, 'icon.svg'), 'w').write(svg)
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print('Pillow 不存在：只產生 SVG'); raise SystemExit
FONTS = ['/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc', '/Library/Fonts/Arial Unicode.ttf',
         '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc']
def make(size, radius_ratio, name):
    S = size * 4
    im = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(im)
    r = int(S * radius_ratio); c = S // 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=RED)
    for f in FONTS:
        if os.path.exists(f):
            try:
                font = ImageFont.truetype(f, int(r * 1.15)); d.text((c, c), '習', font=font, fill=BG, anchor='mm'); break
            except Exception: pass
    im.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, name))
make(192, 0.29, 'icon-192.png'); make(512, 0.29, 'icon-512.png'); make(512, 0.22, 'icon-maskable-512.png')
print('done')
