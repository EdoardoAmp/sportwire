# Sportwire

Rassegna stampa sportiva statica e **spaziale**: ogni notizia è una stella nel *cielo di oggi* (tempo × sport),
si legge dentro il sito (il *dossier*), resta nella tua *cronologia* e ha il suo *in breve*, scritto
dall'agente Hermes. Aggrega i feed RSS pubblici di ANSA, Gazzetta, Corriere dello Sport, Tuttosport, Sky Sport e OA Sport.
Nessun account, nessun cookie, nessun tracker: la cronologia vive solo nel `localStorage` del tuo dispositivo.

Non ripubblica articoli: mostra titoli, sommari, miniature e un riassunto originale di 1-2 frasi; ogni notizia rimanda
all'articolo sul sito della testata.

## Le quattro cose

| | Come funziona |
|---|---|
| **Le notizie sono il sito** | Ogni storia si apre in un *dossier* dentro la pagina (`#/s/<id>`, indirizzo condivisibile): foto, «in breve», chi ne scrive ora per ora (con la frase di ogni testata) che la raccontano, storie collegate. Frecce, `j`/`k` o uno swipe sul telefono per scorrere, `Esc` per chiudere. La foto della scheda «vola» nel dossier (View Transitions API, solo dove il browser la offre e il movimento non è ridotto). **Ascolta** legge titolo e breve con la voce italiana del dispositivo. |
| **La tua cronologia** | `cronologia.html`: cosa hai letto, giorno per giorno, con statistiche, la mappa delle ultime 12 settimane, ricerca, esporta (JSON) e cancella. «Riprendi da qui» in home. Solo `localStorage`. |
| **Le tue squadre** | Scegli chi segui (squadre, piloti, atleti, o un nome scritto a mano): le sue notizie salgono in cima alla prima pagina con una ★, nelle sezioni c'è il filtro «Le mie», nel dossier si segue con un tocco. Solo `localStorage`, come la cronologia. |
| **«In breve»** | 1-2 frasi riscritte dall'agente (Hermes) con DeepSeek V4.1 Flash via OpenRouter, mai da un modello locale (niente Spark/Ollama); il modello serve solo a scrivere. Ogni breve arriva con le **prove**: le frasi delle fonti che lo sostengono, copiate alla lettera. `briefs.py` controlla che le prove ci siano davvero e che ogni nome, luogo e cifra del breve stia in una di loro; rifiuta anche le copie (8 parole di fila uguali alla fonte). Dove non c'è un breve compare il sommario della testata, dichiarato come tale. |

## Uso

```bash
python3 build.py                 # scarica i feed e rigenera tutte le pagine
python3 build.py --no-fetch      # ricostruisce dai dati salvati (data/raw.json)
python3 build.py --raw altro.json --now 2026-09-30T04:08:00+02:00 --out /tmp/prova   # prove: un'altra ora, altrove
python3 -m pytest -q tests       # test senza rete né browser
python3 -m http.server 8787      # in un altro terminale…
python3 qa.py                    # …QA nel browser (Playwright + Chrome): layout, contrasto, tap, funzioni
```

### Gli «in breve»

```bash
python3 briefs.py status         # quante storie hanno il breve, quante aspettano
python3 briefs.py prepare        # → state/work.txt (testi da leggere) e state/work.json
# l'agente scrive state/answers.json: {"<id>": {"testo": "…", "prove": ["frase copiata dalla fonte", …]} | null, ...}
python3 briefs.py apply state/answers.json    # controlla prove, nomi, cifre, copie, lunghezza; unisce in data/briefs.json
                                              # (state/audit.jsonl tiene le prove di ogni breve accettato)
python3 briefs.py publish        # ramo `briefs` + refresh del sito
```

`briefs.py gate` è lo script del cron di Hermes (`sportwire-in-breve`, due volte l'ora ai minuti :05 e :35, 24 storie
a giro, modello bloccato su `deepseek/deepseek-v4.1-flash` via OpenRouter): se non c'è niente da scrivere stampa
`{"wakeAgent": false}` e l'agente non viene nemmeno svegliato. Il modello non è mai fidato: `apply` ricontrolla
ogni breve contro le fonti (prove, nomi, cifre, copie, lunghezza) qualunque cosa abbia scritto. `briefs.py status`
misura anche l'attesa: minuti tra l'uscita di una notizia e il suo breve. Il ramo `briefs` lo scrive solo `publish`,
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
| `js/src/04-motion.js` | [Motion](https://motion.dev) 13.4.6 (MIT, 18 KB, 7 KB compressi): le animazioni. Solo `animate` (versione mini, sulla Web Animations API del browser), `spring`, `stagger` e `inView`, impacchettati con esbuild da `vendor/motion` senza modifiche, con le due licenze per intero. `js/src/08-motion-ui.js` li usa: ingresso delle pagine a cascata, dossier con una molla, stelle che si accendono, filtri. Con «riduci movimento» restano solo dissolvenze brevi |
| `css/src/01-springs.css` | le molle di Motion come curve CSS native (`linear()`), generate da `vendor/motion/build.mjs`: passaggio del mouse e pressione |
| `js/src/05-ufuzzy.js` | [uFuzzy](https://github.com/leeoniya/uFuzzy) v1.0.19 (MIT, 8,5 KB, copia non modificata con la sua licenza): la ricerca perdona i refusi. Un test verifica che il bundle non contatti altri domini |
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
