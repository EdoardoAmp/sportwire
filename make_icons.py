#!/usr/bin/env python3
"""Genera le icone PNG dell'app (192, 512, maskable) dal marchio di Sportwire: un pianeta ambra con la sua orbita e una luna.
Uso:  python3 make_icons.py      (richiede Pillow; le icone sono già nel repo, serve solo per rifarle)"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
VOID, ACC, INK, ORB = (8, 12, 22), (254, 168, 59), (238, 235, 229), (149, 152, 161)


def draw_icon(size: int, scale: float = 1.0, rounded: bool = True) -> Image.Image:
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=VOID)
    else:
        d.rectangle([0, 0, S, S], fill=VOID)
    cx = cy = S / 2
    r = S * 0.17 * scale
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for i in range(14, 0, -1):
        rr = r * (1 + i * 0.11)
        g.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(*ACC, int(9 * i / 14)))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    rx, ry, tilt = S * 0.405 * scale, S * 0.168 * scale, math.radians(-28)

    def pt(deg: float):
        t = math.radians(deg)
        x, y = rx * math.cos(t), ry * math.sin(t)
        return (cx + x * math.cos(tilt) - y * math.sin(tilt), cy + x * math.sin(tilt) + y * math.cos(tilt))

    w = max(2, int(S * 0.011))
    d.line([pt(k) for k in range(361)], fill=(*ORB, 150), width=w, joint="curve")
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACC)
    d.line([pt(k) for k in range(0, 181)], fill=(*ORB, 200), width=w, joint="curve")   # metà anteriore sopra il pianeta
    mx, my = pt(322)
    mr = S * 0.0375 * scale
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=INK)
    return im.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    out = os.path.join(ROOT, "icons")
    os.makedirs(out, exist_ok=True)
    draw_icon(192).save(os.path.join(out, "icon-192.png"), optimize=True)
    draw_icon(512).save(os.path.join(out, "icon-512.png"), optimize=True)
    draw_icon(512, scale=0.78, rounded=False).save(os.path.join(out, "icon-maskable-512.png"), optimize=True)
    print({f: os.path.getsize(os.path.join(out, f)) for f in sorted(os.listdir(out))})
