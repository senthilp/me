const VERSION = '1';
const ASSETS = [
    '/',
    '/images/senthil.png'
];

async function swInstall() {
    const cache = await caches.open(VERSION);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
}

async function swActivate() {
    const keys = await caches.keys();
    const deletes = [];
    for (const key of keys) {
        if (key !== VERSION) {
            deletes.push(caches.delete(key));
        }
    }
    await Promise.all(deletes);
    await self.clients.claim();
}

async function fetchFromNetworkAndCache(req) {
    const res = await fetch(req);
    if (!res.url) {
        // foreign requests will be res.type === 'opaque' and missing a url
        return res;
    }
    const cache = await caches.open(VERSION);
    cache.put(req, res.clone());
    return res;
}

async function fetchFastest(req) {
    const networkFetch = fetchFromNetworkAndCache(req);
    const cache = await caches.open(VERSION);
    const response = await cache.match(req);
    if (response) {
        return response;
    }
    return networkFetch;
}

async function swFetch(e) {
    const req = e.request;
    const url = new URL(req.url);

    if (req.method !== 'GET' || url.origin !== location.origin) {
        return;
    }

    e.respondWith(fetchFastest(req));
}

self.addEventListener('install', e => e.waitUntil(swInstall()));
self.addEventListener('activate', e => e.waitUntil(swActivate()));
self.addEventListener('fetch', e => swFetch(e));

