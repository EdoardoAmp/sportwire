"""Test di Sportwire senza rete e senza browser (il browser lo fa qa.py).

    python3 -m pytest -q tests
"""
import json
import os
import sys
from datetime import datetime, timedelta

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import article  # noqa: E402
import briefs  # noqa: E402
import build  # noqa: E402
import render  # noqa: E402


# ------------------------------------------------------------------ estrattore
PAGE_JSONLD = """<html><head><title>Titolo</title>
<script type="application/ld+json">{"@type":"NewsArticle","articleBody":"%s"}</script></head><body><p>ciao</p></body></html>"""

PAGE_ARTICLE = """<html><head><meta property="og:title" content="Il titolo"><meta name="description" content="sommario">
</head><body>
<nav><p>Menu principale di navigazione con tante voci utili al lettore distratto</p></nav>
<article>
<p>Il primo paragrafo racconta il fatto principale con abbastanza parole da superare la soglia minima di lunghezza.</p>
<p>Leggi anche: un altro articolo che con questo testo lungo non deve comparire nel corpo estratto per nessun motivo.</p>
<div class="related"><p>Un articolo correlato con un testo sufficientemente lungo da passare il filtro sulla lunghezza minima.</p></div>
<p>Il secondo paragrafo aggiunge un dettaglio importante e resta dentro il testo perché è parte vera dell'articolo.</p>
<p>Accetta i cookie per continuare a leggere questo contenuto e per vedere la pubblicità personalizzata.</p>
<p>Il terzo paragrafo chiude la notizia con la conseguenza principale e con una frase abbastanza lunga da contare.</p>
<p>Un quarto paragrafo ancora, con altri dettagli e altre parole, per stare sopra la soglia di 350 caratteri totali.</p>
</article><footer><p>Riproduzione riservata, tutti i diritti sono della testata che pubblica questo articolo online.</p></footer>
</body></html>"""


def test_extract_prefers_jsonld_article_body():
    body = ("Prima frase dell'articolo, lunga abbastanza. " * 8).strip()          # la soglia dell'estrattore è 300 caratteri
    r = article.extract(PAGE_JSONLD % body)
    assert r["how"] == "jsonld"
    assert "Prima frase" in r["text"]


def test_extract_drops_related_cookie_menu_and_footer():
    r = article.extract(PAGE_ARTICLE)
    assert r["how"] == "article"
    t = r["text"]
    assert "primo paragrafo" in t and "secondo paragrafo" in t and "terzo paragrafo" in t
    for junk in ("Leggi anche", "correlato", "cookie", "Menu principale", "Riproduzione riservata"):
        assert junk not in t, junk


def test_extract_falls_back_to_meta_when_page_has_no_body():
    r = article.extract('<html><head><meta property="og:description" content="Solo un sommario"></head><body></body></html>')
    assert r["how"] == "meta" and r["text"] == "Solo un sommario"


def test_extract_never_raises_on_garbage():
    for junk in ("", "<<<>>>", "<p>", "\x00\x01", "<script>", "<article><p>" * 50):
        assert isinstance(article.extract(junk), dict)


def test_clean_drops_escaped_quotes_and_space_before_punctuation():
    assert article._clean('ha detto \\"colpevole\\" ieri , poi è partito .') == 'ha detto "colpevole" ieri, poi è partito.'


def test_fetch_follows_308_redirects():
    """Corriere dello Sport e Tuttosport rispondono 308 per togliere la «/» finale: urllib di Python 3.9 non lo segue."""
    import http.server
    import threading

    body = ("<html><body><article>" + "<p>" + "Testo vero dell'articolo con abbastanza parole. " * 6 + "</p>" * 1
            + "</article></body></html>").encode()

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            if self.path == "/pezzo/":
                self.send_response(308)
                self.send_header("Location", "/pezzo")
                self.end_headers()
            elif self.path == "/pezzo":
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        article._robots.clear()
        page = article.fetch(f"http://127.0.0.1:{srv.server_address[1]}/pezzo/")
        assert page is not None and "Testo vero" in page
    finally:
        srv.shutdown()


def test_robots_blocked_or_unreachable_means_do_not_fetch(monkeypatch):
    def deny(url, accept=""):
        raise OSError("giù")
    monkeypatch.setattr(article, "_open", deny)
    article._robots.clear()
    assert article.allowed("https://esempio.invalid/a") is False      # rete assente: meglio non insistere


# ------------------------------------------------------------------ controllo anti-copia
SRC_WORK = {"title": "Titolo", "summary": "Sommario", "extra": [],
            "texts": [{"source": "X", "text": "Il capitano ha spiegato che la squadra ha lavorato bene in settimana e che "
                                              "contro la Francia servirà una prova di maturità completa da parte di tutti."}]}


@pytest.mark.parametrize("text,ok", [
    ("Il capitano parla della preparazione e chiede maturità contro la Francia: per lui serve una prova più adulta del gruppo intero.", True),
    ("corto.", False),                                                                       # sotto il minimo
    ("x" * 300 + ".", False),                                                                # sopra il massimo
    ("Il capitano ha spiegato che la squadra ha lavorato bene in settimana e che a suo dire tutto è pronto per la sfida.", False),  # copia
    ("La squadra è pronta e il capitano ne è sicuro, anche se contro la Francia resta da vedere la tenuta mentale del gruppo!", False),  # «!»
    ("Ecco cosa ha detto il capitano dopo l'allenamento di oggi sul tema della sfida con la Francia e sul gruppo azzurro.", False),      # esca
    ("La squadra si è allenata e il capitano vede il gruppo in crescita, ma per la Francia manca ancora qualcosa di importante", False),  # niente punto
    ("Il capitano vede il gruppo in crescita, ma per la sfida con la Francia manca ancora qualcosa: vedi https://esempio.it/x.", False),  # link
])
def test_check_brief(text, ok):
    assert (briefs.check(text, SRC_WORK) == "") is ok


