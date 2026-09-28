#!/usr/bin/env python3
"""Sportwire — generatore del sito di news sportive.

Legge i feed RSS pubblici di sei redazioni sportive italiane, scarta promo e titoli
vecchi, raggruppa gli articoli che raccontano la stessa storia, li classifica per sport
usando le sezioni dichiarate dalle testate (URL e <category>) e sceglie l'apertura in base
a quante redazioni ne parlano. Produce un sito statico:

    index.html + <sezione>.html + data/news.json

Solo stdlib. Uso:  python3 build.py [--no-fetch]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
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

ROOT = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo("Europe/Rome")
SITE_URL = "https://edoardoamp.github.io/sportwire/"
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


def collect(offline: bool = False) -> list[dict]:
    path = os.path.join(ROOT, "data", "raw.json")
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


def stem(w: str) -> str:
    return w[:-1] if len(w) > 4 and w[-1] in "aeio" else w


def tokens(title: str) -> set[str]:
    return {stem(w) for w in norm_key(title).split() if len(w) > 2 and w not in STOP and not w.isdigit()}


def fixture(title: str) -> str:
    """"Turchia-Italia", "Inter - Cagliari" → chiave della partita; i punteggi (101-93) non contano."""
    m = re.search(r"\b([A-ZÀ-Ú][\wà-ú’']{2,})\s?[-–]\s?([A-ZÀ-Ú][\wà-ú’']{2,})\b", title)
    return f"{norm_key(m.group(1))}|{norm_key(m.group(2))}" if m else ""


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


def cluster(items: list[dict]) -> list[dict]:
    items.sort(key=lambda i: i["ts"], reverse=True)
    for it in items:
        it["tok"] = tokens(it["title"])
        it["fx"] = fixture(it["title"])
        it["names"] = names(it["title"])
    # un nome è "raro" se compare in pochi titoli: Sinner no (è ovunque), McNulty sì
    df = Counter(n for it in items for n in it["names"])
    RARE_NAMES.clear()
    RARE_NAMES.update(n for n, c in df.items() if c <= 4)
    COMMON_NAME_STEMS.clear()
    COMMON_NAME_STEMS.update(stem(n) for n, c in df.items() if c > 4)
    stories: list[dict] = []
    for it in items:
        for st in stories:
            if st["cat"] == it["cat"] and any(same_story(it, o) for o in st["items"]):
                st["items"].append(it)
                break
        else:
            stories.append({"items": [it], "cat": it["cat"]})
    for st in stories:
        its = st["items"]
        # rappresentante: foto migliore, poi sommario, poi il più recente
        rep = max(its, key=lambda i: (SRC_IMGQ[i["src"]] if i["image"] else -1, bool(i["summary"]), i["ts"]))
        st.update({
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


# ================================================================ rendering
def esc(t: str) -> str:
    return html.escape(t or "", quote=True)


def dt(st: dict) -> datetime:
    return datetime.fromisoformat(st["ts"]).astimezone(TZ)


def when(st: dict, now: datetime) -> str:
    d = dt(st)
    if d.date() == now.date():
        return d.strftime("%H:%M")
    if d.date() == (now - timedelta(days=1)).date():
        return "ieri " + d.strftime("%H:%M")
    return f"{d.day} {MESI[d.month - 1][:3]} " + d.strftime("%H:%M")


def kicker_html(st: dict, with_section: bool) -> str:
    sec = SEC_TITLE[st["cat"]]
    k = st["kicker"]
    label = esc(sec) if (not with_section and k == sec) else (
        f'{esc(sec)}<span class="kicker__sub">{esc(k)}</span>' if with_section and k != sec else esc(k))
    badges = ""
    if st["live"]:
        badges += '<span class="badge badge--live">Diretta</span>'
    return f'<p class="kicker">{label}{badges}</p>'


def meta_html(st: dict, now: datetime) -> str:
    extra = ""
    if len(st["sources"]) > 1:
        others = ", ".join(SRC_NAME[s] for s in st["sources"] if s != st["src"])
        extra += f'<span class="meta__more" title="Ne scrivono anche: {esc(others)}">+{len(st["sources"]) - 1} testat{"a" if len(st["sources"]) == 2 else "e"}</span>'
    if st["video"]:
        extra += '<span class="meta__video">Video</span>'
    return (f'<p class="meta"><span class="meta__src">{esc(SRC_NAME[st["src"]])}</span>'
            f'<time datetime="{esc(st["ts"])}" data-rel>{esc(when(st, now))}</time>{extra}</p>')


def img_html(url: str, cls: str, eager: bool = False, sizes: str = "") -> str:
    if not url:
        return ""
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<img class="{cls}" src="{esc(url)}" alt="" {load} '
            f'decoding="async" referrerpolicy="no-referrer" onload="this.classList.add(\'is-loaded\')" '
            f'onerror="this.parentNode.classList.add(\'no-img\');this.remove()">')


def hero_html(st: dict, now: datetime) -> str:
    also = "".join(
        f'<li data-hit><a href="{esc(i["link"])}" rel="noopener"><span class="coverage__src">{esc(SRC_NAME[i["src"]])}</span>'
        f'<span class="coverage__title">{esc(i["title"])}</span></a></li>'
        for i in st["also"][:3])
    coverage = (f'<div class="coverage"><p class="coverage__label">Ne scrivono anche</p><ul>{also}</ul></div>'
                if also else "")
    media = (f'<a class="hero__media media" href="{esc(st["link"])}" rel="noopener" tabindex="-1" aria-hidden="true">'
             f'{img_html(st["image"], "", eager=True)}</a>' if st["image"] else "")
    dek = f'<p class="hero__dek">{esc(st["summary"])}</p>' if st["summary"] else ""
    return f"""  <article class="hero{'' if st['image'] else ' hero--text'}" data-k="{esc(norm_key(st['kicker']))}">
    {media}
    <div class="hero__text">
      {kicker_html(st, True)}
      <h2 class="hero__title"><a href="{esc(st['link'])}" rel="noopener">{esc(st['title'])}</a></h2>
      {dek}
      {meta_html(st, now)}
      {coverage}
    </div>
  </article>
