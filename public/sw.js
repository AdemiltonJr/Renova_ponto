const CACHE_NAME = "renova-ponto-v12";
const ASSETS = ["/", "/index.html", "/styles.css", "/schedule.js", "/journey.js", "/app.js", "/manifest.json", "/icon-192.png", "/icon-512.png", "/logo.webp", "/renova-icon.png"];

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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Renova Ponto";
  const options = {
    body: data.body || "Voce tem uma nova notificacao.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: data.url || "/",
    requireInteraction: Boolean(data.requireInteraction),
    tag: data.tag || "renova-ponto",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(clients.openWindow(url));
});
