#!/usr/bin/env python3
"""Sportwire — generatore del sito di news sportive.

Legge i feed RSS pubblici di sei redazioni sportive italiane, scarta promo e titoli
vecchi, raggruppa gli articoli che raccontano la stessa storia, li classifica per sport
usando le sezioni dichiarate dalle testate (URL e <category>) e sceglie l'apertura in base
a quante redazioni ne parlano. Produce un sito statico:

    index.html + <sezione>.html + cronologia.html + data/news.json
    css/site.css e js/app.js (impacchettati da css/src e js/src), sw.js, manifest

Le notizie riscritte in breve stanno in data/briefs.json (le scrive briefs.py / il cron di
Hermes); qui vengono solo unite alle storie. Solo stdlib. Uso:  python3 build.py [--no-fetch]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import briefs as BR
import render as R

ROOT = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo("Europe/Rome")
SITE_URL = "https://edoardoamp.github.io/sportwire/"
THEME_COLOR = "#080c16"   # = --void di css/src/00-tokens.css
WINDOW_H = 36          # finestra delle notizie
MIN_ITEMS = 60         # se la finestra è troppo magra (notte), la allargo fino a 72h
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# chiave, nome, feed, home della testata, qualità dell'immagine (per scegliere la foto migliore)
SOURCES = [
    ("gazzetta", "Gazzetta", "https://www.gazzetta.it/dynamic-feed/rss/section/last.xml",
     "https://www.gazzetta.it/", 3),
    ("cds", "Corriere dello Sport", "https://www.corrieredellosport.it/rss/",
     "https://www.corrieredellosport.it/", 3),
    ("tuttosport", "Tuttosport", "https://www.tuttosport.com/rss/", "https://www.tuttosport.com/", 3),
    ("sky", "Sky Sport", "https://sport.sky.it/rss/sport.xml", "https://sport.sky.it/", 1),
    ("ansa", "ANSA", "https://www.ansa.it/sito/notizie/sport/sport_rss.xml",
     "https://www.ansa.it/sito/notizie/sport/", 0),
    ("oa", "OA Sport", "https://www.oasport.it/feed/", "https://www.oasport.it/", 2),
]
SRC_NAME = {k: n for k, n, *_ in SOURCES}
SRC_IMGQ = {k: q for k, *_, q in SOURCES}

SECTIONS = [("calcio", "Calcio"), ("motori", "Motori"), ("tennis", "Tennis"),
            ("basket", "Basket"), ("ciclismo", "Ciclismo"), ("altri", "Altri sport")]
SEC_TITLE = dict(SECTIONS)
SEC_ORDER = [k for k, _ in SECTIONS]

GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre"]


# ================================================================ testo
def norm_key(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def clean(text: str, limit: int = 240) -> str:
    t = re.sub(r"<[^>]+>", " ", text or "")
    t = re.sub(r"&[#\w]*$", "", t.strip())                 # entità troncata dal feed (es. "l&#x")
    t = html.unescape(html.unescape(t))
    t = re.sub(r"\s*(L'articolo|The post)\b.*$", "", t)     # coda WordPress ("… proviene da OA Sport")
    t = re.sub(r"\s+", " ", t).strip()
    if limit and len(t) > limit:
        t = t[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:—-") + "…"
    return t


SUFFIX_RX = re.compile(r"[\s.,:;|–—-]*\(?\b(VIDEO|FOTO|GALLERY|DIRETTA|LIVE)\b\)?\s*$")


def tidy_title(raw: str) -> tuple[str, bool, bool]:
    """Titolo pulito + flag video/diretta ricavati dai suffissi in maiuscolo."""
    t = clean(raw, 0)
    video = live = False
    while True:
        m = SUFFIX_RX.search(t)
        if not m or m.start() < 12:
            break
        word = m.group(1)
        video |= word in ("VIDEO",)
        live |= word in ("DIRETTA", "LIVE")
        t = t[: m.start()].rstrip()
    m = re.match(r"^(LIVE|DIRETTA|VIDEO)\b[\s:–-]*", t)          # anche in testa: "LIVE Alle 20.45 …"
    if m and len(t) > m.end() + 12:
        video |= m.group(1) == "VIDEO"
        live |= m.group(1) != "VIDEO"
        t = t[m.end():]
        t = t[:1].upper() + t[1:]
    t = t.replace("'", "’")
    parts = t.split('"')
    if len(parts) % 2 == 1 and len(parts) > 1:           # virgolette bilanciate → « »
        t = "".join(p + ("«" if i % 2 == 0 else "»") for i, p in enumerate(parts[:-1])) + parts[-1]
    return t, video, live


# ================================================================ feed
def fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def first_image(node: ET.Element) -> str:
    """media:content / media:thumbnail / enclosure / skyit:image / <img> nel corpo."""
    for child in node.iter():
        tag = child.tag.split("}")[-1].lower()
        url = child.get("url") or ""
        if tag in ("content", "thumbnail") and url:
            kind = (child.get("type") or child.get("medium") or "image").lower()
            if kind.startswith("image"):
                return url
        if tag == "enclosure" and url and (child.get("type") or "").startswith("image"):
            return url
    for child in node.iter():
        tag = child.tag.split("}")[-1].lower()
        if tag == "image" and (child.text or "").strip().startswith("http"):
            return child.text.strip()
    for child in node.iter():
        if child.tag.split("}")[-1].lower() in ("encoded", "description"):
            m = re.search(r'<img[^>]+src="([^"]+)"', child.text or "")
            if m:
                return m.group(1)
    return ""


IT_DAYS = {"lun": "Mon", "mar": "Tue", "mer": "Wed", "gio": "Thu", "ven": "Fri", "sab": "Sat", "dom": "Sun"}
IT_MONTHS = {"gen": "Jan", "feb": "Feb", "mar": "Mar", "apr": "Apr", "mag": "May", "giu": "Jun",
             "lug": "Jul", "ago": "Aug", "set": "Sep", "ott": "Oct", "nov": "Nov", "dic": "Dec"}


def parse_date(raw: str) -> datetime | None:
    """RFC 822, anche nella variante italiana di Sky ("lun, 28 set 2026 17:22:23 GMT") e ISO 8601."""
    s = (raw or "").strip()
    if not s:
        return None
    m = re.match(r"^([a-zà-ú]{3})\w*,\s*(\d{1,2})\s+([a-zà-ú]{3})\w*\s+(.*)$", s, re.I)
    if m and m.group(3).lower() in IT_MONTHS:
        s = f"{IT_DAYS.get(m.group(1).lower(), 'Mon')}, {m.group(2)} {IT_MONTHS[m.group(3).lower()]} {m.group(4)}"
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def parse_feed(src: str, raw: bytes) -> list[dict]:
    root = ET.fromstring(raw)
    out = []
    for item in root.iter("item"):
        def g(name: str) -> str:
            for child in item:
                if child.tag.split("}")[-1] == name:
                    return child.text or ""
            return ""
        title, video, live = tidy_title(g("title"))
        # "LIVE" in coda vale "Diretta" solo per un evento (partita, gara, GP); per la cronaca è un liveblog
        live = live and bool(fixture(title) or re.search(r"\b(gp|gran premio|gara|tappa|finale|match)\b", title, re.I))
        link = g("link").strip()
        if not title or not link.startswith("http"):
            continue
        date = parse_date(g("pubDate") or g("date"))
        if date is None:
            continue                                               # senza data non so se è fresca
        cats = [clean(c.text or "", 0) for c in item if c.tag.split("}")[-1] == "category" and c.text]
        path = urlparse(link).path.lower()
        out.append({
            "src": src,
            "title": title,
            "link": link,
            "summary": clean(g("description")),
            "image": first_image(item),
            "cats": [c for c in cats if c],
            "ts": date.astimezone(TZ).isoformat(),
            "video": video or "/video/" in path or "/video-" in path,
            # "Diretta" solo per le partite: Sky usa il liveblog anche per notizie di cronaca
            "live": live or ("liveblog" in " ".join(cats).lower() and bool(fixture(title))),
        })
    return out


RAW_OVERRIDE = ""       # --raw: prove su dati grezzi di un'altra ora (solo lettura)


def collect(offline: bool = False) -> list[dict]:
    path = RAW_OVERRIDE or os.path.join(ROOT, "data", "raw.json")
    if offline:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    out: list[dict] = []
    with cf.ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        futs = {pool.submit(fetch, url): key for key, _n, url, *_ in SOURCES}
        for fut in cf.as_completed(futs):
            key = futs[fut]
            try:
                items = parse_feed(key, fut.result())
                print(f"  {SRC_NAME[key]:21} {len(items):4} articoli")
                out += items
            except Exception as exc:                               # noqa: BLE001
                print(f"  {SRC_NAME[key]:21} ERRORE: {type(exc).__name__}: {exc}", file=sys.stderr)
    if not out:
        print("nessun feed raggiungibile — uso i dati grezzi salvati", file=sys.stderr)
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    return out


# ================================================================ filtri
PROMO_RX = re.compile(
    r"abbonat|abbonament|\d+[,.]\d{2}\s*(euro|€)|offerta|newsletter|scarica l.app|"
    r"digitale senza costi|codice sconto|black friday|oroscopo|meteo\b|concorso a premi|"
    r"guida con noi|che (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|"
    r"novembre|dicembre) su sky|tutte le partite in onda|in streaming su now|palinsesto|"
    r"dove vederl[aoei] in tv|come vederl[aoei] in (tv|streaming)|\bx\d+(,\d+)?!|terzina|quote? (di|dei)|"
    r"pronostic|scommess|bonus benvenuto", re.I)
# sezioni delle testate che non sono sport (Gazzetta ha salute, fitness, tv, prove auto…)
NON_SPORT_RX = re.compile(
    r"^(salute|fitness|tv|attualit|lifestyle|guide|moda|cucina|altri-mondi|motori/(auto|prove|guida)|"
    r"running/(scarpe|attrezzatura))|/(salute|fitness|tv|attualita|altri-mondi|guida-con-noi|"
    r"prove-auto|auto-nuove|lifestyle|gossip|on-air|sport-e-salute|scommesse|betting|pronostici)/", re.I)


def is_noise(it: dict) -> str:
    if PROMO_RX.search(it["title"]):
        return "promo"
    probe = [urlparse(it["link"]).path.lower()] + [c.lower() for c in it["cats"]]
    if any(NON_SPORT_RX.search(p) for p in probe):
        return "non-sport"
    return ""


# ================================================================ classificazione
# 1) indizi dichiarati dalla testata: sezione nell'URL o <category>. Ordine = priorità.
HINTS = [
    (r"calciomercato", "calcio", "Calciomercato"),
    (r"formula.?1|\bf1\b|formula1", "motori", "F1"),
    (r"moto.?gp", "motori", "MotoGP"),
    (r"superbike|\bsbk\b", "motori", "Superbike"),
    (r"\brally\b|\bwrc\b|dakar", "motori", "Rally"),
    (r"motori|automobilismo|motociclismo|\bmoto\b|^auto\b| auto$", "motori", ""),
    (r"\bwnba\b", "basket", "WNBA"),
    (r"\bnba\b", "basket", "NBA"),
    (r"eurolega|euroleague", "basket", "Eurolega"),
    (r"basket|pallacanestro", "basket", ""),
    (r"tennis|\batp\b|\bwta\b", "tennis", ""),
    (r"ciclismo", "ciclismo", ""),
    (r"volley|pallavolo", "altri", "Volley"),
    (r"nuoto|tuffi|pallanuoto|cliff", "altri", "Nuoto"),
    (r"atletica|maratona", "altri", "Atletica"),
    (r"\bsci\b|sport.?invernali|biathlon|slittino", "altri", "Sport invernali"),
    (r"rugby", "altri", "Rugby"),
    (r"\bgolf\b", "altri", "Golf"),
    (r"\bvela\b|america.?s cup", "altri", "Vela"),
    (r"boxe|pugilato|\bmma\b|\bufc\b", "altri", "Boxe"),
    (r"scherma", "altri", "Scherma"),
    (r"canoa|kayak|canottaggio", "altri", "Canoa"),
    (r"hockey", "altri", "Hockey"),
    (r"pallamano", "altri", "Pallamano"),
    (r"esports?", "altri", "eSports"),
    (r"calcio|serie.?a|serie.?b|champions|nazional|premier|liga|bundesliga|news-\w+|"
     r"\bjuve|\binter\b|\bmilan\b|\broma\b|\blazio\b|\bnapoli\b", "calcio", ""),
]
HINTS = [(re.compile(rx), cat, kick) for rx, cat, kick in HINTS]

# 2) parole chiave quando la testata non dichiara la sezione (ANSA con percorso /2026/, regionali…)
KEYWORDS = {
    "calcio": "calcio, serie a, serie b, juventus, juve, inter, milan, napoli, roma, lazio, atalanta, "
              "fiorentina, bologna, torino, udinese, genoa, lecce, verona, cagliari, parma, como, "
              "sassuolo, pisa, cremonese, champions, europa league, conference, nations league, "
              "nazionale, azzurri, mancini, gol, rigore, allenatore, calciomercato, premier, liga, "
              "bundesliga, psg, real madrid, barcellona, figc",
    "motori": "formula 1, f1, gran premio, ferrari, verstappen, hamilton, leclerc, mclaren, motogp, "
              "marquez, bagnaia, ducati, aprilia, superbike, bulega, rally, pole",
    "tennis": "tennis, atp, wta, sinner, musetti, alcaraz, djokovic, paolini, cobolli, wimbledon, slam, davis",
    "basket": "basket, nba, eurolega, lba, olimpia milano, virtus, legabasket, canestro",
    "ciclismo": "ciclismo, giro d italia, tour de france, vuelta, tappa, pogacar, evenepoel, van der poel",
    "altri": "volley, pallavolo, rugby, nuoto, atletica, scherma, boxe, sci, olimpiadi, vela, golf, "
             "america s cup, coni",
}
KEYWORDS = {k: [norm_key(w) for w in v.split(",")] for k, v in KEYWORDS.items()}
BASKET_SCORE = re.compile(r"\b([4-9]\d|1[0-4]\d)-([4-9]\d|1[0-4]\d)\b")   # 101-93: è basket, non calcio

AZZURRI_RX = re.compile(r"\bazzurr\w*|\bmancini\b|\bitalia (u ?21|under 21)\b|"
                        r"\b(turchia|nations league|nazionale)\b.*\bitalia\b|"
                        r"(?<!coppa )\bitalia\b.*\b(turchia|nations league|nazionale)\b")
NAZIONALI_RX = re.compile(r"\bnations league\b|\bqualificazion\w*|\bnazional\w*|\bct\b|\bamichevol\w*")
COPPE_RX = re.compile(r"\bchampions\b|\beuropa league\b|\bconference\b")
ESTERO_RX = re.compile(r"\bpremier\b|\bliga\b|\bbundesliga\b|\bligue 1\b|\bpsg\b|\breal madrid\b|"
                       r"\bbarcellona\b|\bmanchester\b|\bliverpool\b|\bbayern\b|\barsenal\b|\bchelsea\b")
SERIE_A_RX = re.compile(r"serie a|\b(juve|juventus|inter|milan|napoli|roma|lazio|atalanta|fiorentina|bologna|"
                        r"torino|udinese|genoa|lecce|verona|cagliari|parma|como|sassuolo|pisa|cremonese)\b")


def section_hint(it: dict) -> str:
    segs = [s for s in urlparse(it["link"]).path.lower().split("/") if s]
    src = it["src"]
    parts = [" / ".join(it["cats"]).lower()]
    if src == "ansa" and len(segs) >= 4:
        parts.append(segs[3])                 # /sito/notizie/sport/<sezione>/
    elif src in ("cds", "tuttosport") and len(segs) >= 2:
        parts.append(" ".join(segs[1:3]))     # /news/<sezione>/<sottosezione>/
    elif segs:
        parts.append(segs[0])
    return " ".join(p for p in parts if p and not p.isdigit())


def classify(it: dict) -> tuple[str, str]:
    text = " " + norm_key(it["title"] + " " + it["summary"][:160]) + " "
    hint = section_hint(it)
    # ANSA apre spesso il titolo con lo sport: "Auto: …", "Tennis, …", "Ciclismo: …"
    lead = re.match(r"^([A-Za-zÀ-ú ]{3,18})[:,]\s", it["title"])
    if lead and it["src"] == "ansa":
        hint = f"{hint} {norm_key(lead.group(1))}"
    cat, kicker = "", ""
    if BASKET_SCORE.search(it["title"]):
        cat = "basket"
    for rx, c, k in HINTS:
        if not cat and rx.search(hint):
            cat, kicker = c, k
    if not cat:
        scores = {c: sum(1 for w in words if f" {w} " in text) for c, words in KEYWORDS.items()}
        best = max(scores, key=scores.get)
        # una sola parola generica ("nazionale") nel sommario non basta a dire "calcio"
        cat = best if scores[best] >= (2 if best == "calcio" and not any(
            f" {w} " in " " + norm_key(it["title"]) + " " for w in KEYWORDS["calcio"]) else 1) else "altri"
    if not kicker:
        kicker = subsection(cat, text, it)
    if cat == "basket" and " wnba " in text:
        kicker = "WNBA"
    return cat, kicker


def subsection(cat: str, text: str, it: dict) -> str:
    low = " / ".join(it["cats"]).lower()
    if cat == "calcio":
        if "femminil" in text:
            return "Femminile"
        if AZZURRI_RX.search(text):
            return "Azzurri"
        if COPPE_RX.search(text):
            return "Coppe europee"
        if NAZIONALI_RX.search(text) or "nazionali" in low:
            return "Nazionali"
        if "calciomercato" in text or "mercato" in text:
            return "Calciomercato"
        if ESTERO_RX.search(text) or "estero" in low:
            return "Estero"
        if "serie b" in text:
            return "Serie B"
        if SERIE_A_RX.search(text) or "serie a" in low:
            return "Serie A"
        return "Calcio"
    if cat == "motori":
        if re.search(r"\b(ferrari|verstappen|leclerc|hamilton|mclaren|vasseur|gran premio|f1)\b", text):
            return "F1"
        if re.search(r"\b(motogp|marquez|bagnaia|ducati|aprilia|martin)\b", text):
            return "MotoGP"
        if re.search(r"\b(superbike|sbk|bulega)\b", text):
            return "Superbike"
        return "Motori"
    if cat == "tennis":
        for c in it["cats"]:
            m = re.match(r"(ATP|WTA)\s+([A-Za-zÀ-ú' ]+?)(?:\s+\d{4})?$", c)
            if m:
                return f"{m.group(1)} {m.group(2)}"
        if "davis" in text:
            return "Coppa Davis"
        if re.search(r"\bwta\b|paolini|sabalenka|swiatek|gauff", text):
            return "WTA"
        return "ATP"
    if cat == "basket":
        if re.search(r"\bnba\b", text):
            return "NBA"
        if "eurolega" in text:
            return "Eurolega"
        if BASKET_SCORE.search(it["title"]) or "serie a" in text or "lba" in text:
            return "Serie A"
        return "Basket"
    if cat == "ciclismo":
        t = norm_key(it["title"])
        if "europe" in t:
            return "Europei"
        if "mondial" in t:
            return "Mondiali"
        return "Mondiali" if "mondial" in text else "Ciclismo"
    for rx, c, k in HINTS:
        if c == "altri" and k and rx.search(text):
            return k
    return "Altri sport"


# ================================================================ storie (raggruppamento)
STOP = set("""il lo la i gli le un uno una di a da in con su per tra fra e ed o ma che non piu
del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello
nella nei negli nelle sul sullo sulla sui sugli sulle come dopo contro ecco video foto highlights
gol diretta live oggi ieri news ultime ora cosa chi perche quando anche solo sono stato stata
ha hanno era vs tutto tutti tutte suo sua suoi sue loro questo questa quel quella ci si mi ti ne
parla dice detto dopo prima nuovo nuova ancora sempre gia molto poi qui cosi due tre ecco""".split())


def item_id(link: str) -> str:
    """Identificativo stabile di un articolo (e, per estensione, della storia): hash del link."""
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:8]


def stem(w: str) -> str:
    return w[:-1] if len(w) > 4 and w[-1] in "aeio" else w


def tokens(title: str) -> set[str]:
    return {stem(w) for w in norm_key(title).split() if len(w) > 2 and w not in STOP and not w.isdigit()}


# Squadre e paesi di più parole: diventano una parola sola, così «Repubblica Ceca-Inghilterra» non è la partita
# «Repubblica-Ceca» e «San Marino-Albania» non è «Marino-Albania». Le forme lunghe dei club diventano quella corta
# che usano i titoli («Real Madrid-Barcellona» e «Real-Barcellona» sono la stessa partita).
COMPOUNDS = [(re.compile(rx, re.I), to) for rx, to in [
    (r"\brep(?:ubblica|\.)[\s-]+ceca\b", "Cechia"), (r"\bsan[\s-]+marino\b", "Sanmarino"),
    (r"\b(?:isole[\s-]+)?f(?:a|æ)r(?:\s|-)?o(?:e|ë)r\b", "Faroer"), (r"\bisole[\s-]+faroe?\b", "Faroer"),
    (r"\bmacedonia[\s-]+del[\s-]+nord\b", "Macedonia"), (r"\birlanda[\s-]+del[\s-]+nord\b", "Nordirlanda"),
    (r"\bbosnia[\s-]+(?:ed?[\s-]+)?erzegovina\b", "Bosnia"), (r"\bcosta[\s-]+d['’]avorio\b", "Costadavorio"),
    (r"\barabia[\s-]+saudita\b", "Arabia"), (r"\bnuova[\s-]+zelanda\b", "Nuovazelanda"),
    (r"\bstati[\s-]+uniti\b", "Usa"), (r"\bcorea[\s-]+del[\s-]+sud\b", "Corea"), (r"\blas[\s-]+vegas\b", "Lasvegas"),
    (r"\breal[\s-]+madrid\b", "Real"), (r"\batl[eé]tico[\s-]+madrid\b", "Atletico"),
    (r"\bparis[\s-]+saint[\s-]+germain\b", "Psg"), (r"\bbayern[\s-]+(?:monaco|m[uü]nchen)\b", "Bayern"),
    (r"\bborussia[\s-]+dortmund\b", "Dortmund"), (r"\bmanchester[\s-]+city\b", "City"),
    (r"\bmanchester[\s-]+united\b", "United"), (r"\baston[\s-]+villa\b", "Villa"), (r"\bhellas[\s-]+verona\b", "Verona"),
    (r"\bolimpia[\s-]+milano\b", "Milano"), (r"\bvirtus[\s-]+(?:segafredo[\s-]+)?bologna\b", "Virtus"),
]]
FIX_RX = re.compile(r"\b([A-ZÀ-Ú][\wà-ú’']{2,})\s?[-–]\s?([A-ZÀ-Ú][\wà-ú’']{2,})\b")


def compound(title: str) -> str:
    for rx, to in COMPOUNDS:
        title = rx.sub(to, title)
    return title


def fixture(title: str) -> str:
    """"Turchia-Italia", "Inter - Cagliari" → chiave della partita; i punteggi (101-93) non contano."""
    m = FIX_RX.search(compound(title))
    return f"{norm_key(m.group(1))}|{norm_key(m.group(2))}" if m else ""


def team_words(title: str) -> set:
    return set(norm_key(compound(title)).split())


# «I risultati di martedì», «tutti i gol della serata»: articoli che parlano di più partite insieme. Entrano nella
# storia più vicina ma non ne diventano mai il titolo.
ROUNDUP_RX = re.compile(r"\b(i risultati|risultati di|tutti i gol|tutti i risultati|la giornata di|il punto sul|"
                        r"classifica(?:he)? de[il] giron)", re.I)


def names(title: str) -> set[str]:
    """Nomi propri nel titolo (non la prima parola): McNulty, Pogacar, Bastoni…"""
    words = re.findall(r"[\wà-ú’']+", title)
    return {norm_key(w) for w in words[1:] if w[:1].isupper() and len(w) > 3 and norm_key(w) not in STOP}


def same_story(a: dict, b: dict) -> bool:
    if a["fx"] and a["fx"] == b["fx"]:
        return True                                   # stessa partita = stessa storia (probabili, diretta, pagelle)
    ta, tb = a["tok"], b["tok"]
    inter = ta & tb
    if len(inter) >= 3 and len(inter) / max(1, min(len(ta), len(tb))) >= 0.6:
        return True
    shared_names = a["names"] & b["names"] & RARE_NAMES
    if shared_names:
        # un nome raro in comune + almeno due altre parole in comune, di cui una non è un nome famoso
        # ("McNulty" + "mondiali ciclismo" sì; "Carlos" + "Alcaraz Sinner" no)
        rest = inter - {stem(n) for n in shared_names}
        if len(rest) >= 2 and rest - COMMON_NAME_STEMS:
            return True
    return SequenceMatcher(None, norm_key(a["title"]), norm_key(b["title"])).ratio() > 0.86


RARE_NAMES: set[str] = set()
COMMON_NAME_STEMS: set[str] = set()
MAX_STORY = 16


def fixtures(st: dict) -> set[str]:
    return {i["fx"] for i in st["items"] if i["fx"]}


def rivals(fx_a: set[str], fx_b: set[str]) -> bool:
    """Partite diverse: nessuna squadra in comune («Inter-Cagliari» e «Milan-Lazio»). «Olimpia Milano-Virtus Bologna»
    e «Milano-Bologna» invece hanno una squadra in comune: è lo stesso incontro scritto in due modi."""
    teams = lambda fx: {t for f in fx for t in f.split("|")}          # noqa: E731
    return bool(fx_a and fx_b and not teams(fx_a) & teams(fx_b))

LIVE_FOR = timedelta(hours=4)
OVER_RX = re.compile(r"\b(highlights|pagelle|voti|tabellino|il film del|risultato finale)\b", re.I)


def still_live(st: dict, now: datetime) -> bool:
    """«Diretta» solo finché la diretta è fresca: al più 4 ore dall'ultimo articolo in diretta, e nessun highlights o
    pagelle arrivati dopo. A evento finito la storia torna normale e si può riassumere (il derby Milano-Virtus restava
    «in diretta» con l'87-85 finale già nel titolo)."""
    lives = [datetime.fromisoformat(i["ts"]) for i in st["items"] if i.get("live")]
    if not lives:
        return False
    last = max(lives)
    if now - last > LIVE_FOR:
        return False
    return not any(OVER_RX.search(i["title"]) and datetime.fromisoformat(i["ts"]) > last
                   for i in st["items"] if not i.get("live"))


def cluster(items: list[dict]) -> list[dict]:
    items.sort(key=lambda i: i["ts"], reverse=True)
    for it in items:
        it["id"] = item_id(it["link"])
        it["tok"] = tokens(it["title"])
        it["fx"] = fixture(it["title"])
        it["names"] = names(it["title"])
    # Titoli senza trattino che nominano le due squadre di una partita già vista («poker della Spagna alla Croazia»):
    # sono quella partita. Se ne nominano due o più, è un riepilogo.
    seen_fx = Counter(i["fx"] for i in items if i["fx"])
    known = {f for f, n in seen_fx.items() if n >= 2}       # partite vere, raccontate da almeno due articoli
    for it in items:
        words = team_words(it["title"])
        hits = sorted(f for f in known if set(f.split("|")) <= words)
        # squadre di altre partite nominate nel titolo («… Inghilterra sbanca a Praga»): parla di più incontri
        others = {t for f in known if f not in hits for t in f.split("|")} & words
        it["multi"] = len(hits) >= 2 or bool(hits and others) or bool(ROUNDUP_RX.search(it["title"]))
        if not it["fx"] and len(hits) == 1:
            it["fx"] = hits[0]
    # un nome è "raro" se compare in pochi titoli: Sinner no (è ovunque), McNulty sì
    df = Counter(n for it in items for n in it["names"])
    RARE_NAMES.clear()
    RARE_NAMES.update(n for n, c in df.items() if c <= 4)
    COMMON_NAME_STEMS.clear()
    COMMON_NAME_STEMS.update(stem(n) for n, c in df.items() if c > 4)
    stories: list[dict] = []
    for it in items:
        hits = [st for st in stories if st["cat"] == it["cat"] and not rivals({it["fx"]} - {""}, fixtures(st))
                and any(same_story(it, o) for o in st["items"])]
        if not hits:
            stories.append({"items": [it], "cat": it["cat"]})
            continue
        home = hits[0]
        home["items"].append(it)
        # L'articolo lega due storie già aperte (arrivate da testate che si sono accorte tardi di parlare della stessa
        # cosa): diventano una. Mai due partite diverse e mai storie enormi, perché un titolo generico non unisca tutto.
        for st in hits[1:]:
            if rivals(fixtures(home), fixtures(st)) or len(home["items"]) + len(st["items"]) > MAX_STORY:
                continue
            home["items"] += st["items"]
            stories.remove(st)
    for st in stories:
        its = st["items"]
        # rappresentante: mai un riepilogo di più partite se c'è altro; poi foto migliore, sommario, il più recente
        rep = max(its, key=lambda i: (not i.get("multi"), SRC_IMGQ[i["src"]] if i["image"] else -1, bool(i["summary"]), i["ts"]))
        first = min(its, key=lambda i: (i["ts"], i["id"]))
        st.update({
            "id": first["id"],                 # la storia si chiama come il suo primo articolo: non cambia se ne arrivano altri
            "first_ts": first["ts"],
            "rep": rep,
            "title": rep["title"], "link": rep["link"], "src": rep["src"],
            "summary": next((i["summary"] for i in [rep] + its if i["summary"]), ""),
            "image": next((i["image"] for i in sorted(its, key=lambda i: -SRC_IMGQ[i["src"]]) if i["image"]), ""),
            "kicker": rep["kicker"],
            "ts": max(i["ts"] for i in its),
            "video": all(i["video"] for i in its),
            "live": any(i["live"] for i in its),
            "sources": sorted({i["src"] for i in its}, key=lambda s: [k for k, *_ in SOURCES].index(s)),
            "tok": set().union(*(i["tok"] for i in its)),
        })
        st["also"] = [i for i in sorted(its, key=lambda i: i["ts"], reverse=True) if i["src"] != rep["src"]]
        seen = set()
        st["also"] = [i for i in st["also"] if not (i["src"] in seen or seen.add(i["src"]))]
    return stories


def rank(stories: list[dict], now: datetime) -> None:
    """Importanza = redazioni che coprono la storia + calore del tema + freschezza + foto."""
    df = Counter(t for st in stories for t in st["tok"])
    n = len(stories)
    rare = {t for t, c in df.items() if c <= max(3, n * 0.12)}
    for st in stories:
        salient = st["tok"] & rare
        related = [o for o in stories if o is not st and len(salient & o["tok"]) >= 2]
        heat_sources = {s for o in related for s in o["sources"]} | set(st["sources"])
        age_h = (now - datetime.fromisoformat(st["ts"])).total_seconds() / 3600
        st["score"] = (
            3.0 * (len(st["sources"]) - 1)
            + 0.8 * min(len(related), 6)
            + 0.6 * (len(heat_sources) - 1)
            + max(0.0, 3.0 - age_h / 4)
            + (1.2 if st["image"] else 0)
            + (0.8 if st["live"] else 0)
            - (1.0 if st["video"] else 0)
        )
        st["heat"] = len(heat_sources)
        st["related"] = [o["id"] for o in sorted(related, key=lambda o: (-len(salient & o["tok"]), o["ts"]))[:4]]


# ================================================================ immagini
def validate_images(stories: list[dict], limit: int = 260) -> int:
    urls = list(dict.fromkeys(s["image"] for s in stories if s["image"]))[:limit]
    bad: set[str] = set()

    def probe(u: str) -> None:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA, "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=12) as r:
                if not (r.headers.get("Content-Type") or "").lower().startswith("image"):
                    bad.add(u)
        except urllib.error.HTTPError as exc:
            if exc.code not in (403, 405, 501):      # 403 = il CDN blocca il probe, non l'<img>
                bad.add(u)
        except Exception:                            # noqa: BLE001 — rete instabile: tengo l'URL
            pass

    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(probe, urls))
    for st in stories:
        if st["image"] in bad:
            alt = [i["image"] for i in st["items"] if i["image"] and i["image"] not in bad]
            st["image"] = alt[0] if alt else ""
    return len(bad)


