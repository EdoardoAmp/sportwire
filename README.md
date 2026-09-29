# Sportwire

Rassegna stampa sportiva statica e **spaziale**: ogni notizia è una stella nel *cielo di oggi* (tempo × sport),
si legge dentro il sito (il *dossier*), resta nella tua *cronologia* e ha il suo *in breve*, scritto
dall'agente Hermes. Aggrega i feed RSS pubblici di ANSA, Gazzetta, Corriere dello Sport, Tuttosport, Sky Sport e OA Sport.
Nessun account, nessun cookie, nessun tracker: la cronologia vive solo nel `localStorage` del tuo dispositivo.

Non ripubblica articoli: mostra titoli, sommari, miniature e un riassunto originale di 1-2 frasi; ogni notizia rimanda
all'articolo sul sito della testata.

## Le tre cose

| | Come funziona |
|---|---|
| **Le notizie sono il sito** | Ogni storia si apre in un *dossier* dentro la pagina (`#/s/<id>`, indirizzo condivisibile): foto, «in breve», ora per ora delle testate che la raccontano, storie collegate. Frecce, `j`/`k` o uno swipe sul telefono per scorrere, `Esc` per chiudere. La foto della scheda «vola» nel dossier (View Transitions API, solo dove il browser la offre e il movimento non è ridotto). **Ascolta** legge titolo e breve con la voce italiana del dispositivo. |
| **La tua cronologia** | `cronologia.html`: cosa hai letto, giorno per giorno, con statistiche, la mappa delle ultime 12 settimane, ricerca, esporta (JSON) e cancella. «Riprendi da qui» in home. Solo `localStorage`. |
| **«In breve»** | 1-2 frasi riscritte dall'agente (Hermes) con DeepSeek V4.1 Flash via OpenRouter, mai da un modello locale (niente Spark/Ollama); il modello serve solo a scrivere. `briefs.py` prepara il lavoro, **rifiuta le copie** (8 parole di fila uguali alla fonte) e pubblica. Dove non c'è un breve compare il sommario della testata, dichiarato come tale. |

## Uso

```bash
python3 build.py                 # scarica i feed e rigenera tutte le pagine
python3 build.py --no-fetch      # ricostruisce dai dati salvati (data/raw.json)
python3 -m pytest -q tests       # test senza rete né browser
python3 -m http.server 8787      # in un altro terminale…
python3 qa.py                    # …QA nel browser (Playwright + Chrome): layout, contrasto, tap, funzioni
```

### Gli «in breve»

```bash
python3 briefs.py status         # quante storie hanno il breve, quante aspettano
python3 briefs.py prepare        # → state/work.txt (testi da leggere) e state/work.json
# l'agente scrive state/answers.json: {"<id>": "testo" | null, ...}
python3 briefs.py apply state/answers.json    # controlla (lunghezza, tono, copie) e unisce in data/briefs.json
python3 briefs.py publish        # ramo `briefs` + refresh del sito
```

`briefs.py gate` è lo script del cron di Hermes (`sportwire-in-breve`, ogni ora al minuto :35, modello bloccato su
`deepseek/deepseek-v4.1-flash` via OpenRouter): se non c'è niente di importante da scrivere stampa
`{"wakeAgent": false}` e l'agente non viene nemmeno svegliato. Il modello non è mai fidato: `apply` ricontrolla
ogni breve contro le fonti (copie, cifre, lunghezza) qualunque cosa abbia scritto. Il ramo `briefs` lo scrive solo `publish`,
`main` lo scrive solo il workflow: non ci sono conflitti.

## File

| Percorso | Cosa è |
|---|---|
| `build.py` | dati: fetch dei feed, dedup, raggruppamento in storie, id stabili, bundle di CSS/JS, `sw.js`. Solo stdlib |
| `render.py` | HTML: pagine di sezione, home, cronologia. Tutto ciò che viene da un feed passa da `esc()` |
| `article.py`, `briefs.py` | testo degli articoli (rispetta robots.txt) e pipeline degli «in breve» |
| `css/src/*.css`, `js/src/*.js` | sorgenti numerati; `build.py` li unisce in `css/site.css` e `js/app.js` (con `?v=` nell'URL) |
| `sw.js`, `manifest.webmanifest`, `icons/` | app installabile, pagine e dati offline (rete prima, cache poi) |
| `fonts/` | Archivo, Geist, Geist Mono self-hosted: il browser non contatta nessun terzo per i caratteri |
| `js/src/05-ufuzzy.js` | [uFuzzy](https://github.com/leeoniya/uFuzzy) v1.0.19 (MIT, 8,5 KB, copia non modificata con la sua licenza): la ricerca perdona i refusi. Unica libreria di terzi; un test verifica che il bundle non contatti altri domini |
| `qa.py`, `tests/` | QA nel browser · test unitari |
| `data/news.json` `data/briefs.json` `data/raw.json` | storie pubblicate · «in breve» · feed grezzi |
| `make_icons.py` | rigenera le icone dell'app |

## Design

Genere *atmospheric* · macrostructure *Map / Diagram* (il cielo) · tema *Bloom*: tela blu-notte, un solo accento ambra,
rosso solo per le dirette; navigazione a pillola flottante (N5), chiusura a frase (Ft5). Tipografia: **Archivo** (titoli,
asse di larghezza), **Geist** (testo), **Geist Mono** (orari). Rispetta `prefers-reduced-motion`.

## Fonti

Titoli, sommari e immagini appartengono alle rispettive testate. Il sito aggrega solo i loro feed RSS pubblici;
il testo degli articoli resta sui siti originali.
