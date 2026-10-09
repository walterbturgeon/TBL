// =====================================================================
//  DANSE : réglages (temps en secondes, fenêtres en millisecondes).
//  Les fenêtres sont larges : le plaisir d'abord.
// =====================================================================

export const DANCE = {
  /** couleur de chaque flèche : ← ↓ ↑ → */
  laneColors: [0xb46bff, 0x3fd0ff, 0x7dff7a, 0xff5fa2],
  laneSymbols: ['←', '↓', '↑', '→'],
  /** écart permis entre l'appui et le temps de la note */
  windows: { perfect: 60, great: 105, good: 150 },
  points: { perfect: 300, great: 200, good: 100 },
  /** temps (s) pour qu'une flèche descende du haut jusqu'à la cible */
  scroll: { easy: 2.1, normal: 1.65, hard: 1.3 },
  /** équipe de l'ordinateur : chance de PARFAIT, SUPER, BIEN (le reste est manqué) */
  ai: {
    easy: [0.15, 0.3, 0.25],
    normal: [0.28, 0.32, 0.18],
    hard: [0.45, 0.3, 0.13],
  },
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
