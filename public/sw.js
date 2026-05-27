const CACHE_NAME = "renova-ponto-v11";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.json", "/icon-192.png", "/icon-512.png", "/logo.webp"];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Força a atualização imediata do Service Worker
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  event.waitUntil(clients.claim()); // Assume o controle da página imediatamente
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
