/* GENERATO da build.py: si modifica js/src/*.js */
(() => {
"use strict";
/* Sportwire · js. Nessuna dipendenza, nessun tracker. Tutto ciò che è "tuo" (cronologia) resta in localStorage. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const SECTIONS = { calcio: "Calcio", motori: "Motori", tennis: "Tennis", basket: "Basket", ciclismo: "Ciclismo", altri: "Altri sport" };
const secName = (k) => SECTIONS[k] || (k ? k[0].toUpperCase() + k.slice(1) : "");
const ICON_OUT = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 16L16.5 7.5M9.5 7.5h7v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.6 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const relTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
};
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d, now = new Date()) => {
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return "Oggi";
  if (dayKey(d) === dayKey(y)) return "Ieri";
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
};
const whenLabel = (t) => {
  const d = new Date(t), now = new Date();
  const l = dayLabel(d, now);
  return l === "Oggi" ? `oggi alle ${hhmm(d)}` : l === "Ieri" ? `ieri alle ${hhmm(d)}` : `${l} alle ${hhmm(d)}`;
};

/* Chiavi di storia: 8 esadecimali. */
const ID_RX = /^[0-9a-f]{8}$/;
const cssId = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id);

/* Blocca lo sfondo mentre c'è un overlay: inert + scroll-lock, con contatore per overlay annidati. */
const modal = (() => {
  let n = 0;
  const shell = () => $$(".bar, main, .foot, .fresh");
  return {
    lock() { if (n++ === 0) { document.documentElement.classList.add("is-locked"); shell().forEach((e) => e.setAttribute("inert", "")); } },
    unlock() { if (--n <= 0) { n = 0; document.documentElement.classList.remove("is-locked"); shell().forEach((e) => e.removeAttribute("inert")); } },
  };
})();

/* Tab resta dentro l'overlay. */
const trapTab = (root, e) => {
  if (e.key !== "Tab") return;
  const f = $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', root).filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === a || !root.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
};

/* La tua cronostoria: cosa hai aperto e quando. Solo localStorage, nessun server. */
const store = (() => {
  const KEY = "sw:cronologia:v1", SESS = "sw:sessione";
  const MAX = 600, MAX_AGE = 180 * 864e5, REOPEN = 30 * 60e3;
  let s = read();
  let ids = new Set(s.log.map((e) => e.id));
  let prevSeen = 0;

  function read() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || "null");
      if (j && j.v === 1 && Array.isArray(j.log)) return j;
    } catch { /* dati corrotti: si riparte */ }
    return { v: 1, log: [], seen: 0 };
  }
  const emit = () => document.dispatchEvent(new CustomEvent("sw:store"));
  function write() {
    const cut = Date.now() - MAX_AGE;
    s.log = s.log.filter((e) => e.t > cut).slice(0, MAX);
    ids = new Set(s.log.map((e) => e.id));
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota o navigazione privata: resta in memoria */ }
    emit();
  }

  /* "Dall'ultima volta": il timestamp della sessione precedente, fisso per tutta la sessione corrente. */
  try {
    const cached = sessionStorage.getItem(SESS);
    if (cached === null) { prevSeen = s.seen || 0; sessionStorage.setItem(SESS, String(prevSeen)); s.seen = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ok */ } }
    else prevSeen = Number(cached) || 0;
  } catch { prevSeen = s.seen || 0; }

  addEventListener("storage", (e) => { if (e.key === KEY) { s = read(); ids = new Set(s.log.map((x) => x.id)); emit(); } });

  return {
    log: () => s.log,
    has: (id) => ids.has(id),
    count: () => s.log.length,
    prevSeen: () => prevSeen,
    /* via: "d" = dossier aperto in pagina, "o" = articolo originale aperto */
    open(st, via = "d") {
      const now = Date.now();
      const i = s.log.findIndex((x) => x.id === st.id && now - x.t < REOPEN);
      const old = i >= 0 ? s.log.splice(i, 1)[0] : null;
      s.log.unshift({
        id: st.id, t: now, p: st.ts || "", ti: st.title || "", s: st.source || "", c: st.section || "", k: st.kicker || "",
        l: st.link || "", i: st.image || "", b: String(st.brief || st.summary || "").slice(0, 280),
        v: via === "o" || (old && old.v === "o") ? "o" : "d",
      });
      write();
    },
    remove(id, t) { s.log = s.log.filter((x) => !(x.id === id && x.t === t)); write(); },
    clear() { s.log = []; write(); },
    export: () => ({ app: "sportwire", version: 1, exported: new Date().toISOString(), cronologia: s.log }),
  };
})();

