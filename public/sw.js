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

async function addToCache(req, res) {
    const cache = await caches.open(VERSION);
    cache.put(req, res);
}

async function fretchFromCache(req) {
    const cache = await caches.open(VERSION);
    const cacheRes = await cache.match(req);
    return cacheRes;
}

async function fetchFromNetworkAndCache(req) {
    const res = await fetch(req);
    addToCache(req, res.clone());
    return res;
}

async function fetchFastest(req) {
    return new Promise(resolve => {
        const networkFetch = fetchFromNetworkAndCache(req);
        const cacheFetch = fretchFromCache(req);
        let rejected = false;
        const reasons = [];

        const maybeReject = reason => {
            reasons.push(reason.toString());
            if (rejected) {
                resolve(new Response('Looks like you are either offline or something weird happened on my end', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/html' }
                }));
            } else {
                rejected = true;
            }
        };

        const maybeResolve = result => {
            if (result instanceof Response) {
                resolve(result);
            } else {
                maybeReject(`No result returned`);
            }
        };

        // Whichever resolves first will be the winner
        networkFetch.then(maybeResolve, maybeReject);
        cacheFetch.then(maybeResolve, maybeReject);
    });
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

