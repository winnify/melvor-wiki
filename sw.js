// A "service worker": a script the browser runs in the background for this app.
// It sits between the app and the network, so it can answer from saved copies when you're offline.
// It does two jobs:
//   1. Keeps the app itself (index.html, icons) so the app opens instantly and can be installed.
//   2. Keeps the formula library (KaTeX) after its first download so it doesn't need downloading again.
// Wiki pages are NOT handled here: they always come fresh from the wiki.

const APP_CACHE = "app-v1";       // change the number if you ever need to force-clear old app files
const CDN_CACHE = "cdn-v1";
const APP_FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  // Download and keep the app files, then start working right away.
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Throw away app files left by older versions, then take control of open pages.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("app-") && k !== APP_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));          // our own files
  } else if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("/katex@")) {
    event.respondWith(cacheFirst(request, CDN_CACHE)); // the formula library
  }
  // Everything else (the wiki's API and images) goes straight to the network, untouched.
});

// "Network first": use the internet when it works (so updates show up straight away),
// and fall back to the saved copy when it doesn't.
async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    if (request.mode === "navigate") {
      const shell = await cache.match("index.html");
      if (shell) return shell;
    }
    return Response.error();
  }
}

// "Cache first": the formula library never changes (its address has a version number in it),
// so once we have it, we never need to download it again.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
