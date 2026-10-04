/** Appareil tactile (téléphone, tablette) : on montre les boutons à l'écran. */
export function isTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}
