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
      <button type="button" class="btn btn--primary" data-peek-open="${esc(s.id)}">${own ? "Leggi in breve" : "Apri la notizia"}</button>`;
  }

  function select(r, byKey) {
    const changed = r !== selected;
    selected = r;
    focusOn(r);
    if (r) { showPeek(r.s); if (changed && !byKey) { motion.pop(r.el); motion.peek(peek); } }
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
    motion.stars(stars.slice().sort((a, b) => a.x - b.x).map((r) => r.el), stage);
    scrollToNow(lead);
    if (lead) { selected = lead; focusOn(lead, false); showPeek(lead.s); }

    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      /* Le stelle sono puntini di 6–22px e nelle nubi stanno a pochi pixel l'una dall'altra: il bersaglio non è l'elemento
         sotto il puntatore (le aree di tocco si accavallano e vinceva la vicina) ma la stella col centro più vicino. */
      const nearest = (cx, cy, radius) => {
        const cr = canvas.getBoundingClientRect();
        if (cx < frame.getBoundingClientRect().left + labW()) return null;      // sotto i nomi delle corsie
        const x = cx - cr.left, y = cy - cr.top;
        let best = null, bd = radius;
        for (const r of stars) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } }
        return best;
      };
      const unhover = () => {
        stage.classList.remove("is-pointing");
        if (!hovered) return;
        hovered = null;
        focusOn(selected, false); if (selected) showPeek(selected.s);
      };
      let raf = 0, pt = null;
      stage.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        pt = [e.clientX, e.clientY];
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = nearest(pt[0], pt[1], 18);
          if (!r) { unhover(); return; }
          stage.classList.add("is-pointing");
          if (r !== hovered) { hovered = r; focusOn(r, true); showPeek(r.s); }
        });
      });
      stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") unhover(); });
      let lastPT = "mouse";
      stage.addEventListener("pointerdown", (e) => { lastPT = e.pointerType || "mouse"; }, true);
      stage.addEventListener("click", (e) => {
        const b = e.target.closest(".star");
        if (e.detail === 0) { const r = b && rec(b.dataset.sid); if (r) select(r, false); return; }   // da tastiera
        const mouse = lastPT === "mouse";
        const r = nearest(e.clientX, e.clientY, mouse ? 18 : 26);
        if (!r) return;
        if (mouse || r === selected) { select(r, false); reader.open(r.s.id, laneIds(r.lane)); }
        else select(r, false);
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