/* Le notizie dell'edizione corrente (data/news.json), caricate una volta sola. */
const NEWS = { data: null, byId: new Map(), ready: false, promise: null };

function indexNews(d) {
  NEWS.data = d;
  NEWS.byId = new Map();
  for (const s of d.stories) {
    s._t = Date.parse(s.ts);
    s.sources = s.sources || [];
    s.items = s.items || [];
    s.related = s.related || [];
    s._nt = norm(s.title);
    s._nk = norm(`${s.kicker} ${secName(s.section)} ${s.source} ${s.sources.join(" ")}`);
    s._nb = norm(`${s.brief} ${s.summary}`);
    s._ni = norm(s.items.map((i) => i.title).join(" "));
    NEWS.byId.set(s.id, s);
  }
  NEWS.ready = true;
  document.dispatchEvent(new CustomEvent("sw:news"));
  return d;
}
function loadNews() {
  if (!NEWS.promise) {
    NEWS.promise = fetch("data/news.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(indexNews)
      .catch((err) => { NEWS.promise = null; throw err; });
  }
  return NEWS.promise;
}

/* Se il JSON non c'è (offline, file:// …) la scheda letta dalla pagina basta per aprire il dossier. */
function storyFromDom(id) {
  const el = $(`[data-id="${cssId(id)}"]`);
  if (!el) return null;
  const a = $("a[data-story]", el);
  const img = $("img", el);
  const kick = $(".kicker", el);
  const time = $("time[datetime]", el);
  const src = $(".meta__src", el);
  const own = $(".brief--own", el);
  const plain = $(".brief:not(.brief--own)", el);
  return {
    id, title: (a ? a.textContent : el.textContent).trim(), link: a ? a.href : "",
    source: src ? src.textContent : "", ts: time ? time.getAttribute("datetime") : "",
    section: el.dataset.c || "", kicker: kick && kick.firstChild ? kick.firstChild.textContent : "",
    image: img ? img.currentSrc || img.src : "", brief: own ? own.textContent.trim() : "", summary: plain ? plain.textContent.trim() : "",
    sources: [], items: [], related: [], live: !!$(".badge--live", el), _from: "dom",
  };
}
function storyFromLog(id) {
  const e = store.log().find((x) => x.id === id);
  if (!e) return null;
  return { id, title: e.ti, link: e.l, source: e.s, ts: e.p || new Date(e.t).toISOString(), section: e.c, kicker: e.k, image: e.i,
    brief: "", summary: e.b, sources: [], items: [], related: [], _from: "log", _readAt: e.t };
}
const getStory = (id) => NEWS.byId.get(id) || storyFromDom(id) || storyFromLog(id);

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

/* Il cielo: ogni notizia è una stella. Asse x = ora di pubblicazione, corsie = sport, grandezza = quante redazioni ne parlano. */
const sky = (() => {
  const LANE_MIN = 84, GAP = 3;
  /* posizioni di prova attorno al punto vero, dalla più vicina: spostamenti orizzontali piccoli prima di salire di livello */
  const CANDS = (() => {
    const out = [];
    for (const dy of [0, -9, 9, -18, 18, -27, 27, -36, 36, -45, 45, -54, 54, -63, 63, -72, 72]) {
      for (const dx of [0, -6, 6, -12, 12, -18, 18]) out.push([dx, dy]);
    }
    return out.sort((a, b) => Math.hypot(a[0] * 1.15, a[1]) - Math.hypot(b[0] * 1.15, b[1]));
  })();
  let root, stage, frame, peek, canvas, svg, stars = [], byLane = new Map(), selected = null, hovered = null, drawn = false;

  const labW = () => (matchMedia("(max-width: 640px)").matches ? 82 : 112);
  const pxPerHour = () => (matchMedia("(max-width: 640px)").matches ? 46 : 58);

  function layout(data) {
    const t1 = Math.max(Date.parse(data.generated), ...data.stories.map((s) => s._t)) + 25 * 60e3;
    const t0 = t1 - data.window_hours * 3600e3;
    const lab = labW();
    const plotW = Math.round(data.window_hours * pxPerHour());
    const order = Object.keys(SECTIONS);
    const lanes = order.filter((k) => data.stories.some((s) => s.section === k));
    const pos = new Map();
    const heights = [];
    lanes.forEach((k) => {
      const ss = data.stories.filter((s) => s.section === k && s._t >= t0).sort((a, b) => a._t - b._t);
      const placed = [];
      ss.forEach((s) => {
        const d = 6 + Math.min(16, Math.max(0, s.score || 0) * 1.05);
        const x = lab + ((s._t - t0) / (t1 - t0)) * plotW;
        const cand = CANDS.map(([dx, dy]) => [x + dx, dy]);
        let px = x, y = 0;
        for (const [cx, cy] of cand) {
          if (placed.every((p) => Math.hypot(p.x - cx, p.y - cy) >= (p.d + d) / 2 + GAP)) { px = cx; y = cy; break; }
        }
        if (px === x && y === 0 && !placed.every((p) => Math.hypot(p.x - x, p.y) >= (p.d + d) / 2 + GAP)) {
          /* nube molto fitta: scala in verticale finché trova posto */
          for (let k3 = 1; k3 < 80; k3++) {
            const yy = (k3 % 2 ? 1 : -1) * Math.ceil(k3 / 2) * 9;
            if (placed.every((p) => Math.hypot(p.x - x, p.y - yy) >= (p.d + d) / 2 + GAP)) { y = yy; break; }
          }
        }
        placed.push({ s, x: px, y, d });
      });
      const lo = Math.min(0, ...placed.map((p) => p.y - p.d / 2)), hi = Math.max(0, ...placed.map((p) => p.y + p.d / 2));
      const h = Math.max(LANE_MIN, hi - lo + 44);
      heights.push(h);
      placed.forEach((p) => { p.dy = -(lo + hi) / 2; });
      pos.set(k, placed);
    });
    return { t0, t1, lab, plotW, lanes, pos, heights };
  }

  function build(data) {
    const L = layout(data);
    const H = L.heights.reduce((a, b) => a + b, 0);
    const W = L.lab + L.plotW + 24;
    stage.innerHTML = "";
    canvas = document.createElement("div");
    canvas.className = "sky__canvas";
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    stage.append(canvas);
    [...frame.querySelectorAll(".sky__labels")].forEach((n) => n.remove());
    const labels = document.createElement("div");
    labels.className = "sky__labels";
    labels.style.height = `${H}px`;
    labels.setAttribute("aria-hidden", "true");
    frame.prepend(labels);

    /* corsie */
    let y0 = 0;
    const laneTop = new Map();
    L.lanes.forEach((k, i) => {
      const h = L.heights[i];
      laneTop.set(k, y0 + h / 2);
      const lane = document.createElement("div");
      lane.className = "sky__lane";
      lane.style.cssText = `top:${y0}px;height:${h}px`;
      canvas.append(lane);
      const lb = document.createElement("div");
      lb.className = "sky__label";
      lb.style.cssText = `top:${y0}px;height:${h}px`;
      lb.innerHTML = `<b>${esc(secName(k))}</b><span>${L.pos.get(k).length}</span>`;
      labels.append(lb);
      y0 += h;
    });

    /* ore */
    const first = new Date(L.t0); first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t <= L.t1; t += 3600e3) {
      const d = new Date(t);
      if (t < L.t0 || d.getHours() % 6) continue;
      const x = L.lab + ((t - L.t0) / (L.t1 - L.t0)) * L.plotW;
      const tick = document.createElement("div");
      tick.className = "sky__tick";
      tick.style.left = `${x}px`;
      tick.innerHTML = `<i>${d.getHours() === 0 ? `${GIORNI[d.getDay()].slice(0, 3)} ${d.getDate()}` : `${pad(d.getHours())}:00`}</i>`;
      canvas.append(tick);
    }
    const nowX = L.lab + ((Date.parse(data.generated) - L.t0) / (L.t1 - L.t0)) * L.plotW;
    const now = document.createElement("div");
    now.className = "sky__now";
    now.style.left = `${nowX}px`;
    now.innerHTML = `<i>edizione ${hhmm(new Date(data.generated))}</i>`;
    canvas.append(now);

    /* linee tra storie collegate, poi le stelle */
    const svgNS = "http://www.w3.org/2000/svg";
    svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "sky__lines");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-hidden", "true");
    canvas.append(svg);

    stars = [];
    const at = new Map();
    let g = 0;
    L.lanes.forEach((k) => {
      L.pos.get(k).forEach((p) => {
        const s = p.s;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "star" + (s.sources.length > 1 ? " star--multi" : "") + (s.live ? " star--live" : "") + (store.has(s.id) ? " is-read" : "");
        b.style.cssText = `left:${p.x}px;top:${laneTop.get(k) + p.dy + p.y}px;--d:${p.d.toFixed(1)}px;--g:${g++ % 14}`;
        b.dataset.sid = s.id;
        b.tabIndex = -1;
        b.setAttribute("aria-label", `${s.title}. ${s.source}, ${whenLabel(s._t)}.${s.sources.length > 1 ? ` Ne scrivono ${s.sources.length} testate.` : ""}`);
        canvas.append(b);
        const rec = { s, el: b, x: p.x, y: laneTop.get(k) + p.dy + p.y, lane: k };
        stars.push(rec);
        at.set(s.id, rec);
      });
    });
    byLane = new Map(L.lanes.map((k) => [k, stars.filter((r) => r.lane === k).sort((a, b) => a.x - b.x)]));
    /* tab stop unico (roving): la stella più recente */
    const lead = stars.slice().sort((a, b) => b.s._t - a.s._t)[0];
    if (lead) lead.el.tabIndex = 0;
    return lead;
  }

  /* Apre la mappa sul "adesso": l'ultima notizia a ~88% dello schermo, così si vedono anche le ore prima. */
  function scrollToNow(lead) {
    if (!lead) { stage.scrollLeft = stage.scrollWidth; return; }
    const view = stage.clientWidth;
    stage.scrollLeft = Math.max(0, Math.min(stage.scrollWidth - view, lead.x - view * 0.88));
  }

  const rec = (id) => stars.find((r) => r.s.id === id);
  const laneIds = (lane) => (byLane.get(lane) || []).slice().sort((a, b) => b.s._t - a.s._t).map((x) => x.s.id);

  function focusOn(r, dim) {
    root.classList.toggle("is-focus", !!r && !!dim);
    stars.forEach((x) => x.el.classList.remove("is-on", "is-rel"));
    while (svg.firstChild) svg.firstChild.remove();
    if (!r) return;
    r.el.classList.add("is-on");
    (r.s.related || []).forEach((id) => {
      const o = rec(id);
      if (!o) return;
      o.el.classList.add("is-rel");
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", r.x); ln.setAttribute("y1", r.y); ln.setAttribute("x2", o.x); ln.setAttribute("y2", o.y);
      svg.append(ln);
    });
  }

  function showPeek(s) {
    const own = !!s.brief;
    const text = s.brief || s.summary || "";
    peek.hidden = false;
    peek.innerHTML = `<div><p class="kicker">${esc(secName(s.section))}${s.kicker && s.kicker !== secName(s.section) ? `<span class="kicker__sub">${esc(s.kicker)}</span>` : ""}${s.live ? '<span class="badge badge--live">Diretta</span>' : ""}</p>
      <h3 class="sky__peek-title">${esc(s.title)}</h3>
      ${text ? `<p class="brief${own ? " brief--own" : ""}">${esc(text)}</p>` : ""}
      <p class="meta"><span class="meta__src">${esc(s.source)}</span><time datetime="${esc(s.ts)}">${esc(relTime(s.ts))}</time>${s.sources.length > 1 ? `<span class="meta__more">+${s.sources.length - 1} ${s.sources.length === 2 ? "testata" : "testate"}</span>` : ""}</p></div>
      <button type="button" class="btn btn--primary" data-peek-open="${esc(s.id)}">Leggi in breve</button>`;
  }

  function select(r, byKey) {
    selected = r;
    focusOn(r);
    if (r) showPeek(r.s);
    if (r && byKey) { stars.forEach((x) => { x.el.tabIndex = x === r ? 0 : -1; }); r.el.focus({ preventScroll: false }); }
  }

  function neighbour(r, dir) {
    const ln = byLane.get(r.lane);
    const i = ln.indexOf(r);
    if (dir === "l") return ln[i - 1] || r;
    if (dir === "r") return ln[i + 1] || r;
    const lanes = [...byLane.keys()];
    const j = lanes.indexOf(r.lane) + (dir === "u" ? -1 : 1);
    const other = byLane.get(lanes[j]);
    if (!other || !other.length) return r;
    return other.reduce((best, c) => (Math.abs(c.x - r.x) < Math.abs(best.x - r.x) ? c : best), other[0]);
  }

  function init() {
    root = $("[data-sky]");
    if (!root || !NEWS.ready) return;
    stage = $("[data-sky-stage]", root);
    frame = $(".sky__frame", root);
    peek = $("[data-sky-peek]", root);
    const lead = build(NEWS.data);
    root.hidden = false;
    drawn = true;
    scrollToNow(lead);
    if (lead) { selected = lead; focusOn(lead, false); showPeek(lead.s); }

    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      stage.addEventListener("pointerover", (e) => {
        const b = e.target.closest(".star");
        if (!b || e.pointerType !== "mouse") return;
        const r = rec(b.dataset.sid);
        if (r) { hovered = r; focusOn(r, true); showPeek(r.s); }
      });
      stage.addEventListener("pointerout", (e) => {
        if (e.pointerType !== "mouse" || !e.target.closest(".star")) return;
        hovered = null;
        focusOn(selected, false); if (selected) showPeek(selected.s);
      });
      /* col dito le stelle (6–8px) sono bersagli minuscoli e nelle nubi si accavallano: vince la più vicina al tocco */
      let lastPT = "mouse";
      stage.addEventListener("pointerdown", (e) => { lastPT = e.pointerType || "mouse"; }, true);
      const nearestStar = (x, y, radius) => {
        let best = null, bd = radius;
        for (const r of stars) {
          const q = r.el.getBoundingClientRect();
          const d = Math.hypot(q.left + q.width / 2 - x, q.top + q.height / 2 - y);
          if (d < bd) { bd = d; best = r; }
        }
        return best;
      };
      stage.addEventListener("click", (e) => {
        let r = null;
        if (lastPT !== "mouse" && e.detail > 0) r = nearestStar(e.clientX, e.clientY, 26);
        if (!r) { const b = e.target.closest(".star"); r = b && rec(b.dataset.sid); }
        if (r) select(r, false);
      });
      stage.addEventListener("focusin", (e) => {
        const b = e.target.closest(".star");
        if (!b) return;
        const r = rec(b.dataset.sid);
        if (r) { stars.forEach((x) => { x.el.tabIndex = x === r ? 0 : -1; }); selected = r; focusOn(r); showPeek(r.s); }
      });
      stage.addEventListener("keydown", (e) => {
        const b = e.target.closest(".star");
        if (!b) return;
        const r = rec(b.dataset.sid);
        const dir = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d" }[e.key];
        if (dir) { e.preventDefault(); const n = neighbour(r, dir); if (n !== r) select(n, true); }
        else if (e.key === "Enter") { e.preventDefault(); reader.open(r.s.id, laneIds(r.lane)); }
      });
      peek.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-peek-open]");
        const r = btn && rec(btn.dataset.peekOpen);
        if (r) reader.open(r.s.id, laneIds(r.lane));
      });
      let rz;
      addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (drawn && NEWS.ready) { const keep = selected && selected.s.id, left = stage.scrollLeft; build(NEWS.data); stage.scrollLeft = left; const r = keep && rec(keep); if (r) { selected = r; focusOn(r, false); } } }, 250); });
    }
  }

  /* Le letture fanno sbiadire le stelle già viste. */
  const refresh = () => { if (!drawn) return; stars.forEach((r) => r.el.classList.toggle("is-read", store.has(r.s.id))); };
  return { init, refresh };
})();

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
    host.innerHTML = stats + tools + list;
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

/* Avvio. */
(() => {
  const home = document.body.dataset.page === "home";

  /* 1. ingresso: solo dissolvenza, un solo observer */
  const targets = $$(".lead, .resume, .sky, .cards > .card, .front__aside, .block, .rows--grid, .hist");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
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
      let shown = 0;
      items.forEach((n) => { const on = f === "*" || n.dataset.k === f; n.hidden = !on; if (on) shown++; });
      if (empty) empty.hidden = shown > 0;
    });
  }

  /* 4. le notizie si aprono dentro Sportwire; l'articolo originale resta a un tocco (e viene registrato) */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target.closest("a[data-story]");
    if (t) { e.preventDefault(); reader.open(t.dataset.story, null); return; }
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
      e.preventDefault(); finder.isOpen() ? finder.close() : finder.open();
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
        requestAnimationFrame(() => b.classList.add("is-in"));
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
})();
