#!/usr/bin/env python3
"""Diagnostica mobile: emulazione telefono vera (Playwright), trova gli elementi che sbordano."""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787/index.html"
WIDTH = int(sys.argv[2]) if len(sys.argv) > 2 else 390

PROBE = r"""
() => {
  const W = window.innerWidth;
  const out = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > W + 1 || r.left < -1) {
      out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
                 left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
                 txt: (el.textContent || '').trim().slice(0, 30) });
    }
  });
  return {
    innerW: W,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    viewportMeta: (document.querySelector('meta[name=viewport]') || {}).content || null,
    offenders: out.slice(0, 14),
    fontsLoaded: document.fonts.status,
  };
}
"""


def main() -> int:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome")
        ctx = b.new_context(viewport={"width": WIDTH, "height": 844}, is_mobile=True,
                            has_touch=True, device_scale_factor=2,
                            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        page = ctx.new_page()
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(1500)
        r = page.evaluate(PROBE)
        print(f"viewport {r['innerW']}px · documento {r['docScrollW']}px · body {r['bodyScrollW']}px · font {r['fontsLoaded']}")
        print("meta viewport:", r["viewportMeta"])
        if r["docScrollW"] > r["innerW"] + 1:
            print(f"⚠ SBORDAMENTO di {r['docScrollW'] - r['innerW']}px")
            for o in r["offenders"]:
                print(f"   {o['right']:>5}px (l {o['left']}, w {o['w']}) {o['sel'][:64]} · «{o['txt']}»")
        else:
            print("nessuno sbordamento")
        page.screenshot(path="/tmp/sw-shot/mobile-emul.png")
        ctx.close()
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())