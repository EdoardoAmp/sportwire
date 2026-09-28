#!/usr/bin/env python3
"""Sportwire — generatore del sito di news sportive.

Tira i feed RSS pubblici di ANSA Sport, La Gazzetta dello Sport e Sky Sport,
deduplica i titoli, li categorizza e produce un sito statico:

    index.html + <sport>.html + data/news.json + tokens.css + css/ + js/

Solo stdlib. Uso:  python3 build.py [--no-fetch]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import difflib
import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(ROOT, "media")
TZ = timezone(timedelta(hours=2))          # Europe/Rome in estate (CEST)

FEEDS = [
    ("ANSA Sport", "https://www.ansa.it/sito/notizie/sport/sport_rss.xml"),
    ("Gazzetta", "https://www.gazzetta.it/rss/home.xml"),
    ("Sky Sport", "https://sport.sky.it/rss/sport.xml"),
]
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# ---------------------------------------------------------------- categorizzazione
CATS = [
    ("calcio", "Calcio", [
        "calcio", "serie a", "serie b", "juventus", "juve", "inter", "milan", "napoli", "roma",
        "lazio", "atalanta", "fiorentina", "bologna", "torino", "udinese", "genoa", "lecce",
        "verona", "cagliari", "empoli", "parma", "como", "venezia", "monza", "champions",
        "europa league", "conference", "mondiale", "nazionale", "azzurri", "allenatore",
        "gol", "rigore", "arbitro", "mercato", "trattativa", "rinnovo", "cartellino", "var",
        "coppa italia", "supercoppa", "premier", "liga", "bundesliga", "ligue 1", "psg",
        "real madrid", "barcellona", "manchester", "liverpool", "bayern", "calciomercato"]),
    ("motori", "Motori", [
        "formula 1", "f1", "gran premio", "gp ", "ferrari", "verstappen", "hamilton", "leclerc",
        "mclaren", "mercedes", "red bull", "motogp", "marquez", "bagnaia", "ducati", "yamaha",
        "aprilia", "k tm", "ktm", "superbike", "rally", "wrc", "dakar", "verstappen",
        "pole position", "pista", "pit stop", "campionato piloti", "indianapolis", "formula e"]),
    ("tennis", "Tennis", [
        "tennis", "atp", "wta", "sinner", "musetti", "berrettini", "paolini", "errani", "vavassori",
        "wimbledon", "roland garros", "us open", "australian open", "slam", "finale slam",
        "coppa davis", "billie jean king", "master 1000", "tie-break", "set ", "ace ", "monte carlo"]),
    ("basket", "Basket", [
        "basket", "nba", "eurolega", "lba", "olimpia milano", "virtus", "reggiana", "cantu",
        "playoff nba", "le bron", "lebron", "curry", "jokic", "partita di basket", "ncaa"]),
    ("ciclismo", "Ciclismo", [
        "ciclismo", "giro d'italia", "il giro", "tour de france", "vuelta", "tappa", "maglia rosa",
        "maglia gialla", "pogacar", "vingegaard", "evenepoel", "milano-sanremo", "classica",
        "campionato del mondo di ciclismo", "bici"]),
    ("altri", "Altri sport", [
        "volley", "pallavolo", "rugby", "nuoto", "atletica", "scherma", "pugilato", "boxe", "mma",
        "ufc", "judo", "ginnastica", "sci ", "sci alpino", "coppa del mondo di sci", "biatlon",
        "hockey", "baseball", "cricket", "surf", "vela", "arrampicata", "sport equestri",
        "olimpiadi", "paralimpiadi", "olimpico", "medaglia"]),
]
CAT_TITLES = {k: t for k, t, _ in CATS}
CAT_ORDER = [k for k, _, _ in CATS]


def norm_key(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def categorize(title: str, desc: str) -> str:
    blob = " " + norm_key(title) + " " + norm_key(desc)[:300] + " "
    best, score = "altri", 0
    for key, _title, words in CATS:
        hits = sum(1 for w in words if " " + norm_key(w) + " " in blob or norm_key(w) in blob)
        if hits > score:
            best, score = key, hits
    return best


def clean(text: str, limit: int = 260) -> str:
    t = re.sub(r"<[^>]+>", " ", text or "")
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    if limit and len(t) > limit:
        t = t[: limit - 1].rsplit(" ", 1)[0] + "…"
    return t


# ---------------------------------------------------------------- feed
def fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def first_image(node: ET.Element) -> str:
    """Cerca un'immagine nell'item: media:content / media:thumbnail / enclosure / <img> nel body."""
    for child in node.iter():
        tag = child.tag.split("}")[-1].lower()
        if tag in ("content", "thumbnail") and child.get("url"):
            t = (child.get("type") or "")
            if not t or t.startswith("image"):
                return child.get("url")
        if tag == "enclosure" and child.get("url"):
            t = (child.get("type") or "")
            if t.startswith("image"):
                return child.get("url")
    for child in node.iter():
        if child.tag.split("}")[-1].lower() in ("encoded", "description"):
            m = re.search(r'<img[^>]+src="([^"]+)"', child.text or "")
            if m:
                return m.group(1)
    return ""


def parse_feed(source: str, raw: bytes) -> list[dict]:
    root = ET.fromstring(raw)
    items = []
    for item in root.iter("item"):
        def g(name: str) -> str:
            el = item.find(name)
            return (el.text or "") if el is not None else ""
        title = clean(g("title"), 0)
        if not title:
            continue
        date = None
        try:
            date = parsedate_to_datetime(g("pubDate"))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            date = date.astimezone(TZ)
        except Exception:
            date = datetime.now(TZ)
        items.append({
            "title": title,
            "link": g("link").strip(),
            "source": source,
            "summary": clean(g("description")),
            "image": first_image(item),
            "ts": date.isoformat(),
            "date": date.strftime("%Y-%m-%d"),
        })
    return items


def collect(offline: bool = False) -> list[dict]:
    path = os.path.join(ROOT, "data", "raw.json")
    if offline:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    out: list[dict] = []
    with cf.ThreadPoolExecutor(max_workers=3) as pool:
        futs = {pool.submit(fetch, url): name for name, url in FEEDS}
        for fut in cf.as_completed(futs):
            name = futs[fut]
            try:
                items = parse_feed(name, fut.result())
                print(f"  {name:11} {len(items):4} titoli")
                out += items
            except Exception as exc:                                     # noqa: BLE001
                print(f"  {name:11} ERRORE: {type(exc).__name__}: {exc}", file=sys.stderr)
    if not out:
        print("nessun feed raggiungibile — uso i dati grezzi salvati", file=sys.stderr)
        with open(path, encoding="utf-8") as fh:
            out = json.load(fh)
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False)
    return out


def validate_images(items: list[dict], limit: int = 240) -> int:
    """Scarta le immagini che non rispondono o non sono immagini: niente quadrati rotti in pagina."""
    urls = [i["image"] for i in items if i["image"]][:limit]
    if not urls:
        return 0
    bad: set[str] = set()

    def probe(u: str) -> None:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA}, method="GET")
            req.add_header("Range", "bytes=0-0")
            with urllib.request.urlopen(req, timeout=12) as r:
                ctype = (r.headers.get("Content-Type") or "").lower()
                if not ctype.startswith("image") and r.status not in (403, 405, 501):
                    bad.add(u)
        except urllib.error.HTTPError as exc:
            if exc.code not in (403, 405, 501):        # 403 = il CDN blocca il probe, non l'<img>
                bad.add(u)
        except Exception:                              # noqa: BLE001 — rete instabile: meglio tenere l'URL
            pass

    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(probe, urls))
    for it in items:
        if it["image"] in bad:
            it["image"] = ""
    return len(bad)


def dedupe(items: list[dict]) -> list[dict]:
    items.sort(key=lambda i: i["ts"], reverse=True)
    kept: list[dict] = []
    keys: list[str] = []
    for it in items:
        k = norm_key(it["title"])
        if not k:
            continue
        if any(k == prev or difflib.SequenceMatcher(None, k, prev).ratio() > 0.88 for prev in keys):
            continue
        keys.append(k)
        kept.append(it)
    return kept


# ---------------------------------------------------------------- rendering
def esc(t: str) -> str:
    return html.escape(t or "", quote=True)


def stamp_of(it: dict) -> str:
    return datetime.fromisoformat(it["ts"]).strftime("%H:%M")


def date_of(it: dict) -> str:
    return datetime.fromisoformat(it["ts"]).strftime("%d/%m")


def lead_block(it: dict) -> str:
    img = (f'<figure class="lead__figure"><img src="{esc(it["image"])}" alt="" loading="eager" '
           f'referrerpolicy="no-referrer" onerror="this.closest(\'figure\').remove()"></figure>'
           if it["image"] else "")
    return f"""      <article class="lead">
        <a class="lead__link" href="{esc(it['link'])}" rel="noopener">
          <span class="wire__meta"><span class="wire__src">{esc(it['source'])}</span> <time class="wire__time" datetime="{esc(it['ts'])}">{stamp_of(it)}</time></span>
          <h3 class="lead__title">{esc(it['title'])}</h3>
          {f'<p class="lead__sum">{esc(it["summary"])}</p>' if it['summary'] else ''}
        </a>
{img}      </article>"""


def item_li(it: dict, thumb: bool = True) -> str:
    img = ""
    if thumb and it["image"]:
        img = (f'<img class="wire__thumb" src="{esc(it["image"])}" alt="" loading="lazy" '
               f'referrerpolicy="no-referrer" onerror="this.remove()">')
    return f"""        <li class="wire__item">
          {img}<a class="wire__link" href="{esc(it['link'])}" rel="noopener">
            <span class="wire__meta"><span class="wire__src">{esc(it['source'])}</span> <time class="wire__time" datetime="{esc(it['ts'])}">{stamp_of(it)}</time></span>
            <span class="wire__title">{esc(it['title'])}</span>
          </a>
        </li>"""


def rail(title: str, items: list[dict], href: str = "", cls: str = "") -> str:
    if not items:
        return ""
    more = (f'<a class="rail__more" href="{esc(href)}">Archivio {esc(title.lower())} →</a>' if href else "")
    return f"""    <section class="rail {cls}" aria-labelledby="rail-{norm_key(title).replace(' ', '-')}">
      <div class="rail__head">
        <h2 class="rail__title" id="rail-{norm_key(title).replace(' ', '-')}">{esc(title)}</h2>
        {more}
      </div>
      <ul class="wire">
{chr(10).join(item_li(i) for i in items)}      </ul>
    </section>"""


def page(title: str, body: str, nav_active: str, counts: dict, generated: str) -> str:
    nav = "".join(
        f'<a class="masthead__navlink{" is-active" if k == nav_active else ""}" href="{k if k != "index" else "index"}.html">{esc(CAT_TITLES.get(k, "Home"))}</a>'
        for k in ["index"] + CAT_ORDER)
    n_tot = sum(counts.values())
    return f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="Rassegna stampa sportiva: titoli e sommari dai feed pubblici di ANSA Sport, Gazzetta e Sky Sport.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;700;800&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="css/site.css">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="favicon.svg">
</head>
<body>
<a class="skip" href="#main">Vai al contenuto</a>
<header class="masthead">
  <div class="masthead__issue">
    <span class="mono">{esc(generated)}</span>
    <span class="mono">{n_tot} titoli · aggiornamento automatico</span>
  </div>
  <a class="masthead__brand" href="index.html">
    <span class="masthead__wordmark">Sportwire</span>
    <span class="masthead__tagline">rassegna sportiva · ANSA · Gazzetta · Sky Sport</span>
  </a>
  <nav class="masthead__nav" aria-label="Sezioni">{nav}</nav>
</header>
<main id="main">
{body}</main>
<footer class="colophon">
  <div class="colophon__row">
    <p class="colophon__note"><strong>Sportwire</strong> aggrega soltanto titoli, sommari, orari e link dai feed RSS
    pubblici di <a href="https://www.ansa.it/sito/notizie/sport/sport_rss.xml">ANSA Sport</a>,
    <a href="https://www.gazzetta.it/rss/home.xml">La Gazzetta dello Sport</a> e
    <a href="https://sport.sky.it/rss/sport.xml">Sky Sport</a>. Gli articoli restano di proprietà delle testate:
    ogni titolo rimanda alla fonte originale. Nessun testo integrale viene ripubblicato.</p>
    <p class="colophon__meta mono">
      build {esc(generated)} · {n_tot} titoli · {len([c for c in counts.values() if c])} sezioni attive<br>
      generato da <code>build.py</code> (stdlib, nessuna dipendenza) · design: Hallmark editorial / Ecosystem Index / tema Sport
    </p>
  </div>
</footer>
<script src="js/site.js" defer></script>
</body>
</html>
"""


