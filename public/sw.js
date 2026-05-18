const CACHE_NAME = "renova-ponto-v5";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.json", "/icon.svg", "/logo.webp"];

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
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
