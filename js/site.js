/* Sportwire · js minimale, nessuna dipendenza, nessun tracker.
   1. ingresso morbido dei blocchi   2. orari relativi sempre giusti
   3. filtri per argomento nelle sezioni   4. avviso quando esce un'edizione nuova */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. Ingresso: solo opacity + transform, un solo observer. */
  const targets = [...document.querySelectorAll(".hero, .cards > .card, .front__aside, .block, .rows--grid, .colophon")];
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    let i = 0;
    targets.forEach((el) => {
      el.classList.add("reveal");
      if (el.matches(".cards > .card")) el.style.setProperty("--i", String(i++ % 6));
      io.observe(el);
    });
  }

  /* 2. Orari relativi: la pagina è statica, ma "12 min fa" deve restare vero. */
  const rel = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "adesso";
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };
  const tick = () => document.querySelectorAll("time[data-rel]").forEach((t) => {
    const txt = rel(t.getAttribute("datetime"));
    if (txt && t.textContent !== txt) t.textContent = txt;
    t.title = new Date(t.getAttribute("datetime")).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
  });
  tick();
  setInterval(tick, 60000);

  /* 3. Filtri per argomento (pagine di sezione). Senza JS i filtri restano nascosti e si vede tutto. */
  const chips = document.querySelector(".chips");
  if (chips) {
    chips.hidden = false;
    const items = [...document.querySelectorAll("[data-hit][data-k]")];
    const empty = document.querySelector(".empty");
    chips.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".chip");
      if (!btn) return;
      const f = btn.dataset.filter;
      chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
      let shown = 0;
      items.forEach((el) => {
        const on = f === "*" || el.dataset.k === f;
        el.hidden = !on;
        if (on) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  }

  /* 4. Nuova edizione: controlla data/news.json ogni 5 minuti; se è più recente, un avviso discreto. */
  const stamp = document.querySelector(".masthead__status time");
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
        b.type = "button";
        b.className = "fresh";
        b.innerHTML = '<span class="pulse" aria-hidden="true"></span>Nuova edizione · aggiorna';
        b.addEventListener("click", () => location.reload());
        document.body.append(b);
        requestAnimationFrame(() => b.classList.add("is-in"));
      } catch { /* offline: la pagina resta valida */ }
    };
    setInterval(check, 300000);
    document.addEventListener("visibilitychange", check);
  }
})();
