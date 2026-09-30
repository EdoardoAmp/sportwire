#!/usr/bin/env python3
"""Sportwire · rendering HTML.

Qui non c'è logica di feed: build.py passa storie già raggruppate, classificate e
arricchite (id, brief, nomi delle testate); questo modulo le trasforma in markup.
Il markup è sempre valido anche senza JavaScript (ogni scheda porta al link originale);
js/app.js lo arricchisce: mappa del cielo, dossier in pagina, cronologia, ricerca.
"""
from __future__ import annotations

import html
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Rome")
GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre"]


@dataclass
class Ctx:
    now: datetime
    site_url: str
    window: int
    n_stories: int
    n_sources: int
    n_multi: int
    sections: list           # [(chiave, titolo)]
    sources: list            # [(chiave, nome, home)]
    sec_counts: dict
    ver: dict                # {"css": hash, "js": hash}
    theme_color: str
    n_own: int = 0           # storie con il riassunto di Sportwire


# ================================================================ piccoli pezzi
def esc(t) -> str:
    return html.escape(t or "", quote=True)


ICONS = {
    "search": '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.6 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    "history": '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.2 4.6v3.9h3.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4.2l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "out": '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 16L16.5 7.5M9.5 7.5h7v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

BRAND = ('<svg class="brand__mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false">'
         '<ellipse cx="16" cy="16" rx="13" ry="5.4" transform="rotate(-28 16 16)" fill="none" stroke="currentColor" '
         'stroke-opacity=".55" stroke-width="1.5"/><circle cx="16" cy="16" r="5" fill="var(--accent)"/>'
         '<circle cx="25.6" cy="11" r="2" fill="currentColor"/></svg>')


def dt(st: dict) -> datetime:
    return datetime.fromisoformat(st["ts"]).astimezone(TZ)


def when(st: dict, now: datetime) -> str:
    d = dt(st)
    if d.date() == now.date():
        return d.strftime("%H:%M")
    if d.date() == (now - timedelta(days=1)).date():
        return "ieri " + d.strftime("%H:%M")
    return f"{d.day} {MESI[d.month - 1][:3]} " + d.strftime("%H:%M")


def human_date(now: datetime) -> str:
    return f"{GIORNI[now.weekday()].capitalize()} {now.day} {MESI[now.month - 1]} {now.year}"


def blurb(st: dict) -> Tuple[str, bool]:
    """Testo breve da mostrare: la riscrittura di Sportwire se c'è, altrimenti il sommario della testata."""
    if st.get("brief"):
        return st["brief"], True
    return st.get("summary") or "", False


def attrs(st: dict) -> str:
    return f'data-id="{esc(st["id"])}" data-k="{esc(st["kkey"])}" data-c="{esc(st["cat"])}"'


def kicker_html(st: dict, with_section: bool = True) -> str:
    sec, k = st["sec_title"], st["kicker"]
    if with_section:
        label = esc(sec) + (f'<span class="kicker__sub">{esc(k)}</span>' if k != sec else "")
    else:
        label = esc(k)
    live = '<span class="badge badge--live">Diretta</span>' if st["live"] else ""
    return f'<p class="kicker">{label}{live}</p>'


def meta_html(st: dict, ctx: Ctx) -> str:
    n = len(st["sources"])
    more = ""
    if n > 1:
        others = ", ".join(x for x in st["src_names"] if x != st["src_name"])
        more = (f'<span class="meta__more" title="Ne scrivono anche: {esc(others)}">'
                f'+{n - 1} testat{"a" if n == 2 else "e"}</span>')
    video = '<span class="meta__video">Video</span>' if st["video"] else ""
    return (f'<p class="meta"><span class="meta__src">{esc(st["src_name"])}</span>'
            f'<time datetime="{esc(st["ts"])}" data-rel>{esc(when(st, ctx.now))}</time>{more}{video}</p>')


def brief_html(st: dict, cls: str = "") -> str:
    text, own = blurb(st)
    if not text:
        return ""
    return f'<p class="brief{" brief--own" if own else ""} {cls}">{esc(text)}</p>'


def img_html(url: str, eager: bool = False) -> str:
    if not url:
        return ""
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<img src="{esc(url)}" alt="" {load} decoding="async" referrerpolicy="no-referrer" '
            f"onload=\"this.classList.add('is-loaded')\" "
            f"onerror=\"this.parentNode.classList.add('no-img');this.remove()\">")


