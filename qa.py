#!/usr/bin/env python3
"""QA del sito: overflow orizzontale, immagini realmente rotte, errori console, contrasto WCAG
(calcolato dai token OKLCH), a capo dei link, hit target mobili."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
PAGES = ["index.html", "calcio.html", "motori.html"]
WIDTHS = [320, 375, 414, 768, 1440]

PREP = r"""
async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y < h; y += 800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 1200));
  return true;
}
"""

PROBE = r"""
() => {
  const oklchToRgb = (L, C, H) => {
    const h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const f = (x) => { x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055; return Math.min(1, Math.max(0, x)) * 255; };
    return [f(r), f(g), f(bl)];
  };
  const parseColor = (css) => {
    const m = String(css).match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
    if (m) {
      const L = m[2] === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      return oklchToRgb(L, parseFloat(m[3]), parseFloat(m[4]));
    }
    const rgbm = String(css).match(/rgba?\(([^)]+)\)/i);
    if (rgbm) {
      const parts = rgbm[1].split(',').map((x) => parseFloat(x));
      if (parts.length > 3 && parts[3] < 0.5) return null;        // trasparente ≠ nero
      return parts.slice(0, 3);
    }
    return null;
  };
  const lum = ([r, g, b]) => {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const bad = [];
  document.querySelectorAll('p, li, span, time, a, h1, h2, h3, code, strong, em').forEach((el) => {
    const t = (el.textContent || '').trim();
    if (!t || el.children.length) return;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    if (size >= 24 || size >= 18.66) return;
    const fg = parseColor(cs.color); if (!fg) return;
    const r = ratio(fg, bgOf(el));
    const need = (size >= 14 && weight >= 700) ? 3 : 4.5;
    if (r < need - 0.01) bad.push({ text: t.slice(0, 40), size: +size.toFixed(1), ratio: +r.toFixed(2), need });
  });

  const imgs = [...document.images];
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => (i.currentSrc || i.src).slice(0, 80));
  const navWrap = [...document.querySelectorAll('.masthead__navlink, .wire__title, .rail__more')]
    .filter((el) => el.getClientRects().length > 2)
    .map((el) => el.textContent.trim().slice(0, 28));
  const targets = [...document.querySelectorAll('a, button')]
    .map((el) => ({ t: el.textContent.trim().slice(0, 22), h: Math.round(el.getBoundingClientRect().height), closest: (sel) => el.closest(sel), classList: el.classList }))
    .filter((x) => x.t && x.h > 0 && x.h < 44 && !x.closest('p') && !x.classList.contains('skip'));

  return {
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    imgs: imgs.length, broken, contrast: bad, navWrap, smallTargets: targets,
    wordmark: getComputedStyle(document.querySelector('.masthead__wordmark')).fontFamily,
    viewportMeta: (document.querySelector('meta[name=viewport]') || {}).content || null,
  };
}
"""


def main() -> int:
    problems = 0
    with sync_playwright() as pw:
        import glob
        import os
        launchers = [dict(channel="chrome"), {}]
        cand = sorted(glob.glob(os.path.expanduser(
            "~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium")))
        if cand:
            launchers.insert(1, dict(executable_path=cand[-1]))
        browser = None
        for kw in launchers:
            try:
                browser = pw.chromium.launch(**kw)
                break
            except Exception:
                continue
        if browser is None:
            raise SystemExit("nessun browser")
        for width in WIDTHS:
            # sotto i 640px uso l'emulazione telefono vera: uno screenshot headless con --window-size
            # NON è una verifica mobile (il layout viewport può essere più largo del ritaglio).
            mobile = width <= 414
            ctx = browser.new_context(
                viewport={"width": width, "height": 900},
                device_scale_factor=2 if mobile else 1,
                is_mobile=mobile, has_touch=mobile,
                user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1") if mobile else None)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text[:90]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)[:90]))
            for path in PAGES:
                page.goto(f"{BASE}/{path}", wait_until="load")
                page.evaluate(PREP)
                r = page.evaluate(PROBE)
                flags = []
                if not r.get("viewportMeta") or "width=device-width" not in (r.get("viewportMeta") or ""):
                    flags.append("META VIEWPORT assente")
                if r["scrollW"] - r["innerW"] > 1:
                    flags.append(f"SCROLL ORIZZONTALE +{r['scrollW'] - r['innerW']}px")
                if r["broken"]:
                    flags.append(f"{len(r['broken'])} img rotte")
                if r["contrast"]:
                    flags.append(f"{len(r['contrast'])} contrasti bassi")
                if r["navWrap"]:
                    flags.append(f"testo a capo: {r['navWrap'][:3]}")
                if width <= 640 and r["smallTargets"]:
                    flags.append(f"{len(r['smallTargets'])} target <44px")
                    print("          piccoli:", [f"{x['t']}={x['h']}" for x in r["smallTargets"][:8]])
                if errors:
                    flags.append(f"console: {errors[:2]}")
                problems += len(flags)
                print(f"{width:5}px {path:14} img {r['imgs']:3} | " + ("OK" if not flags else " · ".join(flags)))
                for c in r["contrast"][:5]:
                    print(f"          contrasto {c['ratio']} < {c['need']} · {c['size']}px · «{c['text']}»")
                if r["broken"]:
                    print("          rotte:", r["broken"][:3])
            ctx.close()
        browser.close()
    print("\nproblemi totali:", problems)
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main())