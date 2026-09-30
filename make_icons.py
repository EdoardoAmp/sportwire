#!/usr/bin/env python3
"""Genera le immagini statiche di Sportwire dal suo marchio (un pianeta ambra con la sua orbita e una luna):
- icone PNG dell'app (192, 512, maskable) in icons/;
- schede di anteprima 1200×630 (og:image, quando si condivide un link) in og/: una per la prima pagina e le sezioni,
  una per la cronologia. Stesso linguaggio del sito: campo blu notte, i due aloni caldi, cielo stellato, accento ambra,
  il marchio e la scritta in Archivo (i font del sito, in fonts/).

Uso:  python3 make_icons.py          rifà solo ciò che manca (tutto è già nel repo)
      python3 make_icons.py --force  rifà tutto
Richiede Pillow (≥ 9, con libraqm non serve)."""
import argparse
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

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


# ---------------------------------------------------------------- schede di anteprima (og:image)
# Colori presi dai token di css/src/00-tokens.css (OKLCH → sRGB, arrotondati):
#   --void oklch(0.155 0.024 268) · --paper-1 oklch(0.195 0.026 268) · --accent oklch(0.80 0.155 68)
#   --ink oklch(0.945 0.008 80) · --ink-2 oklch(0.82 0.010 80) · --ink-3 oklch(0.72 0.014 270)
#   aloni di .cosmos: oklch(0.62 0.15 55 / .30) in alto a destra, oklch(0.50 0.17 20 / .18) a sinistra
OG_W, OG_H = 1200, 630
OG = {"void": (9, 13, 25), "ink": (240, 236, 229), "ink2": (203, 199, 192), "ink3": (163, 167, 182),
      "accent": (254, 168, 59), "halo1": (201, 112, 38), "halo2": (171, 55, 58), "line": (60, 66, 84)}
FONT_DISPLAY = os.path.join(ROOT, "fonts", "archivo-latin-wdth-normal.woff2")
FONT_MONO = os.path.join(ROOT, "fonts", "geist-mono-latin-wght-normal.woff2")
OG_PAGES = {
    "index": ("Sportwire", "il cielo dello sport di oggi", "le notizie di sei redazioni, riassunte"),
    "cronologia": ("Cronologia", "il tuo diario di bordo", "solo sul tuo dispositivo · Sportwire"),
}


def font(path: str, size: int, weight: int, width: int = 100) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    axes = [a["name"] for a in f.get_variation_axes()]
    f.set_variation_by_axes([{b"Weight": weight, b"Width": width}[n] for n in axes])
    return f


def halo(size, cx: float, cy: float, rx: float, ry: float, rgb, alpha: float) -> Image.Image:
    """Alone morbido (come i radial-gradient di .cosmos): ellisse piena, poi sfocata."""
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(*rgb, int(255 * alpha)))
    return im.filter(ImageFilter.GaussianBlur(min(rx, ry) * 0.55))


def planet(d: ImageDraw.ImageDraw, cx: float, cy: float, S: float, back: bool) -> None:
    """Il marchio (pianeta, orbita inclinata, luna) disegnato direttamente sul campo, senza il quadrato dell'icona.
    back=True disegna la metà posteriore dell'orbita (dietro il pianeta), back=False il pianeta, la metà anteriore e la luna."""
    r = S * 0.17
    rx, ry, tilt = S * 0.405, S * 0.168, math.radians(-28)

    def pt(deg: float):
        t = math.radians(deg)
        x, y = rx * math.cos(t), ry * math.sin(t)
        return (cx + x * math.cos(tilt) - y * math.sin(tilt), cy + x * math.sin(tilt) + y * math.cos(tilt))
    w = max(2, int(S * 0.011))
    # sin(t) < 0 è la metà «lontana» dell'ellisse (in alto, dietro il pianeta), sin(t) ≥ 0 quella vicina (davanti)
    if back:
        d.line([pt(k) for k in range(180, 361)], fill=(*ORB, 150), width=w, joint="curve")
        return
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACC)
    d.line([pt(k) for k in range(0, 181)], fill=(*ORB, 210), width=w, joint="curve")
    mx, my = pt(322)
    mr = S * 0.0375
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=INK)


