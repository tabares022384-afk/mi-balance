// Mi Balance — funcionamiento sin conexión. Guarda la aplicación en el teléfono y la abre aunque no haya internet.
// Para publicar una versión nueva: cambiar VERSION. La app avisa «Hay una versión nueva» y se actualiza solo cuando Edwin toca el aviso.
const VERSION = 'mi-balance-v4';
const ARCHIVOS = ['./', './index.html', './calc.js', './db.js', './app.js','./excel_azul.js', './manifest.webmanifest', './icono-192.png', './icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'actualizar') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
