/* Service worker de Turcau Baseball League.
 * - À l'installation : garde index.html et tous les fichiers du jeu qu'il cite (JS).
 *   Le jeu marche donc hors connexion dès que la page a fini de s'installer.
 * - index.html : réseau d'abord, cache ensuite (pour recevoir les mises à jour).
 * - autres fichiers (JS, icônes) : cache d'abord, réseau ensuite.
 * - Les sons du stade (Freesound, Wikimedia) viennent d'un autre site : ils ont besoin d'Internet.
 *   Sans Internet, le jeu utilise ses sons synthétisés.
 */
const CACHE = 'turcau-bbl-v28';
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

/** Garde la nouvelle page du jeu, mais seulement après avoir gardé tous les fichiers qu'elle cite. */
async function keepIndex(res) {
  try {
    const html = await res.clone().text();
    const cache = await caches.open(CACHE);
    const assets = [...new Set(html.match(/\.\/assets\/[^"'\s)]+/g) || [])];
    const missing = [];
    for (const a of assets) if (!(await cache.match(a, { ignoreVary: true }))) missing.push(a);
    await cache.addAll(missing.map((u) => new Request(u, { cache: 'reload' })));
    await cache.put('./index.html', res);
  } catch (e) {
    /* un fichier manque : on garde l'ancienne page, qui marche hors connexion */
  }
}

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
    // seulement la page du jeu (pas diag.html) ; les autres pages passent par le réseau
    const isGame = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    if (!isGame) return;
    event.respondWith(
      (async () => {
        // réseau d'abord, mais pas plus de 4 s : sinon la copie gardée
        const net = fetch(req);
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
        try {
          const res = await Promise.race([net, timeout]);
          if (res && res.ok) {
            event.waitUntil(keepIndex(res.clone()));
            return res;
          }
        } catch (e) {
          /* pas de réseau */
        }
        const cached = await caches.match('./index.html', { ignoreVary: true });
        return cached || net;
      })(),
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
