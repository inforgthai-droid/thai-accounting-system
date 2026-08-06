const CACHE_NAME = 'rg-admin-v5';
const STATIC_ASSETS = [
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

// Network first — บังคับดึงไฟล์สดจากเซิร์ฟเวอร์เสมอ (ข้าม HTTP cache) แล้วค่อย fallback เป็น cache ถ้าออฟไลน์
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com')) return;
  if (e.request.url.includes('firebase')) return;
  if (e.request.url.includes('shop.html')) return;
  if (e.request.url.includes('index.html')) return;

  const isHtml = e.request.url.includes('admin.html') || e.request.mode === 'navigate';

  e.respondWith(
    // สำหรับ admin.html: fetch แบบ reload บังคับข้าม HTTP cache ของเบราว์เซอร์ → ได้ไฟล์ล่าสุดเสมอ
    fetch(isHtml ? new Request(e.request.url, { cache: 'reload' }) : e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
