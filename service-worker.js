const CACHE_NAME = 'rg-admin-v3';
const STATIC_ASSETS = [
  '/thai-accounting-system/admin.html',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — cache เฉพาะ admin.html เท่านั้น ไม่แตะ shop.html
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com')) return;
  if (e.request.url.includes('firebase')) return;

  // ข้าม shop.html และ index.html — ให้โหลดสดทุกครั้ง
  if (e.request.url.includes('shop.html')) return;
  if (e.request.url.includes('index.html')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
