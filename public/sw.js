/**
 * Service Worker hors-ligne — Brawl Collège : Opération 6ème
 * Stratégies :
 * - App shell pré-caché à l'installation
 * - Network-First avec fallback cache pour les navigations HTML
 * - Cache-First avec mise en cache dynamique pour JS/CSS, JSON pédagogiques, images et polices
 */

const CACHE_VERSION = 'brawl-college-m5-v1';
const STATIC_CACHE = CACHE_VERSION;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const ACTIVE_CACHES = new Set([STATIC_CACHE, RUNTIME_CACHE]);

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/assets/timo.jpg',
  '/assets/leo.jpg',
  '/assets/maya.jpg',
  '/assets/zack.jpg',
];

const STATIC_ASSET_EXTENSIONS_RE =
  /\.(?:js|mjs|cjs|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|otf|eot)(?:\?.*)?$/i;

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(new Request(assetUrl, { cache: 'reload' }));
            if (response && response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch (_err) {
            // Tolérance si un asset optionnel est temporairement indisponible lors du pré-cache
          }
        })
      );
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const existingKeys = await caches.keys();
      await Promise.all(
        existingKeys
          .filter((key) => !ACTIVE_CACHES.has(key))
          .map((obsoleteKey) => caches.delete(obsoleteKey))
      );
      await self.clients.claim();
    })()
  );
});

function isHtmlNavigationRequest(request) {
  if (request.mode === 'navigate') {
    return true;
  }
  const acceptHeader = request.headers.get('accept') || '';
  return request.destination === 'document' || acceptHeader.includes('text/html');
}

function isCacheFirstAssetRequest(request, url) {
  if (FONT_HOSTS.has(url.hostname)) {
    return true;
  }
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    return true;
  }
  return STATIC_ASSET_EXTENSIONS_RE.test(url.pathname);
}

async function networkFirstHtml(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      await runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    const exactCached = await caches.match(request);
    if (exactCached) {
      return exactCached;
    }
    const indexCached = (await caches.match('/index.html')) || (await caches.match('/'));
    if (indexCached) {
      return indexCached;
    }
    return new Response(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Hors-ligne</title></head><body style="background:#020617;color:#f8fafc;font-family:sans-serif;padding:24px;"><h1>Brawl Collège hors-ligne</h1><p>Reconnecte-toi une fois pour terminer le chargement du cache local.</p></body></html>',
      {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}

async function cacheFirstDynamic(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      await runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) {
      return fallback;
    }
    return new Response('', { status: 504, statusText: 'Offline Resource Unavailable' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (_err) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (isHtmlNavigationRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (isCacheFirstAssetRequest(request, url)) {
    event.respondWith(cacheFirstDynamic(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstDynamic(request));
  }
});

async function buildCacheStatusPayload() {
  const cacheNames = await caches.keys();
  const activeNames = cacheNames.filter((name) => ACTIVE_CACHES.has(name));
  const counts = {};
  let totalEntries = 0;

  for (const name of activeNames) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    counts[name] = requests.length;
    totalEntries += requests.length;
  }

  return {
    type: 'CACHE_STATUS',
    cacheVersion: CACHE_VERSION,
    activeCaches: activeNames,
    entriesByCache: counts,
    totalCachedEntries: totalEntries,
    precacheAssets: [...PRECACHE_ASSETS],
  };
}

self.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }

  if (payload.type === 'SKIP_WAITING') {
    event.waitUntil(
      self.skipWaiting().then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'SKIP_WAITING_ACK', cacheVersion: CACHE_VERSION });
        }
      })
    );
    return;
  }

  if (payload.type === 'CACHE_STATUS') {
    event.waitUntil(
      buildCacheStatusPayload().then((status) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(status);
        } else if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage(status);
        }
      })
    );
  }
});
