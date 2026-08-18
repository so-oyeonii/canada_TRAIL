/* TRAIL service worker.
 *
 *  There is exactly one hard offline requirement in this product: `/bags/drop` has
 *  to render a QR at a partner counter in a basement. Everything here exists for
 *  that, and nothing here is allowed to make the app lie somewhere else.
 *
 *  The prohibitions are not tuning, they are the design:
 *
 *  1. **Nothing but GET is touched.** A POST that a cache "handled" is a purchase,
 *     a confirmation or a charge that never reached the server while the screen
 *     said it did. Non-GET returns without `respondWith`, straight to the network,
 *     where the app's own outbox already handles failure honestly.
 *  2. **`/api/**`, `/auth/**` and `/login` are never cached.** These are cookie
 *     authenticated. A cached `/api/state` is one traveller's wallet served to the
 *     next person who signs in on the same phone, and a cached 401 is worse: it is
 *     a signed-in traveller told they are signed out until the cache rots.
 *  3. **Navigations are network-first.** The cache only answers when the network
 *     does not, so a deploy is never served stale HTML pointing at chunks that no
 *     longer exist. `(app)` pages are client components fed by `/api/state`, so the
 *     HTML carries markup and no trip data.
 *  4. **Hashed assets are cache-first.** `/_next/static/*` is immutable by name —
 *     including the `uqr` chunk the QR is drawn with, which is why the encoder is a
 *     static import and not a runtime fetch.
 *  5. **Caches are keyed by build.** `?v=` comes from the registration; activate
 *     deletes everything that is not this build's. */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = `trail-shell-${VERSION}`;
const ASSETS = `trail-assets-${VERSION}`;
const MINE = [SHELL, ASSETS];

/** Session-bearing paths. Matched on pathname, before anything else runs. */
const NEVER_CACHE = [/^\/api\//, /^\/auth\//, /^\/login(\/|$)/];
const HASHED = [/^\/_next\/static\//, /^\/fonts\//];
const STATIC_FILE = /\.(?:png|jpg|jpeg|svg|ico|woff2|webmanifest)$/;

self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("trail-") && !MINE.includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/** The one message this worker takes: warm the counter screen while there is
 *  still signal. Sent from `/bags/pay` after a charge — the last moment before
 *  the traveller walks downstairs. Failures are ignored; a warm cache is an
 *  optimisation, and the screen says so when there is no pass. */
self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "warm" && Array.isArray(event.data.urls) ? event.data.urls : null;
  if (!urls) return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(urls.map(async (url) => {
      try { const response = await fetch(url, { credentials: "same-origin" }); if (response.ok && !response.redirected) await cache.put(url, response.clone()); } catch { /* offline already */ }
    }));
  })());
});

const cacheable = (response) => response && response.ok && response.type === "basic" && !response.redirected && !(response.headers.get("cache-control") || "").includes("no-store");

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) void cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (cacheable(response)) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (await cache.match(new URL(request.url).pathname));
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;                       // rule 1
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;   // rule 2
  // React Server Component payloads are per-deploy and answer a specific router
  // state; serving a stale one puts the wrong screen under the right URL.
  if (url.searchParams.has("_rsc")) return;
  if (HASHED.some((pattern) => pattern.test(url.pathname)) || STATIC_FILE.test(url.pathname)) { event.respondWith(cacheFirst(request)); return; }
  if (request.mode === "navigate") { event.respondWith(networkFirst(request)); return; }
});

/** N1-2. The only thing this worker knows about nearby alerts: what to do when one is
 *  tapped. It never *creates* a notification and it never asks where anybody is —
 *  `navigator.geolocation` is not exposed to a service worker in any browser, which is why
 *  N1 has no background half at all. The alert was built and shown by the page, while the
 *  page was running; this handler only reopens it.
 *
 *  None of the five caching rules above is touched. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/home";
  event.waitUntil((async () => {
    const target = new URL(href, self.location.origin);
    if (target.origin !== self.location.origin) return;                 // a notification cannot navigate off-origin
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Reuse the tab that is already signed in rather than opening a second one.
    const mine = open.find((client) => new URL(client.url).origin === self.location.origin);
    if (mine) { await mine.focus(); if ("navigate" in mine) await mine.navigate(target.href).catch(() => {}); return; }
    await self.clients.openWindow(target.href);
  })());
});
