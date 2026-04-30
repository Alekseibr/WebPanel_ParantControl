const CACHE_NAME = 'parental-v1';
const urls = ['/', '/index.html', '/app.js', '/manifest.json', '/fallback.html'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urls))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));