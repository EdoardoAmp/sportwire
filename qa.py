#!/usr/bin/env python3
"""QA di Sportwire (Playwright + Chrome installato).

    python3 qa.py                 # serve http://127.0.0.1:8787 (python3 -m http.server 8787 dalla cartella del sito)
    QA_BASE=https://…  python3 qa.py

1. Contenuto (data/news.json, data/briefs.json): titoli vecchi, promo, prima pagina povera, sezioni vuote,
   ogni «in breve» rispetta le regole di briefs.py, copertura dei brevi in prima pagina.
2. Layout su 5 larghezze × tutte le pagine: meta viewport, niente scroll orizzontale, immagini rotte,
   errori console, contrasto WCAG (con sfondi semitrasparenti composti), target ≥44px sotto i 640px.
3. Funzioni: dossier (click → pannello, URL #/s/<id>, Esc, deep link), cronologia (registra, pagina, cancella),
   ricerca (/ apre, risultati, Esc), cielo (una stella per notizia), service worker + offline, reduced-motion.
Esce con 0 se tutto passa, altrimenti con il numero di problemi.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
from datetime import datetime, timedelta

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8787")
PAGES = ["index.html", "calcio.html", "motori.html", "tennis.html", "basket.html", "ciclismo.html", "altri.html", "cronologia.html"]
WIDTHS = [320, 375, 414, 768, 1440]
PROMO = re.compile(r"abbonat|\d+[,.]\d{2}\s*(euro|€)|offerta|newsletter|in streaming su now|che \w+ su sky|"
                   r"\bx\d+!|terzina|pronostic|scommess", re.I)

PREP = r"""
async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y < h; y += 800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 900));
  return true;
}
"""

PROBE = r"""
() => {
  const parse = (s) => {
    if (!s) return null;
    let m = s.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };

  /* sfondo effettivo: strati semitrasparenti composti dal basso; None se dietro c'è una foto/gradiente */
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
    }
    let base = [16, 18, 27, 1];
    const root = parse(getComputedStyle(document.documentElement).backgroundColor) || parse(getComputedStyle(document.body).backgroundColor);
    if (root && root[3] > 0) base = [root[0], root[1], root[2], 1];
    return stack.reduceRight((acc, c) => over(c, acc), base);
  };

  const bad = [];
  const seen = new Set();
  document.querySelectorAll('p, li, span, time, a, h1, h2, h3, h4, code, strong, em, small, label, button, i, b').forEach((el) => {
    const t = (el.textContent || '').trim();
    if (!t || el.children.length || el.closest('[hidden], .visually-hidden, [aria-hidden="true"], svg')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.display === 'none') return;
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    if (size >= 24) return;
    const fg = parse(cs.color); if (!fg) return;
    const bg = bgOf(el); if (!bg) return;
    const f = fg[3] < 1 ? over(fg, bg) : fg;
    const need = (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    const k = ratio(f, bg);
    if (k < need - 0.01) {
      const key = t.slice(0, 30) + '|' + k.toFixed(1);
      if (!seen.has(key)) { seen.add(key); bad.push({ text: t.slice(0, 36), size: +size.toFixed(1), ratio: +k.toFixed(2), need }); }
    }
  });

  const imgs = [...document.images];
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => (i.currentSrc || i.src).slice(0, 80));
  const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const targets = [...document.querySelectorAll('a[href], button, summary, [role="button"], input, select')]
    .filter((el) => vis(el) && !el.closest('p, [hidden], .visually-hidden, .skip') && !el.classList.contains('skip') && !el.classList.contains('star'))
    .map((el) => {
      /* un link .stretch copre con ::after tutto il blocco posizionato che lo contiene: quello è il bersaglio */
      let box = el;
      if (el.classList.contains('stretch')) {
        let n = el.parentElement;
        while (n && getComputedStyle(n).position === 'static') n = n.parentElement;
        if (n) box = n;
      }
      const r = box.getBoundingClientRect();
      return { t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 22), h: Math.round(r.height), w: Math.round(r.width), cls: String(el.className || '').slice(0, 20) };
    })
    .filter((x) => x.h > 0 && (x.h < 44 || x.w < 44));
  return {
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    imgs: imgs.length, broken, contrast: bad, smallTargets: targets,
    viewportMeta: (document.querySelector('meta[name=viewport]') || {}).content || null,
    fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, '')),
    h1: document.querySelectorAll('h1').length,
  };
}
"""


def content_checks() -> int:
    import briefs as B
    d = json.load(open(os.path.join(ROOT, "data", "news.json")))
    br = B.load(B.BRIEFS, {})
    now = datetime.fromisoformat(d["generated"])
    limit = timedelta(hours=d["window_hours"] + 1)
    S = d["stories"]
    flags = []
    old = [s for s in S if now - datetime.fromisoformat(s["ts"]) > limit]
    promo = [s for s in S if PROMO.search(s["title"])]
    home = [s for s in S if s["on_home"]]
    empty = [k for k, n in d["counts"].items() if n == 0]
    if old:
        flags.append(f"{len(old)} titoli più vecchi di {d['window_hours']}h: {[s['title'][:40] for s in old[:2]]}")
    if promo:
        flags.append(f"{len(promo)} promo: {[s['title'][:40] for s in promo[:2]]}")
    if len(home) < 25:
        flags.append(f"prima pagina povera: {len(home)} notizie")
    if empty:
        flags.append(f"sezioni vuote: {empty}")
    if not any(len(s["sources"]) > 1 for s in S[:3]):
        flags.append("l'apertura non è una notizia coperta da più testate")
    ids = [s["id"] for s in S]
    if len(set(ids)) != len(ids):
        flags.append("id di storia duplicati")
    # i brevi: regole di briefs.py (senza il testo della fonte, che non è nel repo)
    bad = [(k, B.check(v["b"], None)) for k, v in br.items() if v.get("b") and B.check(v["b"], None)]
    if bad:
        flags.append(f"{len(bad)} brevi fuori regola: {bad[:2]}")
    by = {s["id"]: s for s in S}
    on = sum(1 for s in home if (br.get(s["id"]) or {}).get("b"))
    print(f"contenuto: {len(S)} notizie · {len(home)} in prima · brevi {sum(1 for s in S if (br.get(s['id']) or {}).get('b'))} "
          f"({on}/{len(home)} in prima) · " + ("OK" if not flags else " · ".join(flags)))
    if any(b in by and by[b].get("brief") != br[b]["b"] for b in br if br[b].get("b")):
        print("  nota: news.json non contiene l'ultimo breve, rilancia build.py")
    return len(flags)


def launch(pw):
    cand = sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium")))
    tries = [dict(channel="chrome")] + ([dict(executable_path=cand[-1])] if cand else []) + [{}]
    for kw in tries:
        try:
            return pw.chromium.launch(**kw)
        except Exception:
            continue
    raise SystemExit("nessun browser disponibile per Playwright")


def layout_checks(browser) -> int:
    problems = 0
    for width in WIDTHS:
        mobile = width <= 414
        ctx = browser.new_context(
            viewport={"width": width, "height": 900}, device_scale_factor=2 if mobile else 1,
            is_mobile=mobile, has_touch=mobile, locale="it-IT",
            user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
                        "Version/17.0 Mobile/15E148 Safari/604.1") if mobile else None)
        page = ctx.new_page()
        errors: list = []
        page.on("console", lambda m: errors.append(m.text[:90]) if m.type == "error" and (
            "Failed to load resource" not in m.text or BASE in (m.location or {}).get("url", "")) else None)
        page.on("pageerror", lambda e: errors.append(str(e)[:90]))
        for path in PAGES:
            errors.clear()
            page.goto(f"{BASE}/{path}", wait_until="load")
            page.evaluate(PREP)
            r = page.evaluate(PROBE)
            flags = []
            if "width=device-width" not in (r.get("viewportMeta") or ""):
                flags.append("META VIEWPORT assente")
            if r["scrollW"] - r["innerW"] > 1:
                flags.append(f"SCROLL ORIZZONTALE +{r['scrollW'] - r['innerW']}px")
            if r["broken"]:
                flags.append(f"{len(r['broken'])} img rotte")
            if r["contrast"]:
                flags.append(f"{len(r['contrast'])} contrasti bassi {r['contrast'][:2]}")
            if r["h1"] != 1:
                flags.append(f"{r['h1']} h1")
            if not any("Archivo" in f for f in r["fonts"]):
                flags.append(f"font non caricato ({r['fonts'][:3]})")
            if width <= 640 and r["smallTargets"]:
                flags.append(f"{len(r['smallTargets'])} target <44px {[(x['t'], x['h'], x['w']) for x in r['smallTargets'][:4]]}")
            if errors:
                flags.append(f"console: {errors[:2]}")
            if flags:
                problems += 1
                print(f"  ✗ {width:>4}px {path:16} " + " · ".join(flags))
        ctx.close()
    print(f"layout: {len(WIDTHS)} larghezze × {len(PAGES)} pagine · " + ("OK" if not problems else f"{problems} pagine con problemi"))
    return problems


def check(cond, ok_msg, ko_msg, out):
    if not cond:
        out.append(ko_msg)
    return cond


def function_checks(browser) -> int:
    out: list = []
    news = json.load(open(os.path.join(ROOT, "data", "news.json")))
    n_stories = len(news["stories"])
    first = news["stories"][0]["id"]
    for name, w, h, mobile in [("desktop", 1440, 900, False), ("mobile", 390, 844, True)]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1,
                                  is_mobile=mobile, has_touch=mobile, locale="it-IT")
        pg = ctx.new_page()
        errs: list = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.on("console", lambda m: errs.append(m.text[:100]) if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.goto(BASE + "/index.html", wait_until="networkidle")
        pg.wait_for_timeout(700)
        tag = f"[{name}] "

        # cielo: una stella per notizia
        stars = pg.evaluate("document.querySelectorAll('.star').length")
        check(stars == n_stories, "", f"{tag}cielo: {stars} stelle per {n_stories} notizie", out)

        # tocco vicino a una stella isolata: deve scegliere quella (le stelle sono minuscole, il dito no)
        if mobile:
            spot = pg.evaluate("""() => {
              const S = [...document.querySelectorAll('.star')].map((e) => { const q = e.getBoundingClientRect(); return { id: e.dataset.sid, x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
              const st = document.querySelector('[data-sky-stage]'); st.scrollIntoView({ block: 'center', behavior: 'instant' });
              for (const a of S) {
                const near = Math.min(...S.filter((b) => b.id !== a.id).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
                if (near > 44) return { id: a.id };
              }
              return null;
            }""")
            if spot:
                pg.wait_for_timeout(300)
                xy = pg.evaluate("(id) => { const q = document.querySelector('.star[data-sid=\"' + id + '\"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }", spot["id"])
                if 0 < xy[0] < w - 14 and 60 < xy[1] < h - 14:
                    pg.touchscreen.tap(xy[0] + 12, xy[1] + 9)
                    pg.wait_for_timeout(250)
                    got = pg.evaluate("(document.querySelector('.star.is-on') || {}).dataset && document.querySelector('.star.is-on').dataset.sid")
                    check(got == spot["id"], "", f"{tag}tocco a 15px da una stella isolata: selezionata {got!r}, attesa {spot['id']!r}", out)
                    # secondo tocco sulla stessa stella: apre la notizia
                    pg.touchscreen.tap(xy[0] + 12, xy[1] + 9)
                    pg.wait_for_timeout(500)
                    opened = pg.evaluate("location.hash")
                    check(opened == f"#/s/{spot['id']}", "", f"{tag}secondo tocco sulla stella: aperto {opened!r}", out)
                    pg.keyboard.press("Escape")
                    pg.wait_for_timeout(500)
        else:
            # col mouse ogni stella dev'essere raggiungibile, anche nelle nubi fitte: il bersaglio è il centro più vicino
            pg.evaluate("document.querySelector('[data-sky]').scrollIntoView({block: 'start', behavior: 'instant'})")
            pg.wait_for_timeout(700)
            miss = pg.evaluate("""() => {
              const st = document.querySelector('[data-sky-stage]'); const lab = document.querySelector('.sky__labels').getBoundingClientRect().right;
              const sr = st.getBoundingClientRect(); let tried = 0, wrong = 0;
              for (const s of document.querySelectorAll('.star')) {
                const q = s.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
                if (x < lab + 4 || x > sr.right - 4 || y < 0 || y > innerHeight) continue;
                tried++;
                const t = document.elementFromPoint(x, y);
                if (!t || !st.contains(t)) wrong++;
              }
              return [tried, wrong];
            }""")
            check(miss[1] == 0, "", f"{tag}cielo: {miss[1]} stelle su {miss[0]} coperte da altro", out)
            dense = pg.evaluate("""() => {
              const S = [...document.querySelectorAll('.star')].map((e) => { const q = e.getBoundingClientRect(); return { id: e.dataset.sid, x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
              const lab = document.querySelector('.sky__labels').getBoundingClientRect().right, R = document.querySelector('[data-sky-stage]').getBoundingClientRect().right;
              return S.filter((a) => a.x > lab + 6 && a.x < R - 6 && a.y > 70 && a.y < innerHeight - 10
                && S.some((b) => b.id !== a.id && Math.hypot(a.x - b.x, a.y - b.y) < 16)).slice(0, 6);
            }""")
            centre = "(id) => { const q = document.querySelector('.star[data-sid=\"' + id + '\"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }"
            bad = []
            for d in dense:
                x, y = pg.evaluate(centre, d["id"])                     # posizione di adesso, non di prima
                pg.mouse.move(x, y)
                pg.wait_for_timeout(150)
                got = pg.evaluate("(document.querySelector('.star.is-on') || {dataset: {}}).dataset.sid")
                if got != d["id"]:
                    bad.append((d["id"], got))
            check(not bad, "", f"{tag}cielo: nella nube il mouse sul centro sceglie un'altra stella {bad[:3]}", out)
            if dense:
                x, y = pg.evaluate(centre, dense[0]["id"])
                pg.mouse.click(x, y)
                pg.wait_for_timeout(500)
                opened = pg.evaluate("location.hash")
                check(opened == f"#/s/{dense[0]['id']}", "", f"{tag}clic su una stella: aperto {opened!r}", out)
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(500)
            pg.mouse.move(5, 5)
            # il clic sulla stella ha aperto (e registrato) una notizia: si riparte puliti per i controlli sulla cronologia
            pg.evaluate("localStorage.clear()")
            pg.goto(BASE + "/index.html", wait_until="networkidle")
            pg.wait_for_timeout(500)

        # le tue squadre: dal profilo vuoto alla scelta, poi le notizie in cima (tutto in localStorage)
        pg.evaluate("localStorage.clear()")
        pg.goto(BASE + "/index.html", wait_until="networkidle")
        pg.wait_for_timeout(500)
        fs = pg.evaluate("() => { const b = document.querySelector('[data-follow]'); return b ? { hidden: b.hidden, chips: b.querySelectorAll('[data-follow-toggle]').length } : null; }")
        check(bool(fs) and not fs["hidden"] and fs["chips"] > 0, "", f"{tag}squadre: nessun invito a scegliere chi seguire ({fs})", out)
        if fs and fs["chips"]:
            pg.evaluate("document.querySelector('[data-follow]').scrollIntoView({block: 'center', behavior: 'instant'})")
            pg.click("[data-follow] [data-follow-toggle]")
            pg.wait_for_timeout(200)
            pg.click("[data-follow-done]")
            pg.wait_for_timeout(300)
            n_items = pg.evaluate("document.querySelectorAll('[data-follow] .follow__item').length")
            saved = pg.evaluate("(JSON.parse(localStorage.getItem('sw:squadre:v1') || '{}').list || []).length")
            check(n_items > 0 and saved == 1, "", f"{tag}squadre: dopo la scelta {n_items} notizie in cima, {saved} nomi salvati", out)
            pg.reload(wait_until="networkidle")
            pg.wait_for_timeout(500)
            check(pg.evaluate("document.querySelectorAll('[data-follow] .follow__item').length") > 0, "", f"{tag}squadre: la scelta non resta dopo il ricaricamento", out)
        pg.evaluate("localStorage.clear()")
        pg.goto(BASE + "/index.html", wait_until="networkidle")
        pg.wait_for_timeout(500)

        # dossier dal click su una notizia
        link = pg.query_selector("a[data-story]:visible")
        sid = link.get_attribute("data-story") if link else None
        check(bool(link), "", f"{tag}nessun link a[data-story] visibile in home", out)
        if link:
            pg.evaluate("(el) => el.scrollIntoView({block: 'center'})", link)
            link.click()
            pg.wait_for_timeout(600)
            st = pg.evaluate("""() => ({ open: !!document.querySelector('.reader.is-open'), hash: location.hash,
                title: (document.querySelector('.reader h2, .reader h1') || {}).textContent || '',
                ext: [...document.querySelectorAll('.reader a[href^="http"]')].length,
                focusIn: !!document.activeElement.closest('.reader'),
                log: (JSON.parse(localStorage.getItem('sw:cronologia:v1') || '{"log":[]}').log || []).length })""")
            check(st["open"], "", f"{tag}il dossier non si apre", out)
            check(st["hash"] == f"#/s/{sid}", "", f"{tag}hash {st['hash']!r} ≠ #/s/{sid}", out)
            check(len(st["title"].strip()) > 5, "", f"{tag}dossier senza titolo", out)
            check(st["ext"] >= 1, "", f"{tag}dossier senza link alla testata", out)
            check(st["focusIn"], "", f"{tag}il focus non entra nel dossier", out)
            check(st["log"] == 1, "", f"{tag}cronologia: {st['log']} voci dopo la prima apertura (attese 1)", out)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(500)
            st2 = pg.evaluate("() => ({ open: !!document.querySelector('.reader.is-open'), hash: location.hash })")
            check(not st2["open"] and st2["hash"] in ("", "#"), "", f"{tag}Esc non chiude il dossier ({st2})", out)

        # deep link
        pg.goto(f"{BASE}/index.html#/s/{first}", wait_until="networkidle")
        pg.wait_for_timeout(800)
        check(pg.evaluate("!!document.querySelector('.reader.is-open')"), "", f"{tag}deep link #/s/{first} non apre il dossier", out)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(500)                                            # la chiusura torna indietro nella cronologia

        # ricerca
        pg.goto(BASE + "/index.html", wait_until="networkidle")
        pg.wait_for_timeout(500)
        pg.keyboard.press("/")
        pg.wait_for_timeout(300)
        pg.keyboard.type("a", delay=30)
        pg.wait_for_timeout(300)
        hits = pg.evaluate("document.querySelectorAll('.hit').length")
        check(hits > 0, "", f"{tag}ricerca senza risultati per «a»", out)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        check(pg.evaluate("!document.querySelector('.finder.is-open')"), "", f"{tag}Esc non chiude la ricerca", out)

        # ricerca con refuso: una parola lunga di un titolo, con due lettere scambiate, deve ritrovare quella notizia
        probe = pg.evaluate("""() => {
            for (const a of document.querySelectorAll('a[data-story]')) {
              const w = (a.textContent || '').split(/[^A-Za-zÀ-ÿ]+/).filter((x) => x.length >= 8)[0];
              if (w) return { id: a.dataset.story, w };
            }
            return null; }""")
        if probe:
            w = probe["w"]
            typo = w[:3] + w[4] + w[3] + w[5:]
            if typo == w:
                typo = w[:2] + w[3] + w[2] + w[4:]
            pg.keyboard.press("/")
            pg.wait_for_timeout(300)
            pg.fill(".finder__input", typo)
            pg.wait_for_timeout(400)
            ids = pg.evaluate("[...document.querySelectorAll('.hit')].map((h) => h.dataset.id)")
            check(probe["id"] in ids, "", f"{tag}ricerca: «{typo}» (refuso di «{w}») non ritrova la notizia", out)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(300)

        # pagina cronologia
        pg.goto(BASE + "/cronologia.html", wait_until="networkidle")
        pg.wait_for_timeout(600)
        vis = pg.evaluate("document.querySelectorAll('.visit').length")
        check(vis >= 1, "", f"{tag}cronologia.html non mostra la lettura appena fatta", out)
        cells = pg.evaluate("document.querySelectorAll('.heat__grid .cell').length")
        lit = pg.evaluate("document.querySelectorAll('.heat__grid .cell[data-l]:not([data-l=\"0\"])').length")
        check(cells == 84, "", f"{tag}cronologia: la mappa delle settimane ha {cells} caselle (attese 84)", out)
        check(lit >= 1, "", f"{tag}cronologia: la lettura di oggi non colora nessuna casella", out)
        pg.evaluate("localStorage.removeItem('sw:cronologia:v1')")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(400)
        check(pg.evaluate("document.querySelectorAll('.visit').length") == 0, "", f"{tag}cronologia non si svuota", out)
        check(not errs, "", f"{tag}errori JS: {errs[:2]}", out)
        ctx.close()

    # service worker + offline (solo su http://localhost / https)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="it-IT")
    pg = ctx.new_page()
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_timeout(1500)
    reg = pg.evaluate("navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting))) : false")
    check(reg, "", "service worker non registrato", out)
    if reg:
        pg.reload(wait_until="networkidle")           # ora la pagina è controllata dal worker
        pg.wait_for_timeout(1000)
        ctx.set_offline(True)
        try:
            pg.goto(BASE + "/index.html", wait_until="domcontentloaded", timeout=15000)
            pg.wait_for_timeout(800)
            ok = pg.evaluate("!!document.querySelector('.lead, .brief-line') && !!document.querySelector('.bar')")
            check(ok, "", "offline: la home non si apre dalla cache", out)
        except Exception as e:
            out.append(f"offline: la home non si apre ({str(e)[:60]})")
        ctx.set_offline(False)
    ctx.close()

    # swipe sul telefono: avanti, indietro, e dal bordo dello schermo (gesto del sistema) non deve fare niente
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="it-IT")
    pg = ctx.new_page()
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('a[data-story]').click()")
    pg.wait_for_timeout(900)

    def swipe(x0, x1, y=420):
        pg.evaluate("""([x0, x1, y]) => { const el = document.querySelector('.reader__sheet');
            const fire = (type, x) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
            fire('pointerdown', x0); fire('pointerup', x1); }""", [x0, x1, y])
        pg.wait_for_timeout(700)

    first = pg.inner_text(".reader__title")
    swipe(300, 120)
    second = pg.inner_text(".reader__title")
    check(second != first, "", "swipe: scorrendo a sinistra il dossier non passa alla notizia successiva", out)
    swipe(120, 300)
    check(pg.inner_text(".reader__title") == first, "", "swipe: scorrendo a destra il dossier non torna indietro", out)
    swipe(10, 200)
    check(pg.inner_text(".reader__title") == first, "", "swipe: un gesto che parte dal bordo ha cambiato notizia", out)
    ctx.close()

    # transizioni di vista: col movimento normale il dossier passa da una transizione (se il browser le ha) e non lascia classi vt-*
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="it-IT")
    pg = ctx.new_page()
    pg.add_init_script("window.__vt = 0; const _o = Document.prototype.startViewTransition; if (_o) Document.prototype.startViewTransition = function (cb) { window.__vt++; return _o.call(this, cb); };")
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_timeout(600)
    if pg.evaluate("typeof document.startViewTransition === 'function'"):
        pg.evaluate("document.querySelector('a[data-story]').click()")
        pg.wait_for_timeout(1000)
        check(pg.evaluate("!!document.querySelector('.reader.is-open')"), "", "transizioni: il dossier non si apre", out)
        check(pg.evaluate("window.__vt") >= 1, "", "transizioni: l'apertura non usa la transizione di vista", out)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(700)
        check(pg.evaluate("document.documentElement.className.indexOf('vt-') === -1"), "", "transizioni: classi vt-* rimaste sulla pagina", out)
    ctx.close()

    # reduced motion: niente animazioni infinite in corso, niente transizioni di vista
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce", locale="it-IT")
    pg = ctx.new_page()
    pg.add_init_script("window.__vt = 0; const _o = Document.prototype.startViewTransition; if (_o) Document.prototype.startViewTransition = function (cb) { window.__vt++; return _o.call(this, cb); };")
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('a[data-story]').click()")
    pg.wait_for_timeout(600)
    check(pg.evaluate("!!document.querySelector('.reader.is-open')"), "", "reduced-motion: il dossier non si apre", out)
    check(pg.evaluate("window.__vt") == 0, "", "reduced-motion: partono transizioni di vista", out)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    running = pg.evaluate("document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity).length")
    check(running == 0, "", f"reduced-motion: {running} animazioni infinite ancora attive", out)
    ctx.close()

    for m in out:
        print("  ✗", m)
    print("funzioni: dossier · cronologia · ricerca · cielo · offline · reduced-motion · " + ("OK" if not out else f"{len(out)} problemi"))
    return len(out)


def main() -> int:
    total = content_checks()
    with sync_playwright() as pw:
        b = launch(pw)
        total += layout_checks(b)
        total += function_checks(b)
        b.close()
    print("\nQA: " + ("tutto a posto" if not total else f"{total} problemi da sistemare"))
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
