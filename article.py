#!/usr/bin/env python3
"""Testo di un articolo, per chi deve riscriverlo in breve (solo stdlib, Python 3.9).

Regole di buon vicinato: legge robots.txt, si presenta con uno User-Agent onesto, apre una sola pagina alla
volta per sito e non conserva niente. Il testo serve soltanto a chi scrive la sintesi; sul sito finisce la
riscrittura, mai l'originale.

    python3 article.py URL [URL ...]        # stampa titolo e inizio del testo (prova a mano)
"""
from __future__ import annotations

import html as htmllib
import json
import re
import sys
import threading
import urllib.error
import urllib.request
from html.parser import HTMLParser
from typing import Dict, List, Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

UA = "SportwireBot/1.0 (+https://github.com/EdoardoAmp/sportwire; lettura personale, una pagina alla volta)"
MAX_BYTES = 2_500_000
TIMEOUT = 14

_robots: Dict[str, Optional[RobotFileParser]] = {}
_hostlock: Dict[str, threading.Lock] = {}
_glock = threading.Lock()


def _host_lock(host: str) -> threading.Lock:
    with _glock:
        return _hostlock.setdefault(host, threading.Lock())


def _open(url: str, accept: str = "text/html,application/xhtml+xml"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept,
                                               "Accept-Language": "it-IT,it;q=0.9", "Accept-Encoding": "identity"})
    return urllib.request.urlopen(req, timeout=TIMEOUT)


def allowed(url: str) -> bool:
    """True se robots.txt del sito lo consente. 4xx = via libera; errori di rete o 5xx = meglio non insistere."""
    p = urlparse(url)
    host = f"{p.scheme}://{p.netloc}"
    with _glock:
        known = host in _robots
    if not known:
        rp: Optional[RobotFileParser] = RobotFileParser()
        try:
            with _open(host + "/robots.txt", "text/plain") as r:
                rp.parse(r.read(400_000).decode("utf-8", "replace").splitlines())
        except urllib.error.HTTPError as e:
            rp = RobotFileParser() if 400 <= e.code < 500 else None
            if rp is not None:
                rp.parse([])
        except Exception:
            rp = None
        with _glock:
            _robots[host] = rp
    rp = _robots.get(host)
    return bool(rp and rp.can_fetch(UA, url))


def _decode(data: bytes, ctype: str) -> str:
    enc = "utf-8"
    m = re.search(r"charset=([\w-]+)", ctype or "", re.I)
    if m:
        enc = m.group(1)
    else:
        mb = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4096], re.I)
        if mb:
            enc = mb.group(1).decode("ascii", "ignore")
    try:
        return data.decode(enc, "replace")
    except LookupError:
        return data.decode("utf-8", "replace")


def fetch(url: str) -> Optional[str]:
    host = urlparse(url).netloc
    if not allowed(url):
        return None
    with _host_lock(host):
        try:
            with _open(url) as r:
                return _decode(r.read(MAX_BYTES), r.headers.get("Content-Type", ""))
        except Exception:
            return None


# ---------------------------------------------------------------- estrazione
BAD = re.compile(r"related|correlat|newsletter|cookie|share|social|comment|banner|promo|advert|\badv\b|sponsor|taglia|"
                 r"paywall|abbonati|subscribe|signup|iscriviti|footer|navbar|breadcrumb|widget|outbrain|taboola|"
                 r"video-?player|gallery|caption|didascalia|author|autore|byline|tags?\b|banner|cta\b", re.I)
SKIP_TAGS = {"script", "style", "noscript", "nav", "footer", "aside", "form", "iframe", "button", "svg", "figure",
             "figcaption", "header", "select", "template"}
VOID = {"br", "img", "meta", "link", "input", "hr", "source", "wbr", "area", "base", "col", "embed", "param", "track"}
JUNK_LINE = re.compile(r"^(leggi anche|leggi tutto|potrebbe interessarti|iscriviti|seguici|segui |ti potrebbe|"
                       r"©|copyright|tutti i diritti|riproduzione riservata|foto:|foto |video:|guarda |"
                       r"vai alla|scopri |clicca|accedi|registrati|abbonati|nel video )", re.I)
JUNK_ANY = re.compile(r"cookie|consentless|abbonamento|informativa|condizioni generali|contenuti ogni|accedere (senza|a tutti)|"
                      r"newsletter|privacy|javascript|disattiv|adblock|pubblicit", re.I)


