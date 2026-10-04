import { FIELD, VIEW } from '../config/gameConfig';

/**
 * Le monde utilise des pieds : marbre en (0, 0), +y vers le champ centre, +x vers le 1er but,
 * z = hauteur. project() convertit vers l'écran avec une légère perspective.
 */
export interface Screen {
  x: number;
  y: number;
  s: number; // facteur d'échelle de perspective
}

export function persp(y: number) {
  return 1 / (1 + y / VIEW.perspective);
}

export function project(x: number, y: number, z = 0): Screen {
  const s = persp(y);
  return {
    x: VIEW.homeX + x * VIEW.pxPerFootX * s,
    y: VIEW.homeY - y * VIEW.pxPerFootY * s - z * VIEW.pxPerFootZ * s,
    s,
  };
}

/** Inverse de project() pour z = 0 (utile pour le débogage et la souris). */
export function unproject(sx: number, sy: number) {
  // sy = homeY - y*k*s, s = 1/(1+y/D)  →  y = a / (k - a/D) avec a = homeY - sy
  const a = VIEW.homeY - sy;
  const y = a / (VIEW.pxPerFootY - a / VIEW.perspective);
  const s = persp(y);
  const x = (sx - VIEW.homeX) / (VIEW.pxPerFootX * s);
  return { x, y };
}

const L = FIELD.baseDistance;
const D = L / Math.SQRT2;

/** Position des buts : 0 = marbre, 1 = 1er, 2 = 2e, 3 = 3e, 4 = marbre (fin du tour). */
export const BASES: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: D, y: D },
  { x: 0, y: 2 * D },
  { x: -D, y: D },
  { x: 0, y: 0 },
];

export const MOUND = { x: 0, y: FIELD.moundDistance };

/** Point sur le trajet des buts à la distance d (0 → 4L). */
export function basePathPoint(d: number) {
  const dd = Math.max(0, Math.min(4 * L, d));
  const seg = Math.min(3, Math.floor(dd / L));
  const f = (dd - seg * L) / L;
  const a = BASES[seg];
  const b = BASES[seg + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Angle par rapport au champ centre, en degrés (négatif = côté gauche / 3e but). */
export function sprayAngle(x: number, y: number) {
  return (Math.atan2(x, y) * 180) / Math.PI;
}

export function isFairPosition(x: number, y: number) {
  if (y < -0.5) return false;
  return Math.abs(sprayAngle(x, y)) <= 45.5;
}
