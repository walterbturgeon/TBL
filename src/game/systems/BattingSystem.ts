import { TIMING, type PitchType } from '../config/gameConfig';

type TimingBase = { perfect: number; good: number; ok: number; max: number };
import { chance, DEG, rand } from '../util/math';

export interface TimingWindows {
  perfect: number;
  good: number;
  ok: number;
  max: number;
}

export function windowsFor(mul: number, base: TimingBase = TIMING): TimingWindows {
  return { perfect: base.perfect * mul, good: base.good * mul, ok: base.ok * mul, max: base.max * mul };
}

export type ContactQuality = 'perfect' | 'good' | 'ok' | 'weak';

export interface Contact {
  quality: ContactQuality;
  label: string;
  vx: number;
  vy: number;
  vz: number;
  spray: number; // degrés, négatif = gauche
  launch: number; // degrés
  exitSpeed: number;
}

/** Texte de rétroaction du timing (delta < 0 = trop tôt). */
export function timingLabel(deltaMs: number, w: TimingWindows): string {
  const a = Math.abs(deltaMs);
  if (a <= w.perfect) return 'PARFAIT !';
  if (a > w.max) return deltaMs < 0 ? 'TROP TÔT' : 'TROP TARD';
  if (a <= w.good) return deltaMs < 0 ? 'UN PEU TÔT' : 'UN PEU TARD';
  return deltaMs < 0 ? 'TÔT' : 'TARD';
}

const PITCH_POWER: Record<PitchType, number> = { fastball: 1.05, changeup: 0.97, slow: 0.93, curve: 0.98 };

/**
 * Résultat d'un élan selon le timing.
 *  très tôt → balle tirée fort à gauche (souvent fausse balle)
 *  parfait  → frappe forte au centre
 *  tard     → balle à droite, plus faible ; très tard → faible ou fausse balle
 * Retourne null si l'élan rate la balle.
 */
export function computeContact(
  deltaMs: number,
  w: TimingWindows,
  power: number,
  pitch: PitchType,
  inZone: boolean,
  powerMul = 1,
): Contact | null {
  const a = Math.abs(deltaMs);
  const max = inZone ? w.max : w.max * 0.9;
  if (a > max) return null;

  let quality: ContactQuality;
  let q: number;
  if (a <= w.perfect) {
    quality = 'perfect';
    q = 1;
  } else if (a <= w.good) {
    quality = 'good';
    q = 0.86;
  } else if (a <= w.ok) {
    quality = 'ok';
    q = 0.76;
  } else {
    quality = 'weak';
    q = 0.6;
  }
  if (!inZone) q *= 0.82;
  if (deltaMs > 0) q *= 1 - 0.22 * (deltaMs / w.max);

  // direction : proportionnelle au timing, avec une petite variation
  let spray = (deltaMs / w.max) * 54 + rand(-7, 7);
  if (quality === 'perfect') spray = spray * 0.6 + rand(-6, 6);

  // angle de départ
  let launch: number;
  const r = Math.random();
  switch (quality) {
    case 'perfect':
      launch = r < 0.15 ? rand(4, 12) : rand(14, 36);
      break;
    case 'good':
      launch = r < 0.45 ? rand(-7, 9) : r < 0.9 ? rand(10, 36) : rand(40, 58);
      break;
    case 'ok':
      launch = r < 0.45 ? rand(-12, 5) : r < 0.9 ? rand(8, 30) : rand(45, 70);
      break;
    default:
      launch = r < 0.6 ? rand(-22, 0) : r < 0.85 ? rand(50, 76) : rand(5, 20);
  }

  const exitSpeed = (70 + power * 4.1) * (0.55 + 0.45 * q) * PITCH_POWER[pitch] * powerMul * rand(0.94, 1.06);
  // petite chance de frappe « fausse balle tip » sur un contact faible
  if (quality === 'weak' && chance(0.25)) spray = (deltaMs < 0 ? -1 : 1) * rand(52, 80);

  const la = launch * DEG;
  const sa = spray * DEG;
  const h = exitSpeed * Math.cos(la);
  return {
    quality,
    label: timingLabel(deltaMs, w),
    vx: h * Math.sin(sa),
    vy: h * Math.cos(sa),
    vz: exitSpeed * Math.sin(la),
    spray,
    launch,
    exitSpeed,
  };
}
