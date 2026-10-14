#!/usr/bin/env python3
"""Builds the font atlases embedded by lib/canvas.aklang (anti-aliased glyphs for ASCII 32..126, rasterised from DejaVu Sans).
usage: python3 tools/mkfont.py          (needs Pillow and the DejaVu fonts; the generated lib/font*.bin files are committed)
file layout: [size, ascent, line height, 95] then 95 little-endian u32 offsets, then per glyph:
             [advance u8, left i8, top i8 (above the baseline), width u8, height u8, width*height coverage bytes]"""
import os, struct
from PIL import Image, ImageDraw, ImageFont
D = '/usr/share/fonts/truetype/dejavu/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib')
def build(path, size, out):
    f = ImageFont.truetype(path, size)
    asc, desc = f.getmetrics()
    recs = []
    for c in range(32, 127):
        ch = chr(c); adv = int(round(f.getlength(ch)))
        l, t, r, b = f.getbbox(ch, anchor='ls')
        w, h = max(0, r - l), max(0, b - t)
        data = b''
        if w and h:
            im = Image.new('L', (w, h), 0); ImageDraw.Draw(im).text((-l, -t), ch, font=f, fill=255, anchor='ls'); data = im.tobytes()
        recs.append(struct.pack('<Bbb BB', min(adv, 255), l, -t, w, h) + data)
    head = bytes([size, asc, asc + desc, 95]); off = 4 + 95 * 4; table = b''
    for r in recs: table += struct.pack('<I', off); off += len(r)
    with open(os.path.join(OUT, out), 'wb') as fh: fh.write(head + table + b''.join(recs))
    print(out, size, 'ascent', asc, 'height', asc + desc, off, 'bytes')
build(D + 'DejaVuSans.ttf', 15, 'font15.bin')
build(D + 'DejaVuSans.ttf', 22, 'font22.bin')
build(D + 'DejaVuSans-Bold.ttf', 34, 'font34.bin')