"""


def card_html(st: dict, now: datetime, with_section: bool = True, eager: bool = False) -> str:
    media = (f'<div class="card__media media">{img_html(st["image"], "", eager=eager)}</div>'
             if st["image"] else "")
    return f"""<article class="card{'' if st['image'] else ' card--text'}" data-hit data-k="{esc(norm_key(st['kicker']))}">
      {media}
      <div class="card__body">
        {kicker_html(st, with_section)}
        <h3 class="card__title"><a href="{esc(st['link'])}" rel="noopener">{esc(st['title'])}</a></h3>
        {meta_html(st, now)}
      </div>
    </article>"""


def row_html(st: dict, now: datetime, with_section: bool = True, thumb: bool = True) -> str:
    img = (f'<div class="row__media media">{img_html(st["image"], "")}</div>'
           if thumb and st["image"] else "")
    return f"""<li class="row" data-hit data-k="{esc(norm_key(st['kicker']))}">
        <div class="row__body">
          {kicker_html(st, with_section)}
          <h3 class="row__title"><a href="{esc(st['link'])}" rel="noopener">{esc(st['title'])}</a></h3>
          {meta_html(st, now)}
        </div>{img}
      </li>"""


def tl_html(st: dict, now: datetime) -> str:
    return f"""<li class="tl" data-hit>
        <time class="tl__time" datetime="{esc(st['ts'])}">{esc(dt(st).strftime('%H:%M'))}</time>
        <div class="tl__body">
          {kicker_html(st, True)}
          <a class="tl__title" href="{esc(st['link'])}" rel="noopener">{esc(st['title'])}</a>
          <span class="tl__src">{esc(SRC_NAME[st['src']])}{' · video' if st['video'] else ''}</span>
        </div>
      </li>"""


def human_date(now: datetime) -> str:
    return f"{GIORNI[now.weekday()].capitalize()} {now.day} {MESI[now.month - 1]} {now.year}"


def page(*, rel: str, title: str, description: str, h1: str, h1_hidden: bool, body: str,
         active: str, now: datetime, og_image: str, n_stories: int) -> str:
    cur = ' aria-current="page"'
    nav = "".join(
        f'<a href="{k}.html"{cur if k == active else ""}>{esc(t)}</a>'
        for k, t in [("index", "Prima pagina")] + SECTIONS)
    url = SITE_URL + ("" if rel == "index.html" else rel)
    og_img = f'<meta property="og:image" content="{esc(og_image)}">' if og_image else ""
    return f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sportwire">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(url)}">
{og_img}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#faf8f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14171c" media="(prefers-color-scheme: dark)">
<script>document.documentElement.classList.add('js')</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="css/site.css">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="favicon.svg">
</head>
<body>
<a class="skip" href="#main">Vai al contenuto</a>
<header class="masthead">
  <div class="masthead__bar wrap">
    <span>{esc(human_date(now))}</span>
    <span class="masthead__status"><span class="pulse" aria-hidden="true"></span>Aggiornato alle <time datetime="{esc(now.isoformat())}">{esc(now.strftime('%H:%M'))}</time></span>
  </div>
  <div class="masthead__brand wrap">
    <a class="wordmark" href="index.html">Sportwire<span class="wordmark__dot" aria-hidden="true">.</span></a>
    <p class="masthead__tagline">La giornata sportiva raccontata da sei redazioni</p>
  </div>
</header>
<nav class="sections" aria-label="Sezioni">
  <div class="sections__track wrap">{nav}</div>
</nav>
<main id="main" class="wrap">
<h1 class="{'visually-hidden' if h1_hidden else 'page-title'}">{esc(h1)}</h1>
{body}</main>
<footer class="colophon">
  <div class="colophon__grid wrap">
    <div>
      <p class="colophon__brand">Sportwire<span class="wordmark__dot">.</span></p>
      <p class="colophon__about">Una rassegna, non una redazione: raccoglie titoli, sommari e foto dai feed
      pubblici delle testate e rimanda sempre all’articolo originale. Le notizie coperte da più redazioni
      salgono in prima pagina.</p>
    </div>
    <div>
      <p class="colophon__label">Le fonti</p>
      <ul class="colophon__sources">
        {''.join(f'<li><a href="{esc(home)}" rel="noopener">{esc(name)}</a></li>' for _k, name, _u, home, _q in SOURCES)}
      </ul>
    </div>
    <div>
      <p class="colophon__label">Questa edizione</p>
      <p class="colophon__meta">{n_stories} notizie delle ultime {WINDOW_H} ore<br>
      aggiornata ogni ora · {esc(now.strftime('%d/%m/%Y %H:%M'))}<br>
      nessun tracciamento, nessun cookie</p>
    </div>
  </div>
</footer>
<script src="js/site.js" defer></script>
</body>
</html>
"""


