// =====================================================================
//  DANSE : réglages (temps en secondes, fenêtres en millisecondes).
//  Les fenêtres sont larges : le plaisir d'abord.
// =====================================================================

export const DANCE = {
  /** couleur de chaque flèche : ← ↓ ↑ → */
  laneColors: [0xb46bff, 0x3fd0ff, 0x7dff7a, 0xff5fa2],
  laneSymbols: ['←', '↓', '↑', '→'],
  points: { perfect: 300, great: 200, good: 100 },
  // Valeurs selon le niveau D, aux points D = 0 (facile), 0.5 (normal), 1 (difficile), 2 (très dur), 3 (impossible).
  /** écart permis (ms) entre l'appui et le temps de la note */
  windows: {
    perfect: [60, 60, 60, 48, 36],
    great: [105, 105, 105, 82, 62],
    good: [150, 150, 150, 118, 90],
  },
  /** temps (s) pour qu'une flèche descende du haut jusqu'à la cible */
  scroll: [2.1, 1.65, 1.3, 1.05, 0.85],
  /** équipe de l'ordinateur : chance de PARFAIT, SUPER, BIEN (le reste est manqué) */
  ai: {
    perfect: [0.15, 0.28, 0.45, 0.62, 0.8],
    great: [0.3, 0.32, 0.3, 0.25, 0.15],
    good: [0.25, 0.18, 0.13, 0.08, 0.04],
  },
  /** vitesse de la musique (1 = normale) */
  tempo: [1, 1, 1, 1.1, 1.2],
  crewSize: 4, // danseuses sur scène à chaque round
  musicBoost: 2.6, // la musique est le cœur du mode : plus forte que la musique des menus
  /** décalage de l'horloge (ms) : à changer si les flèches arrivent toujours trop tôt ou trop tard */
  offsetMs: 0,
};

export type Grade = 'perfect' | 'great' | 'good' | 'miss';

export const GRADE_LABEL: Record<Grade, string> = {
  perfect: 'PARFAIT !',
  great: 'SUPER !',
  good: 'BIEN',
  miss: 'MANQUÉ',
};

export const GRADE_COLOR: Record<Grade, string> = {
  perfect: '#7dff7a',
  great: '#3fd0ff',
  good: '#ffe14d',
  miss: '#ff7b5c',
};

/** multiplicateur de combo : ×1, puis ×2 dès 10, ×3 dès 20, ×4 dès 30 */
export const comboMul = (combo: number) => 1 + Math.min(3, Math.floor(combo / 10));