NUM_WORK = {"title": "Trento vince in Lituania", "summary": "", "extra": [], "kicker": "Eurocup",
            "texts": [{"source": "X", "text": "La Dolomiti Energia ha battuto il Neptunas 73-76 con 22 punti di Olivari, il 24esimo successo "
                                              "europeo della stagione, e la stagione 2026/2027 è appena cominciata."}]}


@pytest.mark.parametrize("text,ok", [
    ("Trento espugna la Lituania 76-73: Olivari firma 22 punti nella gara che apre l'Eurocup di questa stagione europea.", True),
    ("Trento espugna la Lituania 80-73: Olivari firma 22 punti nella gara che apre l'Eurocup di questa stagione europea.", False),   # 80 inventato
    ("Trento espugna la Lituania 76-73: Olivari firma 31 punti nella gara che apre l'Eurocup di questa stagione europea.", False),   # 31 inventato
    ("Trento vince in Lituania, quarta gara su cinque: Olivari trascina la Dolomiti Energia nell'Eurocup di questa stagione.", True),  # cifre singole non si controllano
    ("Trento vince in Lituania nel 24° successo europeo della stagione 2026/27: Olivari trascina la Dolomiti Energia.", True),          # 24esimo, 2027
])
def test_check_numbers_must_come_from_the_source(text, ok):
    assert (briefs.check(text, NUM_WORK) == "") is ok


# ------------------------------------------------------------------ nomi e prove
NAME_WORK = {"title": "Musetti salta Tokyo", "summary": "Frattura all'anulare destro", "extra": [], "kicker": "Atp",
             "texts": [{"source": "Gazzetta", "text": "Lorenzo Musetti ha annunciato sui social la frattura all'anulare della "
                        "mano destra, rimediata nell'ultimo allenamento. Il carrarino salta il torneo di Tokyo e proverà a "
                        "recuperare per giocare a Shanghai. L'ex interista Darmian si allena con il Bologna."}]}
VOCAB = {"il", "la", "per", "dopo", "intanto"}


@pytest.mark.parametrize("text,bad", [
    ("Lorenzo Musetti salta Tokyo per una frattura all'anulare destro presa in allenamento: il carrarino punta a Shanghai.", ""),
    ("Lorenzo Musetti salta Tokyo per una frattura all'anulare destro: il carrarino punta al Masters di Shanghai.", "Masters"),
    ("Lorenzo Musetti salta Tokyo per una frattura all'anulare destro: venerdì il carrarino vola a Parigi per curarsi.", "Parigi"),
    ("Intanto Lorenzo Musetti salta Tokyo per una frattura all'anulare: la Gazzetta dice che punta a Shanghai.", ""),   # testata
    ("Darmian, ex Inter, si allena con il Bologna; Lorenzo Musetti salta Tokyo per la frattura all'anulare destro.", ""),  # interista
])
def test_check_rejects_names_that_are_not_in_the_sources(text, bad):
    err = briefs.check(text, NAME_WORK, VOCAB)
    assert (bad in err and err != "") if bad else err == ""


def test_known_matches_forms_but_not_lookalikes():
    bag = briefs._bag("l'ex interista si allena, lo sloveno Lovric, European Football Club, Nicolo")
    assert briefs._known("Inter", bag) and briefs._known("Slovenia", bag) and briefs._known("Clubs", bag)
    assert briefs._known("Nicolò", bag)
    assert not briefs._known("Inter", briefs._bag("una lunga intervista"))
    assert not briefs._known("Parigi", bag)


def test_aliases_accept_the_usual_other_names():
    src = "Depositato presso un tribunale della Florida (Usa) un esposto. I bianconeri si allenano."
    assert briefs.names_missing("Esposto negli Stati Uniti contro la Juventus, depositato in Florida.", src, VOCAB) == []


def test_proofs_must_be_copied_and_cover_names_and_numbers():
    src = " ".join([NAME_WORK["title"], NAME_WORK["summary"], NAME_WORK["texts"][0]["text"]])
    text = "Lorenzo Musetti salta Tokyo per una frattura all'anulare destro presa in allenamento: il carrarino punta a Shanghai."
    p1 = "Lorenzo Musetti ha annunciato sui social la frattura all'anulare della mano destra"
    p2 = "Il carrarino salta il torneo di Tokyo e proverà a recuperare per giocare a Shanghai."
    assert briefs.proof_error(text, [p1, p2], src, VOCAB) == ""
    both = briefs.proof_error(text, [p1], src, VOCAB)
    assert "nessuna prova" in both and "Tokyo" in both and "Shanghai" in both          # tutti insieme, non uno alla volta
    p1b = "Il carrarino salta il torneo di Tokyo e proverà"
    assert "Shanghai" in briefs.proof_error(text, [p1, p1b], src, VOCAB)
    assert "alla lettera" in briefs.proof_error(text, [p1, "Musetti giocherà a Shanghai la settimana prossima"], src, VOCAB)
    assert "corta" in briefs.proof_error(text, ["Musetti", p2], src, VOCAB)
    assert "prove" in briefs.proof_error(text, [], src, VOCAB)
    # virgolette, apostrofi e accenti diversi non contano: conta che le parole siano quelle
    assert briefs.proof_error(text, [p1.replace("'", "’"), p2.upper()], src, VOCAB) == ""


