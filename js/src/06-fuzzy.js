/* Ricerca tollerante ai refusi (uFuzzy, qui sopra). Serve solo quando la ricerca esatta non trova abbastanza:
   «pogachar» → Pogacar, «orsatto» → Orsato. Gira sui titoli già scaricati, niente rete. */
const fuzzy = (() => {
  const uf = typeof uFuzzy === "function"
    ? new uFuzzy({ intraMode: 1, intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1 })   // un errore per parola: scambio, lettera in più/in meno/sbagliata
    : null;
  const flat = (t) => uFuzzy.latinize(String(t ?? ""));
  return {
    /* haystack: array di testi. Ritorna [{ i, ranges }] dal più pertinente, al più `max`. Sotto le 4 lettere ogni cosa «somiglia» a ogni cosa: niente. */
    find(haystack, q, max = 8) {
      const needle = flat(q).trim();
      if (!uf || needle.replace(/[^a-z0-9]/gi, "").length < 4) return [];
      const hay = haystack.map(flat);
      let res;
      try { res = uf.search(hay, needle, 3, 1e3); } catch { return []; }
      const [idxs, info, order] = res || [];
      if (!idxs || !idxs.length || !info || !order) return [];
      return order.slice(0, max).map((o) => {
        const i = info.idx[o];
        return { i, ranges: hay[i].length === String(haystack[i] ?? "").length ? info.ranges[o] : null };   // se latinize ha cambiato la lunghezza, non si evidenzia
      });
    },
    /* Il testo con le parti trovate in <mark>, tutto con l'escape. */
    mark(text, ranges) {
      const t = String(text ?? "");
      return ranges && ranges.length ? uFuzzy.highlight(t, ranges, (part, hit) => (hit ? `<mark>${esc(part)}</mark>` : esc(part))) : esc(t);
    },
  };
})();
