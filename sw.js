// Permet à l'appli de s'ouvrir même sans internet, et garde les couvertures en mémoire.
// Change ce numéro à chaque mise à jour de l'appli pour forcer le rafraîchissement.
const CACHE = 'mes-lectures-v5';
const COVERS = 'mes-lectures-couvertures';
const FILES = ['./', 'index.html', 'recherche.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const COVER_HOSTS = ['covers.openlibrary.org', 'archive.org', 'catalogue.bnf.fr', 'images-na.ssl-images-amazon.com',
  'books.google.com', 'books.googleusercontent.com', 'mzstatic.com', 'di-static.com', 'epagine.fr'];
const MAX_COVERS = 1500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== COVERS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimCovers() {
  const c = await caches.open(COVERS);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_COVERS; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fichiers de l'appli : d'abord internet (pour avoir la dernière version), sinon la copie.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }

  // Couvertures : gardées en mémoire après le premier affichage (s'affichent vite et hors ligne).
  // (pas pour les images chargées en mode « cors », utilisées pour fabriquer l'image du bilan)
  if (req.destination === 'image' && req.mode !== 'cors' && COVER_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(COVERS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimCovers(); }
      return res;
    }))));
    return;
  }

  // Lecteur de code-barres : gardé en copie après le premier usage.
  if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
