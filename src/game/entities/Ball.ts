import Phaser from 'phaser';
import { FIELD, PHYSICS } from '../config/gameConfig';
import { project } from '../world/Projection';
import { bakeTexture, bakedImage } from '../util/bake';
import { LOW } from '../util/quality';

export type BallState = 'held' | 'pitch' | 'batted' | 'thrown' | 'loose' | 'dead' | 'homerun';

/** Données physiques pures : utilisées pour la balle réelle et pour les prédictions de l'IA. */
export interface BallSim {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bounced: boolean;
}

export interface StepEvents {
  bounce: boolean;
  fence: boolean;
  homerun: boolean;
  wallFoul: boolean;
}

export function cloneSim(b: BallSim): BallSim {
  return { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, bounced: b.bounced };
}

/** Physique arcade : gravité, rebond, friction au sol, clôture. */
export function stepBall(b: BallSim, dt: number): StepEvents {
  const ev: StepEvents = { bounce: false, fence: false, homerun: false, wallFoul: false };
  const onGround = b.z <= 0.01 && Math.abs(b.vz) < 0.01;
  if (!onGround) b.vz -= PHYSICS.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < -4) {
      b.vz = -b.vz * PHYSICS.bounce;
      b.vx *= PHYSICS.bounceFriction;
      b.vy *= PHYSICS.bounceFriction;
      b.bounced = true;
      ev.bounce = true;
    } else {
      b.vz = 0;
      b.bounced = true;
    }
  }
  if (b.z === 0 && b.vz === 0) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - PHYSICS.rollFriction * dt);
      b.vx *= ns / sp;
      b.vy *= ns / sp;
    }
  }

  // clôture du champ extérieur
  const r = Math.hypot(b.x, b.y);
  const ang = (Math.atan2(b.x, b.y) * 180) / Math.PI;
  if (r >= FIELD.fenceRadius && Math.abs(ang) <= 46 && b.y > 0) {
    if (b.z > FIELD.fenceHeight && !b.bounced && Math.abs(ang) <= 45) {
      ev.homerun = true;
    } else {
      const nx = b.x / r;
      const ny = b.y / r;
      const vr = b.vx * nx + b.vy * ny;
      if (vr > 0) {
        b.vx -= (1 + PHYSICS.fenceBounce) * vr * nx;
        b.vy -= (1 + PHYSICS.fenceBounce) * vr * ny;
      }
      b.x = nx * (FIELD.fenceRadius - 0.3);
      b.y = ny * (FIELD.fenceRadius - 0.3);
      ev.fence = true;
    }
  }
  // murs en territoire des fausses balles et filet arrière
  if (b.y < -FIELD.backstop) {
    b.y = -FIELD.backstop;
    if (b.vy < 0) b.vy = -b.vy * 0.3;
    ev.wallFoul = true;
  }
  for (const side of [-1, 1]) {
    // distance perpendiculaire à la ligne de fausse balle (positive = hors du terrain)
    const d = (side * b.x - b.y) / Math.SQRT2;
    if (d > FIELD.foulWall) {
      const nx = side / Math.SQRT2;
      const ny = -1 / Math.SQRT2;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= 1.4 * vn * nx;
        b.vy -= 1.4 * vn * ny;
      }
      b.x -= nx * (d - FIELD.foulWall);
      b.y -= ny * (d - FIELD.foulWall);
      ev.wallFoul = true;
    }
  }
  return ev;
}

export interface PitchPath {
  x0: number;
  y0: number;
  z0: number;
  tx: number;
  tz: number;
  T: number; // durée jusqu'au marbre (s)
  arc: number; // hauteur supplémentaire au milieu (pi)
  curve: number; // déviation latérale maximale (pi)
  wild: boolean;
}