def test_numbers_ignore_separators():
    assert briefs.numbers("18,75 voti e 1.500 euro, 2026/27") == ["1875", "1500", "2026", "27"]


def test_check_rejects_a_brief_that_belongs_to_another_story():
    other = ("La Giunta comunale ha stanziato cinquanta milioni per lo stadio, che servono alla candidatura "
             "della città come sede degli Europei di calcio del 2032.")
    assert "non sembra parlare" in briefs.check(other, SRC_WORK)
    assert briefs.check(other, None) == ""                                 # senza fonte (dati pubblicati) non si giudica


def test_shared_run_finds_only_long_copies():
    src = "uno due tre quattro cinque sei sette otto nove dieci"
    assert briefs.shared_run("uno due tre quattro cinque sei sette", src) == ""            # 7 parole: ancora ok
    assert briefs.shared_run("boh uno due tre quattro cinque sei sette otto boh", src) != ""


# ------------------------------------------------------------------ archivio brevi
def now_iso(**kw):
    return (datetime.now().astimezone() - timedelta(**kw)).isoformat(timespec="seconds")


def test_merge_takes_the_more_recent_entry_and_keeps_the_rest():
    theirs = {"a": {"b": "vecchio", "at": now_iso(hours=3), "n": 1}, "c": {"b": "solo loro", "at": now_iso(hours=1), "n": 1}}
    mine = {"a": {"b": "nuovo", "at": now_iso(hours=1), "n": 2}, "d": {"b": "solo mio", "at": now_iso(), "n": 1}}
    out, took = briefs.merge_briefs(theirs, mine)
    assert out["a"]["b"] == "nuovo" and out["c"]["b"] == "solo loro" and out["d"]["b"] == "solo mio"
    assert took == 2


def test_merge_does_not_let_an_older_local_copy_overwrite_a_newer_remote_one():
    theirs = {"a": {"b": "recente", "at": now_iso(minutes=5), "n": 1}}
    mine = {"a": {"b": "vecchio", "at": now_iso(hours=5), "n": 1}}
    out, took = briefs.merge_briefs(theirs, mine)
    assert out["a"]["b"] == "recente" and took == 0


def test_prune_drops_only_old_entries_of_stories_that_left_the_window():
    b = {"vivo": {"b": "x", "at": now_iso(days=30), "n": 1},            # ancora in news.json: resta comunque
         "fresco": {"b": "x", "at": now_iso(hours=2), "n": 1},           # uscito da poco: resta
         "vecchio": {"b": "x", "at": now_iso(days=briefs.KEEP_DAYS + 2), "n": 1},
         "rotto": {"b": "x"}}                                            # senza data: va via
    gone = briefs.prune(b, {"vivo"})
    assert set(b) == {"vivo", "fresco"} and gone == 2


# ------------------------------------------------------------------ coda e gate del cron
def story(i, **kw):
    s = {"id": f"s{i}", "sources": ["Gazzetta"], "on_home": False, "score": 1, "live": False}
    s.update(kw)
    return s


def test_pending_skips_live_and_video_and_orders_home_first():
    news = {"stories": [story(1), story(2, on_home=True), story(3, live=True), story(4, on_home=True, score=9),
                        story(5, video=True)]}
    kinds = [(k, s["id"]) for k, s in briefs.pending(news, {})]
    assert [i for _, i in kinds] == ["s4", "s2", "s1"]                    # a parità di tutto decide il punteggio


def test_queue_priority_is_home_then_outlets_then_most_recent():
    t = lambda h: (datetime.now().astimezone() - timedelta(hours=h)).isoformat()      # noqa: E731
    news = {"stories": [
        story(1, first_ts=t(1)),                                        # fuori pagina, 1 testata, recente
        story(2, on_home=True, first_ts=t(5)),                          # prima pagina, 1 testata, vecchia
        story(3, on_home=True, first_ts=t(2)),                          # prima pagina, 1 testata, recente
        story(4, on_home=True, first_ts=t(9), sources=["A", "B", "C"]),  # prima pagina, 3 testate
        story(5, first_ts=t(3), sources=["A", "B"]),                    # fuori pagina, 2 testate
    ]}
    assert [s["id"] for _, s in briefs.pending(news, {})] == ["s4", "s3", "s2", "s5", "s1"]


def _tries(monkeypatch, tmp_path, data=None):
    p = tmp_path / "tries.json"
    if data is not None:
        p.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(briefs, "TRIES", str(p))
    monkeypatch.setattr(briefs, "STATE", str(tmp_path))
    return p


