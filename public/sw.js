const VERSION = '1';
const ASSETS = [];
const ALLOWED_URL_PATHS = [
    '/'
];
let offlineReady = false;
let offlinePage = undefined;

function requestExpectsHTML(headers) {
    if (!headers) {
        return false;
    }
    const acceptHeader = headers.get("Accept");
    if (acceptHeader) {
        return acceptHeader.indexOf('text/html') !== -1;
    }
    return false;
}

function isUrlPathAllowed(path) {
    return ALLOWED_URL_PATHS.some(allowedPath => {
        // Special check for root
        if (allowedPath === '/') {
            return allowedPath === path;
        }
        return new RegExp(allowedPath).test(path);
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

async function updateCacheEntities(entitiesToKeep) {
    const cache = await caches.open(VERSION);
    const cacheKeys = await cache.keys();
    const existingEntities = cacheKeys.map(key => key.url);

    const entitiesToDelete = existingEntities
                            .filter(entity => !entitiesToKeep.includes(entity) && !ASSETS.includes(entity));

    await Promise.all(entitiesToDelete.map(entityToDelete => cache.delete(entityToDelete)));
}

async function addCacheEntities(entities) {
    const cache = await caches.open(VERSION);
    const cacheKeys = await cache.keys();
    const existingEntities = cacheKeys.map(key => key.url);

    const entitiesToAdd = entities.filter(entity => !existingEntities.includes(entity));

    await cache.addAll(entitiesToAdd);
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

    // Even cache failed so fallback to browser default
    throw Error(reasons.join(`, `));
}

async function fetchFastest(req) {
    return new Promise((resolve, reject) => {
        const networkFetch = fetchFromNetworkAndCache(req);
        const cacheFetch = fretchFromCache(req);
        let rejected = false;
        const reasons = [];

        const maybeReject = reason => {
            reasons.push(reason.toString());
            if (rejected) {
                reject(Error(reasons.join(`, `)));
            } else {
                rejected = true;
            }
        };

        // Whichever resolves first will be the winner
        cacheFetch.then(resolve, maybeReject);
        networkFetch.then(resolve, maybeReject);
    });
}

async function prepOffline(e) {
    offlineReady = false;

    try {
        const offlineDataRes = await fetch(e.data.offlineDataService);
        const offlineData = await offlineDataRes.json();
        const offlineAssets = offlineData.assets;

        await updateCacheEntities(offlineAssets);

        // Set and add offline page to the asset queue
        offlinePage = offlineData.page;
        offlineAssets.push(offlinePage);

        await addCacheEntities(offlineAssets);
        offlineReady = true;
    } catch (ex) {
        // Offline Prep failed
    }
}

async function swFetch(e) {
    // Initial checks, return immediately if
    // 1. user is online
    // or
    // 2. Offline cache is not ready
    if (navigator.onLine || !offlineReady) {
        return;
    }

    const req = e.request;
    const url = new URL(req.url);

    if (req.method !== 'GET') {
        return;
    }

    if (requestExpectsHTML(req.headers)) {
        if (isUrlPathAllowed(url.pathname)) {
            e.respondWith(fretchFromCache(offlinePage));
        }
    } else {
        e.respondWith(fretchFromCache(req));
    }
}

self.addEventListener('install', e => e.waitUntil(swInstall()));
self.addEventListener('activate', e => e.waitUntil(swActivate()));
self.addEventListener('fetch', e => swFetch(e));
self.addEventListener('message', e => prepOffline(e));
