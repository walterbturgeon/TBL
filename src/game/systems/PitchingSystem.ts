import { FIELD, PITCH_TYPES, SPEEDS, type PitchType } from '../config/gameConfig';
import type { PitchPath } from '../entities/Ball';
import { chance, rand, weighted } from '../util/math';

export interface PitcherStats {
  pitching: number; // vitesse
  control: number;
  movement: number; // effet
}

export interface PitchPlan {
  type: PitchType;
  strike: boolean;
  path: PitchPath;
  label: string;
  fingers: number; // signe de la receveuse
}

/** Zone des prises : la largeur du marbre (17 po) + la balle. */
export const ZONE_HALF_WIDTH = 0.95;

export function isStrikeX(x: number) {
  return Math.abs(x) <= ZONE_HALF_WIDTH;
}

export function pickPitchType(): PitchType {
  const w = {} as Record<PitchType, number>;
  for (const k of Object.keys(PITCH_TYPES) as PitchType[]) w[k] = PITCH_TYPES[k].weight;
  return weighted(w);
}

/**
 * Prépare un lancer : type, prise ou balle, trajectoire.
 * strikeChance vient de la difficulté et du contrôle du lanceur.
 */
export function planPitch(p: PitcherStats, speedMul: number, strikeChance: number, wildChance: number, type = pickPitchType()): PitchPlan {
  const def = PITCH_TYPES[type];
  const ctrl = (p.control - 6) * 0.03;
  const strike = chance(Math.min(0.85, strikeChance + ctrl));
  const wild = !strike && chance(wildChance);
  const curve = def.curve * (0.6 + p.movement * 0.07) * (chance(0.5) ? 1 : -1);
  let tx: number;
  if (strike) tx = rand(-0.75, 0.75);
  else tx = (chance(0.5) ? -1 : 1) * (wild ? rand(3, 4.5) : rand(1.3, 2.4));
  const speed = SPEEDS.pitch(p.pitching) * def.speedMul * speedMul;
  const y0 = FIELD.moundDistance - 2.5;
  const T = y0 / speed;
  return {
    type,
    strike,
    label: def.label,
    fingers: type === 'fastball' ? 1 : type === 'curve' ? 2 : type === 'changeup' ? 3 : 4,
    path: {
      x0: 0.6,
      y0,
      z0: 5.2,
      tx,
      tz: wild ? 0.3 : 2.4,
      T,
      arc: def.arc * (0.8 + T * 0.4),
      curve,
      wild,
    },
  };
}