def title_link(st: dict, cls: str = "stretch") -> str:
    return (f'<a class="{cls}" href="{esc(st["link"])}" data-story="{esc(st["id"])}" rel="noopener">'
            f'{esc(st["title"])}</a>')


# ================================================================ pianeta (apertura)
def planet_html(st: dict, eager: bool = True) -> str:
    """Foto tonda con un'orbita: una luna per ogni testata che ne scrive."""
    n = max(1, min(len(st["sources"]), 6))
    rx, ry, tilt = 47.0, 17.0, math.radians(-26)
    cx = cy = 50.0

    def pt(theta: float) -> Tuple[float, float]:
        x, y = rx * math.cos(theta), ry * math.sin(theta)
        return (cx + x * math.cos(tilt) - y * math.sin(tilt), cy + x * math.sin(tilt) + y * math.cos(tilt))

    back, front = [], []
    for i in range(n):
        th = math.radians(200 + i * (300 / max(n, 1)))            # distribuite sull'orbita, mai tutte in fila
        x, y = pt(th)
        moon = (f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{2.3 if i == 0 else 1.7}" class="moon{" moon--lead" if i == 0 else ""}">'
                f'<title>{esc(st["src_names"][i] if i < len(st["src_names"]) else "")}</title></circle>')
        (front if math.sin(th) >= 0 else back).append(moon)
    x0, y0 = pt(0.0)
    x1, y1 = pt(math.pi)
    arc = f'<path class="orbit" d="M{x0:.2f} {y0:.2f} A{rx} {ry} {math.degrees(tilt):.0f} 0 1 {x1:.2f} {y1:.2f}"/>'
    ring = (f'<ellipse class="orbit" cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'transform="rotate({math.degrees(tilt):.0f} {cx} {cy})"/>')
    photo = (f'<div class="planet__body">{img_html(st["image"], eager=eager)}</div>' if st["image"]
             else '<div class="planet__body planet__body--bare"></div>')
    return (f'<div class="planet" aria-hidden="true">'
            f'<svg class="planet__back" viewBox="0 0 100 100" focusable="false">{ring}{"".join(back)}</svg>'
            f'{photo}'
            f'<svg class="planet__front" viewBox="0 0 100 100" focusable="false">{arc}{"".join(front)}</svg></div>')


def lead_html(st: dict, ctx: Ctx) -> str:
    coverage = ""
    if st["also"]:
        li = "".join(
            f'<li><a href="{esc(i["link"])}" rel="noopener"><span class="coverage__src">{esc(i["src_name"])}</span>'
            f'<span class="coverage__title">{esc(i["title"])}</span></a></li>' for i in st["also"][:3])
        coverage = f'<div class="coverage"><p class="coverage__label">Ne scrivono anche</p><ul>{li}</ul></div>'
    n = len(st["sources"])
    return f"""<article class="lead" {attrs(st)}>
  <div class="lead__planet">{planet_html(st)}</div>
  <div class="lead__text">
    <p class="eyebrow"><span class="pulse" aria-hidden="true"></span>In apertura<span class="eyebrow__more"> · {n} testat{"a" if n == 1 else "e"}</span></p>
    {kicker_html(st, True)}
    <h2 class="lead__title{' lead__title--long' if len(st['title']) > 78 else ''}">{title_link(st)}</h2>
    {brief_html(st, "lead__brief")}
    {meta_html(st, ctx)}
    <div class="lead__actions">
      <a class="btn btn--primary" href="{esc(st['link'])}" data-story="{esc(st['id'])}" rel="noopener">{"Leggi in breve" if st["brief"] else "Apri la notizia"}</a>
      <a class="btn btn--quiet" href="{esc(st['link'])}" rel="noopener" data-out="{esc(st['id'])}">{esc(st['src_name'])} {ICONS['out']}</a>
    </div>
    {coverage}
  </div>
</article>
"""


# ================================================================ schede
def card_html(st: dict, ctx: Ctx, with_section: bool = True, eager: bool = False) -> str:
    media = f'<div class="card__media media">{img_html(st["image"], eager=eager)}</div>' if st["image"] else ""
    return f"""<article class="card{'' if st['image'] else ' card--text'}" data-hit {attrs(st)}>
      {media}
      <div class="card__body">
        {kicker_html(st, with_section)}
        <h3 class="card__title">{title_link(st)}</h3>
        {brief_html(st)}
        {meta_html(st, ctx)}
      </div>
    </article>"""


def row_html(st: dict, ctx: Ctx, with_section: bool = True, thumb: bool = True) -> str:
    img = f'<div class="row__media media">{img_html(st["image"])}</div>' if thumb and st["image"] else ""
    return f"""<li class="row" data-hit {attrs(st)}>
        <div class="row__body">
          {kicker_html(st, with_section)}
          <h3 class="row__title">{title_link(st)}</h3>
          {brief_html(st)}
          {meta_html(st, ctx)}
        </div>{img}
      </li>"""


def log_html(st: dict, ctx: Ctx) -> str:
    return f"""<li class="log" data-hit {attrs(st)}>
        <time class="log__time" datetime="{esc(st['ts'])}">{esc(dt(st).strftime('%H:%M'))}</time>
        <div class="log__body">
          {kicker_html(st, True)}
          {title_link(st, "log__title stretch")}
          <span class="log__src">{esc(st['src_name'])}{' · video' if st['video'] else ''}</span>
        </div>
      </li>"""


# ================================================================ pagine
def sky_html(ctx: Ctx) -> str:
    return f"""  <section class="sky" data-sky hidden aria-labelledby="h-sky">
    <div class="sec-head">
      <div>
        <p class="eyebrow">Mappa delle notizie</p>
        <h2 class="h2" id="h-sky">Il cielo di oggi</h2>
      </div>
      <p class="sec-head__note">Ogni punto è una notizia: più è grande, più redazioni ne parlano. Da sinistra a destra
      scorre il tempo, le corsie sono gli sport. Un punto mostra l’anteprima: cliccalo, o toccalo di nuovo, per aprirlo.</p>
    </div>
    <div class="sky__frame">
      <div class="sky__stage" data-sky-stage role="group" aria-label="Le notizie di oggi disposte per sport e orario"></div>
      <div class="sky__peek" data-sky-peek hidden></div>
    </div>
    <ul class="sky__legend" aria-hidden="true">
      <li><i class="key key--star"></i>notizia</li>
      <li><i class="key key--multi"></i>più testate</li>
      <li><i class="key key--live"></i>in diretta</li>
      <li><i class="key key--read"></i>già letta</li>
      <li><i class="key key--line"></i>collegate a quella scelta</li>
    </ul>
  </section>
"""


def clips_html(clips: list, ctx: Ctx) -> str:
    """I video dello stesso periodo del registro, raccolti in una riga che si apre (senza JavaScript: <details>)."""
    if not clips:
        return ""
    items = "".join(
        f'<li data-hit {attrs(s)}><a href="{esc(s["link"])}" data-story="{esc(s["id"])}" rel="noopener">{esc(s["title"])}</a>'
        f'<span class="clips__src">{esc(s["src_name"])} · {esc(dt(s).strftime("%H:%M"))}</span></li>' for s in clips)
    n = len(clips)
    return f"""<details class="clips">
        <summary><span class="clips__icon" aria-hidden="true">▶</span>{n} video di highlights e clip <span class="clips__hint">mostra</span></summary>
        <ul class="clips__list">{items}</ul>
      </details>"""


def home_body(ctx: Ctx, hero: dict, top: list, live: list, blocks: list, clips: Optional[list] = None) -> str:
    blocks_html = []
    for k, lead, rest in blocks:
        title = dict(ctx.sections)[k]
        lead_card = card_html(lead[0], ctx, with_section=False) if lead else ""
        rows = "\n      ".join(row_html(s, ctx, with_section=False, thumb=False) for s in rest)
        blocks_html.append(f"""    <section class="block" aria-labelledby="h-{k}">
      <div class="block__head">
        <h2 class="block__title" id="h-{k}"><a href="{k}.html">{esc(title)}</a></h2>
        <a class="block__more" href="{k}.html">Tutte le {ctx.sec_counts.get(k, 0)} <span aria-hidden="true">→</span></a>
      </div>
      <div class="block__grid{'' if lead else ' block__grid--rows'}">
        {lead_card}
        <ul class="rows">
      {rows}
        </ul>
      </div>
    </section>""")
    return f"""<p class="brief-line"><strong>{ctx.n_stories} notizie</strong> nelle ultime {ctx.window} ore da {ctx.n_sources} redazioni ·
  {ctx.n_multi} raccontate da più testate · <span class="brief-line__own">{ctx.n_own} riassunte da Sportwire</span> ·
  <span class="brief-line__at">aggiornato alle <time datetime="{esc(ctx.now.isoformat())}">{esc(ctx.now.strftime('%H:%M'))}</time></span></p>
{lead_html(hero, ctx)}
<section class="follow" data-follow hidden aria-labelledby="h-follow"></section>
<section class="resume" data-resume hidden aria-labelledby="h-resume"></section>
  <div class="front">
    <section class="front__main" aria-labelledby="h-top">
      <div class="sec-head">
        <div><p class="eyebrow">In breve</p><h2 class="h2" id="h-top">Da non perdere</h2></div>
      </div>
      <div class="cards">
    {chr(10).join(card_html(s, ctx, eager=i < 2) for i, s in enumerate(top))}
      </div>
    </section>
    <aside class="front__aside" aria-labelledby="h-live">
      <div class="sec-head">
        <div><p class="eyebrow"><span class="pulse" aria-hidden="true"></span>Ultim’ora</p><h2 class="h2" id="h-live">Registro di bordo</h2></div>
      </div>
      <ol class="logbook">
      {chr(10).join(log_html(s, ctx) for s in live)}
      </ol>
      {clips_html(clips or [], ctx)}
    </aside>
  </div>
{sky_html(ctx)}
  <div class="blocks">
{chr(10).join(blocks_html)}
  </div>
"""


def section_body(ctx: Ctx, k: str, sec: list, feats: list, rest: list) -> str:
    from collections import Counter
    title = dict(ctx.sections)[k]
    kicks = Counter((s["kicker"], s["kkey"]) for s in sec)
    generic = title
    order = [(kk, key, n) for (kk, key), n in kicks.most_common() if kk != generic]
    order += [(kk, key, n) for (kk, key), n in kicks.items() if kk == generic]       # «Varie» in coda
    chips = "".join(
        f'<button type="button" class="chip" data-filter="{esc(key)}" aria-pressed="false">'
        f'{esc("Varie" if kk == generic else kk)}<span class="chip__n">{n}</span></button>'
        for kk, key, n in order)
    return f"""<p class="page-meta">{len(sec)} notizie nelle ultime {ctx.window} ore · aggiornato alle {esc(ctx.now.strftime('%H:%M'))}</p>
<div class="chips" role="group" aria-label="Filtra per argomento" hidden>
  <button type="button" class="chip" data-filter="*" aria-pressed="true">Tutte<span class="chip__n">{len(sec)}</span></button>{chips}
</div>
<div class="cards cards--feature">
  {chr(10).join(card_html(s, ctx, with_section=False, eager=True) for s in feats)}
</div>
<ul class="rows rows--grid">
  {chr(10).join(row_html(s, ctx, with_section=False) for s in rest)}
</ul>
<p class="empty" hidden>Nessuna notizia per questo argomento nelle ultime {ctx.window} ore.</p>
"""


def history_body(ctx: Ctx) -> str:
    return """<div class="hist" data-history>
  <noscript><p class="empty">La cronologia vive nel tuo browser e ha bisogno di JavaScript.</p></noscript>
</div>
"""


# Anteprima quando si condivide un link: una scheda statica del sito (og/, generata da make_icons.py), mai la foto di
# un editore in hotlink. La cronologia ha la sua; prima pagina e sezioni usano quella del marchio.
OG_CARDS = {"cronologia.html": "og/cronologia.png"}
OG_DEFAULT = "og/index.png"
OG_SIZE = (1200, 630)


def og_card(rel: str) -> str:
    return OG_CARDS.get(rel, OG_DEFAULT)


def page(ctx: Ctx, *, rel: str, title: str, description: str, body: str, active: str,
         noindex: bool = False) -> str:
    is_home = rel == "index.html"
    is_hist = rel == "cronologia.html"
    h1 = {"index.html": "Sportwire · il cielo dello sport di oggi",
          "cronologia.html": "Cronologia"}.get(rel, dict(ctx.sections).get(rel[:-5], "Sportwire"))
    h1_html = (f'<h1 class="visually-hidden">{esc(h1)}</h1>' if is_home else
               f'<h1 class="page-title">{esc(h1)}</h1>')
    if is_hist:
        h1_html = ('<div class="page-head"><p class="eyebrow">Il tuo diario di bordo</p>'
                   '<h1 class="page-title">Cronologia</h1>'
                   '<p class="page-sub">Le notizie che hai aperto, in ordine di tempo. Vive solo su questo dispositivo: '
                   'nessun account, nessun server.</p></div>')
    url = ctx.site_url + ("" if is_home else rel)
    card = ctx.site_url + og_card(rel)
    og = (f'<meta property="og:image" content="{esc(card)}">\n'
          f'<meta property="og:image:width" content="{OG_SIZE[0]}">\n<meta property="og:image:height" content="{OG_SIZE[1]}">\n'
          f'<meta property="og:image:alt" content="Sportwire, il cielo dello sport di oggi">\n'
          f'<meta name="twitter:image" content="{esc(card)}">')
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    cur = ' aria-current="page"'
    links = "".join(
        f'<a href="{k}.html"{cur if k == active else ""}>{esc(t)}</a>' for k, t in ctx.sections)
    home_link = f'<a href="index.html"{cur if active == "index" else ""}>Oggi</a>'
    src_links = "".join(f'<li><a href="{esc(h)}" rel="noopener">{esc(n)}</a></li>' for _k, n, h in ctx.sources)
    hist_cur = cur if active == "cronologia" else ""
    return f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
{robots}<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sportwire">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(url)}">
{og}
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="{ctx.theme_color}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="preload" href="fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.classList.add('js')</script>
<link rel="stylesheet" href="css/site.css?v={ctx.ver['css']}">
<script src="js/app.js?v={ctx.ver['js']}" defer></script>
</head>
<body data-page="{'home' if is_home else 'history' if is_hist else 'section'}">
<a class="skip" href="#main">Vai al contenuto</a>
<div class="cosmos" aria-hidden="true"></div>
<header class="bar">
  <nav class="pill" aria-label="Principale">
    <a class="brand" href="index.html" aria-label="Sportwire, il cielo di oggi">{BRAND}<span class="brand__name">Sportwire</span></a>
    <div class="pill__links">{home_link}{links}</div>
    <div class="pill__tools">
      <button type="button" class="tool" data-open-search aria-label="Cerca tra le notizie" title="Cerca ( / )">{ICONS['search']}</button>
      <a class="tool" href="cronologia.html"{hist_cur} aria-label="Cronologia" title="Cronologia">{ICONS['history']}<span class="tool__n" data-hist-count hidden></span></a>
    </div>
  </nav>
</header>
<main id="main" class="wrap">
{h1_html}
{body}</main>
<footer class="foot">
  <div class="wrap foot__in">
    <p class="foot__statement">Sei redazioni, un solo cielo. Le notizie, riscritte in breve.</p>
    <div class="foot__cols">
      <p class="foot__about">Sportwire raccoglie i titoli dei feed pubblici delle testate, li riscrive in poche righe
      e rimanda sempre all’articolo originale. Nessun account, nessun cookie: la cronologia resta su questo
      dispositivo. Le foto arrivano dai server delle testate.</p>
      <div><p class="foot__label">Le fonti</p><ul class="foot__sources">{src_links}</ul></div>
      <div><p class="foot__label">Questa edizione</p>
      <p class="foot__meta">{ctx.n_stories} notizie · ultime {ctx.window} ore<br>
      <span class="stamp"><span class="pulse" aria-hidden="true"></span>aggiornata alle
      <time datetime="{esc(ctx.now.isoformat())}" data-stamp>{esc(ctx.now.strftime('%H:%M'))}</time></span><br>
      {esc(human_date(ctx.now))}</p></div>
    </div>
  </div>
</footer>
</body>
</html>
"""
