/* Movimento con Motion (04-motion.js): molle fisiche sulla Web Animations API del browser. Ogni animazione è
   interrompibile (se ne parte un'altra riprende da dov'è) e usa solo transform e opacity, quindi gira fuori dal
   thread principale anche mentre la pagina carica. Con «riduci movimento» non parte niente: le pagine restano ferme
   e ogni stato arriva subito. Senza Web Animations API (browser vecchi) idem: il sito funziona uguale. */
const motion = (() => {
  const M = typeof Motion === "object" && Motion ? Motion : null;
  const can = !!M && typeof Element.prototype.animate === "function";
  const on = can && !reduce;
  /* Con «riduci movimento» niente spostamenti né molle: restano solo dissolvenze brevi (0,2 s) dove aiutano a capire
     cosa è cambiato (dossier che si apre, elenco filtrato). Niente contenuti nascosti in attesa di comparire. */
  const calm = can && reduce;
  if (on) document.documentElement.classList.add("mo");
  const spring = (visualDuration, bounce = 0) => (on ? { type: M.spring, visualDuration, bounce } : {});
  const SNAPPY = () => spring(0.32, 0), SOFT = () => spring(0.46, 0.14), POP = () => spring(0.34, 0.42);

  /* Animazione sicura: niente se il movimento è ridotto o l'elemento non c'è; mai un errore che rompa la pagina.
     Motion a fine corsa scrive i valori finali nello style dell'elemento: qui si tolgono (sono gli stessi del CSS),
     altrimenti un transform «none» in linea blocca per sempre :hover, :active e gli stati del CSS. keep = li lascia. */
  const list = (el) => (el instanceof Element ? [el] : Array.from(el || []));
  function go(el, keyframes, options, keep = false) {
    const els = list(el);
    if ((!on && !calm) || !els.length) return null;
    if (calm) {
      if (!("opacity" in keyframes)) return null;
      keyframes = { opacity: keyframes.opacity };
      options = { duration: 0.2, ease: "easeOut" };
    }
    try {
      const a = M.animate(els, keyframes, options);
      if (!keep) a.finished.then(() => els.forEach((n) => { for (const k in keyframes) n.style[k] = ""; }), () => {});
      return a;
    } catch { return null; }
  }
  /* ferma subito le animazioni in corso e toglie gli stili lasciati in linea (riapertura durante una chiusura…) */
  function reset(...els) {
    els.flat().filter(Boolean).forEach((n) => { n.getAnimations().forEach((a) => a.cancel()); n.style.opacity = ""; n.style.transform = ""; });
  }

  /* — ingresso della prima pagina: apertura, poi le schede a cascata; il resto entra quando arriva nello schermo — */
  function entrance() {
    if (!on) return false;
    const lead = $(".lead");
    if (lead) {
      const parts = $$(".lead__text > *", lead);
      go(parts, { opacity: [0, 1], transform: ["translateY(14px)", "none"] }, { ...SOFT(), delay: M.stagger(0.05) });
      const planet = $(".planet", lead);
      if (planet) go(planet, { opacity: [0, 1], transform: ["scale(.9) rotate(-8deg)", "none"] }, { ...spring(0.7, 0.2), delay: 0.08 });
      const moons = $$(".moon", lead);
      if (moons.length) go(moons, { opacity: [0, 1] }, { duration: 0.35, delay: M.stagger(0.07, { startDelay: 0.35 }) });
    }
    const pageHead = $$(".page-title, .page-sub, .page-meta, .chips");
    go(pageHead, { opacity: [0, 1], transform: ["translateY(12px)", "none"] }, { ...SOFT(), delay: M.stagger(0.05) });
    /* gruppi che entrano insieme quando compaiono: le schede in cascata, i blocchi in blocco */
    /* Cascata solo per i gruppi piccoli di schede grandi; il registro (12 righe) e gli elenchi lunghi entrano in blocco:
       una animazione invece di dodici, mentre la pagina sta scorrendo. */
    const groups = [[".cards", ":scope > .card"], [".follow__list", ":scope > .follow__item"], [".resume__list", ":scope > .resume__item"]];
    /* Si nasconde solo ciò che sta sotto lo schermo e si mostra quando ci arriva. Se l'osservatore non scatta (fondo
       della pagina, stampa, salto con un link) ci pensano scrollend, il fondo pagina e la stampa: mai un buco. */
    const hidden = new Set();
    const below = (el) => el.getBoundingClientRect().top > innerHeight * 0.92;
    const reveal = (els, kf, opts) => { els.forEach((x) => { hidden.delete(x); x.style.opacity = ""; }); go(els, kf, opts); };
    for (const [box, kids] of groups) {
      $$(box).forEach((g) => {
        const items = $$(kids, g).filter((x) => !x.hidden);
        if (!items.length || !below(g)) return;       // una sola misura per gruppo, al caricamento
        items.forEach((x) => { x.style.opacity = "0"; hidden.add(x); });
        M.inView(g, () => {
          reveal(items.slice(0, 6), { opacity: [0, 1], transform: ["translateY(16px)", "none"] }, { ...SOFT(), delay: M.stagger(0.04) });
          items.slice(6).forEach((x) => { hidden.delete(x); x.style.opacity = ""; });
        }, { margin: "0px 0px -6% 0px" });
      });
    }
    $$(".sky, .block, .front__aside, .hist").forEach((el) => {
      if (!below(el)) return;
      el.style.opacity = "0"; hidden.add(el);
      M.inView(el, () => reveal([el], { opacity: [0, 1], transform: ["translateY(22px)", "none"] }, SOFT()), { margin: "0px 0px -4% 0px" });
    });
    /* Rete di sicurezza senza misure di layout: arrivati al piè di pagina (o in stampa) tutto ciò che è ancora nascosto
       si mostra. inView usa IntersectionObserver, che il browser calcola fuori dal thread principale. */
    const showAll = () => { hidden.forEach((x) => { x.style.opacity = ""; }); hidden.clear(); };
    const foot = $(".foot");
    if (foot) M.inView(foot, () => { showAll(); });
    addEventListener("beforeprint", showAll);
    return true;
  }

  /* — il dossier: entra con una molla da destra (o dal basso, sul telefono), esce veloce — */
  const narrow = () => matchMedia("(max-width: 640px)").matches;
  const EASE_OUT = [0.23, 1, 0.32, 1];                 // ease-out forte: parte subito, si posa piano
  function sheetIn(sheet, scrim) {
    if ((!on && !calm) || !sheet) return;
    /* Riaperto mentre usciva: Motion ferma l'uscita e (con null) riparte dal punto in cui era, senza salti. */
    const back = sheet.getAnimations().length > 0;
    go(scrim, { opacity: [back ? null : 0, 1] }, { duration: 0.22, ease: EASE_OUT });
    go(sheet, { transform: [back ? null : narrow() ? "translateY(40px)" : "translateX(48px)", "none"], opacity: [back ? null : 0.6, 1] }, SNAPPY());
    const body = $$(".reader__body > *", sheet).slice(0, 6);
    if (body.length && !back) go(body, { opacity: [0, 1], transform: ["translateY(10px)", "none"] }, { ...SOFT(), delay: M.stagger(0.035, { startDelay: 0.06 }) });
  }
  function sheetOut(sheet, scrim) {
    if (!on) return Promise.resolve();
    /* uscita più corta dell'entrata (chi chiude ha già deciso); gli stili restano finché il pannello non è nascosto */
    const a = go(sheet, { transform: narrow() ? "translateY(28px)" : "translateX(36px)", opacity: 0 }, { duration: 0.2, ease: EASE_OUT }, true);
    go(scrim, { opacity: 0 }, { duration: 0.2, ease: EASE_OUT }, true);
    return a ? a.finished.catch(() => {}) : Promise.resolve();
  }
  /* passo alla notizia dopo (d = 1) o prima (d = -1): il contenuto scivola nel verso del gesto. Mai da opacità 0:
     il vecchio contenuto sparisce subito, quindi il nuovo parte già visibile e il pannello non resta mai vuoto. */
  function step(scroller, d) {
    if (!on || !scroller) return;
    const photo = $(".reader__photo", scroller);
    if (photo) go(photo, { opacity: [0.55, 1], transform: ["scale(1.015)", "none"] }, SNAPPY());
    const kids = $$(".reader__body > *", scroller).slice(0, 5);
    go(kids, { opacity: [0.35, 1], transform: [`translateX(${d * 22}px)`, "none"] }, { ...SNAPPY(), delay: M.stagger(0.025) });
  }

  /* — la ricerca è la tavolozza dei comandi (/ o ⌘K): dalla tastiera si apre e si chiude senza animazione, come
       Raycast; toccando la lente entra con un colpo di molla corto. I risultati mentre si scrive non si animano mai. — */
  function finderIn(box) { go(box, { opacity: [0, 1], transform: ["translateY(-8px) scale(.985)", "none"] }, spring(0.2, 0)); }

  /* — piccoli momenti: la stella scelta nel cielo, il «segui», l'anteprima, le schede che si riordinano — */
  function pop(el) { go(el, { transform: ["scale(1)", "scale(1.75)", "scale(1.55)"] }, POP()); }
  function peek(el) {
    const kids = el && $$(":scope > div > *, :scope > .btn", el);
    go(kids, { opacity: [0.2, 1], transform: ["translateY(6px)", "none"] }, { ...SNAPPY(), delay: M.stagger(0.025) });
  }
  function fresh(el) { go(el, { opacity: [0, 1], transform: ["translate(-50%, 24px) scale(.95)", "translate(-50%, 0) scale(1)"] }, POP()); }
  /* elenco filtrato (chip delle sezioni): le schede rimaste si ricompongono in cascata */
  function filtered(items) {
    const shown = items.filter((n) => !n.hidden);
    /* Il filtro rimescola le schede: nessuna deve restare nascosta in attesa dell'ingresso (che guardava le posizioni di
       prima) né a metà di un'animazione del filtro precedente. */
    items.forEach((n) => { n.getAnimations().forEach((a) => a.cancel()); n.style.opacity = ""; n.style.transform = ""; });
    const first = shown.filter((n) => n.getBoundingClientRect().top < innerHeight * 1.2).slice(0, 12);
    go(first, { opacity: [0, 1], transform: ["translateY(10px) scale(.985)", "none"] }, { ...SNAPPY(), delay: M.stagger(0.02) });
  }
  function box(el) { go(el, { opacity: [0, 1], transform: ["translateY(10px) scale(.99)", "none"] }, SOFT()); }

  /* — il cielo si accende quando arriva nello schermo: una tenda che si apre da destra (le notizie più recenti) verso
       sinistra, a ritroso nel tempo. UNA sola animazione sul contenitore (clip-path, fatto dal compositore), non una per
       stella: con 200 stelle animate una per una il browser ricalcolava lo stile di tutte a ogni fotogramma e lo
       scorrimento della pagina andava a scatti. Si vede una volta sola per visita. — */
  function stars(canvas, stage) {
    if (!on || !canvas) return;
    canvas.style.clipPath = "inset(0 0 0 100%)";
    const light = () => {
      canvas.style.clipPath = "";
      go(canvas, { clipPath: ["inset(0 0 0 100%)", "inset(0 0 0 0%)"], opacity: [0.2, 1] }, { duration: 1.1, ease: [0.23, 1, 0.32, 1] });
    };
    const r = stage.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) light();
    else M.inView(stage, () => { light(); }, { margin: "0px 0px -10% 0px" });
    addEventListener("beforeprint", () => { canvas.style.clipPath = ""; }, { once: true });
  }

  /* — il cielo cambia finestra (12 ore / tutta l'edizione): ogni stella scivola dalla posizione di prima alla nuova
       con una molla (FLIP: si misura prima e dopo, si anima solo il transform); quelle che entrano nella finestra
       compaiono. Si animano solo le stelle dentro la vista: le altre non si vedono. Con «riduci movimento» la mappa
       si ridisegna con una dissolvenza di 0,2 s. — */
  function glide(recs, before, stage, canvas) {
    if (calm) { go(canvas, { opacity: [0.35, 1] }, {}); return; }
    if (!on || !recs.length) return;
    const sr = stage.getBoundingClientRect();
    recs.forEach((r, i) => {
      const q = r.el.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
      if (x < sr.left - 60 || x > sr.right + 60) return;
      const cs = getComputedStyle(r.el), end = cs.transform === "none" ? "" : cs.transform;
      const was = before.get(r.s.id);
      if (was) {
        go(r.el, { transform: [`translate(${(was[0] - x).toFixed(1)}px, ${(was[1] - y).toFixed(1)}px) ${end}`, end || "none"] },
          { ...spring(0.5, 0.16), delay: Math.min(i, 40) * 0.004 });
      } else {
        go(r.el, { opacity: [0, cs.opacity], transform: [`scale(.3) ${end}`, end || "none"] }, { ...spring(0.45, 0.2), delay: 0.12 });
      }
    });
    go($$(".sky__tick, .sky__now", canvas), { opacity: [0, 1] }, { duration: 0.3, ease: [0.23, 1, 0.32, 1] });
  }

  return { on, entrance, sheetIn, sheetOut, step, finderIn, pop, peek, fresh, filtered, box, reset, stars, glide };
})();
