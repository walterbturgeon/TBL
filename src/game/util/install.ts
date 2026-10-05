/**
 * Plein écran et installation sur un téléphone.
 * - Dans le navigateur : le plein écran demande un toucher (règle des navigateurs).
 * - Installé sur l'écran d'accueil : le jeu s'ouvre directement en plein écran, à l'horizontale.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Le jeu tourne comme une application installée (pas dans un onglet). */
export function isStandalone(): boolean {
  try {
    return (
      matchMedia('(display-mode: fullscreen)').matches ||
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Android / Chrome : on garde la demande d'installation pour la montrer avec notre bouton. */
export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    for (const fn of listeners) fn();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const fn of listeners) fn();
  });
}

export function canInstall() {
  return deferred !== null && !isStandalone();
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  await d.prompt();
  const r = await d.userChoice;
  for (const fn of listeners) fn();
  return r.outcome === 'accepted';
}

/** Passe en plein écran et bloque l'écran à l'horizontale (doit suivre un toucher). */
export function goFullscreen() {
  const doc = document as Document & { webkitFullscreenElement?: Element };
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    Promise.resolve(p)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  } catch {
    /* pas de plein écran sur cet appareil (iPhone) : le jeu marche quand même */
  }
}
