import Phaser from 'phaser';
import { SPEEDS, VIEW } from '../config/gameConfig';
import { stat, type CharacterDef, type Position, type TeamConfig } from '../config/teams';
import { project } from '../world/Projection';
import { CartoonRig, lookFor } from './CartoonRig';

export type FielderTask = 'idle' | 'chase' | 'cover' | 'backup' | 'hold' | 'pitch' | 'catch';

/** Défenseure (ou lanceur / receveuse). Les mêmes objets servent aux deux équipes. */
export class Fielder {
  def: CharacterDef;
  pos: Position;
  team: TeamConfig;
  rig: CartoonRig;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  tx: number;
  ty: number;
  task: FielderTask = 'idle';
  coverBase: number | null = null;
  hasBall = false;
  reaction = 0;
  decideT = 0;
  human = false;
  speedMul = 1;
  diveT = 0; // plongeon en cours
  recoverT = 0; // se relève après un plongeon
  readonly runSpeed: number;
  readonly throwSpeed: number;
  readonly catchR: number;
  readonly reachZ: number;
  private lastSx = 0;
  private lastSy = 0;

  constructor(scene: Phaser.Scene, def: CharacterDef, pos: Position, team: TeamConfig, home: { x: number; y: number }) {
    this.def = def;
    this.pos = pos;
    this.team = team;
    this.rig = new CartoonRig(scene, lookFor(def, team, { catcherGear: pos === 'C' }));
    scene.add.existing(this.rig);
    this.rig.baseScale = VIEW.characterScale * (stat.height(def) / 66);
    this.x = this.homeX = this.tx = home.x;
    this.y = this.homeY = this.ty = home.y;
    this.runSpeed = SPEEDS.fielder(stat.speed(def));
    this.throwSpeed = SPEEDS.throw(stat.throwing(def));
    this.catchR = SPEEDS.catchRadius(stat.catching(def)) + (pos === 'C' ? 0.6 : 0);
    this.reachZ = 6.2 + (stat.height(def) - 60) / 14;
    if (pos === 'C') this.rig.showMask(true);
    this.sync(0);
  }

  get speed() {
    return this.runSpeed * this.speedMul;
  }

  setTarget(x: number, y: number) {
    this.tx = x;
    this.ty = y;
  }

  /** Avance vers la cible. Retourne la distance restante. */
  moveToward(dt: number, mul = 1) {
    if (this.reaction > 0) {
      this.reaction -= dt;
      return Math.hypot(this.tx - this.x, this.ty - this.y);
    }
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * mul * dt;
    if (d <= step || d < 0.05) {
      this.x = this.tx;
      this.y = this.ty;
      return 0;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return d - step;
  }

  /** Déplacement manuel (clavier). dir en coordonnées du monde. La cible devient la position. */
  moveDir(dt: number, dx: number, dy: number, mul = 1) {
    this.step(dt, dx, dy, mul);
    this.tx = this.x;
    this.ty = this.y;
  }

  /** Déplacement dans une direction, sans changer la cible (sprint guidé vers la balle). */
  step(dt: number, dx: number, dy: number, mul = 1) {
    const l = Math.hypot(dx, dy);
    if (l < 0.01) return;
    this.x += (dx / l) * this.speed * mul * dt;
    this.y += (dy / l) * this.speed * mul * dt;
  }

  /** Portée du gant (plus grande pendant un plongeon). */
  reach(diveReach: number) {
    return this.diveT > 0 ? this.catchR * diveReach : this.catchR;
  }

  sync(dt: number) {
    const s = project(this.x, this.y, 0);
    const vx = dt > 0 ? (s.x - this.lastSx) / dt : 0;
    const vy = dt > 0 ? (s.y - this.lastSy) / dt : 0;
    this.lastSx = s.x;
    this.lastSy = s.y;
    const sp = Math.hypot(vx, vy) / (VIEW.pxPerFootX * s.s);
    this.rig.setMotion(sp, vx / (Math.hypot(vx, vy) || 1), vy / (Math.hypot(vx, vy) || 1));
    this.rig.setPosition(s.x, s.y);
    this.rig.applyScale(s.s);
    this.rig.setDepth(s.y);
    this.rig.tick(dt);
  }

  setVisible(v: boolean) {
    this.rig.setVisible(v);
  }

  resetHome() {
    this.x = this.tx = this.homeX;
    this.y = this.ty = this.homeY;
    this.task = 'idle';
    this.coverBase = null;
    this.hasBall = false;
    this.rig.setHoldingBall(false);
  }
}
