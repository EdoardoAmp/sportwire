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
