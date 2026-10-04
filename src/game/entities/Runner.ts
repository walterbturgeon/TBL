import Phaser from 'phaser';
import { FIELD, SPEEDS, VIEW } from '../config/gameConfig';
import { stat, type CharacterDef, type TeamConfig } from '../config/teams';
import { basePathPoint, project } from '../world/Projection';
import { CartoonRig, lookFor } from './CartoonRig';

const L = FIELD.baseDistance;

/**
 * Coureuse sur les buts. La position est une distance le long du trajet des buts :
 * 0 = marbre, L = 1er but, 2L = 2e, 3L = 3e, 4L = point marqué.
 */
export class Runner {
  def: CharacterDef;
  rig: CartoonRig;
  d: number;
  target: number;
  lastBase: number;
  startBase: number;
  forcedTo: number | null = null;
  out = false;
  scored = false;
  isBatter = false;
  holdAt: number | null = null;
  manual = false;
  delay = 0;
  trot = false;
  sliding = 0;
  boost = 1; // sprint (flèches tapées par la joueuse)
  readonly speed: number;
  /** quitte le terrain (retrait ou point) : marche vers l'abri */
  exiting: { x: number; y: number; t: number } | null = null;
  private lastSx = 0;
  private lastSy = 0;

  constructor(scene: Phaser.Scene, def: CharacterDef, team: TeamConfig, base: number, rig?: CartoonRig) {
    this.def = def;
    this.rig = rig ?? new CartoonRig(scene, lookFor(def, team));
    if (!rig) scene.add.existing(this.rig);
    this.rig.baseScale = VIEW.characterScale * (stat.height(def) / 66);
    this.rig.setPose('stand');
    this.rig.showBat(false);
    this.d = base * L;
    this.target = base;
    this.lastBase = base;
    this.startBase = base;
    this.speed = SPEEDS.runner(stat.speed(def));
  }

  /** But sur lequel la coureuse se tient (ou -1 si elle est entre deux buts). */
  get onBase(): number {
    const k = Math.round(this.d / L);
    return Math.abs(this.d - k * L) < 0.05 ? k : -1;
  }

  get settled() {
    return !this.out && !this.scored && this.onBase === this.target && this.delay <= 0;
  }

  get pos() {
    return basePathPoint(this.d);
  }

  /** Temps restant pour atteindre le but k (s). */
  timeTo(k: number) {
    return Math.abs(k * L - this.d) / this.speed + Math.max(0, this.delay);
  }

  step(dt: number) {
    if (this.exiting) {
      const e = this.exiting;
      const p = this.exitPos ?? this.pos;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dd = Math.hypot(dx, dy);
      const st = Math.min(dd, 12 * dt);
      const nx = dd > 0 ? p.x + (dx / dd) * st : p.x;
      const ny = dd > 0 ? p.y + (dy / dd) * st : p.y;
      e.t -= dt;
      this.exitPos = { x: nx, y: ny };
      this.syncAt(nx, ny, dt, st > 0 ? 12 : 0);
      return;
    }
    if (this.delay > 0) {
      this.delay -= dt;
      this.syncAt(this.pos.x, this.pos.y, dt, 0);
      return;
    }
    if (this.out || this.scored) return;
    let goal = this.target * L;
    if (this.holdAt !== null && goal > this.holdAt && this.d <= this.holdAt + 0.01) goal = this.holdAt;
    const dir = Math.sign(goal - this.d);
    // tour des buts après un circuit : accéléré pour garder le rythme
    const sp = this.speed * (this.trot ? 2.2 : this.boost);
    if (dir !== 0) {
      const nd = this.d + dir * sp * dt;
      this.d = dir > 0 ? Math.min(goal, nd) : Math.max(goal, nd);
      if (dir > 0) {
        const k = Math.floor(this.d / L + 1e-6);
        if (k > this.lastBase) this.lastBase = k;
      } else {
        const k = Math.ceil(this.d / L - 1e-6);
        this.lastBase = Math.min(this.lastBase, k);
      }
    }
    if (this.sliding > 0) this.sliding -= dt;
    const p = this.pos;
    this.syncAt(p.x, p.y, dt, dir !== 0 ? sp : 0);
  }

  exitPos: { x: number; y: number } | null = null;

  private syncAt(x: number, y: number, dt: number, sp: number) {
    const s = project(x, y, 0);
    const vx = dt > 0 ? s.x - this.lastSx : 0;
    const vy = dt > 0 ? s.y - this.lastSy : 0;
    this.lastSx = s.x;
    this.lastSy = s.y;
    const l = Math.hypot(vx, vy) || 1;
    this.rig.setMotion(sp, vx / l, vy / l);
    this.rig.setPosition(s.x, s.y);
    this.rig.applyScale(s.s);
    this.rig.setDepth(s.y);
    this.rig.tick(dt);
  }

  /** Quitte le terrain vers l'abri. */
  leave(toward: { x: number; y: number }, seconds = 2.2) {
    this.exiting = { x: toward.x, y: toward.y, t: seconds };
  }

  destroy() {
    this.rig.destroy();
  }
}
