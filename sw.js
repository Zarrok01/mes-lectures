// Permet à l'appli de s'ouvrir même sans internet, et garde les couvertures en mémoire.
// Change ce numéro à chaque mise à jour de l'appli pour forcer le rafraîchissement.
const CACHE = 'mes-lectures-v10';
const COVERS = 'mes-lectures-couvertures';
const FILES = ['./', 'index.html', 'recherche.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const COVER_HOSTS = ['covers.openlibrary.org', 'archive.org', 'catalogue.bnf.fr', 'images-na.ssl-images-amazon.com',
  'books.google.com', 'books.googleusercontent.com', 'mzstatic.com', 'di-static.com', 'epagine.fr'];
// Couvertures gardées : Chrome compte chaque image d'un autre site pour beaucoup plus que sa vraie taille,
// on en garde donc un nombre raisonnable pour ne pas manger la place de tes livres
const MAX_COVERS = 300;
// Réseau trop lent : au-delà de ce délai, on ouvre la copie enregistrée (plus d'écran blanc interminable)
const DELAI_RESEAU = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // On ne supprime que les anciennes copies de CETTE appli (d'autres sites peuvent partager la même adresse github.io)
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mes-lectures-') && k !== CACHE && k !== COVERS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimCovers() {
  const c = await caches.open(COVERS);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_COVERS; i++) await c.delete(keys[i]);
}

// Fichiers de l'appli : d'abord internet (pour avoir la dernière version), sinon la copie.
// Seule une vraie réponse (pas une page d'erreur) remplace la copie gardée pour le hors-ligne.
async function appli(req, reseau) {
  const cache = await caches.open(CACHE);
  const copie = await cache.match(req, {ignoreSearch: req.mode === 'navigate'});
  if (!copie) return reseau.catch(async () => (req.mode === 'navigate' && await cache.match('index.html')) || Response.error());
  // Une copie existe : on attend internet au plus quelques secondes, puis on l'utilise
  const delai = new Promise(r => setTimeout(() => r(null), DELAI_RESEAU));
  const res = await Promise.race([reseau.catch(() => null), delai]);
  return res && res.ok ? res : copie;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    const reseau = fetch(req);
    // (la copie est mise à jour même si la page a déjà été servie depuis la copie)
    e.waitUntil(reseau.then(res => res.ok ? caches.open(CACHE).then(c => c.put(req, res.clone())) : null).catch(() => {}));
    e.respondWith(appli(req, reseau));
    return;
  }

  // Couvertures : gardées en mémoire après le premier affichage (s'affichent vite et hors ligne).
  // (pas pour les images chargées en mode « cors », utilisées pour fabriquer l'image du bilan)
  if (req.destination === 'image' && req.mode !== 'cors' && COVER_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(caches.open(COVERS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') e.waitUntil(c.put(req, res.clone()).then(trimCovers));
      return res;
    }))));
    return;
  }

  // Lecteur de code-barres : gardé en copie après le premier usage.
  if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) e.waitUntil(caches.open(CACHE).then(c => c.put(req, res.clone())));
      return res;
    })));
  }
});
