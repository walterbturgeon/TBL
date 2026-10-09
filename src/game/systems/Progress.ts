// =====================================================================
//  PROGRESSION : la difficulté monte avec le temps de jeu (les 3 sports).
//  Le temps compte seulement pendant le jeu (pas dans les menus ni en pause).
//  Il continue d'une partie à l'autre (REJOUER, chanson suivante) et repart
//  à zéro quand on revient au choix des équipes.
// =====================================================================
import type { Difficulty } from '../config/gameConfig';
import { Save } from './Save';

export type ProgressSport = 'baseball' | 'volley' | 'dance';

/** Échelle de difficulté D : 0 = facile, 0.5 = normal, 1 = difficile, 2 = très dur, 3 = impossible. */
export const LEVEL_ANCHORS = [0, 0.5, 1, 2, 3] as const;

/** Minutes de jeu → D. Facile pendant 3 minutes, difficile à 7, très dur à 11, impossible à 15. */
const CURVE: [number, number][] = [
  [0, 0],
  [3, 0],
  [7, 1],
  [11, 2],
  [15, 3],
];

/** Niveaux montrés au joueur (début en minutes). */
export const LEVELS = [
  { name: 'Facile', from: 0, color: '#7dff7a' },
  { name: 'Difficile', from: 3, color: '#ffe14d' },
  { name: 'Très dur', from: 7, color: '#ff9f43' },
  { name: 'Impossible', from: 11, color: '#ff5c5c' },
];

const FIXED: Record<Difficulty, number> = { easy: 0, normal: 0.5, hard: 1 };

const clock: Record<ProgressSport, number> = { baseball: 0, volley: 0, dance: 0 };

export const Progress = {
  /** vrai si la difficulté monte avec le temps (réglage DIFFICULTÉ = Progressive) */
  get on() {
    return Save.settings.progressive;
  },
  reset(sport: ProgressSport) {
    clock[sport] = 0;
  },
  /** Ajoute du temps de jeu (s). */
  add(sport: ProgressSport, dt: number) {
    clock[sport] += dt;
  },
  seconds(sport: ProgressSport) {
    return clock[sport];
  },
  /** D à un moment donné (s de jeu) ; avec une difficulté fixe : la valeur de cette difficulté. */
  levelAt(seconds: number) {
    if (!this.on) return FIXED[Save.settings.difficulty];
    const m = seconds / 60;
    for (let i = 1; i < CURVE.length; i++) {
      const [m1, d1] = CURVE[i];
      const [m0, d0] = CURVE[i - 1];
      if (m <= m1) return d0 + ((d1 - d0) * (m - m0)) / (m1 - m0);
    }
    return CURVE[CURVE.length - 1][1];
  },
  level(sport: ProgressSport) {
    return this.levelAt(clock[sport]);
  },
  /** Niveau montré (0 à 3) et son nom. */
  stage(sport: ProgressSport) {
    if (!this.on) {
      const d = Save.settings.difficulty;
      const name = d === 'easy' ? 'Facile' : d === 'hard' ? 'Difficile' : 'Normal';
      return { index: -1, name, color: '#c9d4ff', text: name };
    }
    const m = clock[sport] / 60;
    let index = 0;
    for (let i = 0; i < LEVELS.length; i++) if (m >= LEVELS[i].from) index = i;
    const L = LEVELS[index];
    return { index, name: L.name, color: L.color, text: `Niveau ${index + 1} · ${L.name}` };
  },
};

/** Valeur selon D : anchors = valeurs à D = 0, 0.5, 1, 2, 3 (interpolation linéaire). */
export function atLevel(d: number, anchors: readonly number[]): number {
  const A = LEVEL_ANCHORS;
  if (d <= A[0]) return anchors[0];
  for (let i = 1; i < A.length; i++) {
    if (d <= A[i]) return anchors[i - 1] + ((anchors[i] - anchors[i - 1]) * (d - A[i - 1])) / (A[i] - A[i - 1]);
  }
  return anchors[anchors.length - 1];
}

/** Mélange champ par champ de réglages numériques (même forme), selon D. */
export function blendAt<T extends object>(d: number, anchors: readonly T[]): T {
  const out = { ...anchors[0] } as Record<string, unknown>;
  for (const k of Object.keys(anchors[0])) {
    const v = (anchors[0] as Record<string, unknown>)[k];
    if (typeof v === 'number') out[k] = atLevel(d, anchors.map((a) => (a as Record<string, number>)[k]));
  }
  return out as T;
}
