/* Cerca tra le notizie dell'edizione ( / oppure ⌘K ). Tocca solo dati già scaricati: nessuna richiesta a terzi. */
const finder = (() => {
  let el, input, listEl, results = [], sel = 0, isOpen = false, lastFocus = null;

  function build() {
    el = document.createElement("div");
    el.className = "finder";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Cerca tra le notizie");
    el.innerHTML = `<div class="finder__scrim" data-close></div>
      <div class="finder__box">
        <div class="finder__field">${ICON_SEARCH}
          <input class="finder__input" type="search" placeholder="Cerca una squadra, un pilota, una notizia…" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="finder-list" aria-label="Cerca">
          <kbd class="finder__esc" data-close>ESC</kbd>
        </div>
        <div class="finder__list" id="finder-list" role="listbox" aria-label="Risultati"></div>
      </div>`;
    document.body.append(el);
    input = $("input", el);
    listEl = $(".finder__list", el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      const hit = e.target.closest(".hit");
      if (hit) pick(hit.dataset.id);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) pick(results[sel].id); }
      else trapTab(el, e);
    });
    input.addEventListener("input", () => run(input.value));
  }

  const allStories = () => (NEWS.ready ? NEWS.data.stories : $$("[data-id]").map((n) => storyFromDom(n.dataset.id)).filter(Boolean));

  function score(s, toks) {
    let sc = 0;
    for (const t of toks) {
      let hit = 0;
      if (s._nt && s._nt.includes(t)) hit = 6 + (s._nt.startsWith(t) || s._nt.includes(" " + t) ? 2 : 0);
      else if (s._nk && s._nk.includes(t)) hit = 4;
      else if (s._ni && s._ni.includes(t)) hit = 3;
      else if (s._nb && s._nb.includes(t)) hit = 2;
      if (!hit) return 0;
      sc += hit;
    }
    return sc + Math.min(3, (s.score || 0) / 6);
  }

  /* Evidenzia i termini cercati ignorando accenti e maiuscole; indici riportati sul testo originale. */
  const mark = (title, toks) => {
    const chars = [...title];
    let plain = "";
    const map = [];
    chars.forEach((c, i) => {
      const b = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      for (const x of b) { plain += x; map.push(i); }
    });
    const on = new Array(chars.length).fill(false);
    for (const t of toks) {
      if (t.length < 2) continue;
      let from = 0, at;
      while ((at = plain.indexOf(t, from)) >= 0) {
        for (let k = at; k < at + t.length; k++) on[map[k]] = true;
        from = at + t.length;
      }
    }
    let out = "", open = false;
    chars.forEach((c, i) => {
      if (on[i] && !open) { out += "<mark>"; open = true; }
      if (!on[i] && open) { out += "</mark>"; open = false; }
      out += esc(c);
    });
    return out + (open ? "</mark>" : "");
  };

  function hitHtml(s, i, toks) {
    return `<button type="button" class="hit" role="option" id="hit-${i}" data-id="${esc(s.id)}" aria-selected="${i === sel}">
      <span class="hit__t">${toks.length ? mark(s.title, toks) : esc(s.title)}</span>
      <span class="hit__m">${esc(secName(s.section))} · ${esc(s.source)} · ${esc(relTime(s.ts))}${store.has(s.id) ? " · già letta" : ""}</span></button>`;
  }

  function run(q) {
    const toks = norm(q).split(" ").filter(Boolean);
    let html = "";
    results = [];
    if (!toks.length) {
      const seen = new Set();
      const recent = store.log().filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, 4).map((e) => getStory(e.id)).filter(Boolean);
      const top = allStories().filter((s) => !seen.has(s.id)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
      let i = 0;
      const group = (label, arr) => {
        if (!arr.length) return "";
        results.push(...arr);
        return `<p class="finder__group">${label}</p>` + arr.map((s) => hitHtml(s, i++, [])).join("");
      };
      html = group("Le tue ultime letture", recent) + group("In apertura", top);
      if (!NEWS.ready) html += '<p class="finder__empty">Carico le notizie…</p>';
    } else {
      const scored = allStories().map((s) => [score(s, toks), s]).filter(([sc]) => sc > 0)
        .sort((a, b) => b[0] - a[0] || (b[1]._t || 0) - (a[1]._t || 0)).slice(0, 30);
      results = scored.map(([, s]) => s);
      html = results.length
        ? `<p class="finder__group">${results.length} ${results.length === 1 ? "risultato" : "risultati"}</p>` + results.map((s, i) => hitHtml(s, i, toks)).join("")
        : `<p class="finder__empty">Niente per “${esc(q.trim())}” nelle ultime ore. Prova con un cognome o una squadra.</p>`;
    }
    sel = 0;
    listEl.innerHTML = html;
    paint();
  }

  function paint() {
    $$(".hit", listEl).forEach((h, i) => h.setAttribute("aria-selected", String(i === sel)));
    const cur = $$(".hit", listEl)[sel];
    if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function move(d) { if (!results.length) return; sel = (sel + d + results.length) % results.length; paint(); }

  function pick(id) {
    const ids = results.map((s) => s.id);
    close(true);
    reader.open(id, ids.length > 1 ? ids : null);
  }

  function openIt() {
    if (isOpen) return;
    if (!el) build();
    lastFocus = document.activeElement;
    isOpen = true;
    modal.lock();
    el.classList.add("is-open");
    input.value = "";
    run("");
    requestAnimationFrame(() => input.focus());
    if (!NEWS.ready) loadNews().then(() => { if (isOpen) run(input.value); }).catch(() => {});
  }
  function close(skipFocus) {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("is-open");
    modal.unlock();
    if (!skipFocus && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  return { open: openIt, close, isOpen: () => isOpen };
})();
