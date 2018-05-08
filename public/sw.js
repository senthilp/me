const VERSION = '{%VERSION%}';
const ASSETS = [];
const offlineMap = new Map();

function getOfflineKey(url) {
    const urlObj = new URL(url);
    const pathMatches = urlObj.pathname.match(/(^\/[^\/]*)\/?/);
    const seoToken = pathMatches ? pathMatches[1] : '';

    return urlObj.origin + seoToken;
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

async function fetchFromCache(req) {
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

async function fetchNetworkFirst(req, cacheResponse = false) {
    const reasons = [];
    // Try netwrok first
    try {
        const networkFetch = cacheResponse ? fetchFromNetworkAndCache(req) : fetch(req.url, {credentials: 'include'});
        return await networkFetch;
    } catch (e) {
        reasons.push(e.message);
    }

    // Network failed so try cache
    try {
        return await fetchFromCache(req);
    } catch (e) {
        reasons.push(e.message);
    }

    // Cache failed, try the offline page if available
    try {
        const offlinePage = offlineMap.get(getOfflineKey(req.url));
        if (offlinePage) {
            return await fetchFromCache(offlinePage);
        }
    } catch (e) {
        reasons.push(e.message);
    }

    // Even cache failed so fallback to browser default
    throw Error(reasons.join(`, `));
}

async function fetchFastest(req, cacheResponse = false) {
    return new Promise((resolve, reject) => {
        const networkFetch = cacheResponse ? fetchFromNetworkAndCache(req) : fetch(req);
        const cacheFetch = fetchFromCache(req);
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
    try {
        // Reset the offline Map to null to clear current entries
        // This also makes the prep step atomic
        const offlineKey = getOfflineKey(e.data.currentPage);
        offlineMap.set(offlineKey, null);

        const offlineDataRes = await fetch(e.data.offlineSrc);
        const offlineData = await offlineDataRes.json();
        const offlineAssets = offlineData.assets;

        await updateCacheEntities(offlineAssets);

        // Add offline page to the asset queue
        const offlinePage = offlineData.page;
        offlineAssets.push(offlinePage);

        await addCacheEntities(offlineAssets);

        offlineMap.set(offlineKey, offlinePage);
    } catch (ex) {
        // Offline Prep failed
    }
}

async function swFetch(e) {
    const req = e.request;
    const url = new URL(req.url);

    if (req.method !== 'GET') {
        return;
    }

    if (e.request.mode === 'navigate') {
        if (url.origin === location.origin) {
            e.respondWith(fetchNetworkFirst(req));
        }
    } else {
        e.respondWith(fetchFastest(req));
    }
}

self.addEventListener('install', e => e.waitUntil(swInstall()));
self.addEventListener('activate', e => e.waitUntil(swActivate()));
self.addEventListener('fetch', e => swFetch(e));
self.addEventListener('message', e => prepOffline(e));
