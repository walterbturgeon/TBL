/** Appareil tactile (téléphone, tablette) : on montre les boutons à l'écran. */
export function isTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/** Télé (Fire TV avec Fire OS ou Vega OS, Android TV, Tizen, webOS…) : appareil souvent peu puissant. */
export function isTVDevice(): boolean {
  try {
    return /AFT|Silk|Vega|SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|GoogleTV|Android TV|CrKey|AmazonWebAppPlatform/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}
