/* Le tue squadre: chi segui (squadre, piloti, atleti). Le sue notizie salgono in cima alla prima pagina, nelle sezioni
   c'è il filtro «Le mie» e nel dossier si segue con un tocco. Come la cronologia vive solo in localStorage: nessun
   account, nessun server. */
const follow = (() => {
  const KEY = "sw:squadre:v1", MAX = 24;
  /* Chi si segue con un tocco: [nome, parole che lo indicano nei titoli]. Si cercano parole intere e senza accenti,
     così Milan non prende Milano e Inter non prende intervista. Chiunque altro si aggiunge scrivendone il nome. */
  const CATALOG = [
    ["Inter", "inter|nerazzurri|!inter miami"], ["Milan", "milan|rossoneri"], ["Juventus", "juventus|juve|bianconeri"],
    ["Napoli", "napoli|!napoli basket"], ["Roma", "roma|giallorossi|!bc roma|!virtus roma|!maxima roma"], ["Lazio", "lazio|biancocelesti"], ["Atalanta", "atalanta"],
    ["Fiorentina", "fiorentina"], ["Bologna", "bologna|!virtus bologna|!virtus costa bologna|!fortitudo bologna|!milano bologna"],
    ["Torino", "torino|granata|!reale mutua torino"], ["Genoa", "genoa"],
    ["Como", "como"], ["Udinese", "udinese"], ["Parma", "parma"], ["Cagliari", "cagliari"], ["Lecce", "lecce"],
    ["Sassuolo", "sassuolo"], ["Verona", "verona|hellas"], ["Cremonese", "cremonese"], ["Pisa", "pisa"],
    ["Sampdoria", "sampdoria|samp|blucerchiati"], ["Palermo", "palermo"],
    ["Italia", "italia|azzurri|azzurre|italbasket|italvolley|!coppa italia|!rally italia|!giro d italia|!supercoppa italiana"],
    ["Sinner", "sinner"], ["Alcaraz", "alcaraz"], ["Musetti", "musetti"], ["Cobolli", "cobolli"], ["Paolini", "paolini"],
    ["Djokovic", "djokovic"], ["Ferrari", "ferrari"], ["Leclerc", "leclerc"], ["Hamilton", "hamilton"],
    ["Antonelli", "antonelli|kimi antonelli"], ["Verstappen", "verstappen"], ["Bagnaia", "bagnaia|pecco"],
    ["Marquez", "marquez"], ["Bezzecchi", "bezzecchi"], ["Ducati", "ducati"], ["Pogacar", "pogacar"], ["Ganna", "ganna"],
    ["Olimpia Milano", "olimpia milano|olimpia"], ["Virtus Bologna", "virtus"],
  ];
  const catalog = new Map(CATALOG.map(([label, t]) => [norm(label), t]));
  /* «!frase»: da togliere prima di cercare (Coppa Italia non è l'Italia, Virtus Bologna non è il Bologna) */
  const termsOf = (label) => {
    const raw = (catalog.get(norm(label)) || label).split("|");
    const w = (xs) => xs.map((x) => norm(x)).filter(Boolean).map((x) => ` ${x} `);
    return { pos: w(raw.filter((x) => !x.startsWith("!"))), neg: w(raw.filter((x) => x.startsWith("!")).map((x) => x.slice(1))) };
  };
  const hay = (st) => st._fw || (st._fw = ` ${norm(`${st.title} ${st.kicker || ""} ${(st.items || []).map((i) => i.title).join(" ")}`)} `);
  const hits = (st, terms) => {
    let h = hay(st);
    for (const n of terms.neg) h = h.split(n).join("   ");
    return terms.pos.some((t) => h.includes(t));
  };

  function read() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || "null");
      if (j && j.v === 1 && Array.isArray(j.list)) return { v: 1, list: j.list.filter((x) => typeof x === "string").slice(0, MAX), later: Number(j.later) || 0 };
    } catch { /* dati rovinati: si riparte */ }
    return { v: 1, list: [], later: 0 };
  }
  let s = read(), editing = false, saved = true;
  const emit = () => document.dispatchEvent(new CustomEvent("sw:follow"));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); saved = true; } catch { saved = false; /* quota o navigazione privata: resta in memoria */ } emit(); };
  addEventListener("storage", (e) => { if (e.key === KEY) { s = read(); emit(); } });

  const list = () => s.list.map((label) => ({ label, terms: termsOf(label) }));
  const has = (label) => s.list.some((l) => norm(l) === norm(label));
  function toggle(label) {
    label = String(label || "").replace(/\s+/g, " ").trim().slice(0, 32);
    if (!norm(label)) return;
    s.list = has(label) ? s.list.filter((l) => norm(l) !== norm(label)) : [...s.list, label].slice(-MAX);
    save();
  }
  const mine = (st, fs = list()) => fs.length > 0 && fs.some((f) => hits(st, f.terms));
  const stories = () => {
    if (!NEWS.ready || !s.list.length) return [];
    const fs = list();
    return NEWS.data.stories.filter((st) => mine(st, fs)).sort((a, b) => b._t - a._t);
  };
  /* nomi del catalogo di cui si parla oggi, dal più presente */
  const suggest = (n) => (NEWS.ready ? CATALOG.map(([label]) => ({ label, n: NEWS.data.stories.filter((st) => hits(st, termsOf(label))).length }))
    .filter((x) => x.n > 0 && !has(x.label)).sort((a, b) => b.n - a.n).slice(0, n) : []);
  /* chi compare in questa notizia (per «Segui» nel dossier): il catalogo e i nomi già seguiti */
  function spotted(st) {
    const out = CATALOG.map(([label]) => label).filter((label) => hits(st, termsOf(label)));
    s.list.forEach((l) => { if (!out.some((x) => norm(x) === norm(l)) && hits(st, termsOf(l))) out.push(l); });
    return out.slice(0, 4);
  }

  /* — Suggerimento dalla cronologia: «Hai aperto N notizie su <nome>». Solo locale, zero rete. Si riconosce chi compare
       in una notizia letta con lo STESSO confronto delle squadre seguite (hits + termsOf: parole intere, senza accenti,
       con le esclusioni come «Coppa Italia»), sul titolo e sull'occhiello che la cronologia conserva. Un suggerimento
       alla volta, al più una volta per sessione per ciascun nome; «Non ora» vale 14 giorni per quel nome. — */
  const HKEY = "sw:suggerimenti:v1", SEEN = "sw:suggerimenti:visti", HINT_MIN = 5, HINT_DAYS = 7, HINT_QUIET = 14 * 864e5;
  const readNo = () => { try { const j = JSON.parse(localStorage.getItem(HKEY) || "null"); return j && j.v === 1 && j.no && typeof j.no === "object" ? j.no : {}; } catch { return {}; } };
  const writeNo = (no) => { try { localStorage.setItem(HKEY, JSON.stringify({ v: 1, no })); return true; } catch { return false; } };
  const seenNow = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || "[]")); } catch { return new Set(); } };
  const markSeen = (label) => { try { const x = seenNow(); x.add(label); sessionStorage.setItem(SEEN, JSON.stringify([...x])); } catch { /* ok */ } };
  let hint = null;                                  // { label, n, state: "ask" | "done" | "gone" }: deciso una volta per pagina
  function opened7() {
    const cut = Date.now() - HINT_DAYS * 864e5, ids = new Set();
    return store.log().filter((e) => e.t > cut && !ids.has(e.id) && ids.add(e.id)).map((e) => ({ title: e.ti || "", kicker: e.k || "", items: [] }));
  }
  function pickHint() {
    if (hint) return;
    if (!s.list.length && (!s.later || Date.now() - s.later > 7 * 864e5)) return;   // c'è già l'invito a scegliere
    const read7 = opened7();
    if (read7.length < HINT_MIN) return;
    const no = readNo(), seen = seenNow(), now = Date.now();
    let best = null;
    for (const [label] of CATALOG) {
      if (has(label) || seen.has(label) || (no[label] && now - no[label] < HINT_QUIET)) continue;
      const t = termsOf(label), n = read7.filter((st) => hits(st, t)).length;
      if (n >= HINT_MIN && (!best || n > best.n)) best = { label, n };
    }
    if (best) { hint = { ...best, state: "ask" }; markSeen(best.label); }
  }
  function hintHtml() {
    pickHint();
    if (!hint || hint.state === "gone") return "";
    const who = esc(hint.label);
    if (hint.state === "done") {
      return `<div class="hint hint--done" role="status"><p class="hint__text">${saved
        ? `Ora segui ${who}: le sue notizie sono in «Le tue squadre», qui sopra.`
        : `Segui ${who} solo per questa visita: il browser non ha salvato la scelta.`}</p><button type="button" class="follow__link" data-hint-undo>Annulla</button></div>`;
    }
    return `<div class="hint" data-hint="${who}"><p class="hint__text">Hai aperto <b>${hint.n} notizie</b> su ${who} negli ultimi ${HINT_DAYS} giorni.</p>
      <div class="hint__actions"><button type="button" class="btn btn--primary" data-hint-follow>Segui ${who}</button><button type="button" class="follow__link" data-hint-no>Non ora</button></div></div>`;
  }

  const toggleBtn = (label, extra = "") => `<button type="button" class="chip chip--follow" data-follow-toggle="${esc(label)}" aria-pressed="${has(label)}"><span class="chip__star" aria-hidden="true">${has(label) ? "★" : "☆"}</span>${esc(label)}${extra}</button>`;
  const chips = (st) => {
    const names = spotted(st);
    return names.length ? `<div class="follow-chips"><span class="follow-chips__label">Segui</span>${names.map((l) => toggleBtn(l)).join("")}</div>` : "";
  };
  const item = (st) => `<li class="follow__item" data-id="${esc(st.id)}"><p class="kicker">${esc(secName(st.section))}${st.kicker && st.kicker !== secName(st.section) ? `<span class="kicker__sub">${esc(st.kicker)}</span>` : ""}</p>
      <a class="follow__t stretch" href="${esc(st.link)}" data-story="${esc(st.id)}">${esc(st.title)}</a>
      <p class="meta"><span class="meta__src">${esc(st.source)}</span><time datetime="${esc(st.ts)}" data-rel>${esc(relTime(st.ts))}</time>${st.brief ? '<span class="meta__own">✦ in breve</span>' : ""}</p></li>`;

  /* — il riquadro in prima pagina: invito (prima volta), scelta (Modifica), oppure le notizie — */
  function paintHome() {
    const box = $("[data-follow]");
    if (!box || !NEWS.ready) return;
    const fs = list();
    const choosing = editing || (!fs.length && (!s.later || Date.now() - s.later > 7 * 864e5));   // «Non ora» vale una settimana
    let html = "";
    if (choosing) {
      const sug = suggest(editing ? 12 : 8);
      html = `<div class="follow__head"><h2 class="follow__title" id="h-follow">Le tue squadre</h2>
        <p class="follow__note">${fs.length || editing ? "Tocca per seguire o smettere di seguire, oppure scrivi un nome." : "Scegli chi segui: le sue notizie arrivano qui, in cima. Restano solo su questo dispositivo."}</p></div>
        <div class="follow__chips">${fs.map((f) => toggleBtn(f.label)).join("")}${sug.map((x) => toggleBtn(x.label, `<span class="chip__n">${x.n}</span>`)).join("")}</div>
        <form class="follow__add" data-follow-add><input class="follow__input" name="q" type="text" maxlength="32" list="follow-names" placeholder="Un altro nome…" aria-label="Aggiungi chi segui" autocomplete="off" enterkeyhint="done"><button class="btn btn--quiet" type="submit">Segui</button>
        <datalist id="follow-names">${CATALOG.map(([l]) => `<option value="${esc(l)}"></option>`).join("")}</datalist></form>
        <div class="follow__foot">${fs.length || editing ? '<button type="button" class="btn btn--primary" data-follow-done>Fatto</button>' : '<button type="button" class="follow__link" data-follow-later>Non ora</button>'}</div>`;
    } else if (fs.length) {
      const all = stories(), top = all.slice(0, 6);
      html = `<div class="follow__head"><h2 class="follow__title" id="h-follow">Le tue squadre</h2>
        <p class="follow__note">${fs.map((f) => esc(f.label)).join(" · ")} — ${all.length ? `<b>${all.length} ${all.length === 1 ? "notizia" : "notizie"}</b> nelle ultime ore` : "oggi nessuna notizia"}</p>
        <button type="button" class="follow__link" data-follow-edit>Modifica</button></div>
        ${top.length ? `<ul class="follow__list">${top.map(item).join("")}</ul>` : ""}
        ${all.length > top.length ? `<button type="button" class="follow__link" data-follow-all>Leggile tutte (${all.length}) →</button>` : ""}`;
    }
    const typing = box.contains(document.activeElement) && document.activeElement.matches(".follow__input");
    box.innerHTML = html;
    box.hidden = !html;
    if (typing) { const i = $(".follow__input", box); if (i) i.focus(); }
  }

  /* — segno ★ sulle notizie di chi segui, ovunque — */
  function paintMarks() {
    if (!NEWS.ready) return;
    const fs = list();
    $$("[data-id]").forEach((n) => { const st = NEWS.byId.get(n.dataset.id); n.classList.toggle("is-mine", !!st && mine(st, fs)); });
  }

  /* — filtro «Le mie» nelle pagine di sezione (compare solo se c'è qualcosa da mostrare) — */
  function sectionChip() {
    const bar = $(".chips");
    if (!bar || !NEWS.ready) return;
    const n = $$("[data-hit][data-k]").filter((x) => x.classList.contains("is-mine")).length;
    let chip = $('[data-filter="__mine"]', bar);
    if (!n) {
      if (chip) { if (chip.getAttribute("aria-pressed") === "true") $('[data-filter="*"]', bar).click(); chip.remove(); }
      return;
    }
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button"; chip.className = "chip chip--mine"; chip.dataset.filter = "__mine"; chip.setAttribute("aria-pressed", "false");
      $('[data-filter="*"]', bar).after(chip);
    }
    chip.innerHTML = `<span class="chip__star" aria-hidden="true">★</span>Le mie<span class="chip__n">${n}</span>`;
  }

  function paintToggles() {
    $$("[data-follow-toggle]").forEach((b) => {
      const on = has(b.dataset.followToggle);
      b.setAttribute("aria-pressed", String(on));
      const star = $(".chip__star", b);
      if (star) star.textContent = on ? "★" : "☆";
    });
  }

  function paint() { paintHome(); paintMarks(); sectionChip(); paintToggles(); }
  document.addEventListener("sw:news", paint);
  document.addEventListener("sw:follow", paint);

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-follow-toggle]");
    if (t) {
      e.preventDefault();
      if (t.closest("[data-follow]")) editing = true;          // scelta in corso: il riquadro resta aperto finché non si preme «Fatto»
      toggle(t.dataset.followToggle);
      return;
    }
    if (e.target.closest("[data-follow-edit]")) { editing = true; paintHome(); motion.box($("[data-follow]")); const c = $("[data-follow] .chip"); if (c) c.focus(); return; }
    if (e.target.closest("[data-follow-done]")) { editing = false; paintHome(); motion.box($("[data-follow]")); const b = $("[data-follow] .follow__link, [data-follow] a"); if (b) b.focus(); return; }
    if (e.target.closest("[data-follow-later]")) { s.later = Date.now(); save(); return; }
    if (hint && e.target.closest("[data-hint-follow]")) {
      if (!has(hint.label)) toggle(hint.label);
      hint.state = "done";
      history_.resume();
      const u = $("[data-hint-undo]"); if (u) u.focus();
      return;
    }
    if (hint && e.target.closest("[data-hint-no]")) {
      const no = readNo(); no[hint.label] = Date.now(); writeNo(no);
      hint.state = "gone";
      history_.resume();
      const l = $(".resume__link"); if (l) l.focus();
      return;
    }
    if (hint && e.target.closest("[data-hint-undo]")) {
      if (has(hint.label)) toggle(hint.label);
      hint.state = "gone";
      history_.resume();
      const l = $(".resume__link"); if (l) l.focus();
      return;
    }
    if (e.target.closest("[data-follow-all]")) { const ids = stories().map((x) => x.id); if (ids.length) reader.open(ids[0], ids); return; }
    const a = e.target.closest("[data-follow] a[data-story]");
    if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) { e.preventDefault(); reader.open(a.dataset.story, stories().map((x) => x.id)); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-follow-add]");
    if (!f) return;
    e.preventDefault();
    const inp = $(".follow__input", f);
    const v = inp.value.trim();
    editing = true;
    if (v && !has(v)) toggle(v); else paintHome();
    inp.value = "";
  });

  return { chips, stories, mine: (st) => mine(st), paint, count: () => s.list.length, hint: hintHtml };
})();
