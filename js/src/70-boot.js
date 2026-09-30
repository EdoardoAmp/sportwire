/* Avvio. */
(() => {
  const home = document.body.dataset.page === "home";

  /* 1. ingresso: con Motion l'apertura entra a cascata e le schede con una molla quando arrivano nello schermo
        (08-motion-ui.js); senza Motion resta la dissolvenza semplice qui sotto. */
  const targets = $$(".lead, .resume, .sky, .cards > .card, .front__aside, .block, .rows--grid, .hist");
  if (!motion.entrance() && !reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0 });   // soglia 0: un elemento altissimo (cronologia lunga) non potrebbe mai superare una percentuale
    targets.forEach((n) => { n.classList.add("reveal"); io.observe(n); });
  }

  /* 2. orari relativi sempre veri */
  const tick = () => $$("time[data-rel]").forEach((t) => {
    const txt = relTime(t.getAttribute("datetime"));
    if (txt && t.textContent !== txt) t.textContent = txt;
    t.title = new Date(t.getAttribute("datetime")).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
  });
  tick(); setInterval(tick, 60000);

  /* 3. filtri per argomento (pagine di sezione) */
  const chips = $(".chips");
  if (chips) {
    chips.hidden = false;
    const items = $$("[data-hit][data-k]");
    const empty = $(".empty");
    chips.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".chip");
      if (!btn) return;
      const f = btn.dataset.filter;
      $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
      if (chips.scrollWidth > chips.clientWidth) chips.scrollTo({ left: btn.offsetLeft - chips.clientWidth / 2 + btn.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
      const apply = () => {
        let shown = 0;
        items.forEach((n) => { const on = f === "*" || (f === "__mine" ? n.classList.contains("is-mine") : n.dataset.k === f); n.hidden = !on; if (on) shown++; });
        if (empty) empty.hidden = shown > 0;
      };
      if (motion.on) { apply(); motion.filtered(items); } else withVT(apply);
    });
  }

  /* 3b. barra delle sezioni su telefono: scorre in orizzontale. La sezione aperta si vede sempre, e le sfumature
     sui bordi compaiono solo dove c'è altro da scoprire. */
  const links = $(".pill__links");
  if (links) {
    const edges = () => {
      links.classList.toggle("at-start", links.scrollLeft < 4);
      links.classList.toggle("at-end", links.scrollLeft + links.clientWidth >= links.scrollWidth - 4);
    };
    const cur = $('[aria-current="page"]', links);
    if (cur && links.scrollWidth > links.clientWidth) links.scrollTo({ left: cur.offsetLeft - links.clientWidth / 2 + cur.offsetWidth / 2, behavior: "instant" });
    edges();
    links.addEventListener("scroll", edges, { passive: true });
    addEventListener("resize", edges, { passive: true });
  }

  /* 4. le notizie si aprono dentro Sportwire; l'articolo originale resta a un tocco (e viene registrato) */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target.closest("a[data-story]");
    if (t) {
      e.preventDefault();
      const card = t.closest("[data-id]");
      reader.open(t.dataset.story, null, card && $(".card__media, .lead__planet", card));
      return;
    }
    const ext = e.target.closest('[data-id] a[href^="http"]');
    if (ext) {
      const s = getStory(ext.closest("[data-id]").dataset.id);
      if (s) store.open(s, "o");
    }
  });
  const opener = e => { const b = e.target.closest("[data-open-search]"); if (b) finder.open(); };
  document.addEventListener("click", opener);
  addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.target.isContentEditable;
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
      if (reader.isOpen()) return;
      e.preventDefault(); finder.isOpen() ? finder.close() : finder.open(true);
    }
  });

  /* 5. dati, cielo, cronologia */
  history_.bindPage();
  const paint = () => { history_.paintCount(); history_.paintMarks(); sky.refresh(); };
  document.addEventListener("sw:store", () => { paint(); history_.resume(); history_.page(); });
  paint(); history_.page();
  loadNews().then(() => { sky.init(); history_.resume(); paint(); history_.page(); reader.sync(); }).catch(() => { history_.resume(); reader.sync(); });

  /* 6. nuova edizione: controllo ogni 5 minuti */
  const stamp = $("[data-stamp]");
  if (stamp && location.protocol.startsWith("http")) {
    const mine = new Date(stamp.getAttribute("datetime")).getTime();
    let shown = false;
    const check = async () => {
      if (shown || document.hidden) return;
      try {
        const r = await fetch("data/news.json", { cache: "no-store" });
        if (!r.ok) return;
        const { generated } = await r.json();
        if (new Date(generated).getTime() - mine < 60000) return;
        shown = true;
        const b = document.createElement("button");
        b.type = "button"; b.className = "fresh";
        b.innerHTML = '<span class="pulse" aria-hidden="true"></span>Nuova edizione · aggiorna';
        b.addEventListener("click", () => location.reload());
        document.body.append(b);
        requestAnimationFrame(() => { b.classList.add("is-in"); motion.fresh(b); });
      } catch { /* offline: la pagina resta valida */ }
    };
    setInterval(check, 300000);
    document.addEventListener("visibilitychange", check);
  }

  /* 7. installabile e leggibile offline (solo su https o localhost) */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
