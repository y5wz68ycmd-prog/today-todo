const CACHE_NAME = "today-todo-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./legal.css",
  "./app.js",
  "./sync-config.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./privacy.html",
  "./terms.html",
  "./support.html",
  "./account-deletion.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./")),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients[0];

        if (existingClient) {
          return existingClient.focus();
        }

        return self.clients.openWindow("./");
      }),
  );
});