def draw_og(title: str, tagline: str, note: str) -> Image.Image:
    S = 2                                                   # si disegna al doppio e si riduce: bordi puliti
    W, H = OG_W * S, OG_H * S
    im = Image.new("RGBA", (W, H), (*OG["void"], 255))
    # i due aloni caldi di .cosmos, in piccolo e ingranditi (sfumatura continua, niente gradini)
    small = Image.new("RGBA", (W // 8, H // 8), (0, 0, 0, 0))
    small = Image.alpha_composite(small, halo(small.size, small.width * 0.86, -small.height * 0.10, small.width * 0.50, small.height * 0.66, OG["halo1"], 0.30))
    small = Image.alpha_composite(small, halo(small.size, small.width * 0.02, small.height * 0.46, small.width * 0.34, small.height * 0.52, OG["halo2"], 0.17))
    im = Image.alpha_composite(im, small.resize((W, H), Image.Resampling.BICUBIC))
    d = ImageDraw.Draw(im, "RGBA")
    left = 88 * S
    text_box = (left - 20 * S, 90 * S, 780 * S, 540 * S)    # niente stelle dietro al testo
    rnd = random.Random(20260930)                           # cielo sempre uguale: niente differenze inutili nel repo
    for _ in range(190):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.choice([0.8, 1.0, 1.2, 1.5]) * S
        if text_box[0] < x < text_box[2] and text_box[1] < y < text_box[3]:
            continue
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*OG["ink"], rnd.choice([60, 100, 140, 190])))
    # alone del pianeta (come la luce attorno alle icone), poi orbita dietro, pianeta, orbita davanti, luna
    cx, cy, P = W - 250 * S, H * 0.5, 560 * S
    glow = Image.new("RGBA", (W // 8, H // 8), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([(cx - P * 0.30) / 8, (cy - P * 0.30) / 8, (cx + P * 0.30) / 8, (cy + P * 0.30) / 8], fill=(*ACC, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(P * 0.05 / 8)).resize((W, H), Image.Resampling.BICUBIC)
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im, "RGBA")
    planet(d, cx, cy, P, back=True)
    planet(d, cx, cy, P, back=False)
    f_eyebrow = font(FONT_MONO, 22 * S, 500)
    f_title = font(FONT_DISPLAY, 156 * S, 800, 72)
    f_tag = font(FONT_DISPLAY, 58 * S, 700, 78)
    f_note = font(FONT_MONO, 24 * S, 500)
    d.ellipse([left, 116 * S, left + 14 * S, 130 * S], fill=OG["accent"])
    d.text((left + 30 * S, 112 * S), "SPORTWIRE · RASSEGNA SPORTIVA", font=f_eyebrow, fill=OG["ink3"])
    d.text((left - 6 * S, 170 * S), title, font=f_title, fill=OG["ink"])
    d.text((left, 356 * S), tagline, font=f_tag, fill=OG["accent"])
    d.line([left, 470 * S, left + 120 * S, 470 * S], fill=OG["line"], width=2 * S)
    d.text((left, 494 * S), note, font=f_note, fill=OG["ink2"])
    return im.resize((OG_W, OG_H), Image.Resampling.LANCZOS).convert("RGB")


def save_small(im: Image.Image, path: str, limit: int = 200_000) -> int:
    """PNG a colori pieni; se supera il limite, tavolozza di 256 colori con retinatura (gli aloni restano morbidi)."""
    im.save(path, optimize=True)
    if os.path.getsize(path) > limit:
        im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    size = os.path.getsize(path)
    if size > limit:
        raise SystemExit(f"{path}: {size} byte, oltre il limite di {limit}")
    return size


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rifà anche le immagini che ci sono già")
    force = ap.parse_args().force
    out = os.path.join(ROOT, "icons")
    os.makedirs(out, exist_ok=True)
    jobs = [("icon-192.png", lambda: draw_icon(192)), ("icon-512.png", lambda: draw_icon(512)),
            ("icon-maskable-512.png", lambda: draw_icon(512, scale=0.78, rounded=False))]
    for name, make in jobs:
        path = os.path.join(out, name)
        if force or not os.path.exists(path):
            make().save(path, optimize=True)
    og = os.path.join(ROOT, "og")
    os.makedirs(og, exist_ok=True)
    for key, (title, tagline, note) in OG_PAGES.items():
        path = os.path.join(og, f"{key}.png")
        if force or not os.path.exists(path):
            save_small(draw_og(title, tagline, note), path)
    print({f"icons/{f}": os.path.getsize(os.path.join(out, f)) for f in sorted(os.listdir(out))}
          | {f"og/{f}": os.path.getsize(os.path.join(og, f)) for f in sorted(os.listdir(og))})
