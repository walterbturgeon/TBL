import type { Difficulty } from '../config/gameConfig';
import { RULES } from '../config/gameConfig';

const KEY_SETTINGS = 'turcau-bbl.settings';
const KEY_RECORDS = 'turcau-bbl.records';

export interface Settings {
  musicVolume: number; // 0..10
  sfxVolume: number; // 0..10
  muted: boolean;
  difficulty: Difficulty;
  innings: number;
  timingAid: boolean;
  opponent: string;
}

export interface CareerLine {
  games: number;
  hits: number;
  hr: number;
  runs: number;
  k: number;
  putouts: number;
  mvp: number;
}

export interface Records {
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  bestScore: number;
  bestMargin: number;
  mostHomeRunsGame: number;
  career: Record<string, CareerLine>;
}

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 4,
  sfxVolume: 7,
  muted: false,
  difficulty: 'normal',
  innings: RULES.innings,
  timingAid: true,
  opponent: 'visiteur',
};

const DEFAULT_RECORDS: Records = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  bestScore: 0,
  bestMargin: 0,
  mostHomeRunsGame: 0,
  career: {},
};

function read<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(def);
    return { ...structuredClone(def), ...JSON.parse(raw) };
  } catch {
    return structuredClone(def);
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage plein ou bloqué : le jeu continue sans sauvegarde */
  }
}

let settings: Settings = read(KEY_SETTINGS, DEFAULT_SETTINGS);

export const Save = {
  get settings(): Settings {
    return settings;
  },
  updateSettings(patch: Partial<Settings>) {
    settings = { ...settings, ...patch };
    write(KEY_SETTINGS, settings);
  },
  records(): Records {
    return read(KEY_RECORDS, DEFAULT_RECORDS);
  },
  saveRecords(r: Records) {
    write(KEY_RECORDS, r);
  },
  resetRecords() {
    write(KEY_RECORDS, DEFAULT_RECORDS);
  },
  emptyLine(): CareerLine {
    return { games: 0, hits: 0, hr: 0, runs: 0, k: 0, putouts: 0, mvp: 0 };
  },
};
