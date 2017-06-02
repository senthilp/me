const cacheName = 'v1::static';

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(cacheName).then(cache => cache.addAll([
            '/',
            '/images/senthil.png'
        ]).then(() => self.skipWaiting(), ex => console.log(`Fetch - ${ex}`)))
    );
});

self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', event => {
    event.respondWith(caches.open(cacheName)
                            .then(cache => cache.match(event.request)
                            .then(res => res || fetch(event.request))));
});
