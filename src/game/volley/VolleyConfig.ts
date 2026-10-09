// =====================================================================
//  VOLLEYBALL : réglages (distances en mètres, temps en secondes).
// =====================================================================

export const COURT = {
  half: 9, // longueur d'un demi-terrain (le filet est en x = 0)
  width: 9, // largeur du terrain (y de 0 à 9)
  netH: 2.24, // hauteur du filet (féminin)
  attack: 3, // ligne d'attaque
};

/** Vue de côté, comme à la télévision, avec une légère perspective. */
export const VVIEW = {
  cx: 960,
  baseY: 905, // ligne de côté la plus proche
  pxX: 82, // pixels par mètre le long du terrain (côté proche)
  pxY: 36, // pixels par mètre en profondeur
  pxZ: 82, // pixels par mètre en hauteur
  depth: 22, // perspective (plus petit = plus forte)
  charScale: 1.55, // taille des personnages
};

export const VPHYS = {
  g: 7.8, // gravité un peu réduite : la balle reste plus longtemps en l'air
};

/** Fenêtres de timing (ms) autour du moment idéal du contact. Assez larges : le plaisir d'abord. */
export const VTIMING = {
  perfect: 80,
  good: 170,
  ok: 260,
};

export const VRULES = {
  winBy: 2,
  cap: 30, // au plus tard, le set finit à ce pointage
};

/** Aide à l'équipe du joueur quand l'ordinateur smashe vers elle (le plaisir d'abord). */
export const VDIG_HELP = {
  spikeSpeedMul: 0.8, // smash de l'ordinateur 20 % moins rapide
  aimTries: { Facile: 3, Normal: 4, Difficile: 8 } as Record<string, number>, // endroits essayés par l'ordinateur (16 = visée parfaite)
  contactZ: 1.25, // hauteur (m) du moment idéal de la manchette ; 0.9 pour l'ordinateur
  rush: 1.2, // la joueuse court 20 % plus vite vers la balle
  reaction: 0.08, // temps de réaction (s) ; 0.15 pour l'ordinateur
  diveReach: 2.6, // portée du plongeon (m) ; 1.8 pour l'ordinateur
  diveMul: 0.85, // qualité d'une manchette en plongeon ; 0.75 pour l'ordinateur
  autoQ: 0.36, // qualité moyenne d'une touche automatique (sans appui)
  autoMiss: 0.4, // risque de rater une manchette automatique faible
  smashAutoMiss: 0.5, // risque de rater un smash sans appui
};

/** Vitesse de déplacement (m/s) selon la vitesse sur 10. */
export const vMoveSpeed = (speed: number) => 3.4 + speed * 0.3;

/** Positions de rotation 1 à 6 pour l'équipe de gauche (x < 0). L'équipe de droite est en miroir. */
export const ROT_SPOTS: Record<number, { x: number; y: number }> = {
  1: { x: -7, y: 1.6 },
  2: { x: -2.2, y: 1.6 },
  3: { x: -2.2, y: 4.5 },
  4: { x: -2.2, y: 7.4 },
  5: { x: -7, y: 7.4 },
  6: { x: -7, y: 4.5 },
};