/** Position du lancer à l'instant t (s). Après le marbre, la balle ralentit vers le gant. */
export function pitchPos(p: PitchPath, t: number) {
  const catcherY = -3.8;
  const after = 0.24; // délai entre le marbre et le gant : laisse la fenêtre « tard » possible
  if (t <= p.T) {
    const u = t / p.T;
    const x = p.x0 + (p.tx - p.x0) * u + p.curve * Math.sin(Math.PI * u) * u;
    const y = p.y0 * (1 - u);
    let z = p.z0 + (p.tz - p.z0) * u + p.arc * Math.sin(Math.PI * u);
    if (p.wild && u > 0.7) z = Math.max(0, z - (u - 0.7) * 14);
    return { x, y, z, done: false };
  }
  const v = Math.min(1, (t - p.T) / after);
  return {
    x: p.tx,
    y: catcherY * v,
    z: p.wild ? Math.abs(Math.sin(v * Math.PI)) * 1.5 : p.tz,
    done: v >= 1,
  };
}

export class Ball {
  sim: BallSim = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, bounced: false };
  state: BallState = 'held';
  pitch: PitchPath | null = null;
  pitchT = 0;
  private g: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private trail: { x: number; y: number }[] = [];
  private trailG: Phaser.GameObjects.Graphics;
  visible = true;

  constructor(scene: Phaser.Scene) {
    const BB: [number, number, number, number] = [-8, -8, 8, 8];
    const SB: [number, number, number, number] = [-8, -4, 8, 4];
    bakeTexture(scene, 'ball_shadow', SB, 3, (g) => {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, 0, 13, 5);
    });
    bakeTexture(scene, 'ball_tex', BB, 4, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, 6);
      g.lineStyle(1.6, 0xd62828, 1);
      g.beginPath();
      g.arc(-7, 0, 5.2, -0.9, 0.9);
      g.strokePath();
      g.beginPath();
      g.arc(7, 0, 5.2, Math.PI - 0.9, Math.PI + 0.9);
      g.strokePath();
      g.lineStyle(2.4, 0x141414, 1);
      g.strokeCircle(0, 0, 6);
    });
    this.shadow = bakedImage(scene, 'ball_shadow', SB, 3, 0, 0);
    this.trailG = scene.add.graphics();
    this.g = bakedImage(scene, 'ball_tex', BB, 4, 0, 0);
  }

  setPos(x: number, y: number, z: number) {
    this.sim.x = x;
    this.sim.y = y;
    this.sim.z = z;
  }

  setVel(vx: number, vy: number, vz: number) {
    this.sim.vx = vx;
    this.sim.vy = vy;
    this.sim.vz = vz;
  }

  speed() {
    return Math.hypot(this.sim.vx, this.sim.vy, this.sim.vz);
  }

  groundSpeed() {
    return Math.hypot(this.sim.vx, this.sim.vy);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.g.setVisible(v);
    this.shadow.setVisible(v);
    this.trailG.setVisible(v);
    if (!v) this.trail = [];
  }

  /** Met à jour le dessin à l'écran (balle, ombre, traînée). */
  render() {
    const b = this.sim;
    const ground = project(b.x, b.y, 0);
    const air = project(b.x, b.y, b.z);
    const lift = Math.min(1, b.z / 40);
    this.shadow.setPosition(ground.x, ground.y);
    this.shadow.setScale((ground.s * (1 - lift * 0.45)) / 3);
    this.shadow.setAlpha(1 - lift * 0.5);
    // la balle grossit un peu quand elle est haute : la hauteur est facile à lire
    const sz = air.s * (1 + Math.min(0.9, b.z / 55));
    this.g.setPosition(air.x, air.y);
    this.g.setScale(sz / 4);
    this.g.setDepth(air.y + b.z * 4 + 2000);
    this.shadow.setDepth(ground.y - 1);
    this.trailG.setDepth(air.y + 1999);

    const fast = !LOW && (this.state === 'pitch' || this.state === 'batted' || this.state === 'thrown');
    this.trail.push({ x: air.x, y: air.y });
    if (this.trail.length > 7 || !fast) this.trail.shift();
    if (!fast) this.trail = [];
    this.trailG.clear();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      this.trailG.fillStyle(0xffffff, (i / this.trail.length) * 0.35);
      this.trailG.fillCircle(p.x, p.y, 4 * sz * (i / this.trail.length));
    }
  }

  screen() {
    return project(this.sim.x, this.sim.y, this.sim.z);
  }
}
