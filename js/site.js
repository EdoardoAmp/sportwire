/* Sportwire · js minimale: un solo reveal orchestrato, orari relativi, aggiornamento del wire.
   Nessuna dipendenza, nessun tracker, nessuna richiesta a terze parti. */
(() => {
  "use strict";

  /* 1. Reveal: IntersectionObserver, solo opacity + transform (niente listener di scroll). */
  const revealTargets = document.querySelectorAll(".rail, .feature, .intro, .colophon");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => el.classList.add("reveal", "is-in"));
  } else {
    revealTargets.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
    revealTargets.forEach((el) => io.observe(el));
    /* sopra la piega subito visibile */
    requestAnimationFrame(() => document.querySelectorAll(".intro, .feature").forEach((el) => el.classList.add("is-in")));
  }

  /* 2. Orari: "3 min fa" accanto all'ora esatta. */
  const fmt = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "adesso";
    if (min < 60) return `${min} min fa`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
    return `${Math.round(h / 24)} g fa`;
  };
  const ages = () => document.querySelectorAll("time[datetime]").forEach((t) => {
    const rel = fmt(t.getAttribute("datetime"));
    if (rel && t.dataset.rel !== rel) { t.dataset.rel = rel; t.title = rel; }
  });
  ages();
  setInterval(ages, 60000);

  /* 3. Wire dal vivo: se la pagina è servita via http(s) e data/news.json è più fresco, sostituisci le prime voci. */
  if (location.protocol.startsWith("http")) {
    const wire = document.getElementById("live-wire");
    if (wire) {
      const refresh = async () => {
        try {
          const res = await fetch("data/news.json", { cache: "no-store" });
          if (!res.ok) return;
          const { items } = await res.json();
          if (!Array.isArray(items) || !items.length) return;
          const first = wire.querySelector("time[datetime]");
          if (first && new Date(items[0].ts) <= new Date(first.getAttribute("datetime"))) return;
          wire.innerHTML = items.slice(0, 18).map((it) => `
            <li class="wire__item">
              <a class="wire__link" href="${it.link}" rel="noopener">
                <span class="wire__meta"><span class="wire__src">${it.source}</span>
                  <time class="wire__time" datetime="${it.ts}">${new Date(it.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time></span>
                <span class="wire__title">${it.title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</span>
              </a>
            </li>`).join("");
          ages();
        } catch { /* offline: la pagina statica resta valida */ }
      };
      setInterval(refresh, 300000);
    }
  }
})();