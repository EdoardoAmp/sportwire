# Sportwire

Rassegna stampa sportiva statica: aggrega i titoli dei feed RSS pubblici di **ANSA Sport**,
**La Gazzetta dello Sport** e **Sky Sport**, li deduplica, li categorizza per sport e genera
un sito statico (una homepage "ecosystem index" più una pagina per sezione).

Non ripubblica articoli: mostra titoli, sommari brevi e miniature, e ogni voce apre l'articolo
sul sito della testata che l'ha scritto.

## Uso

```bash
python3 build.py                 # scarica i feed e riscrive index.html + le pagine di sezione
python3 build.py --no-fetch      # ricostruisce dai dati grezzi salvati in data/raw.json
```

## File

| Percorso | Cosa è |
|---|---|
| `build.py` | generatore: fetch dei feed, dedup, categorizzazione, controllo immagini, rendering. Solo stdlib |
| `tokens.css` | token di design (colori OKLCH, tipografia, spaziature, motion) |
| `css/site.css` | una sola foglia CSS: masthead, rail, wire, colophon, responsive |
| `js/site.js` | reveal orchestrato, orari relativi, refresh del wire da `data/news.json` |
| `qa.py` | QA automatico (Playwright): overflow orizzontale, immagini rotte, contrasto WCAG, tap target |
| `data/news.json` | dati per il refresh client-side del wire |
| `data/raw.json` | ultimi item grezzi dei feed (fallback offline) |

## Design

Genere *editorial* · macrostructure *Ecosystem Index* · tema *Sport*: masthead da giornale
(N6), rail con filetti da un capello, colophon denso (Ft4). Tipografia: **Big Shoulders Display**
(titoli), **Newsreader** (testo), **JetBrains Mono** (marcatempo del wire). Tema chiaro e scuro.

## Fonti

Titoli, sommari e immagini appartengono alle rispettive testate. Il sito aggrega solo i loro
feed RSS pubblici; tutto il testo è ospitato dai publisher originali.