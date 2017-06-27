const VERSION = '1';
const ASSETS = [
    '/',
    '/images/senthil.png'
];

function getOfflineResponse(reason) {
    const offlineMsg = `
        ***********************************************************************
        <br/>
        <strong>Looks like you are either offline or something weird happened on my end</strong>
        <br/>
        ***********************************************************************        
        <br/><br/>
        <div style="display:none;">Possible reason(s): ${reason || 'None'}</div>
    `;
    return new Response(offlineMsg, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html' }
    });
}

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
    if (!cacheRes) {
        throw Error(`Item not found in cache`);
    }
    return cacheRes;
}

async function fetchFromNetworkAndCache(req) {
    const res = await fetch(req);
    addToCache(req, res.clone());
    return res;
}

async function fetchNetworkFirst(req) {
    const reasons = [];
    // Try netwrok first
    try {
        return await fetchFromNetworkAndCache(req);
    } catch (e) {
        reasons.push(e.message);
    }

    // Network failed so try cache
    try {
        return await fretchFromCache(req);
    } catch (e) {
        reasons.push(e.message);
    }

    // Even cache failed so get offline response
    return getOfflineResponse(reasons.join(', '));
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
                resolve(getOfflineResponse(reasons.join(', ')));
            } else {
                rejected = true;
            }
        };

        // Whichever resolves first will be the winner
        cacheFetch.then(resolve, maybeReject);
        networkFetch.then(resolve, maybeReject);
    });
}

async function swFetch(e) {
    const req = e.request;
    const url = new URL(req.url);

    if (req.method !== 'GET' || url.origin !== location.origin) {
        return;
    }

    if (req.method === "GET" && url.pathname === '/') {
        e.respondWith(fetchNetworkFirst(req));
    } else {
        e.respondWith(fetchFastest(req));
    }
}

self.addEventListener('install', e => e.waitUntil(swInstall()));
self.addEventListener('activate', e => e.waitUntil(swActivate()));
self.addEventListener('fetch', e => swFetch(e));
