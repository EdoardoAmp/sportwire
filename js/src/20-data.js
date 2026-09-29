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
