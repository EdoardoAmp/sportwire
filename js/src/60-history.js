/* Cronostoria: la pagina Cronologia, "Riprendi da qui" in prima pagina, i segni "letta" e "nuova". */
const history_ = (() => {
  const uniq = (log) => { const seen = new Set(); return log.filter((e) => !seen.has(e.id) && seen.add(e.id)); };

  /* — segni sulle schede — */
  function paintMarks() {
    $$("[data-id]").forEach((n) => n.classList.toggle("is-read", store.has(n.dataset.id)));
    const prev = store.prevSeen();
    if (!prev || !NEWS.ready) return;
    $$("[data-id]").forEach((n) => {
      const s = NEWS.byId.get(n.dataset.id);
      const k = $(".kicker", n);
      if (!s || !k || $(".new-dot", k) || store.has(s.id) || s._t <= prev) return;
      const d = document.createElement("i");
      d.className = "new-dot"; d.title = "Nuova dall’ultima visita"; d.setAttribute("role", "img"); d.setAttribute("aria-label", "Nuova dall’ultima visita");
      k.append(d);
    });
  }

  function paintCount() {
    const n = store.count();
    $$("[data-hist-count]").forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); });
  }

  /* — Riprendi da qui (prima pagina) — */
  function resume() {
    const box = $("[data-resume]");
    if (!box) return;
    const prev = store.prevSeen();
    const fresh = NEWS.ready && prev ? NEWS.data.stories.filter((s) => s._t > prev).length : 0;
    const last = uniq(store.log()).slice(0, 3);
    if (!last.length && !fresh) { box.hidden = true; return; }
    const parts = [];
    if (fresh) parts.push(`<b>${fresh} ${fresh === 1 ? "notizia nuova" : "notizie nuove"}</b> dall’ultima visita${prev ? `, ${whenLabel(prev)}` : ""}`);
    box.innerHTML = `<div class="resume__head"><h2 class="resume__title" id="h-resume">Riprendi da qui</h2><p class="resume__note">${parts.join(" · ")}</p></div>
      ${last.length ? `<div class="resume__list">${last.map((e) => {
        const live = NEWS.byId.get(e.id);
        const href = live ? `#/s/${e.id}` : e.l;
        return `<a class="resume__item" href="${esc(href)}" ${live ? `data-goto="${esc(e.id)}"` : 'target="_blank" rel="noopener"'}><span class="kicker">${esc(secName(e.c))}</span><strong>${esc(e.ti)}</strong><span class="meta"><span class="meta__src">${esc(e.s)}</span><span>letta ${esc(whenLabel(e.t))}</span></span></a>`;
      }).join("")}</div>` : ""}
      <a class="resume__link" href="cronologia.html">Tutta la cronologia →</a>`;
    box.hidden = false;
  }

  /* — pagina Cronologia — */
  let q = "", armed = 0;

  function mix(log) {
    const c = {};
    log.forEach((e) => { c[e.c] = (c[e.c] || 0) + 1; });
    const rows = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return rows;
  }

  /* Le ultime 12 settimane in un colpo d'occhio (una casella per giorno, colonne = settimane, righe = lunedì…domenica). */
  function heat(all) {
    const WEEKS = 12, now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const counts = new Map();
    all.forEach((e) => { const k = dayKey(new Date(e.t)); counts.set(k, (counts.get(k) || 0) + 1); });
    let active = 0, best = null;
    const cells = [];
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        if (day > today) { cells.push('<i class="cell cell--future"></i>'); continue; }
        const n = counts.get(dayKey(day)) || 0;
        if (n) active++;
        if (n && (!best || n > best.n)) best = { n, day };
        const lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4;
        cells.push(`<i class="cell" data-l="${lvl}"${day.getTime() === today.getTime() ? " data-today" : ""} title="${n} ${n === 1 ? "notizia" : "notizie"} · ${esc(dayLabel(day, now))}"></i>`);
      }
    }
    const sum = `${active} ${active === 1 ? "giorno" : "giorni"} di lettura nelle ultime ${WEEKS} settimane${best ? `; il più intenso ${dayLabel(best.day, now).toLowerCase()}, ${best.n} ${best.n === 1 ? "notizia" : "notizie"}` : ""}.`;
    return `<section class="heat" aria-labelledby="heat-h"><h2 class="heat__title" id="heat-h">Le tue ultime ${WEEKS} settimane</h2>
      <div class="heat__grid" role="img" aria-label="${esc(sum)}">${cells.join("")}</div>
      <div class="heat__foot"><p class="mixkey">${esc(sum)}</p>
      <span class="heat__key" aria-hidden="true">meno ${[0, 1, 2, 3, 4].map((l) => `<i class="cell" data-l="${l}"></i>`).join("")} più</span></div></section>`;
  }

  function page() {
    const host = $("[data-history]");
    if (!host) return;
    const all = store.log();
    if (!all.length) {
      host.innerHTML = `<div class="hist__empty"><p>Ancora niente qui. Apri una notizia dal cielo o dalla prima pagina: la ritrovi in questo diario, con l’ora in cui l’hai letta.</p><a class="btn btn--primary" href="index.html">Vai al cielo</a></div>`;
      return;
    }
    const today = dayKey(new Date());
    const days = new Set(all.map((e) => dayKey(new Date(e.t))));
    const m = mix(all);
    const top = m[0];
    const filt = norm(q);
    const log = filt ? all.filter((e) => norm(`${e.ti} ${e.s} ${secName(e.c)} ${e.k} ${e.b}`).includes(filt)) : all;
    const groups = [];
    log.forEach((e) => {
      const d = new Date(e.t), k = dayKey(d);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push((g = { k, d, items: [] }));
      g.items.push(e);
    });
    const stats = `<div class="hist__stats">
      <div class="stat"><b>${all.length}</b><span>notizie aperte</span></div>
      <div class="stat"><b>${all.filter((e) => dayKey(new Date(e.t)) === today).length}</b><span>oggi</span></div>
      <div class="stat"><b>${days.size}</b><span>${days.size === 1 ? "giorno" : "giorni"} di lettura</span></div>
      <div class="stat"><b>${esc(secName(top[0]))}</b><span>lo sport che segui di più · ${Math.round((top[1] / all.length) * 100)}%</span>
        <div class="mix" aria-hidden="true">${m.map(([k, n]) => `<i style="flex:${n}" title="${esc(secName(k))} ${n}"></i>`).join("")}</div>
        <p class="mixkey">${m.slice(0, 4).map(([k, n]) => `${esc(secName(k))} ${n}`).join(" · ")}</p></div>
    </div>`;
    const tools = `<div class="hist__tools">
      <input class="hist__search" type="search" placeholder="Cerca nella cronologia" aria-label="Cerca nella cronologia" value="${esc(q)}" data-hsearch>
      <button type="button" class="btn btn--quiet" data-export>Esporta</button>
      <button type="button" class="btn btn--quiet" data-clear>${armed ? "Sicuro? Cancella tutto" : "Cancella tutto"}</button>
    </div>`;
    const list = groups.length ? groups.map((g) => `<section class="day" aria-label="${esc(dayLabel(g.d))}">
        <h2 class="day__head">${esc(dayLabel(g.d))}<span>${g.items.length}</span></h2>
        <ol class="trail">${g.items.map((e) => {
          const live = NEWS.byId.get(e.id);
          const href = live ? `#/s/${e.id}` : e.l;
          const via = e.v === "o" ? "articolo originale" : "dossier";
          return `<li class="visit"><time class="visit__time" datetime="${new Date(e.t).toISOString()}">${hhmm(new Date(e.t))}</time>
            <div class="visit__body"><p class="kicker">${esc(secName(e.c))}${e.k && e.k !== secName(e.c) ? `<span class="kicker__sub">${esc(e.k)}</span>` : ""}</p>
              <a class="visit__title" href="${esc(href)}" ${live ? `data-goto="${esc(e.id)}"` : 'target="_blank" rel="noopener"'}>${esc(e.ti)}</a>
              ${e.b ? `<p class="brief">${esc(e.b)}</p>` : ""}
              <p class="meta visit__meta"><span class="meta__src">${esc(e.s)}</span><span>${esc(via)}</span>${live ? '<span class="visit__via">ancora nel cielo di oggi</span>' : ""}</p></div>
            <button type="button" class="visit__rm" data-rm="${esc(e.id)}" data-t="${e.t}" aria-label="Rimuovi “${esc(e.ti)}” dalla cronologia" title="Rimuovi">${ICON_X}</button></li>`;
        }).join("")}</ol></section>`).join("")
      : `<p class="empty">Nessun risultato per “${esc(q)}”.</p>`;
    const keep = document.activeElement && document.activeElement.matches("[data-hsearch]");
    host.innerHTML = stats + heat(all) + tools + list;
    if (keep) { const i = $("[data-hsearch]", host); i.focus(); i.setSelectionRange(q.length, q.length); }
  }

  function bindPage() {
    const host = $("[data-history]");
    if (!host) return;
    host.addEventListener("input", (e) => { if (e.target.matches("[data-hsearch]")) { q = e.target.value; page(); } });
    host.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { store.remove(rm.dataset.rm, Number(rm.dataset.t)); return; }
      if (e.target.closest("[data-export]")) {
        const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = `sportwire-cronologia-${dayKey(new Date())}.json`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return;
      }
      const clr = e.target.closest("[data-clear]");
      if (clr) {
        if (armed) { armed = 0; store.clear(); return; }
        armed = setTimeout(() => { armed = 0; page(); }, 4000);
        page();
        return;
      }
      const a = e.target.closest("a[data-goto]");
      if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); reader.open(a.dataset.goto, uniq(store.log()).map((x) => x.id).filter((id) => NEWS.byId.has(id))); }
    });
  }

  return { paintMarks, paintCount, resume, page, bindPage };
})();