def test_recovery_reoffers_old_nulls_once_when_the_round_has_room(monkeypatch, tmp_path):
    _tries(monkeypatch, tmp_path)
    gen = datetime.now().astimezone()
    t = lambda h: (gen - timedelta(hours=h)).isoformat()                 # noqa: E731
    news = {"generated": gen.isoformat(), "stories": [
        story(1, first_ts=t(1)),                                        # nuova: coda normale
        story(2, first_ts=t(20)), story(3, first_ts=t(30)),             # «null» di ieri: recupero, la più vecchia prima
        story(4, first_ts=t(50)),                                       # «null» di 50 ore fa: fuori finestra
        story(5, first_ts=t(10), video=True),                           # video: mai
    ]}
    v = briefs.SKIP_VER
    done = {f"s{i}": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": v} for i in (2, 3, 4, 5)}
    fresh, rec, batch = briefs.queue(news, done, 24)
    assert [s["id"] for _, s in fresh] == ["s1"]
    assert [(k, s["id"]) for k, s in rec] == [("recupero", "s3"), ("recupero", "s2")]
    assert [s["id"] for _, s in batch] == ["s1", "s3", "s2"]
    fresh, rec, batch = briefs.queue(news, done, 1)                        # giro pieno: niente recupero
    assert [s["id"] for _, s in batch] == ["s1"]


def test_attempts_are_capped_and_the_story_keeps_the_feed_summary(monkeypatch, tmp_path):
    p = _tries(monkeypatch, tmp_path)
    monkeypatch.setattr(briefs, "BRIEFS", str(tmp_path / "b.json"))
    news = {"generated": datetime.now().astimezone().isoformat(), "stories": [story(1, first_ts=now_iso(hours=2))]}
    briefs.note_tries(["s1"])                                             # giro 1: proposta, breve rifiutato da apply
    assert [s["id"] for _, s in briefs.queue(news, {}, 24)[2]] == ["s1"]
    briefs.note_tries(["s1"])                                             # giro 2: di nuovo rifiutato
    assert briefs.queue(news, {}, 24)[2] == []                            # niente terzo giro
    assert json.loads(p.read_text(encoding="utf-8"))["s1"]["n"] == 2
    arch = {}
    assert briefs.retire(news, arch) == 1 and arch["s1"]["skip"] and arch["s1"]["why"] == "tentativi"
    st = {"id": "s1", "brief": "", "live": False, "video": False, "sources": ["Gazzetta"], "items": []}
    assert build.brief_state(st, arch) == "held"                          # il dossier dice che è il sommario della testata
    # chi ha già un breve accettato non ha limite: gli aggiornamenti con nuove testate continuano
    has = {"s1": {"b": "Breve già scritto.", "n": 1, "at": now_iso()}}
    many = {"generated": news["generated"], "stories": [story(1, sources=["A", "B", "C"])]}
    assert [k for k, _ in briefs.queue(many, has, 24)[2]] == ["aggiorna"]


def test_a_null_from_before_the_counter_counts_as_one_attempt(monkeypatch, tmp_path):
    _tries(monkeypatch, tmp_path)
    gen = datetime.now().astimezone()
    news = {"generated": gen.isoformat(), "stories": [story(2, first_ts=(gen - timedelta(hours=3)).isoformat())]}
    done = {"s2": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": briefs.SKIP_VER}}
    assert [s["id"] for _, s in briefs.queue(news, done, 24)[2]] == ["s2"]  # un solo tentativo in più
    briefs.note_tries(["s2"], done)
    assert briefs.queue(news, done, 24)[2] == []


def test_pending_retries_skipped_story_when_more_outlets_cover_it():
    news = {"stories": [story(1, sources=["Gazzetta", "Sky Sport"]), story(2)]}
    v = briefs.SKIP_VER
    done = {"s1": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": v}, "s2": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": v}}
    assert [s["id"] for _, s in briefs.pending(news, done)] == ["s1"]


def test_pending_retries_old_skips_once_when_sources_are_read_better():
    news = {"stories": [story(1), story(2)]}
    done = {"s1": {"b": "", "skip": True, "n": 1, "at": now_iso()},                          # «null» di prima del fix
            "s2": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": briefs.SKIP_VER}}    # «null» già con le fonti nuove
    assert [(k, s["id"]) for k, s in briefs.pending(news, done)] == [("riprova", "s1")]


def test_pending_rewrites_when_the_picture_changes_a_lot():
    news = {"stories": [story(1, sources=["A", "B", "C"])]}
    assert briefs.pending(news, {"s1": {"b": "x", "n": 1, "at": now_iso()}})[0][0] == "aggiorna"
    assert briefs.pending(news, {"s1": {"b": "x", "n": 2, "at": now_iso()}}) == []


def test_wake_gate_sleeps_for_quiet_queues_and_wakes_for_real_work(capsys, monkeypatch, tmp_path):
    monkeypatch.setattr(briefs, "STATE", str(tmp_path))
    monkeypatch.setattr(briefs, "TRIES", str(tmp_path / "tries.json"))    # mai lo stato vero del repo
    monkeypatch.setattr(briefs, "WORK_JSON", str(tmp_path / "w.json"))
    monkeypatch.setattr(briefs, "WORK_TXT", str(tmp_path / "w.txt"))
    monkeypatch.setattr(briefs, "BRIEFS", str(tmp_path / "b.json"))
    news = tmp_path / "n.json"
    monkeypatch.setattr(briefs, "NEWS", str(news))
    monkeypatch.setattr(briefs, "gather", lambda s: {"id": s["id"], "cat": "calcio", "kicker": "", "title": s["id"], "summary": "",
                                                     "outlets": ["Gazzetta"], "video": False, "texts": [], "extra": [], "chars": 0})

    news.write_text(json.dumps({"stories": [story(1), story(2), story(3, video=True), story(4, live=True)]}))
    assert briefs.gate(20) == 0
    out = capsys.readouterr().out.strip().splitlines()
    assert json.loads(out[-1]) == {"wakeAgent": False}                    # due storie fuori pagina (+ video e diretta): si aspetta

    news.write_text(json.dumps({"stories": [story(i, on_home=True) for i in range(briefs.WAKE_HOME)]}))
    assert briefs.gate(20) == 0
    out = capsys.readouterr().out
    assert "wakeAgent" not in out and "COME SI SCRIVE" in out             # sveglia l'agente e gli passa le regole


def test_gate_contract_with_recovery(capsys, monkeypatch, tmp_path):
    """Niente da fare → {"wakeAgent": false}. Un recupero è lavoro vero: sveglia. Recupero esaurito → di nuovo a dormire."""
    _tries(monkeypatch, tmp_path)
    monkeypatch.setattr(briefs, "WORK_JSON", str(tmp_path / "w.json"))
    monkeypatch.setattr(briefs, "WORK_TXT", str(tmp_path / "w.txt"))
    monkeypatch.setattr(briefs, "BRIEFS", str(tmp_path / "b.json"))
    news = tmp_path / "n.json"
    monkeypatch.setattr(briefs, "NEWS", str(news))
    monkeypatch.setattr(briefs, "gather", lambda s: {"id": s["id"], "cat": "calcio", "kicker": "", "title": s["id"], "summary": "",
                                                     "outlets": ["Gazzetta"], "video": False, "texts": [], "extra": [], "chars": 0})
    gen = datetime.now().astimezone()
    news.write_text(json.dumps({"generated": gen.isoformat(), "stories": [story(1, first_ts=(gen - timedelta(hours=5)).isoformat())]}))
    (tmp_path / "b.json").write_text(json.dumps({"s1": {"b": "Breve.", "n": 1, "at": now_iso()}}))
    assert briefs.gate(24) == 0
    assert json.loads(capsys.readouterr().out.strip().splitlines()[-1]) == {"wakeAgent": False}   # tutto scritto
    (tmp_path / "b.json").write_text(json.dumps({"s1": {"b": "", "skip": True, "n": 1, "at": now_iso(), "v": briefs.SKIP_VER}}))
    assert briefs.gate(24) == 0
    out = capsys.readouterr().out
    assert "wakeAgent" not in out and "recupero" in out                   # il «null» di 5 ore fa si riprova una volta
    assert briefs.gate(24) == 0
    assert json.loads(capsys.readouterr().out.strip().splitlines()[-1]) == {"wakeAgent": False}   # tentativi finiti


# ------------------------------------------------------------------ raggruppamento delle storie
def item(title, src, mins, link=None):
    ts = (datetime.now().astimezone() - timedelta(minutes=mins)).isoformat()
    return {"src": src, "title": title, "link": link or f"https://{src}.it/{abs(hash(title)) % 10**6}", "summary": "", "image": "",
            "cats": [], "ts": ts, "video": False, "live": False, "cat": "calcio", "kicker": "Azzurri"}


def test_cluster_merges_same_fixture_and_keeps_unrelated_apart():
    items = [item("Turchia-Italia 1-4: Bastoni e Frattesi decidono", "gazzetta", 30),
             item("Turchia-Italia, le pagelle degli azzurri", "sky", 20),
             item("Inter, prosegue ad Appiano il recupero degli infortunati", "sky", 10)]
    stories = build.cluster(items)
    assert len(stories) == 2
    big = max(stories, key=lambda s: len(s["items"]))
    assert len(big["items"]) == 2 and len(big["sources"]) == 2


def test_story_id_is_stable_when_more_articles_join():
    a = item("Pogacar salta gli Europei di ciclismo in Slovenia", "oa", 60, link="https://oa.it/primo")
    first = build.cluster([dict(a)])[0]["id"]
    b = item("Pogacar salta gli Europei di ciclismo, lo dice il suo staff", "gazzetta", 10, link="https://gazzetta.it/dopo")
    both = build.cluster([dict(b), dict(a)])
    assert len(both) == 1 and both[0]["id"] == first                        # la storia si chiama come il suo primo articolo


def test_two_stories_bridged_by_an_older_article_become_one():
    # Il raggruppamento va dal più recente: a e b si somigliano poco e aprono due storie; c, uscito prima di entrambi,
    # somiglia a tutte e due. Prima finiva nella prima trovata e le due storie gemelle restavano separate.
    a = item("Canestro sulla sirena e derby deciso: festa milano", "gazzetta", 100, link="https://g.it/a")
    b = item("Virtus fermata allo scadere: milano vince il derby", "sky", 200, link="https://sky.it/b")
    c = item("Milano batte la virtus nel derby allo scadere: canestro sulla sirena", "cds", 300, link="https://cds.it/c")
    for i in (a, b, c):
        i["cat"], i["kicker"] = "basket", "Eurolega"
    assert len(build.cluster([dict(a), dict(b)])) == 2                     # da sole non si somigliano abbastanza
    both = build.cluster([dict(a), dict(b), dict(c)])
    assert len(both) == 1 and len(both[0]["items"]) == 3
    assert both[0]["id"] == build.item_id("https://cds.it/c")              # la storia unita si chiama come il primo articolo


def test_cluster_never_merges_two_different_matches():
    a = item("Inter-Cagliari 2-0, decide Lautaro nel finale", "gazzetta", 300, link="https://g.it/1")
    b = item("Milan-Lazio 1-1, pari nel finale a San Siro", "gazzetta", 200, link="https://g.it/2")
    c = item("Serie A, finale di serata: Inter-Cagliari e Milan-Lazio nel finale", "sky", 100, link="https://sky.it/3")
    assert len(build.cluster([dict(a), dict(b), dict(c)])) >= 2


def test_fixture_reads_compound_names():
    assert build.fixture("Nations League: Repubblica-Ceca-Inghilterra 0-2") == "cechia|inghilterra"
    assert build.fixture("Repubblica Ceca-Inghilterra 0-2: gol e highlights") == "cechia|inghilterra"
    assert build.fixture("San Marino-Albania 0-3: gol e highlights") == "sanmarino|albania"
    assert build.fixture("Real Madrid-Barcellona 2-1") == build.fixture("Real-Barcellona, le pagelle")


def test_roundup_joins_its_match_and_never_titles_a_story():
    # I titoli veri della sera di Nations League che avevano prodotto Spagna-Croazia due volte in prima pagina.
    spa = [item("Spagna show: poker alla Croazia con doppietta di Yamal", "cds", 300),
           item("Super Yamal trascina la Spagna in Nations League: 4-1 alla Croazia. Il solito Kane guida l'Inghilterra", "gazzetta", 290),
           item("Nations League: Spagna-Croazia 4-1", "ansa", 280),
           item("Spagna-Croazia 4-1: gol e highlights", "sky", 270),
           item("Spagna-Croazia 4-1: video, gol e highlights", "sky", 260)]
    cze = [item("Nations League: Repubblica-Ceca-Inghilterra 0-2", "ansa", 250),
           item("Repubblica Ceca-Inghilterra 0-2: gol e highlights", "sky", 240)]
    oa = item("Calcio, poker della Spagna alla Croazia in Nations League. Inghilterra sbanca a Praga", "oa", 200)
    oa["image"] = "https://oa.it/foto.jpg"                                # la foto migliore: prima lo faceva diventare titolo
    rnd = item("Nations League, i risultati di martedì: vincono Inghilterra e Svizzera", "sky", 190)
    stories = build.cluster([dict(i) for i in spa + cze + [oa, rnd]])
    where = {i["title"]: s for s in stories for i in s["items"]}
    assert where[oa["title"]] is where[spa[2]["title"]]                    # l'articolo di OA sta con Spagna-Croazia
    assert where[cze[0]["title"]] is where[cze[1]["title"]]                # la Repubblica Ceca è una storia sola
    assert where[cze[0]["title"]] is not where[spa[0]["title"]]
    assert all(s["title"] not in (oa["title"], rnd["title"]) for s in stories if len(s["items"]) > 1)


def test_live_badge_goes_away_when_the_event_is_over():
    now = datetime.now().astimezone()
    ago = lambda h: (now - timedelta(hours=h)).isoformat()                  # noqa: E731
    fresh = {"items": [{"ts": ago(1), "live": True, "title": "Inter-Milan in diretta"}]}
    old = {"items": [{"ts": ago(5), "live": True, "title": "Inter-Milan in diretta"}]}
    over = {"items": [{"ts": ago(2), "live": True, "title": "Inter-Milan in diretta"},
                      {"ts": ago(1), "live": False, "title": "Inter-Milan 2-1: gli highlights"}]}
    assert build.still_live(fresh, now) is True
    assert build.still_live(old, now) is False
    assert build.still_live(over, now) is False


def test_brief_survives_when_its_story_changes_name_and_state_tells_the_truth():
    st = {"id": "nuovo", "items": [{"id": "nuovo"}, {"id": "vecchio"}], "live": False, "video": False,
          "sources": ["gazzetta", "sky"]}
    old = {"b": "Milano vince il derby sulla sirena.", "at": now_iso(hours=2), "n": 1}
    assert build.brief_of(st, {"vecchio": old})["b"] == old["b"]
    st["brief"] = ""
    assert build.brief_state(st, {}) == "wait"                              # riassunto in arrivo
    assert build.brief_state(st, {"nuovo": {"b": "", "skip": True, "n": 2, "v": briefs.SKIP_VER}}) == "skip"
    assert build.brief_state(dict(st, video=True), {}) == "video"
    assert build.brief_state(dict(st, live=True), {}) == "live"
    assert build.brief_state(dict(st, brief="x"), {}) == "own"


# ------------------------------------------------------------------ pulizia dei titoli
@pytest.mark.parametrize("raw,title,video,live", [
    ("Inter-Napoli 2-1 VIDEO", "Inter-Napoli 2-1", True, False),
    ("Roma-Lazio, il derby DIRETTA", "Roma-Lazio, il derby", False, True),
    ("LIVE Alle 20.45 la Juve in campo contro il Torino", "Alle 20.45 la Juve in campo contro il Torino", False, True),
    ("Titolo senza suffissi", "Titolo senza suffissi", False, False),
])
def test_tidy_title_strips_video_and_live_flags(raw, title, video, live):
    assert build.tidy_title(raw) == (title, video, live)


# ------------------------------------------------------------------ HTML: niente injection dai feed
EVIL = '"><img src=x onerror=alert(1)><script>alert(2)</script>'


def evil_story():
    return {"id": "abc12345", "title": EVIL, "link": "https://esempio.it/x?a=1&b=2", "src": "gazzetta", "src_name": "Gazzetta",
            "sources": ["gazzetta"], "src_names": ["Gazzetta"], "cat": "calcio", "sec_title": "Calcio", "kicker": EVIL, "kkey": "x",
            "ts": datetime.now().astimezone().isoformat(), "summary": EVIL, "brief": "", "image": 'https://x/i.jpg" onerror="alert(3)',
            "video": False, "live": False,
            "also": [{"src": "sky", "src_name": EVIL, "title": EVIL, "link": "https://esempio.it/y", "ts": datetime.now().astimezone().isoformat()}],
            "items": []}


def test_render_escapes_hostile_feed_content():
    ctx = render.Ctx(now=datetime.now().astimezone(), site_url="https://x/", window=36, n_stories=1, n_sources=1, n_multi=0,
                     sections=[("calcio", "Calcio")], sources=[], sec_counts={"calcio": 1}, ver={"css": "a", "js": "b"}, theme_color="#000")
    st = evil_story()
    html_ = "".join(f(st, ctx) for f in (render.row_html, render.card_html, render.log_html)) + render.lead_html(st, ctx)
    assert "<script>" not in html_ and "<img src=x" not in html_
    assert 'onerror="alert(3)' not in html_                                 # l'URL della foto non esce dall'attributo
    assert "&lt;script&gt;" in html_


def test_pages_use_the_static_brand_card_never_a_publisher_photo():
    """og:image = scheda del sito (og/*.png, < 200 KB, 1200×630), mai una foto di un editore in hotlink."""
    import re
    from PIL import Image
    pages = [f for f in os.listdir(ROOT) if f.endswith(".html")]
    assert pages
    site = build.SITE_URL
    for f in pages:
        html_ = _read(f)
        imgs = re.findall(r'<meta property="og:image" content="([^"]+)"', html_)
        assert len(imgs) == 1, f
        assert imgs[0].startswith(site + "og/") and imgs[0].endswith(".png"), (f, imgs[0])
        assert re.search(r'<meta name="twitter:image" content="' + re.escape(imgs[0]) + '"', html_), f
    assert render.og_card("cronologia.html") == "og/cronologia.png" and render.og_card("calcio.html") == "og/index.png"
    for name in ("index.png", "cronologia.png"):
        path = os.path.join(ROOT, "og", name)
        assert os.path.getsize(path) < 200_000, name
        assert Image.open(path).size == (1200, 630), name


def test_home_brief_line_says_when_the_edition_was_made():
    import re
    html_ = _read("index.html")
    m = re.search(r'<span class="brief-line__at">aggiornato alle <time datetime="([^"]+)">(\d\d:\d\d)</time></span>', html_)
    assert m, "manca «aggiornato alle HH:MM» nella riga d'apertura"
    gen = json.loads(_read("data", "news.json"))["generated"]
    assert m.group(1)[:16] == gen[:16] and m.group(2) == gen[11:16]
    assert html_.count("data-stamp") == 1                                   # l'avviso «nuova edizione» legge solo il piè di pagina


def test_render_clips_collects_videos_and_escapes():
    ctx = render.Ctx(now=datetime.now().astimezone(), site_url="https://x/", window=36, n_stories=1, n_sources=1, n_multi=0,
                     sections=[("calcio", "Calcio")], sources=[], sec_counts={"calcio": 1}, ver={"css": "a", "js": "b"}, theme_color="#000")
    st = dict(evil_story(), video=True)
    out = render.clips_html([st, dict(st, id="def67890")], ctx)
    assert out.startswith("<details") and "2 video" in out and "<script>" not in out
    assert render.clips_html([], ctx) == ""


def test_home_body_puts_the_map_after_the_front_page_news():
    ctx = render.Ctx(now=datetime.now().astimezone(), site_url="https://x/", window=36, n_stories=1, n_sources=1, n_multi=0,
                     sections=[("calcio", "Calcio")], sources=[], sec_counts={"calcio": 1}, ver={"css": "a", "js": "b"}, theme_color="#000")
    st = evil_story()
    body = render.home_body(ctx, st, [st], [st], [], [dict(st, video=True)])
    assert body.index('data-follow') < body.index('id="h-top"') < body.index('data-sky') < body.index('class="blocks"')
    assert body.index('class="clips"') < body.index('data-sky')


# ------------------------------------------------------------------ dati pubblicati
NEWS = os.path.join(ROOT, "data", "news.json")


@pytest.mark.skipif(not os.path.exists(NEWS), reason="data/news.json non c'è ancora")
def test_published_news_json_is_consistent():
    d = json.load(open(NEWS, encoding="utf-8"))
    ids = [s["id"] for s in d["stories"]]
    assert len(ids) == len(set(ids)), "id duplicati"
    known = set(ids)
    for s in d["stories"]:
        assert s["title"] and s["link"].startswith("http") and s["items"]
        assert all(r in known for r in s.get("related", [])), f"related orfano in {s['id']}"
        b = s.get("brief") or ""
        assert not any(x in b for x in ("<", ">", "http", "\n")), f"brief con markup o link in {s['id']}"
        assert len(b) <= briefs.MAX_CH, f"brief troppo lungo in {s['id']}"
        assert s.get("brief_state") in ("own", "wait", "skip", "held", "live", "video"), f"brief_state strano in {s['id']}"
    home = [s for s in d["stories"] if s["on_home"]]
    assert sum(1 for s in home if s["video"]) <= 6, "troppi video in prima pagina"   # i video stanno nella riga «N video»


# ------------------------------------------------------------------ pagina senza tracker
def _read(*parts):
    return open(os.path.join(ROOT, *parts), encoding="utf-8").read()


def test_bundle_talks_only_to_its_own_news_json():
    """Il colophon dice «nessun tracker»: il bundle non deve mai contattare un altro dominio."""
    import re
    js = _read("js", "app.js")
    calls = re.findall(r"fetch\(([^)]*)\)", js)
    assert calls and all("data/news.json" in c for c in calls), calls
    for bad in ("sendBeacon", "XMLHttpRequest", "WebSocket", "EventSource", "document.cookie", "importScripts"):
        assert bad not in js, bad
    css = _read("css", "site.css")
    assert "http://" not in css and "https://" not in css and "@import" not in css
    code = re.sub(r"(?ms)^/\*.*?\*/", "", js)                          # le intestazioni (licenze, rimandi) non contattano nessuno
    hosts = set(re.findall(r"https?://([A-Za-z0-9.-]+)", code))
    assert hosts <= {"www.w3.org"}, hosts                               # solo lo spazio dei nomi SVG


def test_third_party_library_keeps_its_license_and_is_not_edited():
    src = _read("js", "src", "05-ufuzzy.js")
    assert "MIT License" in src and "Permission is hereby granted" in src and "Leon Sorokin" in src
    assert "uFuzzy" in _read("js", "app.js")


def test_motion_is_vendored_with_both_licenses_and_rebuilds_the_same():
    """Motion (motion.dev) nel bundle: licenze complete (Motion B.V. e Framer B.V.), versione fissata, nessuna rete."""
    src = _read("js", "src", "04-motion.js")
    head = src[:src.index("*/")]
    assert head.count("Permission is hereby granted") == 2
    assert "Motion](https://motion.dev) B.V." in head and "Framer B.V." in head
    assert "Motion 13.4.6" in head
    body = src[src.index("*/") + 2:]
    for bad in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "document.cookie", "importScripts", "eval("):
        assert bad not in body, bad
    pkg = json.loads(_read("vendor", "motion", "package.json"))
    assert pkg["dependencies"]["motion"] == "13.4.6"                      # versione esatta: ricostruire dà lo stesso file
    assert "var Motion=" in _read("js", "app.js")


def test_motion_springs_are_generated_css_with_a_fallback():
    css = _read("css", "src", "01-springs.css")
    for name in ("--spring:", "--spring-soft:", "--spring-quick:", "--spring-pop:"):
        assert name in css
    assert "linear(0," in css and "@supports not (transition-timing-function: linear(0, 1))" in css


def test_motion_respects_reduced_motion_and_old_browsers():
    js = _read("js", "src", "08-motion-ui.js")
    assert "!reduce" in js and 'typeof Element.prototype.animate === "function"' in js
    assert "catch" in js                                                    # un errore di animazione non rompe la pagina


# ------------------------------------------------------------------ build resistente
def test_build_drops_broken_briefs_instead_of_failing(tmp_path, monkeypatch):
    import build
    (tmp_path / "data").mkdir()
    good = {"b": "Frase valida e tranquilla, senza link né markup, di lunghezza ragionevole per il sito.", "at": "2026-09-29T20:00:00+02:00", "n": 1}
    data = {"ok": good, "skip": {"b": "", "skip": True, "n": 1}, "markup": {"b": "<b>no</b>"}, "link": {"b": "vedi https://x.it"},
            "lungo": {"b": "x" * 400}, "stringa": "testo", "nullo": None, "numero": 5}
    (tmp_path / "data" / "briefs.json").write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(build, "ROOT", str(tmp_path))
    assert sorted(build.load_briefs()) == ["ok", "skip"]
    (tmp_path / "data" / "briefs.json").write_text("{rotto", encoding="utf-8")
    assert build.load_briefs() == {}
    (tmp_path / "data" / "briefs.json").write_text("[1, 2]", encoding="utf-8")
    assert build.load_briefs() == {}


def test_apply_fetches_sources_when_the_story_has_no_prepared_work(tmp_path, monkeypatch):
    """Un work.json di un altro giro (o di un'altra cartella) non deve spegnere anti-copia e controllo dei numeri."""
    monkeypatch.setattr(briefs, "STATE", str(tmp_path))
    monkeypatch.setattr(briefs, "WORK_JSON", str(tmp_path / "manca.json"))
    monkeypatch.setattr(briefs, "BRIEFS", str(tmp_path / "b.json"))
    news = tmp_path / "n.json"
    news.write_text(json.dumps({"stories": [{"id": "aaaaaaaa", "title": "Titolo", "summary": "Sommario", "items": []}]}), encoding="utf-8")
    monkeypatch.setattr(briefs, "NEWS", str(news))
    monkeypatch.setattr(briefs, "gather", lambda s: dict(SRC_WORK, id=s["id"], chars=300))
    copy = "Il capitano ha spiegato che la squadra ha lavorato bene in settimana e che a suo dire tutto è pronto per la sfida."
    good = "Il capitano parla della preparazione e chiede maturità contro la Francia: per lui serve una prova più adulta del gruppo intero."
    ans = tmp_path / "a.json"
    ans.write_text(json.dumps({"aaaaaaaa": copy}), encoding="utf-8")
    assert briefs.apply(str(ans)) == 1                                  # copia: rifiutata anche senza work.json
    assert "aaaaaaaa" not in json.loads((tmp_path / "b.json").read_text(encoding="utf-8"))
    ans.write_text(json.dumps({"aaaaaaaa": good}), encoding="utf-8")
    assert briefs.apply(str(ans)) == 1                                  # senza prove: rifiutato
    proof = "contro la Francia servirà una prova di maturità completa da parte di tutti"
    ans.write_text(json.dumps({"aaaaaaaa": {"testo": good, "prove": [proof]}}), encoding="utf-8")
    assert briefs.apply(str(ans)) == 0
    assert json.loads((tmp_path / "b.json").read_text(encoding="utf-8"))["aaaaaaaa"]["b"] == good
    log = [json.loads(x) for x in (tmp_path / "audit.jsonl").read_text(encoding="utf-8").splitlines()]
    assert log[-1]["id"] == "aaaaaaaa" and log[-1]["p"] == [proof]      # con quali frasi è stato giustificato


def test_prepare_clears_every_answers_file_of_the_previous_round(tmp_path, monkeypatch):
    monkeypatch.setattr(briefs, "STATE", str(tmp_path))
    monkeypatch.setattr(briefs, "TRIES", str(tmp_path / "tries.json"))
    monkeypatch.setattr(briefs, "WORK_JSON", str(tmp_path / "w.json"))
    monkeypatch.setattr(briefs, "WORK_TXT", str(tmp_path / "w.txt"))
    monkeypatch.setattr(briefs, "BRIEFS", str(tmp_path / "b.json"))
    monkeypatch.setattr(briefs, "NEWS", str(tmp_path / "n.json"))
    for name in ("answers.json", "answers2.json", "answers3.json"):
        (tmp_path / name).write_text("{}", encoding="utf-8")
    briefs.prepare(5)
    assert not list(tmp_path.glob("answers*.json"))