def write(rel: str, content: str) -> None:
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"  scritto {rel} ({len(content) // 1024} KB)")


# ================================================================ build
def build(offline: bool = False) -> int:
    print("Sportwire · build")
    now = datetime.now(TZ)
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
    stories = cluster(fresh)
    rank(stories, now)
    bad = validate_images(stories)
    print(f"  scartati: {dict(dropped)} · immagini non raggiungibili: {bad}")
    print(f"  {len(fresh)} articoli → {len(stories)} notizie "
          f"({sum(1 for s in stories if len(s['sources']) > 1)} coperte da più testate)")

    by_score = sorted(stories, key=lambda s: s["score"], reverse=True)
    by_time = sorted(stories, key=lambda s: s["ts"], reverse=True)
    used: set[int] = set()

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

    hero = (take(by_score[:4], 1, need_image=True) or take(by_score, 1))[0]
    top = take(by_score, 6, need_image=True)
    top += take(by_score, 6 - len(top))
    live = take(by_time, 10)
    blocks = []
    for k in SEC_ORDER:
        lead = take(by_score, 1, need_image=True, cat=k)
        rest = take(by_time, 4, cat=k)
        if lead or rest:
            blocks.append((k, lead, rest))

    n_multi = sum(1 for s in stories if len(s["sources"]) > 1)
    sec_counts = Counter(s["cat"] for s in stories)
    brief = (f'<p class="brief"><strong>{len(stories)} notizie</strong> nelle ultime {window} ore da '
             f'{len({s for st in stories for s in st["sources"]})} redazioni · '
             f'{n_multi} raccontate da più testate: le trovi in alto.</p>')

    blocks_html = []
    for k, lead, rest in blocks:
        lead_html = card_html(lead[0], now, with_section=False) if lead else ""
        rows = "\n      ".join(row_html(s, now, with_section=False, thumb=False) for s in rest)
        blocks_html.append(f"""  <section class="block" aria-labelledby="h-{k}">
    <div class="block__head">
      <h2 class="block__title" id="h-{k}"><a href="{k}.html">{esc(SEC_TITLE[k])}</a></h2>
      <a class="block__more" href="{k}.html">Tutte le {sec_counts[k]} notizie <span aria-hidden="true">→</span></a>
    </div>
    <div class="block__grid{'' if lead else ' block__grid--rows'}">
      {lead_html}
      <ul class="rows">
      {rows}
      </ul>
    </div>
  </section>""")

    home = f"""{brief}
{hero_html(hero, now)}
  <div class="front">
    <section class="front__main" aria-labelledby="h-top">
      <h2 class="section-head" id="h-top">Da non perdere</h2>
      <div class="cards">
    {chr(10).join(card_html(s, now, eager=i < 3) for i, s in enumerate(top))}
      </div>
    </section>
    <aside class="front__aside" aria-labelledby="h-live">
      <h2 class="section-head" id="h-live"><span class="pulse" aria-hidden="true"></span>Ultim’ora</h2>
      <ol class="timeline">
      {chr(10).join(tl_html(s, now) for s in live)}
      </ol>
    </aside>
  </div>
{chr(10).join(blocks_html)}
"""
    desc = (f"{hero['title']} — e altre {len(stories) - 1} notizie sportive di oggi da Gazzetta, "
            f"Corriere dello Sport, Tuttosport, Sky Sport, ANSA e OA Sport.")
    write("index.html", page(rel="index.html", title="Sportwire · la giornata sportiva",
                             description=desc, h1="Sportwire · prima pagina", h1_hidden=True,
                             body=home, active="index", now=now, og_image=hero["image"],
                             n_stories=len(stories)))

    for k in SEC_ORDER:
        sec = sorted([s for s in stories if s["cat"] == k], key=lambda s: s["ts"], reverse=True)
        if not sec:
            continue
        feats = sorted([s for s in sec if s["image"]], key=lambda s: s["score"], reverse=True)[:3]
        rest = [s for s in sec if s not in feats]
        kicks = Counter(s["kicker"] for s in sec)
        generic = norm_key(SEC_TITLE[k])
        order = [(kk, n) for kk, n in kicks.most_common() if norm_key(kk) != generic]
        order += [(kk, n) for kk, n in kicks.items() if norm_key(kk) == generic]     # "Varie" in coda
        chips = "".join(
            f'<button type="button" class="chip" data-filter="{esc(norm_key(kk))}" aria-pressed="false">'
            f'{esc("Varie" if norm_key(kk) == generic else kk)}<span class="chip__n">{n}</span></button>'
            for kk, n in order)
        body = f"""<p class="page-meta">{len(sec)} notizie nelle ultime {window} ore · aggiornato alle {esc(now.strftime('%H:%M'))}</p>
<div class="chips" role="group" aria-label="Filtra per argomento" hidden>
  <button type="button" class="chip" data-filter="*" aria-pressed="true">Tutte<span class="chip__n">{len(sec)}</span></button>{chips}
</div>
<div class="cards cards--feature">
  {chr(10).join(card_html(s, now, with_section=False, eager=True) for s in feats)}
</div>
<ul class="rows rows--grid">
  {chr(10).join(row_html(s, now, with_section=False) for s in rest)}
</ul>
<p class="empty" hidden>Nessuna notizia per questo argomento nelle ultime {window} ore.</p>
"""
        lead = feats[0] if feats else sec[0]
        write(f"{k}.html", page(rel=f"{k}.html", title=f"{SEC_TITLE[k]} · Sportwire",
                                description=f"{SEC_TITLE[k]}: {lead['title']} e le altre notizie di oggi.",
                                h1=SEC_TITLE[k], h1_hidden=False, body=body, active=k, now=now,
                                og_image=lead["image"], n_stories=len(stories)))

    home_ids = {id(s) for s in [hero] + top + live + [x for _k, a, b in blocks for x in a + b]}
    data = {
        "generated": now.isoformat(), "window_hours": window,
        "counts": {k: sec_counts.get(k, 0) for k in SEC_ORDER},
        "dropped": dict(dropped),
        "stories": [{
            "title": s["title"], "link": s["link"], "source": SRC_NAME[s["src"]], "section": s["cat"],
            "kicker": s["kicker"], "ts": s["ts"], "image": s["image"], "summary": s["summary"],
            "video": s["video"], "live": s["live"], "score": round(s["score"], 2),
            "sources": [SRC_NAME[x] for x in s["sources"]], "on_home": id(s) in home_ids,
            "also": [{"source": SRC_NAME[i["src"]], "title": i["title"], "link": i["link"]} for i in s["also"]],
        } for s in by_score],
    }
    with open(os.path.join(ROOT, "data", "news.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    print("  sezioni: " + " · ".join(f"{k} {sec_counts.get(k, 0)}" for k in SEC_ORDER))
    print(f"  apertura: [{hero['score']:.1f}] {hero['title']} ({', '.join(SRC_NAME[s] for s in hero['sources'])})")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true", help="usa data/raw.json invece della rete")
    sys.exit(build(offline=ap.parse_args().no_fetch))
