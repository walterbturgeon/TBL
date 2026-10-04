import type { CharacterDef } from '../config/teams';
import { Save } from './Save';

export interface Line {
  ab: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  runs: number;
  rbi: number;
  walks: number;
  k: number; // retraits au bâton réussis (lanceur)
  putouts: number; // retraits réalisés en défensive
  catches: number; // ballons attrapés
}

const empty = (): Line => ({ ab: 0, hits: 0, singles: 0, doubles: 0, triples: 0, hr: 0, runs: 0, rbi: 0, walks: 0, k: 0, putouts: 0, catches: 0 });

/** Statistiques d'une partie, par personnage. */
export class GameStats {
  lines = new Map<string, Line>();
  defs = new Map<string, CharacterDef>();

  line(c: CharacterDef): Line {
    let l = this.lines.get(c.id);
    if (!l) {
      l = empty();
      this.lines.set(c.id, l);
      this.defs.set(c.id, c);
    }
    return l;
  }

  hit(c: CharacterDef, bases: number) {
    const l = this.line(c);
    l.hits++;
    if (bases === 1) l.singles++;
    else if (bases === 2) l.doubles++;
    else if (bases === 3) l.triples++;
    else l.hr++;
  }

  sum(ids: string[], key: keyof Line) {
    let s = 0;
    for (const id of ids) s += this.lines.get(id)?.[key] ?? 0;
    return s;
  }

  /** Pointage du meilleur personnage (frappe, course, défensive, lancers). */
  score(l: Line) {
    return l.hits * 2 + l.doubles + l.triples * 2 + l.hr * 4 + l.runs * 1.5 + l.rbi * 1.2 + l.walks * 0.5 + l.k * 1.4 + l.putouts * 0.8 + l.catches * 0.7;
  }

  mvp(ids: string[]): { def: CharacterDef; line: Line } | null {
    let best: { def: CharacterDef; line: Line } | null = null;
    let bs = -1;
    for (const id of ids) {
      const l = this.lines.get(id);
      const d = this.defs.get(id);
      if (!l || !d) continue;
      const s = this.score(l);
      if (s > bs) {
        bs = s;
        best = { def: d, line: l };
      }
    }
    return best;
  }

  /** Résumé lisible d'une ligne de statistiques. */
  static describe(l: Line, isPitcher: boolean) {
    const parts: string[] = [];
    if (l.ab > 0 || l.hits > 0) parts.push(`${l.hits} en ${l.ab}`);
    if (l.hr) parts.push(`${l.hr} circuit${l.hr > 1 ? 's' : ''}`);
    if (l.rbi) parts.push(`${l.rbi} pt produit${l.rbi > 1 ? 's' : ''}`);
    if (l.runs) parts.push(`${l.runs} pt${l.runs > 1 ? 's' : ''} marqué${l.runs > 1 ? 's' : ''}`);
    if (isPitcher || l.k) parts.push(`${l.k} retrait${l.k > 1 ? 's' : ''} au bâton`);
    if (l.putouts) parts.push(`${l.putouts} retrait${l.putouts > 1 ? 's' : ''} en défensive`);
    return parts.join(' · ') || 'Belle présence sur le terrain';
  }

  /** Ajoute la partie aux statistiques de carrière (localStorage). */
  commit(ids: string[], mvpId: string | null) {
    const rec = Save.records();
    for (const id of ids) {
      const l = this.lines.get(id) ?? empty();
      const c = rec.career[id] ?? Save.emptyLine();
      c.games++;
      c.hits += l.hits;
      c.hr += l.hr;
      c.runs += l.runs;
      c.k += l.k;
      c.putouts += l.putouts;
      if (id === mvpId) c.mvp++;
      rec.career[id] = c;
    }
    Save.saveRecords(rec);
  }
}
