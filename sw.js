/* Sportwire · service worker (build 86650740). Pagine e dati: rete prima, cache se offline.
   Asset con ?v= nel nome: cache prima. Le foto delle testate non si mettono in cache. */
const BUILD = "86650740";
const STATIC = "sw-static-" + BUILD;
const PAGES = "sw-pages-v1";
const PRECACHE = ["css/site.css?v=c7ec58e2", "js/app.js?v=7f9589ff", "favicon.svg", "img/stars-a.svg", "img/stars-b.svg", "fonts/archivo-latin-wdth-normal.woff2", "fonts/geist-latin-wght-normal.woff2", "fonts/geist-mono-latin-wght-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("sw-static-") && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (x) => { clearTimeout(t); rej(x); }); });

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await withTimeout(fetch(req), 6000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await cache.match("index.html", { ignoreSearch: true }) || await cache.match("./", { ignoreSearch: true });
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const dynamic = req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/data/news.json");
  e.respondWith(dynamic ? networkFirst(req) : cacheFirst(req));
});
