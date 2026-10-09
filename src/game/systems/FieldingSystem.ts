import { FIELD } from '../config/gameConfig';
import type { Position } from '../config/teams';
import { cloneSim, stepBall, type BallSim } from '../entities/Ball';
import type { Fielder } from '../entities/Fielder';
import type { Runner } from '../entities/Runner';
import { BASES, MOUND } from '../world/Projection';
import { dist } from '../util/math';

export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  bounced: boolean;
}

/** Prédit la trajectoire de la balle (pour l'IA défensive). */
export function predict(sim: BallSim, horizon = 5, dt = 1 / 30): Sample[] {
  const b = cloneSim(sim);
  const out: Sample[] = [];
  let t = 0;
  while (t < horizon) {
    const ev = stepBall(b, dt);
    t += dt;
    out.push({ t, x: b.x, y: b.y, z: b.z, bounced: b.bounced });
    if (ev.homerun) break;
    if (b.z === 0 && Math.hypot(b.vx, b.vy) < 0.3) break;
  }
  return out;
}

export interface Intercept {
  t: number;
  x: number;
  y: number;
  air: boolean; // attrapé avant de toucher le sol
}

/** Premier point de la trajectoire que la défenseure peut atteindre à temps. */
export function intercept(f: Fielder, samples: Sample[], reaction: number): Intercept {
  for (const s of samples) {
    if (s.z > f.reachZ) continue;
    const d = Math.max(0, dist(f.x, f.y, s.x, s.y) - f.catchR * 0.8);
    if (reaction + d / f.speed <= s.t) return { t: s.t, x: s.x, y: s.y, air: !s.bounced };
  }
  const last = samples[samples.length - 1] ?? { t: 0, x: f.x, y: f.y };
  const d = dist(f.x, f.y, last.x, last.y);
  return { t: Math.max(last.t, reaction + d / f.speed), x: last.x, y: last.y, air: false };
}

/** Point où une défenseure se place pour couvrir un but. */
export function coverSpot(base: number) {
  const b = BASES[base % 4];
  if (base === 1) return { x: b.x - 0.8, y: b.y + 0.4 };
  if (base === 4 || base === 0) return { x: 0.3, y: -1.6 };
  return { x: b.x, y: b.y };
}

/** Répartit les tâches : une poursuivante, une défenseure par but, les autres en soutien. */
export function assignDefense(fielders: Fielder[], chaser: Fielder | null, ballX: number, ballY: number) {
  const used = new Set<Fielder>();
  if (chaser) used.add(chaser);
  const get = (p: Position) => fielders.find((f) => f.pos === p)!;
  const prefs: [number, Position[]][] = [
    [1, ['1B', 'P', '2B']],
    [2, ballX > 0 ? ['SS', '2B', 'P'] : ['2B', 'SS', 'P']],
    [3, ['3B', 'SS', 'P']],
    [4, ['C', 'P']],
  ];
  for (const [base, list] of prefs) {
    // la défenseure qui tient la balle ne couvre pas : la suivante de la liste vient au but
    const f = list.map(get).find((x) => !used.has(x) && !x.hasBall);
    if (!f) continue;
    used.add(f);
    if (!f.hasBall) {
      f.task = 'cover';
      f.coverBase = base;
      const s = coverSpot(base);
      f.setTarget(s.x, s.y);
    }
  }
  for (const f of fielders) {
    if (used.has(f) || f.hasBall) continue;
    f.task = 'backup';
    f.coverBase = null;
    if (f.pos === 'P') {
      // relais : entre le monticule et la balle
      const k = Math.min(0.45, 55 / Math.max(1, dist(MOUND.x, MOUND.y, ballX, ballY)));
      f.setTarget(MOUND.x + (ballX - MOUND.x) * k, MOUND.y + (ballY - MOUND.y) * k);
    } else {
      f.setTarget(f.x + (ballX - f.x) * 0.45, f.y + (ballY - f.y) * 0.45);
    }
  }
  if (chaser) {
    chaser.task = 'chase';
    chaser.coverBase = null;
  }
}

export function coverOf(fielders: Fielder[], base: number): Fielder | undefined {
  return fielders.find((f) => f.task === 'cover' && f.coverBase === base);
}

export interface ThrowChoice {
  base: number;
  run: boolean;
  margin: number;
}

/** Temps pour que la balle (tenue par holder) arrive au but k. */
export function ballTimeToBase(holder: Fielder, fielders: Fielder[], k: number) {
  const b = BASES[k % 4];
  const dH = dist(holder.x, holder.y, b.x, b.y);
  if (dH < 2.5) return { t: 0, run: true };
  const run = dH / holder.speed;
  const rec = coverOf(fielders, k);
  const recT = rec && rec !== holder ? dist(rec.x, rec.y, b.x, b.y) / rec.speed : 0;
  const thr = Math.max(0.28 + dH / holder.throwSpeed, recT);
  if (dH < 28 && run < thr) return { t: run, run: true };
  return { t: thr, run: false };
}

/** Une coureuse peut-elle être retirée au but k ? (forcée, ou hors d'un but) */
export function outable(r: Runner, k: number) {
  if (r.out || r.scored || r.target !== k) return false;
  if (r.onBase === k) return false;
  return r.onBase === -1 || r.forcedTo === k || r.delay > 0;
}

/** Meilleur jeu pour la défenseure qui tient la balle. */
export function chooseThrow(holder: Fielder, fielders: Fielder[], runners: Runner[]): ThrowChoice | null {
  let best: ThrowChoice | null = null;
  let bestScore = -Infinity;
  for (const r of runners) {
    const k = r.target;
    if (!outable(r, k)) continue;
    const tr = r.timeTo(k);
    const tb = ballTimeToBase(holder, fielders, k);
    const margin = tr - tb.t;
    const score = margin + k * 0.06;
    if (margin > 0.12 && score > bestScore) {
      bestScore = score;
      best = { base: k, run: tb.run, margin };
    }
  }
  return best;
}

/** Sans jeu possible : où envoyer la balle pour arrêter les coureuses. */
export function containThrow(holder: Fielder, runners: Runner[]): number | null {
  const moving = runners.filter((r) => !r.out && !r.scored && !r.settled).sort((a, b) => b.d - a.d);
  if (moving.length === 0) return null;
  const lead = moving[0];
  const k = Math.min(4, lead.target + (lead.target < 4 ? 1 : 0));
  const target = lead.target === 4 ? 4 : k;
  const b = BASES[target % 4];
  if (dist(holder.x, holder.y, b.x, b.y) < 30) return null;
  return target;
}

export function isOutfield(x: number, y: number) {
  return Math.hypot(x, y) > FIELD.baseDistance * 1.55;
}