class _Body(HTMLParser):
    """Raccoglie i paragrafi dell'articolo: dentro <article> se c'è, altrimenti dell'intera pagina."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: List[tuple] = []          # (tag, skip, in_article)
        self.paras: List[tuple] = []          # (in_article, testo)
        self.cur: Optional[List[str]] = None
        self.in_p_article = False
        self.meta: Dict[str, str] = {}
        self.jsonld: List[str] = []
        self._ld = False
        self._title = False
        self.title = ""

    def _skipping(self) -> bool:
        return any(s for _, s, _ in self.stack)

    def _in_article(self) -> bool:
        return any(a for _, _, a in self.stack)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            k = (a.get("property") or a.get("name") or "").lower()
            if k and a.get("content"):
                self.meta.setdefault(k, a["content"] or "")
            return
        if tag == "script" and "ld+json" in (a.get("type") or ""):
            self._ld = True
            self.jsonld.append("")
        if tag == "title":
            self._title = True
        if tag in VOID:
            return
        cls = f"{a.get('class', '')} {a.get('id', '')}"
        skip = tag in SKIP_TAGS or bool(BAD.search(cls)) or a.get("hidden") is not None or a.get("aria-hidden") == "true"
        if tag == "script" and self._ld:
            skip = True
        art = tag == "article" or (tag in ("div", "section", "main") and re.search(r"articolo|article-?(body|content|text)|post-?content|entry-?content|story-?body", cls, re.I) is not None)
        self.stack.append((tag, skip, art))
        if tag == "p" and not self._skipping():
            self.cur = []
            self.in_p_article = self._in_article()

    def handle_endtag(self, tag):
        if tag == "script":
            self._ld = False
        if tag == "title":
            self._title = False
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                if tag == "p" and self.cur is not None:
                    txt = re.sub(r"\s+", " ", "".join(self.cur)).strip()
                    if txt:
                        self.paras.append((self.in_p_article, txt))
                    self.cur = None
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._ld:
            self.jsonld[-1] += data
        if self._title:
            self.title += data
        if self.cur is not None and not self._skipping():
            self.cur.append(data)


def _walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)


def _clean(text: str) -> str:
    text = htmllib.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t\u00a0]+", " ", text).strip()


def extract(page: str) -> Dict[str, str]:
    """{'title', 'text', 'how'} dove how = jsonld | article | page | meta (da dove viene il testo)."""
    p = _Body()
    try:
        p.feed(page)
    except Exception:
        pass
    title = _clean(p.meta.get("og:title") or p.title)
    # 1) JSON-LD: quando c'è articleBody è il testo già pulito
    for blob in p.jsonld:
        try:
            data = json.loads(blob.strip())
        except ValueError:
            continue
        for o in _walk(data):
            body = o.get("articleBody")
            if isinstance(body, str) and len(_clean(body)) > 300:
                return {"title": title, "text": _tidy(re.split(r"\n{2,}|\r\n", body) if "\n" in body else [body]), "how": "jsonld"}
    # 2) paragrafi dentro <article>, poi dell'intera pagina
    for how, only in (("article", True), ("page", False)):
        paras = [t for a, t in p.paras if a or not only]
        text = _tidy(paras)
        if len(text) > 350:
            return {"title": title, "text": text, "how": how}
    # 3) il sommario della testata (og:description): serve solo come ripiego
    return {"title": title, "text": _clean(p.meta.get("og:description") or p.meta.get("description") or ""), "how": "meta"}


def _tidy(paras: List[str]) -> str:
    out, seen = [], set()
    for t in paras:
        t = _clean(t)
        if len(t) < 45 or JUNK_LINE.search(t) or JUNK_ANY.search(t) or t in seen:
            continue
        if t.endswith(("...", "…")) and len(t) < 200:      # anteprime di altri articoli (correlati)
            continue
        seen.add(t)
        out.append(t)
    return "\n".join(out)


def read(url: str, limit: int = 1400) -> Optional[Dict[str, str]]:
    page = fetch(url)
    if page is None:
        return None
    r = extract(page)
    r["text"] = r["text"][:limit].rsplit(" ", 1)[0] if len(r["text"]) > limit else r["text"]
    return r


if __name__ == "__main__":
    for u in sys.argv[1:]:
        r = read(u, 900)
        print("=", u)
        print("  ", "NON DISPONIBILE (robots o rete)" if r is None else f"[{r['how']}] {r['title']}\n   {r['text'][:900]}")
