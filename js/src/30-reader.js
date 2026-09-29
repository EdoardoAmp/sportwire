/* Il dossier: la notizia letta dentro Sportwire (foto, in breve, ora per ora, storie collegate).
   URL profondo #/s/<id>: il tasto Indietro lo chiude, il link si può condividere con se stessi. */
const reader = (() => {
  let el, sheet, scroller, posEl, prevBtn, nextBtn;
  let list = [], current = null, lastFocus = null, isOpen = false;

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
      const a = e.target.closest("a[data-goto]");
      if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); open(a.dataset.goto, null); return; }
      const out = e.target.closest("a[data-visit]");
      if (out && current) store.open(current, "o");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "ArrowLeft" && !e.altKey && !e.metaKey) { e.preventDefault(); step(-1); return; }
      if (e.key === "ArrowRight" && !e.altKey && !e.metaKey) { e.preventDefault(); step(1); return; }
      trapTab(sheet, e);
    });
  }

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

  function render(s) {
    const own = !!s.brief;
    const text = s.brief || s.summary || "";
    const others = (s.sources || []).filter((x) => x !== s.source);
    const box = text
      ? `<div class="reader__box"><p class="eyebrow">${own ? "In breve · riscritta da Sportwire" : "Dalla testata"}</p><p class="reader__brief${own ? "" : " reader__brief--src"}">${esc(text)}</p><p class="reader__note">${own
        ? "Riscrittura di Sportwire a partire da ciò che pubblicano le testate: per i dettagli c’è l’articolo originale."
        : "Per ora c’è il sommario della testata: la riscrittura in breve arriva al prossimo aggiornamento."}</p></div>`
      : "";
    scroller.innerHTML = `${photo(s)}<div class="reader__body">
      <div><p class="kicker">${esc(secName(s.section))}${s.kicker && s.kicker !== secName(s.section) ? `<span class="kicker__sub">${esc(s.kicker)}</span>` : ""}${s.live ? '<span class="badge badge--live">Diretta</span>' : ""}</p>
      <h2 class="reader__title" id="rd-title">${esc(s.title)}</h2></div>
      <p class="meta"><span class="meta__src">${esc(s.source)}</span><time datetime="${esc(s.ts)}">${esc(relTime(s.ts))}</time>${others.length ? `<span class="meta__more">+${others.length} ${others.length === 1 ? "testata" : "testate"}: ${esc(others.join(", "))}</span>` : ""}</p>
      ${box}
      <div class="reader__actions">
        <a class="btn btn--primary" href="${esc(s.link)}" target="_blank" rel="noopener" data-visit>Leggi su ${esc(s.source || "la testata")} ${ICON_OUT}</a>
      </div>
      ${chrono(s)}${related(s)}
    </div>`;
    scroller.scrollTop = 0;
  }

  function updateNav() {
    const i = list.indexOf(current.id);
    posEl.textContent = list.length > 1 && i >= 0 ? `${i + 1} di ${list.length}` : "Dossier";
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i < 0 || i >= list.length - 1;
  }

  function show(id, ids) {
    const s = getStory(id);
    if (!s) return false;
    if (!el) build();
    if (ids && ids.length) list = ids;
    else if (!list.includes(id)) list = pageIds(id);
    const first = !isOpen;
    current = s;
    render(s);
    updateNav();
    el.setAttribute("aria-labelledby", "rd-title");
    if (first) {
      lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      modal.lock();
      isOpen = true;
      el.classList.add("is-open");
      requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
    }
    document.title = `${s.title} · Sportwire`;
    store.open(s, "d");
    return true;
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("is-open");
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

  function open(id, ids) {
    if (!ID_RX.test(id)) return false;
    if (!document.body.dataset.title) document.body.dataset.title = document.title;
    if (!show(id, ids)) return false;
    if (parse() !== id) history.pushState({ sw: 1 }, "", hashFor(id));
    return true;
  }
  function close() {
    if (!isOpen) return;
    if (history.state && history.state.sw && parse()) history.back();
    else { clean(); hide(); }
  }
  function step(d) {
    if (!current) return;
    const i = list.indexOf(current.id);
    const n = list[i + d];
    if (i < 0 || !n) return;
    if (show(n)) history.replaceState({ sw: 1 }, "", hashFor(n));
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
