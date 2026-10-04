import { FIELD } from '../config/gameConfig';
import type { Runner } from '../entities/Runner';

const L = FIELD.baseDistance;

/** Au moment de la frappe : qui est forcée d'avancer ? */
export function computeForces(runners: Runner[]) {
  const occupied = new Set<number>();
  for (const r of runners) if (!r.out && !r.scored) occupied.add(r.startBase);
  for (const r of runners) {
    r.forcedTo = null;
    if (r.out || r.scored) continue;
    if (r.isBatter) {
      r.forcedTo = 1;
      continue;
    }
    // forcée si tous les buts derrière elle sont occupés
    let forced = true;
    for (let b = 1; b < r.startBase; b++) if (!occupied.has(b)) forced = false;
    if (forced && r.startBase >= 1) r.forcedTo = r.startBase + 1;
  }
}

/** Quand une coureuse est retirée, les coureuses devant elle ne sont plus forcées. */
export function removeForcesAhead(runners: Runner[], outRunner: Runner) {
  for (const r of runners) if (r !== outRunner && r.startBase > outRunner.startBase) r.forcedTo = null;
}

/** Le but k est-il réclamé par une autre coureuse (qui y va ou qui y reste) ? */
export function baseClaimed(runners: Runner[], self: Runner, k: number) {
  if (k >= 4) return false;
  return runners.some((r) => r !== self && !r.out && !r.scored && r.target === k);
}

/**
 * Décision automatique : avancer au but suivant ?
 * eta = temps estimé pour que la défense amène la balle à ce but.
 */
export function shouldAdvance(r: Runner, runners: Runner[], eta: number, margin: number): boolean {
  const next = r.target + 1;
  if (next > 4) return false;
  if (baseClaimed(runners, r, next)) return false;
  // une coureuse devant doit aussi avancer pour libérer le but
  const t = L / r.speed;
  return t + margin < eta;
}

/** Applique la touche E (avancer) : de la coureuse de tête vers l'arrière. */
export function advanceAll(runners: Runner[]) {
  const list = runners.filter((r) => !r.out && !r.scored && !r.exiting).sort((a, b) => b.d - a.d);
  for (const r of list) {
    const movingBack = r.target * L < r.d - 0.01;
    const next = movingBack ? Math.ceil(r.d / L - 1e-6) : Math.min(4, r.target + 1);
    if (next === r.target) continue;
    if (baseClaimed(runners, r, next)) continue;
    r.target = next;
    r.holdAt = null;
    r.manual = true;
  }
}

/** Applique la touche Q (revenir) : chaque coureuse retourne au dernier but touché. */
export function retreatAll(runners: Runner[]) {
  const list = runners.filter((r) => !r.out && !r.scored && !r.exiting).sort((a, b) => a.d - b.d);
  for (const r of list) {
    if (r.forcedTo !== null && r.forcedTo === r.target) continue;
    if (r.onBase === r.target) continue;
    const back = Math.floor(r.d / L + 1e-6);
    if (back === r.target) continue;
    if (r.isBatter ? back < 1 : back < r.startBase) continue;
    if (baseClaimed(runners, r, back)) continue;
    r.target = back;
    r.manual = true;
  }
}
