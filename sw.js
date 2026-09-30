/*
 * Blockfell offline support (service worker).
 *
 * The whole game is one page (index.html, with its code, font and textures inside
 * it), so the service worker only has to keep that one page. It answers the page
 * from its cache first, so Blockfell starts with no connection (on a plane, abroad)
 * and starts quickly. It never fetches updates behind the player's back: the page
 * itself checks for a newer build now and then, stores it here, and offers a
 * Restart (see src/engine/offline.ts). Worlds are not stored here but in IndexedDB.
 */
const CACHE = 'blockfell-page-v1';
const PAGE = new URL('./', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(PAGE, { cache: 'reload' }))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('blockfell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // only page loads: the game's own update check (a plain fetch) must reach the network
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // only the game page itself (the scope root or index.html), never other files
  const root = new URL(PAGE).pathname;
  if (url.pathname !== root && url.pathname !== root + 'index.html') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(PAGE);
    if (hit) return hit;
    const res = await fetch(PAGE, { cache: 'no-cache' });
    if (res.ok) await cache.put(PAGE, res.clone());
    return res;
  })());
});
