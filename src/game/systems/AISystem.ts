import type { DifficultySettings } from '../config/gameConfig';
import type { PitchPlan } from './PitchingSystem';
import type { TimingWindows } from './BattingSystem';
import { chance, gauss, rand } from '../util/math';

/** Décision de l'IA au bâton : s'élancer ou non, et avec quelle erreur de timing (ms). */
export function aiSwing(plan: PitchPlan, diff: DifficultySettings, w: TimingWindows, strikes: number) {
  const pSwing = plan.strike ? diff.aiSwingStrike + (strikes === 2 ? 0.12 : 0) : diff.aiSwingBall + (strikes === 2 ? 0.1 : 0);
  if (plan.path.wild || !chance(pSwing)) return { swing: false, deltaMs: 0 };
  if (chance(diff.aiWhiff + (plan.type === 'curve' ? 0.08 : 0))) {
    const side = chance(0.6) ? -1 : 1;
    return { swing: true, deltaMs: side * (w.max + rand(30, 140)) };
  }
  let bias = 0;
  let sd = diff.aiTimingSd;
  if (plan.type === 'changeup') bias = -45;
  if (plan.type === 'slow') bias = -30;
  if (plan.type === 'curve') sd *= 1.25;
  return { swing: true, deltaMs: gauss(bias, sd) };
}
