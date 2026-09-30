/* Il dossier: la notizia letta dentro Sportwire (foto, in breve, ora per ora, storie collegate).
   URL profondo #/s/<id>: il tasto Indietro lo chiude, il link si può condividere con se stessi.
   Si scorre con ← → (o j k, o un tocco laterale sul telefono); «Ascolta» legge il breve con la voce italiana del dispositivo. */
const reader = (() => {
  let el, sheet, scroller, posEl, prevBtn, nextBtn;
  let list = [], current = null, lastFocus = null, isOpen = false;
  let sx = 0, sy = 0, st = 0, tracking = false;
  const tts = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function" ? speechSynthesis : null;
  let speaking = false, said = null;

  const parse = () => { const m = /^#\/s\/([0-9a-f]{8})$/.exec(location.hash); return m ? m[1] : null; };
  const hashFor = (id) => `#/s/${id}`;
  const clean = () => history.replaceState(null, "", location.pathname + location.search);

  function build() {
    el = document.createElement("div");
    el.className = "reader";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Dossier della notizia");
    el.innerHTML = `<div class="reader__scrim" data-close></div>
      <div class="reader__sheet" tabindex="-1">
        <div class="reader__top">
          <p class="reader__pos" data-pos></p>
          <div class="reader__nav">
            <button type="button" class="tool" data-prev aria-label="Notizia precedente" title="Precedente ( ← )">${ICON_PREV}</button>
            <button type="button" class="tool" data-next aria-label="Notizia successiva" title="Successiva ( → )">${ICON_NEXT}</button>
            <button type="button" class="tool" data-close aria-label="Chiudi" title="Chiudi ( Esc )">${ICON_X}</button>
          </div>
        </div>
        <div class="reader__scroll" data-scroll></div>
      </div>`;
    document.body.append(el);
    sheet = $(".reader__sheet", el);
    scroller = $("[data-scroll]", el);
    posEl = $("[data-pos]", el);
    prevBtn = $("[data-prev]", el);
    nextBtn = $("[data-next]", el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      if (e.target.closest("[data-prev]")) return step(-1);
      if (e.target.closest("[data-next]")) return step(1);
      if (e.target.closest("[data-listen]")) return toggleListen();
      const a = e.target.closest("a[data-goto]");
      if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); open(a.dataset.goto, null); return; }
      const out = e.target.closest("a[data-visit]");
      if (out && current) store.open(current, "o");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "ArrowLeft" && !e.altKey && !e.metaKey) { e.preventDefault(); step(-1, true); return; }
      if (e.key === "ArrowRight" && !e.altKey && !e.metaKey) { e.preventDefault(); step(1, true); return; }
      if ((e.key === "j" || e.key === "k") && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(e.key === "j" ? 1 : -1, true); return; }
      trapTab(sheet, e);
    });
    /* col dito: un colpo laterale netto passa alla notizia dopo o prima (il bordo sinistro resta al gesto «indietro» di iOS) */
    sheet.addEventListener("pointerdown", (e) => { tracking = e.pointerType === "touch" && e.clientX > 28; sx = e.clientX; sy = e.clientY; st = e.timeStamp; });
    sheet.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6 && e.timeStamp - st < 800) step(dx < 0 ? 1 : -1);
    });
    sheet.addEventListener("pointercancel", () => { tracking = false; });
  }

  /* — Ascolta: sintesi vocale del dispositivo, solo con una voce italiana locale (niente voci in rete) — */
  const voice = () => {
    if (!tts) return null;
    const it = tts.getVoices().filter((v) => /^it([-_]|$)/i.test(v.lang) && v.localService);
    return it.find((v) => v.default) || it[0] || null;
  };
  function paintListen() {
    const b = scroller && $("[data-listen]", scroller);
    if (!b) return;
    b.hidden = !voice() || !b.dataset.text;
    b.setAttribute("aria-pressed", String(speaking));
    b.innerHTML = `${speaking ? ICON_STOP : ICON_PLAY}<span>${speaking ? "Ferma" : "Ascolta"}</span>`;
  }
  function stopListen() {
    if (tts && speaking) tts.cancel();
    speaking = false; said = null;
    paintListen();
  }
  function toggleListen() {
    if (!tts || !current) return;
    if (speaking) return stopListen();
    const v = voice();
    if (!v) return;
    const title = String(current.title || "").trim();
    const body = String(current.brief || current.summary || "").trim();
    try {
      const u = new SpeechSynthesisUtterance(`${title}${/[.!?…»”]$/.test(title) ? " " : ". "}${body}`.trim());
      u.voice = v; u.lang = v.lang;
      const end = () => { if (said === u) { speaking = false; said = null; paintListen(); } };
      u.onend = end; u.onerror = end;
      said = u; speaking = true;
      tts.cancel(); tts.speak(u);
    } catch { speaking = false; said = null; }          // il browser rifiuta la voce: il pulsante resta com'era
    paintListen();
  }
  if (tts) { tts.addEventListener("voiceschanged", paintListen); addEventListener("pagehide", stopListen); }

  const photo = (s) => (s.image ? `<div class="reader__photo media"><img src="${esc(s.image)}" alt="" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded')" onerror="this.parentNode.remove()"></div>` : "");

  function chrono(s) {
    const items = (s.items || []).slice().sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (items.length < 2) return "";
    return `<section aria-labelledby="rd-h"><h3 id="rd-h">Come l’hanno raccontata, ora per ora</h3><ol class="chrono">${items.map((i) =>
      `<li><time datetime="${esc(i.ts)}">${hhmm(new Date(i.ts))}</time><a href="${esc(i.link)}" target="_blank" rel="noopener" data-visit><b>${esc(i.source)}</b><span>${esc(i.title)}</span></a></li>`).join("")}</ol></section>`;
  }
  function related(s) {
    const rel = (s.related || []).map((id) => NEWS.byId.get(id)).filter(Boolean);
    if (!rel.length) return "";
    return `<section aria-labelledby="rd-r"><h3 id="rd-r">Storie collegate</h3><div class="mini">${rel.map((r) =>
      `<a href="${hashFor(r.id)}" data-goto="${esc(r.id)}"><strong>${esc(r.title)}</strong><span class="meta"><span class="meta__src">${esc(r.source)}</span><time datetime="${esc(r.ts)}">${esc(relTime(r.ts))}</time></span></a>`).join("")}</div></section>`;
  }

  /* Cosa dire del riassunto, a seconda dello stato che calcola build.py (brief_state). Le promesse devono essere vere:
     «in arrivo» solo se il cron la riscriverà davvero; per dirette e video si dice perché non c'è. */
  const NOTE = {
    own: "Riassunto scritto da Sportwire leggendo le testate che ne parlano. Per i dettagli c’è l’articolo originale.",
    wait: "Il riassunto di Sportwire è in coda: si scrivono due volte l’ora, prima le notizie in prima pagina. Intanto c’è il sommario della testata.",
    skip: "Per questa notizia basta il sommario della testata: l’articolo non aggiunge altro da riassumere.",
    held: "Qui resta il sommario della testata: il riassunto scritto per questa notizia non ha superato i controlli sulle fonti.",
    live: "È una diretta: cambia di minuto in minuto, quindi non si riassume finché non è finita. Seguila sulla testata.",
    video: "È un video: si guarda sulla testata.",
  };
  function box(s) {
    const own = !!s.brief;
    const state = own ? "own" : (s.brief_state || "wait");
    const text = s.brief || s.summary || "";
    const label = own ? "In breve · Sportwire" : state === "live" ? "Diretta · dalla testata" : state === "video" ? "Video · dalla testata" : "Dalla testata";
    const note = NOTE[state] || NOTE.wait;
    if (!text) return `<div class="reader__box reader__box--${state}"><p class="eyebrow">${label}</p><p class="reader__note">${note}</p></div>`;
    return `<div class="reader__box reader__box--${state}"><p class="eyebrow">${own ? ICON_SPARK : ""}${label}</p><p class="reader__brief${own ? "" : " reader__brief--src"}">${esc(text)}</p><p class="reader__note">${note}</p></div>`;
  }

  function render(s) {
    const others = (s.sources || []).filter((x) => x !== s.source);
    const watch = s.video || s.brief_state === "video";
    scroller.innerHTML = `${photo(s)}<div class="reader__body">
      <div><p class="kicker">${esc(secName(s.section))}${s.kicker && s.kicker !== secName(s.section) ? `<span class="kicker__sub">${esc(s.kicker)}</span>` : ""}${s.live ? '<span class="badge badge--live">Diretta</span>' : ""}</p>
      <h2 class="reader__title" id="rd-title">${esc(s.title)}</h2></div>
      <p class="meta"><span class="meta__src">${esc(s.source)}</span><time datetime="${esc(s.ts)}">${esc(relTime(s.ts))}</time>${others.length ? `<span class="meta__more">+${others.length} ${others.length === 1 ? "testata" : "testate"}: ${esc(others.join(", "))}</span>` : ""}</p>
      ${box(s)}
      <div class="reader__actions">
        <a class="btn btn--primary" href="${esc(s.link)}" target="_blank" rel="noopener" data-visit>${watch ? "Guarda" : s.live ? "Segui" : "Leggi"} su ${esc(s.source || "la testata")} ${ICON_OUT}</a>
        <button type="button" class="btn btn--quiet" data-listen data-text="${s.brief || s.summary ? "1" : ""}" aria-pressed="false" hidden>${ICON_PLAY}<span>Ascolta</span></button>
      </div>
      ${follow.chips(s)}
      ${chrono(s)}${related(s)}
    </div>`;
    scroller.scrollTop = 0;
    paintListen();
  }

  function updateNav() {
    const i = list.indexOf(current.id);
    posEl.textContent = list.length > 1 && i >= 0 ? `${i + 1} di ${list.length}` : "Dossier";
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i < 0 || i >= list.length - 1;
  }

  /* La foto della scheda vola nella foto del dossier: un solo elemento condiviso (stesso nome) tra i due stati. */
  const PHOTO = "story-photo";
  const fliesFrom = (n) => {
    if (!canVT || !n || !n.isConnected) return false;
    const r = n.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  function morph(from, update) {
    from.style.viewTransitionName = PHOTO;
    const clear = () => { from.style.viewTransitionName = ""; const p = scroller && $(".reader__photo", scroller); if (p) p.style.viewTransitionName = ""; };
    const t = withVT(() => {
      from.style.viewTransitionName = "";
      update();
      const p = $(".reader__photo", scroller);
      if (p) p.style.viewTransitionName = PHOTO;
    }, "vt-open");
    if (t) t.finished.then(clear, clear); else clear();
  }

  function show(id, ids, from) {
    const s = getStory(id);
    if (!s) return false;
    if (!el) build();
    if (ids && ids.length) list = ids;
    else if (!list.includes(id)) list = pageIds(id);
    if (speaking && (!current || current.id !== s.id)) stopListen();
    const first = !isOpen;
    current = s;
    const paint = () => {
      if (current !== s) return;                        // nel frattempo si è passati a un'altra notizia: la sua paint disegnerà
      render(s); updateNav();
      const im = $(".reader__photo img", scroller);     // già in cache: subito visibile, così la foto che vola non arriva vuota
      if (im && im.complete && im.naturalWidth) im.classList.add("is-loaded");
    };
    el.setAttribute("aria-labelledby", "rd-title");
    if (first) {
      lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      isOpen = true;
      const openIt = (spring) => {
        if (!isOpen) return;                          // chiuso prima che la transizione partisse
        closing++;                                    // un'uscita ancora in corso non deve più chiudere niente
        el.classList.remove("is-leaving");
        if (!spring) motion.reset(sheet, $(".reader__scrim", el));
        paint();
        modal.lock();
        el.classList.add("is-open");
        if (spring) motion.sheetIn(sheet, $(".reader__scrim", el));
        sheet.focus({ preventScroll: true });
      };
      if (fliesFrom(from)) morph(from, () => openIt(false)); else openIt(true);
      requestAnimationFrame(() => { if (isOpen && !el.contains(document.activeElement)) sheet.focus({ preventScroll: true }); });
    } else if (motion.on) { const d = step_dir; paint(); if (d) motion.step(scroller, d); }   // d = 0: dalla tastiera, nessuna animazione
    else if (canVT) withVT(paint, "vt-step");
    else paint();
    document.title = `${s.title} · Sportwire`;
    store.open(s, "d");
    return true;
  }

  let closing = 0;
  function hide() {
    if (!isOpen) return;
    stopListen();
    isOpen = false;
    const my = ++closing;
    if (motion.on) {                                    // esce veloce con Motion, poi si chiude davvero
      el.classList.add("is-leaving");
      motion.sheetOut(sheet, $(".reader__scrim", el)).then(() => {
        if (my !== closing || isOpen) return;
        el.classList.remove("is-leaving", "is-open");  // prima si nasconde (subito, senza transizioni)…
        motion.reset(sheet, $(".reader__scrim", el));  // …poi si tolgono gli stili dell'uscita
      });
    } else el.classList.remove("is-open");
    modal.unlock();
    current = null;
    document.title = document.body.dataset.title || document.title;
    const f = lastFocus; lastFocus = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true });
  }

  /* Ordine delle notizie in pagina: è la sequenza di "successiva" / "precedente". */
  function pageIds(also) {
    const ids = [...new Set($$("[data-id]:not([hidden])").map((n) => n.dataset.id))];
    if (also && !ids.includes(also)) ids.push(also);
    return ids;
  }

  function open(id, ids, from) {
    if (!ID_RX.test(id)) return false;
    if (!document.body.dataset.title) document.body.dataset.title = document.title;
    if (!show(id, ids, from)) return false;
    if (parse() !== id) history.pushState({ sw: 1 }, "", hashFor(id));
    return true;
  }
  function close() {
    if (!isOpen) return;
    if (history.state && history.state.sw && parse()) history.back();
    else { clean(); hide(); }
  }
  let step_dir = 0;
  function step(d, byKey) {
    if (!current) return;
    const i = list.indexOf(current.id);
    const n = list[i + d];
    if (i < 0 || !n) return;
    step_dir = byKey ? 0 : d;                           // frecce e j/k si ripetono molto: niente animazione
    if (show(n)) history.replaceState({ sw: 1 }, "", hashFor(n));
    step_dir = 0;
  }

  const sync = () => {
    const id = parse();
    if (id && (!current || current.id !== id)) {
      if (!show(id)) { loadNews().then(() => { if (parse() === id && !show(id)) { clean(); hide(); } }).catch(() => { clean(); hide(); }); }
    } else if (!id && isOpen) hide();
  };
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);

  return { open, close, step, sync, isOpen: () => isOpen };
})();
