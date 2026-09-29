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
