import { VVIEW } from './VolleyConfig';

/**
 * Monde du volleyball : x le long du terrain (filet en 0), y en profondeur (0 = côté proche), z = hauteur.
 * La caméra est un peu tournée (décalage « shear ») : on voit la face du filet au lieu de son profil.
 */
export const SHEAR = 14; // pixels de décalage horizontal par mètre de profondeur

export function vpersp(y: number) {
  return 1 / (1 + y / VVIEW.depth);
}

export function vproject(x: number, y: number, z = 0) {
  const s = vpersp(y);
  return {
    x: VVIEW.cx + x * VVIEW.pxX * s + y * SHEAR,
    y: VVIEW.baseY - y * VVIEW.pxY - z * VVIEW.pxZ * s,
    s,
  };
}
