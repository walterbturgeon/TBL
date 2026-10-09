// =====================================================================
//  DANSE : musiques et chorégraphies.
//  Les musiques sont jouées par le jeu (synthèse Web Audio) : elles sont
//  originales, libres de droits, et toujours en rythme avec les flèches.
// =====================================================================

export type ChordType = 'm7' | 'maj7' | '7' | 'm' | 'M';
export interface Chord {
  root: number; // note MIDI de la basse (36 = do grave)
  type: ChordType;
}

export interface Song {
  id: string;
  title: string;
  style: string;
  bpm: number;
  swing: number; // 0 à 0.3 : retard des doubles-croches impaires (groove hip-hop)
  barsPerRound: number;
  color: number; // couleur des lumières
  chords: Chord[]; // un accord par mesure, en boucle
  /** 16 pas par mesure. x = coup ; o = charleston ouvert ; . = rien */
  kick: string;
  snare: string;
  clap?: string;
  hat: string;
  /** dernière mesure d'une phrase de 4 mesures */
  fill: { kick: string; snare: string; hat: string };
  /** 16 pas : R = fondamentale, 3, 5, 7, O = octave ; . = rien */
  bass: string;
  bassType: 'saw' | '808' | 'slap';
  keys: string; // 16 pas : x = accord
  keysType: 'rhodes' | 'stab' | 'pad';
}

export const SONGS: Song[] = [
  {
    id: 'rue',
    title: 'Rue Turcau',
    style: 'Boom-bap',
    bpm: 92,
    swing: 0.16,
    barsPerRound: 8,
    color: 0xffb703,
    chords: [
      { root: 45, type: 'm7' },
      { root: 41, type: 'maj7' },
      { root: 38, type: 'm7' },
      { root: 40, type: '7' },
    ],
    kick: 'x......x..x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    fill: { kick: 'x......x..x.x...', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.xxxx' },
    bass: 'R......R..5...O.',
    bassType: 'saw',
    keys: 'x......x........',
    keysType: 'rhodes',
  },
  {
    id: 'neon',
    title: 'Néon Funk',
    style: 'Funk',
    bpm: 108,
    swing: 0.06,
    barsPerRound: 8,
    color: 0xff3cac,
    chords: [
      { root: 40, type: 'm7' },
      { root: 45, type: '7' },
      { root: 40, type: 'm7' },
      { root: 47, type: 'm7' },
    ],
    kick: 'x..x..x...x..x..',
    snare: '....x.......x...',
    clap: '....x.......x...',
    hat: 'xxxoxxxoxxxoxxxo',
    fill: { kick: 'x..x..x...x.x.x.', snare: '....x.......xxxx', hat: 'xxxoxxxoxxxoxxxx' },
    bass: 'R..R.O..R.7.R.5.',
    bassType: 'slap',
    keys: '..x....x..x....x',
    keysType: 'stab',
  },
  {
    id: 'gros808',
    title: 'Gros 808',
    style: 'Trap',
    bpm: 140,
    swing: 0,
    barsPerRound: 12,
    color: 0x7b2ff7,
    chords: [
      { root: 36, type: 'm' },
      { root: 36, type: 'm' },
      { root: 44, type: 'M' },
      { root: 43, type: 'M' },
    ],
    kick: 'x......x..x.....',
    snare: '........x.......',
    clap: '........x.......',
    hat: 'x.x.x.x.x.x.x.x.',
    fill: { kick: 'x......x..x...x.', snare: '........x.....xx', hat: 'x.x.x.x.xxxxxxxx' },
    bass: 'R......R..R.....',
    bassType: '808',
    keys: 'x...............',
    keysType: 'pad',
  },
];

export const CHORD_NOTES: Record<ChordType, number[]> = {
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  m: [0, 3, 7, 12],
  M: [0, 4, 7, 12],
};

// ---------------------------------------------------------------- plan de la chanson
export type SectionKind = 'intro' | 'round' | 'break' | 'outro';
export interface Section {
  kind: SectionKind;
  round: number; // 0, 1, 2 (pour intro et outro : -1)
  startBar: number;
  bars: number;
}

export const ROUNDS = 3;

/** Intro (2 mesures), 3 rounds séparés par une pause (2 mesures), puis la fin (2 mesures). */
export function layoutOf(song: Song): { sections: Section[]; totalBars: number } {
  const sections: Section[] = [];
  let bar = 0;
  const add = (kind: SectionKind, round: number, bars: number) => {
    sections.push({ kind, round, startBar: bar, bars });
    bar += bars;
  };
  add('intro', -1, 2);
  for (let r = 0; r < ROUNDS; r++) {
    add('round', r, song.barsPerRound);
    if (r < ROUNDS - 1) add('break', r, 2);
  }
  add('outro', -1, 2);
  return { sections, totalBars: bar };
}