def build(offline: bool = False) -> None:
    print("Sportwire · build")
    items = dedupe(collect(offline))
    for it in items:
        it["cat"] = categorize(it["title"], it["summary"])
    dropped = validate_images(items)
    if dropped:
        print(f"  immagini non raggiungibili scartate: {dropped}")
    by_cat: dict[str, list[dict]] = {k: [] for k in CAT_ORDER}
    for it in items:
        by_cat[it["cat"]].append(it)
    counts = {k: len(v) for k, v in by_cat.items()}
    now = datetime.now(TZ)
    MESI = {"January": "gennaio", "February": "febbraio", "March": "marzo", "April": "aprile",
            "May": "maggio", "June": "giugno", "July": "luglio", "August": "agosto",
            "September": "settembre", "October": "ottobre", "November": "novembre", "December": "dicembre"}
    generated = now.strftime("%d %B %Y · %H:%M").replace(" 0", " ")
    for en, it in MESI.items():
        generated = generated.replace(en, it)

    with_image = [i for i in items if i["image"]]
    lead = (with_image or items)[0]
    rest = [i for i in items if i is not lead]
    side = ([i for i in rest if i["image"]][:1] + [i for i in rest if not i["image"]])[:4] or rest[:4]

    home_body = f"""  <section class="intro">
    <p class="intro__lede">Tutti i titoli sportivi del giorno, in un solo posto: le prime pagine del wire,
    quello che è appena successo e le sezioni per sport. Ogni riga apre l'articolo sulla testata che l'ha scritto.</p>
  </section>

  <section class="feature" aria-labelledby="rail-in-evidenza">
    <div class="rail__head">
      <h2 class="rail__title" id="rail-in-evidenza">In evidenza</h2>
      <a class="rail__more" href="{esc(lead['link'])}" rel="noopener">Leggi su {esc(lead['source'])} →</a>
    </div>
    <div class="feature__grid">
{lead_block(lead)}
      <div class="feature__side">
{chr(10).join('        ' + item_li(i).strip() for i in side)}
      </div>
    </div>
  </section>

  <section class="rail rail--wire" aria-labelledby="rail-ultimora">
    <div class="rail__head">
      <h2 class="rail__title" id="rail-ultimora">Ultim'ora</h2>
      <span class="rail__more mono">{esc(now.strftime('%H:%M'))} · {len(items)} titoli unici</span>
    </div>
    <ul class="wire wire--dense" id="live-wire">
{chr(10).join(item_li(i, thumb=False) for i in items[:18])}    </ul>
  </section>

{chr(10).join(rail(CAT_TITLES[k], by_cat[k][:6], href=f"{k}.html") for k in CAT_ORDER if by_cat[k])}

  <section class="rail rail--how" aria-labelledby="rail-come">
    <div class="rail__head"><h2 class="rail__title" id="rail-come">Come è fatto</h2></div>
    <div class="how">
      <p>Tre feed RSS pubblici letti da <code>build.py</code>, titoli normalizzati e confrontati
      (scarto i doppioni con similarità &gt; 0.88), poi ogni titolo finisce nella sua sezione per parole chiave.
      Il risultato è HTML statico: nessun tracciamento, nessuno script di terze parti, nessun dato personale.</p>
      <p class="mono">feed: ANSA Sport · Gazzetta · Sky Sport &nbsp;/&nbsp; sezioni: {", ".join(CAT_TITLES[k] for k in CAT_ORDER if by_cat[k])}</p>
    </div>
  </section>
"""
    write("index.html", page("Sportwire · rassegna sportiva del giorno", home_body, "index", counts, generated))

    for k in CAT_ORDER:
        if not by_cat[k]:
            continue
        body = f"""  <section class="feature feature--single" aria-labelledby="rail-{k}">
    <div class="rail__head">
      <h2 class="rail__title" id="rail-{k}">{esc(CAT_TITLES[k])}</h2>
      <span class="rail__more mono">{len(by_cat[k])} titoli · aggiornato {esc(now.strftime('%H:%M'))}</span>
    </div>
    <ul class="wire wire--archive">
{chr(10).join(item_li(i) for i in by_cat[k])}    </ul>
  </section>
"""
        write(f"{k}.html", page(f"{CAT_TITLES[k]} · Sportwire", body, k, counts, generated))

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "news.json"), "w", encoding="utf-8") as fh:
        json.dump({"generated": now.isoformat(), "generated_label": generated,
                   "counts": counts, "items": items}, fh, ensure_ascii=False, indent=1)
    print(f"  totale {len(items)} titoli · " + " · ".join(f"{k} {v}" for k, v in counts.items()))


def write(rel: str, content: str) -> None:
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"  scritto {rel} ({len(content) // 1024} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true", help="usa data/raw.json invece della rete")
    build(offline=ap.parse_args().no_fetch)