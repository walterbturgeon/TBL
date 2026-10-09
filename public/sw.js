/* Service worker de Turcau Baseball League.
 * - À l'installation : garde index.html et tous les fichiers du jeu qu'il cite (JS).
 *   Le jeu marche donc hors connexion dès que la page a fini de s'installer.
 * - index.html : réseau d'abord, cache ensuite (pour recevoir les mises à jour).
 * - autres fichiers (JS, icônes) : cache d'abord, réseau ensuite.
 * - Les sons du stade (Freesound, Wikimedia) viennent d'un autre site : ils ont besoin d'Internet.
 *   Sans Internet, le jeu utilise ses sons synthétisés.
 */
const CACHE = 'turcau-bbl-v26';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // « reload » : la version du serveur, pas une vieille copie du navigateur
      await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
      try {
        const res = await cache.match('./index.html');
        const html = res ? await res.text() : '';
        const assets = [...new Set(html.match(/\.\/assets\/[^"'\s)]+/g) || [])];
        await cache.addAll(assets.map((u) => new Request(u, { cache: 'reload' })));
      } catch (e) {
        /* les fichiers seront gardés à la prochaine ouverture */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    );
    return;
  }

  // ignoreVary : une réponse gardée avec « Vary: Origin » doit servir aussi pour les scripts du jeu
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