export function sectionAt(sections: Section[], bar: number): Section {
  for (const s of sections) if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
  return sections[sections.length - 1];
}

// ---------------------------------------------------------------- chorégraphies
/** Flèches : 0 = ←, 1 = ↓, 2 = ↑, 3 = →. Une note = [temps dans la mesure, flèche]. */
export type Lane = 0 | 1 | 2 | 3;
export interface Note {
  time: number; // secondes depuis le début de la chanson
  beat: number;
  lane: Lane;
  round: number;
  done: boolean; // jouée ou manquée par le joueur
  aiDone: boolean;
}

type Pattern = [number, Lane][];
const EASY: Pattern[] = [
  [
    [0, 0],
    [2, 3],
  ],
  [
    [0, 3],
    [2, 0],
  ],
  [
    [0, 2],
    [2, 1],
  ],
  [
    [0, 1],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 3],
    [2, 0],
    [3, 3],
  ],
];
const NORMAL: Pattern[] = [
  [
    [0, 0],
    [1, 3],
    [2, 0],
    [3, 3],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 3],
    [3, 3],
  ],
  [
    [0, 2],
    [1.5, 1],
    [2, 0],
    [3, 3],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 3],
    [1, 2],
    [2, 1],
    [3, 0],
  ],
  [
    [0, 1],
    [2, 2],
    [3, 2],
  ],
];
const HARD: Pattern[] = [
  ...NORMAL,
  [
    [0, 0],
    [0.5, 3],
    [1, 0],
    [2, 2],
    [3, 1],
    [3.5, 1],
  ],
  [
    [0, 1],
    [1, 2],
    [1.5, 2],
    [2, 0],
    [2.5, 3],
    [3, 1],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [1.5, 3],
    [2, 2],
    [3, 0],
  ],
  [
    [0, 3],
    [1, 3],
    [1.5, 0],
    [2, 1],
    [2.5, 2],
    [3, 2],
  ],
];
// très dur et impossible : croches partout et doubles-croches
const INSANE: Pattern[] = [
  ...HARD.slice(-4),
  [
    [0, 0],
    [0.5, 3],
    [1, 0],
    [1.5, 3],
    [2, 1],
    [2.5, 2],
    [3, 1],
    [3.5, 2],
  ],
  [
    [0, 2],
    [0.25, 2],
    [0.5, 1],
    [1, 0],
    [1.5, 3],
    [2, 0],
    [2.25, 0],
    [2.5, 3],
    [3, 2],
    [3.5, 1],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [1.5, 3],
    [2, 3],
    [2.5, 2],
    [3, 1],
    [3.5, 0],
  ],
  [
    [0, 1],
    [0.5, 1],
    [0.75, 2],
    [1, 3],
    [2, 0],
    [2.5, 1],
    [2.75, 2],
    [3, 3],
    [3.5, 0],
  ],
];
const FINALE: Pattern = [[0, 2]]; // dernière mesure d'un round : un grand saut

/** Pas selon le niveau D (0 facile, 0.5 normal, 1 difficile, 2 très dur, 3 impossible). */
function libFor(d: number): { lib: Pattern[]; key: number } {
  if (d < 0.25) return { lib: EASY, key: 1 };
  if (d < 0.75) return { lib: NORMAL, key: 2 };
  if (d < 1.5) return { lib: HARD, key: 3 };
  return { lib: INSANE, key: 4 };
}

/** Générateur aléatoire avec graine : la même chanson donne toujours la même chorégraphie. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chorégraphie d'une chanson. levelOf(round) = niveau D de chaque round (il peut monter d'un round à l'autre). */
export function chartOf(song: Song, levelOf: (round: number) => number): Note[] {
  const spb = 60 / song.bpm;
  const notes: Note[] = [];
  const { sections } = layoutOf(song);
  for (const sec of sections) {
    if (sec.kind !== 'round') continue;
    const { lib, key } = libFor(levelOf(sec.round));
    let seed = key * 7919 + sec.round * 104729;
    for (const ch of song.id) seed = seed * 31 + ch.charCodeAt(0);
    const rnd = seeded(seed);
    let prev = -1;
    for (let b = 0; b < sec.bars; b++) {
      const last = b === sec.bars - 1;
      // une mesure sur deux répète la précédente (comme une vraie chorégraphie) ;
      // sinon, un nouveau pas, différent du précédent
      if (b % 2 === 0 || prev < 0) {
        let idx = Math.floor(rnd() * lib.length);
        if (idx === prev) idx = (idx + 1) % lib.length;
        prev = idx;
      }
      const pat = last ? FINALE : lib[prev];
      for (const [beatInBar, lane] of pat) {
        const beat = (sec.startBar + b) * 4 + beatInBar;
        notes.push({ time: beat * spb, beat, lane, round: sec.round, done: false, aiDone: false });
      }
    }
  }
  return notes;
}
