// Permet à l'appli de s'ouvrir même sans internet, et garde les couvertures en mémoire.
// Change ce numéro à chaque mise à jour de l'appli pour forcer le rafraîchissement.
const CACHE = 'mes-lectures-v42';   // appli 2026.10.29-2
// Couvertures : deux réserves. Chrome compte une image « opaque » (site qui n'autorise pas la lecture) pour
// 10 à 14 Mo de place (mesuré), contre sa vraie taille (20 à 60 Ko) quand le site l'autorise (« CORS »).
// (l'ancienne réserve « mes-lectures-couvertures », pleine d'images opaques, est supprimée à l'activation)
const COVERS = 'mes-lectures-couv-cors', OPAQUES = 'mes-lectures-couv-opaques';
const FILES = ['./', 'index.html', 'recherche.js', 'taxonomie.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const COVER_HOSTS = ['covers.openlibrary.org', 'archive.org', 'catalogue.bnf.fr', 'images-na.ssl-images-amazon.com',
  'books.google.com', 'books.googleusercontent.com', 'mzstatic.com', 'di-static.com', 'epagine.fr'];
// Couvertures gardées : 300 lisibles (quelques Mo en tout), et seulement 30 opaques (pour ne pas manger la place de tes livres)
const MAX_COVERS = 300, MAX_OPAQUES = 30;
// Réseau trop lent : au-delà de ce délai, on ouvre la copie enregistrée (plus d'écran blanc interminable)
const DELAI_RESEAU = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // On ne supprime que les anciennes copies de CETTE appli (d'autres sites peuvent partager la même adresse github.io)
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mes-lectures-') && k !== CACHE && k !== COVERS && k !== OPAQUES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(nom, max) {
  const c = await caches.open(nom);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
// Sites qui n'autorisent pas la lecture de leurs images (retenus le temps que le service tourne : une seule tentative)
const sansCors = new Set();
async function couverture(e, req, url) {
  const [lisibles, opaques] = await Promise.all([caches.open(COVERS), caches.open(OPAQUES)]);
  const hit = (await lisibles.match(req.url)) || (await opaques.match(req.url));
  if (hit) return hit;
  if (!sansCors.has(url.hostname)) {
    try {
      const res = await fetch(req.url, {mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (res.ok) e.waitUntil(lisibles.put(req.url, res.clone()).then(() => trim(COVERS, MAX_COVERS)));
      return res;
    } catch (err) { if (navigator.onLine !== false) sansCors.add(url.hostname); }   // (refusé par le site : on essaie à l'ancienne)
  }
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') e.waitUntil(opaques.put(req.url, res.clone()).then(() => trim(OPAQUES, MAX_OPAQUES)));
  return res;
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
    e.respondWith(couverture(e, req, url));
    return;
  }

  // (le lecteur de code-barres zxing.min.js est rangé avec l'appli : gardé en copie comme les autres fichiers)
});
