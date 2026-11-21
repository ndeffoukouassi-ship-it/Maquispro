const VERSION = "maquispro-demo-v3-export-20261121";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./logo-maquispro.svg", "./manifest.webmanifest", "./catalog-export.mjs"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("maquispro-demo-") && key !== VERSION).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const target = new URL(req.url);
  if (target.origin !== self.location.origin) return;
  event.respondWith(fetch(req).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(VERSION).then(cache => cache.put(req, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      return (await caches.match("./index.html")) ||
        new Response("Connexion requise pour afficher MaquisPro.",{status:503,headers:{"content-type":"text/plain; charset=utf-8"}});
    }
    return Response.error();
  }));
});
