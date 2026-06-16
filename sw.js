/* ==============================================================
   AQMAR — Service Worker
   Durable, lazy, version-keyed offline cache for the memorial SPA.

   Lives at the repo ROOT so its scope covers BOTH /webui/ (the SPA) and
   /data/ (the photos + JSON). Registered from webui/app.js as
   `register('../sw.js', { scope: '../' })`. On GitHub Pages it is served at
   /AQMAR/sw.js (scope /AQMAR/); locally (IIS at :8082, working-tree root)
   at /sw.js (scope /).

   It intercepts ONLY two request classes — everything else passes straight
   through to the network, so the app shell (HTML/CSS/JS) is never served
   stale:

     · data/photos/*      → cache-first  (each photo caches itself the first
                            time it is viewed — "cache as viewed"; the 247 MB
                            set is never downloaded up front)
     · data/martyrs.json  → network-first (fresh data online, cached snapshot
                            offline)

   Photo filenames are stable, so the photo cache persists across dataset
   versions — no 247 MB re-download when the published version bumps. The
   "store ID" (dataset version) is written to localStorage by the page, not
   here; this worker only moves bytes.
   ============================================================== */

"use strict";

const PHOTO_CACHE = "aqmar-photos";
const DATA_CACHE = "aqmar-data";
const OURS = new Set([PHOTO_CACHE, DATA_CACHE]);

self.addEventListener("install", () => {
  // Activate immediately — there's no precache step to wait on.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any stale aqmar-* caches from a previous naming scheme.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("aqmar-") && !OURS.has(n))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // same-origin only

  const path = url.pathname;
  if (/\/data\/photos\//.test(path)) {
    event.respondWith(cacheFirst(req, PHOTO_CACHE));
  } else if (/\/data\/martyrs\.json$/.test(path)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
  }
  // Otherwise: no respondWith() → default browser handling.
});

// Cache-first: serve the cached copy if present; otherwise fetch, cache a
// clone, and return. Offline misses fall through to a network error, which
// the page's <img onerror> already handles (renders the calligraphic
// monogram fallback).
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return hit || Response.error();
  }
}

// Network-first: try the network (so a freshly published JSON wins), cache a
// clone on success, and fall back to the cached snapshot when offline.
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
