// =====================================================================
//  RÉGLAGES DU JEU : terrain, physique, timing, difficulté, règles.
//  Toutes les distances sont en pieds, les vitesses en pieds/seconde.
// =====================================================================

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
export const VERSION = '0.1.0';

export const FIELD = {
  baseDistance: 70, // distance entre les buts
  moundDistance: 46, // marbre → monticule
  fenceRadius: 205, // distance de la clôture
  fenceHeight: 7,
  foulWall: 26, // distance des murs en territoire des fausses balles
  backstop: 22, // distance du filet derrière le marbre
};

/** Projection « vue d'en haut avec légère perspective ». */
export const VIEW = {
  homeX: 960,
  homeY: 945,
  pxPerFootX: 5.6,
  pxPerFootY: 4.95,
  pxPerFootZ: 4.0,
  perspective: 700, // plus petit = perspective plus forte
  characterScale: 0.95,
};

export const PHYSICS = {
  gravity: 38,
  bounce: 0.42, // restitution verticale au sol
  bounceFriction: 0.76, // perte de vitesse horizontale à chaque rebond
  rollFriction: 26, // décélération au sol
  fenceBounce: 0.35,
};

/** Fenêtres de timing de la frappe, en millisecondes (avant le multiplicateur de difficulté). */
export const TIMING = {
  // 5 % plus large que 45 / 105 / 165 / 230 : frappe un peu plus facile
  perfect: 47,
  good: 110,
  ok: 173,
  max: 242,
};

/** Fenêtres de timing de l'IA au bâton (plus étroites : l'IA ne doit pas frapper plus souvent). */
export const TIMING_AI = {
  perfect: 30,
  good: 75,
  ok: 125,
  max: 175,
};

export type PitchType = 'fastball' | 'slow' | 'changeup' | 'curve';

export const PITCH_TYPES: Record<PitchType, { label: string; speedMul: number; arc: number; curve: number; weight: number }> = {
  fastball: { label: 'Balle rapide', speedMul: 1.0, arc: 1.0, curve: 0, weight: 45 },
  changeup: { label: 'Changement de vitesse', speedMul: 0.76, arc: 2.0, curve: 0, weight: 20 },
  slow: { label: 'Balle lente', speedMul: 0.62, arc: 4.5, curve: 0, weight: 15 },
  curve: { label: 'Balle courbe', speedMul: 0.82, arc: 2.5, curve: 1.6, weight: 20 },
};

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultySettings {
  label: string;
  pitchSpeedMul: number; // vitesse des lancers adverses vers le joueur
  timingWindowMul: number; // largeur des fenêtres de timing du joueur
  aiTimingSd: number; // erreur de timing de l'IA au bâton (ms)
  aiWhiff: number; // chance de swing complètement raté de l'IA
  aiSwingStrike: number;
  aiSwingBall: number;
  aiPowerMul: number;
  aiReaction: number; // délai de réaction des défenseures IA (s)
  aiFielderSpeedMul: number;
  aiRunnerMargin: number; // prudence des coureuses IA (s)
  assist: number; // aide au déplacement de la joueuse contrôlée (0 = aucune)
  aiStrikeChance: number; // précision de la lanceuse adverse
}

export const DIFFICULTY: Record<Difficulty, DifficultySettings> = {
  easy: {
    label: 'Facile',
    pitchSpeedMul: 0.7,
    timingWindowMul: 1.5,
    aiTimingSd: 120,
    aiWhiff: 0.3,
    aiSwingStrike: 0.7,
    aiSwingBall: 0.35,
    aiPowerMul: 0.85,
    aiReaction: 0.42,
    aiFielderSpeedMul: 0.9,
    aiRunnerMargin: 0.65,
    assist: 1.0,
    aiStrikeChance: 0.8,
  },
  normal: {
    label: 'Normal',
    pitchSpeedMul: 0.78,
    timingWindowMul: 1.25,
    aiTimingSd: 90,
    aiWhiff: 0.2,
    aiSwingStrike: 0.75,
    aiSwingBall: 0.28,
    aiPowerMul: 0.95,
    aiReaction: 0.36,
    aiFielderSpeedMul: 1.0,
    aiRunnerMargin: 0.45,
    assist: 0.8,
    aiStrikeChance: 0.74,
  },
  hard: {
    label: 'Difficile',
    pitchSpeedMul: 0.92,
    timingWindowMul: 1.0,
    aiTimingSd: 70,
    aiWhiff: 0.13,
    aiSwingStrike: 0.8,
    aiSwingBall: 0.22,
    aiPowerMul: 1.04,
    aiReaction: 0.22,
    aiFielderSpeedMul: 1.05,
    aiRunnerMargin: 0.3,
    assist: 0.6,
    aiStrikeChance: 0.68,
  },
};

export const RULES = {
  innings: 3, // durée par défaut (changeable dans les options : 1, 3, 6, 9)
  strikesForOut: 3,
  ballsForWalk: 4,
  outsPerHalf: 3,
  runLimitPerHalf: 5, // limite de points par demi-manche (règle de ligue mineure). 0 = aucune limite
  maxExtraInnings: 3, // après, la partie est nulle
};

/**
 * Commandes simplifiées : ESPACE (frapper / lancer), FLÈCHES (bouger), ÉCHAP (pause).
 * Les options ci-dessous ajoutent des touches avancées. Elles sont désactivées par défaut.
 */
export const CONTROLS = {
  manualRunning: false, // true : E = avancer les coureuses, Q = les faire revenir
  numberKeyThrows: false, // true : 1-2-3-4 = lancer à un but précis
  autoThrowDelay: 1.2, // s : la joueuse lance seule si personne n'appuie sur ESPACE
  sprintMax: 0.55, // vitesse en plus quand on tape vite sur les flèches (0.55 = +55 %)
  sprintHold: 0.35, // part du sprint gardée en tenant une flèche enfoncée
  sprintPerTap: 0.22, // chaque appui sur une flèche remplit la jauge
  sprintDecay: 0.9, // la jauge se vide (par seconde)
  diveTime: 0.42, // durée du plongeon (s)
  diveRecover: 0.5, // temps pour se relever (s)
  diveReach: 2.2, // le plongeon multiplie la portée du gant
};

/** Vitesses des personnages, calculées à partir des statistiques sur 10. */
export const SPEEDS = {
  runner: (speed: number) => 14.5 + speed * 1.05,
  fielder: (speed: number) => 12 + speed * 0.95,
  throw: (throwing: number) => 50 + throwing * 3,
  pitch: (pitching: number) => 46 + pitching * 2.2,
  catchRadius: (defense: number) => 2.3 + defense * 0.13,
};

/** Durées des animations rapides (s). Elles ne doivent jamais ralentir le jeu. */
export const PACE = {
  signTime: 0.55,
  confusedExtra: 0.55,
  windupTime: 0.55,
  afterPitch: 0.75,
  afterPlay: 1.1,
  bannerTime: 1.6,
};