# ================================================================ asset
def read_text(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write_if_changed(path: str, content: str) -> bool:
    try:
        if read_text(path) == content:
            return False
    except OSError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return True


def bundle(kind: str) -> str:
    """Impacchetta css/src/*.css o js/src/*.js in un solo file: una richiesta, cache legata al contenuto."""
    src_dir = os.path.join(ROOT, kind, "src")
    names = sorted(f for f in os.listdir(src_dir) if f.endswith("." + kind))
    body = "\n".join(read_text(os.path.join(src_dir, f)).rstrip() + "\n" for f in names)
    if kind == "css":
        fonts = read_text(os.path.join(ROOT, "fonts", "fonts.css")).replace("url(./", "url(../fonts/")
        body = fonts.rstrip() + "\n\n" + body
        out = "css/site.css"
        banner = "/* GENERATO da build.py: si modifica css/src/*.css */\n"
    else:
        body = '(() => {\n"use strict";\n' + body + "})();\n"
        out = "js/app.js"
        banner = "/* GENERATO da build.py: si modifica js/src/*.js */\n"
    content = banner + body
    write_if_changed(os.path.join(ROOT, out), content)
    return hashlib.sha1(content.encode("utf-8")).hexdigest()[:8]


SW_TEMPLATE = """/* Sportwire · service worker (build __BUILD__). Pagine e dati: rete prima, cache se offline.
   Asset con ?v= nel nome: cache prima. Le foto delle testate non si mettono in cache. */
const BUILD = "__BUILD__";
const STATIC = "sw-static-" + BUILD;
const PAGES = "sw-pages-v1";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("sw-static-") && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (x) => { clearTimeout(t); rej(x); }); });

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await withTimeout(fetch(req), 6000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await cache.match("index.html", { ignoreSearch: true }) || await cache.match("./", { ignoreSearch: true });
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const dynamic = req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/data/news.json");
  e.respondWith(dynamic ? networkFirst(req) : cacheFirst(req));
});
"""


def write_pwa(ver: dict) -> None:
    fonts = sorted(f for f in os.listdir(os.path.join(ROOT, "fonts")) if f.endswith("-latin-wdth-normal.woff2")
                   or f.endswith("-latin-wght-normal.woff2"))
    pre = [f"css/site.css?v={ver['css']}", f"js/app.js?v={ver['js']}", "favicon.svg",
           "img/stars-a.svg", "img/stars-b.svg"] + [f"fonts/{f}" for f in fonts]
    build_id = hashlib.sha1((ver["css"] + ver["js"] + "".join(pre)).encode()).hexdigest()[:8]
    sw = SW_TEMPLATE.replace("__BUILD__", build_id).replace("__PRECACHE__", json.dumps(pre))
    if OUT_ROOT:
        return                                  # prove: service worker e manifest restano quelli del sito
    write_if_changed(os.path.join(ROOT, "sw.js"), sw)
    manifest = {
        "name": "Sportwire", "short_name": "Sportwire", "lang": "it",
        "description": "La giornata sportiva raccontata da sei redazioni, in breve.",
        "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": THEME_COLOR, "theme_color": THEME_COLOR,
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            {"src": "favicon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
    }
    write_if_changed(os.path.join(ROOT, "manifest.webmanifest"),
                     json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


# ================================================================ brevi
BRIEF_MAX = 280


def brief_ok(b: object) -> bool:
    """Un breve entra in pagina solo se è testo semplice e corto (lo pubblica un altro processo: qui non ci si fida)."""
    return (isinstance(b, str) and 0 < len(b) <= BRIEF_MAX
            and not any(x in b for x in ("<", ">", "http", "\n")))


def brief_of(st: dict, briefs: dict) -> dict:
    """Il breve della storia. Se la storia ha cambiato nome fondendosi con una più vecchia, vale quello scritto per uno
    dei suoi articoli (il più recente): resta finché il cron non la riscrive intera, invece di sparire."""
    b = briefs.get(st["id"]) or {}
    if b.get("b"):
        return b
    olds = [briefs[i["id"]] for i in st["items"] if i["id"] != st["id"] and (briefs.get(i["id"]) or {}).get("b")]
    return max(olds, key=lambda x: str(x.get("at", ""))) if olds else b


def brief_state(st: dict, briefs: dict) -> str:
    """Per il lettore: own (riassunto di Sportwire) · wait (in arrivo) · skip (basta il sommario della testata) ·
    live (diretta in corso) · video."""
    if st["brief"]:
        return "own"
    if st["live"]:
        return "live"
    if st["video"]:
        return "video"
    return "wait" if BR.need(st, briefs.get(st["id"])) else "skip"


def load_briefs() -> dict:
    """data/briefs.json: {id_storia: {"b": testo breve, "at": iso, "n": testate al momento}}.
    Le voci rovinate si scartano una per una: il sito esce lo stesso, con il sommario della testata."""
    try:
        data = json.loads(read_text(os.path.join(ROOT, "data", "briefs.json")))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    out, dropped = {}, 0
    for sid, b in data.items():
        if isinstance(b, dict) and (b.get("skip") or brief_ok(b.get("b"))):
            out[sid] = b
        else:
            dropped += 1
    if dropped:
        print(f"  ATTENZIONE: {dropped} «in breve» scartati da data/briefs.json (voce rovinata o non a norma)", file=sys.stderr)
    return out


# ================================================================ build
OUT_ROOT = ""           # --out: prove in una cartella a parte (il sito resta com'è)


def write(rel: str, content: str) -> None:
    path = os.path.join(OUT_ROOT or ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    changed = write_if_changed(path, content)
    print(f"  {'scritto' if changed else 'invariato'} {rel} ({len(content) // 1024} KB)")


def item_payload(i: dict) -> dict:
    return {"id": i["id"], "source": SRC_NAME[i["src"]], "title": i["title"], "link": i["link"],
            "ts": i["ts"], "summary": i["summary"]}


def build(offline: bool = False, now: datetime | None = None) -> int:
    print("Sportwire · build")
    now = now or datetime.now(TZ)
    ver = {"css": bundle("css"), "js": bundle("js")}
    raw = collect(offline)

    dropped = Counter()
    items = []
    for it in raw:
        why = is_noise(it)
        if why:
            dropped[why] += 1
            continue
        items.append(it)

    window = WINDOW_H
    fresh = [i for i in items if now - datetime.fromisoformat(i["ts"]) <= timedelta(hours=window)]
    while len(fresh) < MIN_ITEMS and window < 72:
        window += 12
        fresh = [i for i in items if now - datetime.fromisoformat(i["ts"]) <= timedelta(hours=window)]
    dropped["vecchi"] = len(items) - len(fresh)
    fresh = [i for i in fresh if datetime.fromisoformat(i["ts"]) <= now + timedelta(minutes=10)]
    if not fresh:
        print("ERRORE: nessuna notizia fresca", file=sys.stderr)
        return 1

    for it in fresh:
        it["cat"], it["kicker"] = classify(it)
        it["src_name"] = SRC_NAME[it["src"]]
    stories = cluster(fresh)
    for st in stories:
        st["live"] = still_live(st, now)
    rank(stories, now)
    bad = 0 if offline else validate_images(stories)     # --no-fetch: niente rete, nemmeno per le immagini
    ids = [s["id"] for s in stories]
    if len(set(ids)) != len(ids):
        print("ERRORE: id di storia duplicati", file=sys.stderr)
        return 1
    briefs = load_briefs()
    for st in stories:
        b = brief_of(st, briefs)
        st["brief"] = b.get("b", "")
        st["brief_at"] = b.get("at", "")
        st["brief_state"] = brief_state(st, briefs)
        st["src_name"] = SRC_NAME[st["src"]]
        st["src_names"] = [SRC_NAME[x] for x in st["sources"]]
        st["sec_title"] = SEC_TITLE[st["cat"]]
        st["kkey"] = norm_key(st["kicker"])
    print(f"  scartati: {dict(dropped)} · immagini non raggiungibili: {bad}")
    print(f"  {len(fresh)} articoli → {len(stories)} notizie "
          f"({sum(1 for s in stories if len(s['sources']) > 1)} coperte da più testate, "
          f"{sum(1 for s in stories if s['brief'])} riscritte in breve)")

    by_score = sorted(stories, key=lambda s: s["score"], reverse=True)
    by_time = sorted(stories, key=lambda s: s["ts"], reverse=True)
    used: set = set()

    def take(pool, n, need_image=False, cat=None):
        out = []
        if n <= 0:
            return out
        for s in pool:
            if id(s) in used or (cat and s["cat"] != cat) or (need_image and not s["image"]):
                continue
            out.append(s)
            used.add(id(s))
            if len(out) == n:
                break
        return out

    # I video (highlights, clip) non si possono riassumere e di notte Sky ne pubblica a decine: in prima pagina passano
    # dopo i testi. Nel registro di bordo si raccolgono in una riga sola invece di occupare otto voci su dodici.
    words = [s for s in by_score if not s["video"]]
    words_t = [s for s in by_time if not s["video"]]
    hero = (take(words[:4], 1, need_image=True) or take(by_score[:4], 1, need_image=True) or take(by_score, 1))[0]
    top = take(words, 6, need_image=True)
    top += take(words, 6 - len(top))
    top += take(by_score, 6 - len(top))
    live = take(words_t, 12)
    cutoff = live[-1]["ts"] if len(live) == 12 else ""
    clips = [s for s in by_time if s["video"] and id(s) not in used and s["ts"] >= cutoff][:12]
    for s in clips:
        used.add(id(s))
    blocks = []
    for k in SEC_ORDER:
        lead = take(words, 1, need_image=True, cat=k) or take(by_score, 1, need_image=True, cat=k)
        rest = take(words_t, 4, cat=k)
        rest += take(by_time, 4 - len(rest), cat=k)
        if lead or rest:
            blocks.append((k, lead, rest))

    sec_counts = Counter(s["cat"] for s in stories)
    ctx = R.Ctx(now=now, site_url=SITE_URL, window=window, n_stories=len(stories),
                n_sources=len({s for st in stories for s in st["sources"]}),
                n_multi=sum(1 for s in stories if len(s["sources"]) > 1),
                n_own=sum(1 for s in stories if s["brief"]),
                sections=SECTIONS, sources=[(k, n, home) for k, n, _u, home, _q in SOURCES],
                sec_counts=dict(sec_counts), ver=ver, theme_color=THEME_COLOR)

    desc = (f"{hero['title']} — e altre {len(stories) - 1} notizie sportive di oggi da Gazzetta, "
            f"Corriere dello Sport, Tuttosport, Sky Sport, ANSA e OA Sport, riscritte in breve.")
    write("index.html", R.page(ctx, rel="index.html", title="Sportwire · il cielo dello sport di oggi",
                               description=desc, body=R.home_body(ctx, hero, top, live, blocks, clips),
                               active="index", og_image=hero["image"]))

    for k in SEC_ORDER:
        sec = sorted([s for s in stories if s["cat"] == k], key=lambda s: s["ts"], reverse=True)
        if not sec:
            continue
        feats = sorted([s for s in sec if s["image"]], key=lambda s: s["score"], reverse=True)[:3]
        rest = [s for s in sec if s not in feats]
        lead = feats[0] if feats else sec[0]
        write(f"{k}.html", R.page(ctx, rel=f"{k}.html", title=f"{SEC_TITLE[k]} · Sportwire",
                                  description=f"{SEC_TITLE[k]}: {lead['title']} e le altre notizie di oggi.",
                                  body=R.section_body(ctx, k, sec, feats, rest), active=k,
                                  og_image=lead["image"]))

    write("cronologia.html", R.page(ctx, rel="cronologia.html", title="Cronologia · Sportwire",
                                    description="Il diario di bordo delle notizie che hai aperto, solo su questo dispositivo.",
                                    body=R.history_body(ctx), active="cronologia", og_image=hero["image"],
                                    noindex=True))

    home_ids = {id(s) for s in [hero] + top + live + [x for _k, a, b in blocks for x in a + b]}   # i video raccolti no
    data = {
        "generated": now.isoformat(), "window_hours": window,
        "counts": {k: sec_counts.get(k, 0) for k in SEC_ORDER},
        "dropped": dict(dropped),
        "stories": [{
            "id": s["id"], "title": s["title"], "link": s["link"], "source": s["src_name"], "section": s["cat"],
            "kicker": s["kicker"], "ts": s["ts"], "first_ts": s["first_ts"], "image": s["image"],
            "summary": s["summary"], "brief": s["brief"], "brief_at": s["brief_at"], "brief_state": s["brief_state"],
            "video": s["video"], "live": s["live"], "score": round(s["score"], 2), "heat": s["heat"],
            "sources": [SRC_NAME[x] for x in s["sources"]], "on_home": id(s) in home_ids,
            "related": s["related"],
            "items": [item_payload(i) for i in sorted(s["items"], key=lambda i: i["ts"])],
        } for s in by_score],
    }
    write("data/news.json", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    write_pwa(ver)
    print("  sezioni: " + " · ".join(f"{k} {sec_counts.get(k, 0)}" for k in SEC_ORDER))
    print(f"  apertura: [{hero['score']:.1f}] {hero['title']} ({', '.join(SRC_NAME[s] for s in hero['sources'])})")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true", help="usa data/raw.json invece della rete")
    ap.add_argument("--raw", default="", help="(prove) dati grezzi da un altro file; implica --no-fetch")
    ap.add_argument("--now", default="", help="(prove) ora dell'edizione, ISO 8601")
    ap.add_argument("--out", default="", help="(prove) scrive pagine e dati in questa cartella invece che nel sito")
    a = ap.parse_args()
    if a.raw:
        RAW_OVERRIDE = os.path.abspath(a.raw)
    if a.out:
        OUT_ROOT = os.path.abspath(a.out)
    sys.exit(build(offline=a.no_fetch or bool(a.raw), now=datetime.fromisoformat(a.now) if a.now else None))
