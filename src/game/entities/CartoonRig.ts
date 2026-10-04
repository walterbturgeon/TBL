import Phaser from 'phaser';
import type { Expression, HairStyle } from '../config/players';
import type { FurStyle } from '../config/dogs';
import type { CharacterDef, TeamConfig } from '../config/teams';
import { hex, shade } from '../util/math';
import { LOW, QUALITY } from '../util/quality';

/** Finesse des petits textes (numéros) : 1 en mode Canvas, où une valeur plus grande agrandit le texte. */
const textRes = (r: number) => (QUALITY === 'canvas' ? 1 : r);

/** Textures créées par chaque scène : retirées de la mémoire quand la scène se ferme. */
const owned = new WeakMap<Phaser.Scene, Set<string>>();
function track(scene: Phaser.Scene, key: string) {
  let set = owned.get(scene);
  if (!set) {
    const s = new Set<string>();
    set = s;
    owned.set(scene, s);
    scene.events.once('shutdown', () => {
      for (const k of s) if (scene.textures.exists(k)) scene.textures.remove(k);
      owned.delete(scene);
    });
  }
  set.add(key);
}

/**
 * Personnage cartoon dessiné en vecteurs (contours noirs épais, aplats de couleur).
 * Le même moteur dessine les joueuses et les chiens (Billy, Stella).
 * Origine du conteneur = point au sol, entre les pieds.
 */

export type View = 'front' | 'back';
export type Pose = 'stand' | 'crouch' | 'bat' | 'ready';
export type Action =
  | 'swing'
  | 'throw'
  | 'catch'
  | 'celebrate'
  | 'windup'
  | 'release'
  | 'slide'
  | 'nod'
  | 'confused'
  | 'shakeHead'
  | 'shakeFur'
  | 'sad'
  | 'paw'
  | 'flinch';

export interface RigLook {
  id: string;
  kind: 'girl' | 'dog';
  name: string;
  number: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  eye: number;
  freckles: boolean;
  beard: boolean;
  fur: number;
  furLight: number;
  furStyle: FurStyle;
  jersey: number;
  trim: number;
  pants: number;
  socks: number;
  cap: number;
  capLogo: number;
  logoLetter: string;
  catcherGear: boolean;
  bodyWidth: number;
  expression: Expression;
  detail: boolean; // portraits : iris colorés, reflets
}

export function lookFor(def: CharacterDef, team: TeamConfig, opts: { catcherGear?: boolean; detail?: boolean } = {}): RigLook {
  const c = team.colors;
  const jersey = hex(def.uniformColor ?? c.primary);
  const base = {
    id: def.id,
    name: (def.kind === 'girl' && def.nick ? def.nick : def.name.split(' ')[0]).toUpperCase(),
    number: def.number,
    jersey,
    trim: hex(c.secondary),
    pants: hex(c.pants),
    socks: hex(c.socks),
    cap: hex(c.cap),
    capLogo: hex(c.capLogo),
    logoLetter: team.logoLetter,
    catcherGear: !!opts.catcherGear,
    expression: def.expression,
    detail: !!opts.detail,
  };
  if (def.kind === 'dog') {
    return {
      ...base,
      kind: 'dog',
      skin: hex(def.furColor),
      hair: hex(def.furColor),
      hairStyle: 'bob',
      eye: 0x3a2412,
      freckles: false,
      beard: false,
      fur: hex(def.furColor),
      furLight: hex(def.furLight),
      furStyle: def.furStyle,
      bodyWidth: def.bodyWidth,
    };
  }
  return {
    ...base,
    kind: 'girl',
    skin: hex(def.skinColor),
    hair: hex(def.hairColor),
    hairStyle: def.hairStyle,
    eye: hex(def.eyeColor),
    freckles: !!def.freckles,
    beard: !!def.beard,
    fur: 0,
    furLight: 0,
    furStyle: 'wavy',
    bodyWidth: 1,
  };
}

const OUT = 0x141414;
const LW = 3;

type Pt = Phaser.Types.Math.Vector2Like;

function ellPts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 26): Pt[] {
  const pts: Pt[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return pts;
}

function qcurve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n = 10): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    pts.push({ x: a * x0 + b * cx + d * x1, y: a * y0 + b * cy + d * y1 });
  }
  return pts;
}

function poly(g: Phaser.GameObjects.Graphics, color: number, pts: Pt[], lw = LW) {
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  if (lw > 0) {
    g.lineStyle(lw, OUT, 1);
    g.strokePoints(pts, true, true);
  }
}

function circ(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, r: number, lw = LW) {
  g.fillStyle(color, 1);
  g.fillCircle(x, y, r);
  if (lw > 0) {
    g.lineStyle(lw, OUT, 1);
    g.strokeCircle(x, y, r);
  }
}

function ell(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, w: number, h: number, lw = LW) {
  g.fillStyle(color, 1);
  g.fillEllipse(x, y, w, h);
  if (lw > 0) {
    g.lineStyle(lw, OUT, 1);
    g.strokeEllipse(x, y, w, h);
  }
}

/** Forme « nuage » : un seul contour autour de plusieurs cercles (boucles de Billy, cheveux frisés). */
function cloud(g: Phaser.GameObjects.Graphics, color: number, circles: [number, number, number][]) {
  g.lineStyle(LW * 2, OUT, 1);
  for (const [x, y, r] of circles) g.strokeCircle(x, y, r);
  g.fillStyle(color, 1);
  for (const [x, y, r] of circles) g.fillCircle(x, y, r);
}

function line(g: Phaser.GameObjects.Graphics, pts: Pt[], w = 2.4, color = OUT) {
  g.lineStyle(w, color, 1);
  g.strokePoints(pts, false, false);
}

interface PartXf {
  legLr: number;
  legRr: number;
  legLsy: number;
  legRsy: number;
  armLr: number;
  armRr: number;
  bodyY: number;
  bodyR: number;
  headR: number;
  headY: number;
  batR: number;
  earR: number;
  tailR: number;
  bodyX: number;
}

type PartName =
  | 'shadow'
  | 'ring'
  | 'ballDot'
  | 'tail'
  | 'hairBack'
  | 'legL'
  | 'legR'
  | 'torso'
  | 'armL'
  | 'armR'
  | 'bat'
  | 'headBack'
  | 'face'
  | 'hairFront'
  | 'earL'
  | 'earR'
  | 'capG'
  | 'maskG';

const PART_NAMES: PartName[] = ['shadow', 'ring', 'ballDot', 'tail', 'hairBack', 'legL', 'legR', 'torso', 'armL', 'armR', 'bat', 'headBack', 'face', 'hairFront', 'earL', 'earR', 'capG', 'maskG'];

/** Boîte englobante de chaque pièce (repère local, avant l'échelle de cuisson). */
const PART_BOUNDS: Record<PartName, [number, number, number, number]> = {
  shadow: [-26, -8, 26, 8],
  ring: [-31, -13, 31, 13],
  ballDot: [-7, -7, 7, 7],
  tail: [-14, -38, 22, 10],
  hairBack: [-36, -102, 36, -24],
  legL: [-10, -4, 10, 28],
  legR: [-10, -4, 10, 28],
  torso: [-26, -30, 26, 7],
  armL: [-13, -7, 13, 31],
  armR: [-13, -7, 13, 31],
  bat: [-7, -40, 7, 8],
  headBack: [-34, -34, 34, 46],
  face: [-22, -16, 22, 30],
  hairFront: [-32, -32, 32, 44],
  earL: [-13, -8, 13, 36],
  earR: [-13, -8, 13, 36],
  capG: [-25, -34, 25, 4],
  maskG: [-21, -10, 21, 30],
};

function hashLook(l: RigLook): string {
  const str = JSON.stringify(l);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const HIP_Y = -25;
const SHOULDER_Y = -46;
const HEAD_Y = -66;

export class CartoonRig extends Phaser.GameObjects.Container {
  look: RigLook;
  view: View = 'front';
  pose: Pose = 'stand';
  expression: Expression;

  private body2: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private tail?: Phaser.GameObjects.Graphics;
  private hairBack: Phaser.GameObjects.Graphics;
  private legL: Phaser.GameObjects.Graphics;
  private legR: Phaser.GameObjects.Graphics;
  private torso: Phaser.GameObjects.Graphics;
  private armL: Phaser.GameObjects.Graphics;
  private armR: Phaser.GameObjects.Graphics;
  private head: Phaser.GameObjects.Container;
  private headBack: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Graphics;
  private hairFront: Phaser.GameObjects.Graphics;
  private earL?: Phaser.GameObjects.Graphics;
  private earR?: Phaser.GameObjects.Graphics;
  private capG: Phaser.GameObjects.Graphics;
  private maskG?: Phaser.GameObjects.Graphics;
  private bat: Phaser.GameObjects.Graphics;
  private numText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private fx: Phaser.GameObjects.Container;

  private time = 0;
  private runPhase = 0;
  private moveSpeed = 0;
  private action: Action | null = null;
  private actionT = 0;
  private actionDur = 0;
  private wagT = 0;
  private maskOn = false;
  private holdBall = false;
  private ballDot: Phaser.GameObjects.Graphics;
  private earFlare = 0;
  baseScale = 1;
  facing = 1;
  private im = {} as Partial<Record<PartName, Phaser.GameObjects.Image>> &
    Record<'shadow' | 'ring' | 'ballDot' | 'legL' | 'legR' | 'torso' | 'armL' | 'armR' | 'bat' | 'headBack' | 'face' | 'hairFront' | 'capG' | 'hairBack', Phaser.GameObjects.Image>;
  private res = 2;
  private sig = '';

  constructor(scene: Phaser.Scene, look: RigLook) {
    super(scene, 0, 0);
    this.look = look;
    this.expression = look.expression;
    const w = look.bodyWidth;

    const G = () => new Phaser.GameObjects.Graphics(scene);
    this.res = LOW ? (look.detail ? 1.5 : 1) : look.detail ? 3 : 2;
    this.sig = hashLook(look);

    // les Graphics servent de brouillon : chaque pièce est cuite en texture, puis affichée comme image
    this.shadow = G();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, 0, 34 * w, 10);
    this.ring = G();
    this.ring.lineStyle(4, 0xffe14d, 1);
    this.ring.strokeEllipse(0, 0, 48, 16);
    this.ring.lineStyle(2, 0x000000, 0.6);
    this.ring.strokeEllipse(0, 0, 54, 20);

    this.body2 = scene.add.container(0, 0);
    if (look.kind === 'dog') this.tail = G();
    this.hairBack = G();
    this.legL = G();
    this.legR = G();
    this.torso = G();
    this.armL = G();
    this.armR = G();
    this.bat = G();
    this.head = scene.add.container(0, HEAD_Y);
    this.headBack = G();
    this.face = G();
    this.hairFront = G();
    this.capG = G();
    if (look.kind === 'dog') {
      this.earL = G();
      this.earR = G();
    }
    if (look.catcherGear) this.maskG = G();
    this.ballDot = G();
    this.ballDot.fillStyle(0xffffff, 1);
    this.ballDot.fillCircle(0, 0, 4);
    this.ballDot.lineStyle(2, OUT, 1);
    this.ballDot.strokeCircle(0, 0, 4);

    for (const name of PART_NAMES) {
      if (!this.gfx(name)) continue;
      this.im[name] = scene.add.image(0, 0, '__DEFAULT').setScale(1 / this.res);
    }
    this.bake('shadow');
    this.bake('ring');
    this.bake('ballDot');
    this.im.ring.setVisible(false);
    this.im.ballDot.setVisible(false);

    const font = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
    this.numText = scene.add
      .text(0, -36, String(look.number), { fontFamily: font, fontSize: '12px', color: '#' + look.trim.toString(16).padStart(6, '0') })
      .setOrigin(0.5)
      .setResolution(textRes(3));
    this.numText.setStroke('#111111', 2);
    this.nameText = scene.add
      .text(0, -45, look.name, { fontFamily: font, fontSize: '6px', color: '#' + look.trim.toString(16).padStart(6, '0') })
      .setOrigin(0.5)
      .setResolution(textRes(4));
    this.fx = scene.add.container(0, HEAD_Y - 34);

    const im = this.im;
    im.legL.setPosition(-5.5 * w, HIP_Y);
    im.legR.setPosition(5.5 * w, HIP_Y);
    im.torso.setPosition(0, HIP_Y);
    im.armL.setPosition(-13 * w, SHOULDER_Y);
    im.armR.setPosition(13 * w, SHOULDER_Y);
    im.bat.setPosition(4, -38);
    im.bat.setVisible(false);
    if (im.tail) im.tail.setPosition(9 * w, HIP_Y + 2);

    const headKids: Phaser.GameObjects.GameObject[] = [im.headBack, im.face, im.hairFront];
    if (im.earL && im.earR) {
      im.earL.setPosition(-20.5, -5);
      im.earR.setPosition(20.5, -5);
      headKids.push(im.earL, im.earR);
    }
    if (im.maskG) headKids.push(im.maskG);
    headKids.push(im.capG);
    this.head.add(headKids);

    this.add([im.shadow, im.ring, this.body2]);
    this.redraw();
  }

  private gfx(name: PartName): Phaser.GameObjects.Graphics | undefined {
    return (this as unknown as Record<string, Phaser.GameObjects.Graphics | undefined>)[name];
  }

  /** Cuit le dessin d'une pièce dans une texture (une seule fois par apparence), puis l'affiche. */
  private bake(name: PartName) {
    const g = this.gfx(name);
    const img = this.im[name];
    if (!g || !img) return;
    const b = PART_BOUNDS[name];
    const extra = name === 'face' ? '_' + this.expression : '';
    const key = 'rig_' + this.sig + '_' + this.view + '_' + name + extra;
    const k = this.res;
    const tm = this.scene.textures;
    if (!tm.exists(key)) {
      const cmds = g.commandBuffer.slice();
      g.clear();
      g.scaleCanvas(k, k);
      g.translateCanvas(-b[0], -b[1]);
      for (const c of cmds) g.commandBuffer.push(c);
      g.generateTexture(key, Math.ceil((b[2] - b[0]) * k), Math.ceil((b[3] - b[1]) * k));
      track(this.scene, key);
    }
    g.clear();
    img.setTexture(key);
    img.setOrigin(-b[0] / (b[2] - b[0]), -b[1] / (b[3] - b[1]));
  }

  private bakeAll() {
    for (const n of PART_NAMES) if (n !== 'shadow' && n !== 'ring' && n !== 'ballDot') this.bake(n);
  }

  /** Ordre des pièces selon la vue (devant / dos). */
  private stack() {
    const b = this.body2;
    const im = this.im;
    b.removeAll(false);
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (this.view === 'front') {
      if (im.tail) parts.push(im.tail);
      parts.push(im.hairBack, im.legL, im.legR, im.torso, this.numText, this.head, im.armL, im.armR, im.bat, im.ballDot, this.fx);
    } else {
      parts.push(im.armL, im.armR, im.bat, im.legL, im.legR, im.torso, this.numText, this.nameText, this.head, im.hairBack);
      if (im.tail) parts.push(im.tail);
      parts.push(im.ballDot, this.fx);
    }
    b.add(parts);
    this.nameText.setVisible(this.view === 'back');
    if (this.view === 'front') {
      this.numText.setPosition(0, -35).setFontSize(12);
    } else {
      this.numText.setPosition(0, -33).setFontSize(17);
    }
  }

  // ------------------------------------------------------------------ dessin
  redraw() {
    const L = this.look;
    const w = L.bodyWidth;
    const front = this.view === 'front';
    const isDog = L.kind === 'dog';
    const handColor = isDog ? L.fur : L.skin;

    // jambes
    for (const [g, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      g.clear();
      poly(g, L.pants, [
        { x: -5, y: -1 },
        { x: 5, y: -1 },
        { x: 4.5, y: 14 },
        { x: -4.5, y: 14 },
      ]);
      g.fillStyle(L.socks, 1);
      g.fillRect(-4, 12, 8, 8);
      g.lineStyle(2, OUT, 1);
      g.strokeRect(-4, 12, 8, 8);
      if (L.catcherGear) {
        g.fillStyle(0x2c3550, 1);
        g.fillRoundedRect(-5.5, 6, 11, 15, 3);
        g.lineStyle(2.5, OUT, 1);
        g.strokeRoundedRect(-5.5, 6, 11, 15, 3);
        g.lineStyle(1.5, 0x8a96b8, 1);
        g.lineBetween(-3, 10, 3, 10);
        g.lineBetween(-3, 15, 3, 15);
      }
      if (isDog) {
        ell(g, L.fur, side * 1, 22, 14, 8);
        g.lineStyle(1.5, OUT, 1);
        g.lineBetween(side * 1 - 2, 19.5, side * 1 - 2, 23);
        g.lineBetween(side * 1 + 2, 19.5, side * 1 + 2, 23);
      } else {
        ell(g, 0x1c1c1c, side * 1, 22, 13, 7);
        g.fillStyle(0xffffff, 0.7);
        g.fillEllipse(side * 1 - 2, 20.5, 4, 2);
      }
    }

    // torse
    const t = this.torso;
    t.clear();
    const tw = 26 * w;
    // cou
    t.fillStyle(isDog ? L.fur : L.skin, 1);
    t.fillRect(-4.5, -26, 9, 6);
    t.lineStyle(2, OUT, 1);
    t.strokeRect(-4.5, -26, 9, 6);
    t.fillStyle(L.jersey, 1);
    t.fillRoundedRect(-tw / 2, -23, tw, 25, 7);
    t.lineStyle(LW, OUT, 1);
    t.strokeRoundedRect(-tw / 2, -23, tw, 25, 7);
    // ceinture et pantalon
    t.fillStyle(L.pants, 1);
    t.fillRect(-tw / 2 + 1.5, -1, tw - 3, 4);
    t.fillStyle(0x1c1c1c, 1);
    t.fillRect(-tw / 2 + 1.5, -2.5, tw - 3, 3);
    // passepoil
    t.lineStyle(2, L.trim, 1);
    if (front) {
      t.strokePoints(
        [
          { x: -6, y: -22 },
          { x: 0, y: -15 },
          { x: 6, y: -22 },
        ],
        false,
      );
      t.lineBetween(0, -15, 0, -3);
    } else {
      t.lineBetween(-tw / 2 + 3, -21, tw / 2 - 3, -21);
    }
    if (L.catcherGear && front) {
      t.fillStyle(0x2c3550, 1);
      t.fillRoundedRect(-11 * w, -21, 22 * w, 19, 6);
      t.lineStyle(2.5, OUT, 1);
      t.strokeRoundedRect(-11 * w, -21, 22 * w, 19, 6);
      t.lineStyle(1.5, 0x8a96b8, 1);
      t.lineBetween(-8 * w, -14, 8 * w, -14);
      t.lineBetween(-8 * w, -8, 8 * w, -8);
    }
    this.numText.setVisible(!(L.catcherGear && front));

    // bras
    for (const [g, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      g.clear();
      g.fillStyle(handColor, 1);
      g.fillRoundedRect(-3.2, 5, 6.4, 12, 3);
      g.lineStyle(2.5, OUT, 1);
      g.strokeRoundedRect(-3.2, 5, 6.4, 12, 3);
      g.fillStyle(L.jersey, 1);
      g.fillRoundedRect(-5, -3, 10, 11, 4);
      g.lineStyle(2.5, OUT, 1);
      g.strokeRoundedRect(-5, -3, 10, 11, 4);
      g.lineStyle(2, L.trim, 1);
      g.lineBetween(-4, 6, 4, 6);
      const gloveSide = front ? 1 : -1;
      if (side === gloveSide) {
        const r = L.catcherGear ? 9.5 : 7;
        circ(g, 0x9b5a2a, 0, 19, r);
        g.lineStyle(1.5, 0x5a3010, 1);
        g.lineBetween(-r * 0.5, 16, -r * 0.5, 22);
        g.lineBetween(0, 15, 0, 23);
        g.lineBetween(r * 0.5, 16, r * 0.5, 22);
      } else {
        circ(g, handColor, 0, 18.5, 4.4, 2.5);
      }
    }

    // bâton
    const b = this.bat;
    b.clear();
    poly(
      b,
      0xd9a35b,
      [
        { x: -1.6, y: 4 },
        { x: 1.6, y: 4 },
        { x: 3.6, y: -32 },
        { x: 0, y: -36 },
        { x: -3.6, y: -32 },
      ],
      2.5,
    );
    b.fillStyle(0x1c1c1c, 1);
    b.fillRect(-2, 0, 4, 4);

    this.drawHead();
    this.drawTail();
    this.bakeAll();
    this.stack();
  }

  private drawHead() {
    const L = this.look;
    const front = this.view === 'front';
    const hb = this.headBack;
    const hf = this.hairFront;
    const back = this.hairBack;
    hb.clear();
    hf.clear();
    back.clear();
    // les cheveux de dos se dessinent dans le repère du corps : décalage de la tête
    const oy = HEAD_Y;

    if (L.kind === 'dog') {
      this.drawDogHead(front);
    } else {
      const hair = L.hair;
      const hs = L.hairStyle;
      // cheveux derrière la tête
      if (front) {
        if (hs === 'ponytail') poly(back, hair, ellPts(19, oy + 6, 6, 14, -0.5));
        if (hs === 'long') {
          poly(back, hair, [
            { x: -19, y: oy - 6 },
            { x: 19, y: oy - 6 },
            { x: 21, y: oy + 30 },
            { x: 12, y: oy + 34 },
            { x: -12, y: oy + 34 },
            { x: -21, y: oy + 30 },
          ]);
        }
        if (hs === 'curly') {
          cloud(back, hair, [
            [-20, oy - 2, 8],
            [20, oy - 2, 8],
            [-22, oy + 9, 8],
            [22, oy + 9, 8],
            [-18, oy + 19, 7],
            [18, oy + 19, 7],
            [-10, oy + 22, 6],
            [10, oy + 22, 6],
          ]);
        }
        if (hs === 'bun') circ(back, hair, 0, oy - 25, 8.5);
        if (hs === 'wavy') {
          cloud(back, hair, [
            [-19, oy - 2, 7],
            [19, oy - 2, 7],
            [-21, oy + 8, 7.5],
            [21, oy + 8, 7.5],
            [-20, oy + 18, 7],
            [20, oy + 18, 7],
            [-14, oy + 26, 6],
            [14, oy + 26, 6],
            [0, oy + 22, 12],
          ]);
        }
        if (hs === 'pigtails') {
          poly(back, hair, ellPts(-23, oy + 10, 7, 11, 0.4));
          poly(back, hair, ellPts(23, oy + 10, 7, 11, -0.4));
          circ(back, 0xff5fa2, -19, oy + 3, 3, 2);
          circ(back, 0xff5fa2, 19, oy + 3, 3, 2);
        }
      }
      // tête
      if (front) {
        circ(hb, L.skin, -17.5, 3, 4.2, 2.5);
        circ(hb, L.skin, 17.5, 3, 4.2, 2.5);
        hb.fillStyle(L.skin, 1);
        hb.fillEllipse(0, 1, 36, 38);
        hb.lineStyle(LW, OUT, 1);
        hb.strokeEllipse(0, 1, 36, 38);
      } else {
        hb.fillStyle(hair, 1);
        hb.fillEllipse(0, 1, 36, 38);
        hb.lineStyle(LW, OUT, 1);
        hb.strokeEllipse(0, 1, 36, 38);
      }
      // mèches de devant / coiffure de dos
      if (front) {
        const sideLen = hs === 'bob' ? 16 : hs === 'long' || hs === 'wavy' ? 18 : hs === 'short' || hs === 'curlyShort' ? 2 : 9;
        poly(hf, hair, [
          { x: -18.5, y: -7 },
          { x: -19.5, y: sideLen * 0.6 },
          { x: -16, y: sideLen },
          { x: -12.5, y: sideLen * 0.4 },
          { x: -12, y: -4 },
        ]);
        poly(hf, hair, [
          { x: 18.5, y: -7 },
          { x: 19.5, y: sideLen * 0.6 },
          { x: 16, y: sideLen },
          { x: 12.5, y: sideLen * 0.4 },
          { x: 12, y: -4 },
        ]);
        if (hs === 'bob') {
          poly(hf, hair, [
            { x: -15, y: -6 },
            { x: 15, y: -6 },
            { x: 14, y: -2 },
            { x: -14, y: -2 },
          ]);
        }
        if (hs === 'curly') {
          cloud(hf, hair, [
            [-15, -3, 4.5],
            [-9, -4, 4],
            [9, -4, 4],
            [15, -3, 4.5],
          ]);
        }
        if (hs === 'curlyShort') {
          cloud(hf, hair, [
            [-17, -4, 4.2],
            [-18.5, 2, 3.6],
            [17, -4, 4.2],
            [18.5, 2, 3.6],
          ]);
        }
        if (hs === 'braid') {
          for (const [bx, by] of [
            [17, 12],
            [18.5, 19],
            [19, 26],
            [18.5, 33],
          ])
            poly(hf, hair, ellPts(bx, by, 4.6, 4.2, 0.3), 2.2);
          circ(hf, 0x7fd3ff, 18.5, 38, 2.6, 1.8);
        }
      } else {
        if (hs === 'ponytail') {
          poly(hf, hair, ellPts(0, 20, 6.5, 15, 0));
          circ(hf, 0xff5fa2, 0, 6, 3, 2);
        }
        if (hs === 'long') {
          poly(hf, hair, [
            { x: -19, y: 0 },
            { x: 19, y: 0 },
            { x: 21, y: 32 },
            { x: 0, y: 36 },
            { x: -21, y: 32 },
          ]);
        }
        if (hs === 'curly') {
          cloud(hf, hair, [
            [-14, 10, 9],
            [0, 14, 10],
            [14, 10, 9],
            [-8, 22, 8],
            [8, 22, 8],
          ]);
        }
        if (hs === 'bun') circ(hf, hair, 0, -18, 8.5);
        if (hs === 'curlyShort') {
          cloud(hf, hair, [
            [-12, -1, 6],
            [0, -3, 6.5],
            [12, -1, 6],
            [-15, 7, 5],
            [0, 7, 6.5],
            [15, 7, 5],
            [-7, 12, 5],
            [7, 12, 5],
          ]);
        }
        if (hs === 'short') {
          poly(hf, hair, [
            { x: -18, y: -2 },
            { x: 18, y: -2 },
            { x: 17, y: 9 },
            { x: 0, y: 11 },
            { x: -17, y: 9 },
          ]);
        }
        if (hs === 'braid') {
          for (let i = 0; i < 4; i++) poly(hf, hair, ellPts(i % 2 ? 1 : -1, 16 + i * 6.5, 4.8, 4.2, 0.3), 2.2);
          circ(hf, 0x7fd3ff, 0, 40, 2.6, 1.8);
        }
        if (hs === 'wavy') {
          cloud(hf, hair, [
            [-16, 6, 8],
            [16, 6, 8],
            [-17, 18, 8],
            [17, 18, 8],
            [-11, 28, 7],
            [11, 28, 7],
            [0, 18, 14],
            [0, 31, 7],
          ]);
        }
        if (hs === 'pigtails') {
          poly(hf, hair, ellPts(-22, 12, 7, 11, 0.4));
          poly(hf, hair, ellPts(22, 12, 7, 11, -0.4));
        }
        if (hs === 'bob') {
          poly(hf, hair, [
            { x: -19, y: 0 },
            { x: 19, y: 0 },
            { x: 18, y: 17 },
            { x: -18, y: 17 },
          ]);
        }
      }
    }
    this.drawCap(front);
    this.drawFace();
    this.drawMask();
  }

  private drawDogHead(front: boolean) {
    const L = this.look;
    const hb = this.headBack;
    const curly = L.furStyle === 'curly';
    if (curly) {
      const c: [number, number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.push([Math.cos(a) * 17.5, 3 + Math.sin(a) * 18, 6.5]);
      }
      c.push([0, 3, 18]);
      cloud(hb, L.fur, c);
      // petites boucles dessinées
      hb.lineStyle(1.6, shade('#' + L.fur.toString(16).padStart(6, '0'), 0.72), 1);
      for (const [x, y] of [
        [-13, 14],
        [13, 14],
        [-15, 4],
        [15, 4],
      ] as const) {
        hb.beginPath();
        hb.arc(x, y, 2.6, 0.3, Math.PI * 1.6);
        hb.strokePath();
      }
    } else {
      hb.fillStyle(L.fur, 1);
      hb.fillEllipse(0, 3, 41, 40);
      hb.lineStyle(LW, OUT, 1);
      hb.strokeEllipse(0, 3, 41, 40);
    }
    if (front) {
      ell(hb, L.furLight, 0, 14.5, 24, 15, 2.5);
    }
    // oreilles
    const earColor = curly ? L.fur : shade('#' + L.fur.toString(16).padStart(6, '0'), 0.86);
    for (const g of [this.earL!, this.earR!]) {
      g.clear();
      if (curly) {
        cloud(g, L.fur, [
          [0, 3, 6],
          [0, 9, 6.5],
          [0.5, 15, 6.5],
          [0, 21, 6],
        ]);
      } else {
        poly(g, earColor, [
          ...qcurve(-5, -2, -8, 14, -4, 27, 8),
          { x: -1, y: 30 },
          { x: 2, y: 27.5 },
          { x: 5, y: 29 },
          ...qcurve(6, 25, 8, 12, 5, -2, 8),
        ]);
      }
    }
    // touffe sur le dessus (Stella)
    if (!curly) {
      poly(this.hairFront, L.fur, [
        { x: -5, y: -15 },
        { x: -1, y: -21 },
        { x: 1, y: -16 },
        { x: 4, y: -20 },
        { x: 5, y: -14 },
      ], 2);
    }
  }

  private drawCap(front: boolean) {
    const L = this.look;
    const g = this.capG;
    g.clear();
    const isDog = L.kind === 'dog';
    const r = isDog ? 20.5 : 18.5;
    const cy = isDog ? -8.5 : -6;
    // dôme
    const dome: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      dome.push({ x: Math.cos(a) * r, y: cy + Math.sin(a) * (r * 0.92) });
    }
    poly(g, L.cap, dome);
    g.fillStyle(0xffffff, 0.14);
    g.fillEllipse(-6, cy - 10, 10, 6);
    circ(g, shade('#' + L.cap.toString(16).padStart(6, '0'), 0.8), 0, cy - r * 0.92, 2.2, 2);
    const reverse = L.catcherGear; // la receveuse porte la casquette à l'envers
    if (front && !reverse) {
      // visière
      ell(g, shade('#' + L.cap.toString(16).padStart(6, '0'), 0.8), 0, cy + 1, r * 2.1, 9);
      this.letter(g, L.logoLetter, 0, cy - 9, L.capLogo);
    } else if (!front && !reverse) {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-5, cy - 4, 10, 5, 2);
    } else if (front && reverse) {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-5, cy - 4, 10, 5, 2);
    } else {
      ell(g, shade('#' + L.cap.toString(16).padStart(6, '0'), 0.8), 0, cy + 1, r * 2.1, 9);
      this.letter(g, L.logoLetter, 0, cy - 9, L.capLogo);
    }
  }

  /** Lettre-logo dessinée en traits (plus nette qu'un texte à petite échelle). */
  private letter(g: Phaser.GameObjects.Graphics, ch: string, x: number, y: number, color: number) {
    g.lineStyle(3, color, 1);
    if (ch === 'T') {
      g.lineBetween(x - 4.5, y - 4, x + 4.5, y - 4);
      g.lineBetween(x, y - 4, x, y + 4.5);
    } else if (ch === 'B') {
      g.strokePoints(
        [
          { x: x - 3, y: y + 4.5 },
          { x: x - 3, y: y - 4.5 },
          { x: x + 1.5, y: y - 4.5 },
          { x: x + 3.5, y: y - 2.5 },
          { x: x + 1.5, y: y - 0.3 },
          { x: x - 3, y: y - 0.3 },
          { x: x + 2, y: y - 0.3 },
          { x: x + 4, y: y + 2.2 },
          { x: x + 2, y: y + 4.5 },
          { x: x - 3, y: y + 4.5 },
        ],
        false,
      );
    } else if (ch === 'E') {
      g.strokePoints(
        [
          { x: x + 3.5, y: y - 4.5 },
          { x: x - 3, y: y - 4.5 },
          { x: x - 3, y: y + 4.5 },
          { x: x + 3.5, y: y + 4.5 },
        ],
        false,
      );
      g.lineBetween(x - 3, y, x + 2, y);
    } else if (ch === 'V') {
      g.strokePoints(
        [
          { x: x - 4.5, y: y - 4 },
          { x, y: y + 4.5 },
          { x: x + 4.5, y: y - 4 },
        ],
        false,
      );
    } else {
      g.strokeCircle(x, y, 3.5);
    }
  }

  private drawFace() {
    const g = this.face;
    g.clear();
    if (this.view === 'back') return;
    const L = this.look;
    const e = this.expression;
    const isDog = L.kind === 'dog';
    const ey = isDog ? 1.5 : 2;
    const big = e === 'surprised' ? 1.18 : 1;
    // yeux : grands ovales blancs à la manière d'une sitcom
    for (const side of [-1, 1]) {
      const ex = side * (isDog ? 6.9 : 6.4);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(ex, ey, 11 * big, 13 * big);
      g.lineStyle(2.4, OUT, 1);
      g.strokeEllipse(ex, ey, 11 * big, 13 * big);
      const px = ex + side * -0.6 + (e === 'confident' ? 1 : 0);
      if (L.detail) {
        g.fillStyle(L.eye, 1);
        g.fillCircle(px, ey + 0.8, 3.1);
      }
      g.fillStyle(0x111111, 1);
      g.fillCircle(px, ey + 0.8, L.detail ? 1.8 : 2.1);
      if (L.detail) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(px + 1, ey - 0.4, 0.8);
      }
      // paupières
      const lid = e === 'calm' ? 0.45 : e === 'focused' ? 0.35 : e === 'embarrassed' ? 0.25 : 0;
      if (lid > 0) {
        const lidColor = isDog ? L.fur : L.skin;
        const h = 13 * lid;
        g.fillStyle(lidColor, 1);
        g.fillRect(ex - 5.8, ey - 6.8, 11.6, h);
        g.lineStyle(2.2, OUT, 1);
        g.lineBetween(ex - 5.2, ey - 6.8 + h, ex + 5.2, ey - 6.8 + h);
      }
    }
    // sourcils
    const by = ey - 8.5;
    g.lineStyle(2.4, isDog ? shade('#' + L.fur.toString(16).padStart(6, '0'), 0.6) : shade('#' + L.hair.toString(16).padStart(6, '0'), 0.8), 1);
    const brow = (x0: number, y0: number, x1: number, y1: number) => g.lineBetween(x0, y0, x1, y1);
    switch (e) {
      case 'determined':
      case 'focused':
        brow(-10, by - 1, -3, by + 1.5);
        brow(10, by - 1, 3, by + 1.5);
        break;
      case 'confident':
        brow(-10, by, -3, by);
        brow(3, by - 2, 10, by - 3);
        break;
      case 'sad':
      case 'embarrassed':
        brow(-10, by + 1, -3, by - 1.5);
        brow(10, by + 1, 3, by - 1.5);
        break;
      case 'energetic':
      case 'enthusiastic':
      case 'surprised':
      case 'attentive':
      case 'happy':
        brow(-10, by - 2, -3, by - 3);
        brow(10, by - 2, 3, by - 3);
        break;
      default:
        brow(-9, by - 1, -3, by - 1);
        brow(9, by - 1, 3, by - 1);
    }

    if (isDog) {
      // truffe
      g.fillStyle(0x1a1a1a, 1);
      g.fillEllipse(0, 10, 10, 6.5);
      g.fillStyle(0xffffff, 0.5);
      g.fillEllipse(-1.5, 8.6, 3.5, 1.6);
      line(g, [
        { x: 0, y: 13 },
        { x: 0, y: 15 },
      ]);
      if (e === 'happy' || e === 'enthusiastic' || e === 'energetic') {
        poly(g, 0x7a1f1f, [...qcurve(-6.5, 15.5, 0, 26, 6.5, 15.5, 10)], 2.2);
        poly(g, 0xff7b9c, ellPts(0, 21.5, 3.6, 3.4), 1.8);
      } else if (e === 'surprised') {
        poly(g, 0x7a1f1f, ellPts(0, 18.5, 3, 3.5), 2);
      } else if (e === 'sad' || e === 'embarrassed') {
        line(g, qcurve(-5, 19, 0, 16, 5, 19, 6));
      } else {
        line(g, qcurve(-6, 15, -3, 18, 0, 15, 6));
        line(g, qcurve(0, 15, 3, 18, 6, 15, 6));
      }
    } else {
      if (L.beard) {
        poly(g, L.hair, [
          { x: -17, y: 2 },
          { x: -16, y: 12 },
          { x: -9, y: 19.5 },
          { x: 0, y: 21.5 },
          { x: 9, y: 19.5 },
          { x: 16, y: 12 },
          { x: 17, y: 2 },
          { x: 13, y: 5 },
          { x: 10, y: 12 },
          { x: 0, y: 16.5 },
          { x: -10, y: 12 },
          { x: -13, y: 5 },
        ]);
      }
      // nez minimaliste
      line(g, qcurve(0.5, 6, 3, 9.5, 0, 10, 6), 2);
      const my = 14;
      switch (e) {
        case 'energetic':
        case 'enthusiastic':
        case 'happy':
          poly(g, 0x7a1f1f, [...qcurve(-6, my - 1, 0, my + 8, 6, my - 1, 10)], 2.2);
          g.fillStyle(0xffffff, 1);
          g.fillRect(-4.5, my - 1, 9, 2);
          break;
        case 'confident':
          line(g, qcurve(-5, my, 0, my + 2, 6, my - 2, 8));
          break;
        case 'determined':
          line(g, [
            { x: -5, y: my + 0.5 },
            { x: 5, y: my },
          ]);
          break;
        case 'focused':
          line(g, [
            { x: -3.5, y: my },
            { x: 3.5, y: my },
          ]);
          break;
        case 'surprised':
          poly(g, 0x7a1f1f, ellPts(0, my + 0.5, 3, 3.6), 2);
          break;
        case 'sad':
          line(g, qcurve(-5, my + 2, 0, my - 1.5, 5, my + 2, 8));
          break;
        case 'embarrassed':
          line(g, [
            { x: -5, y: my },
            { x: -2.5, y: my - 1 },
            { x: 0, y: my },
            { x: 2.5, y: my - 1 },
            { x: 5, y: my },
          ]);
          break;
        default:
          line(g, qcurve(-4.5, my, 0, my + 2.5, 4.5, my, 8));
      }
      if (L.freckles) {
        g.fillStyle(0xb5653a, 0.8);
        for (const [x, y] of [
          [-10, 9],
          [-8, 11],
          [-12, 11],
          [10, 9],
          [8, 11],
          [12, 11],
        ])
          g.fillCircle(x, y, 0.9);
      }
    }
    if (e === 'embarrassed' || (L.detail && (e === 'happy' || e === 'enthusiastic' || e === 'energetic'))) {
      g.fillStyle(0xff6f8e, e === 'embarrassed' ? 0.6 : 0.3);
      g.fillEllipse(-11, 9, 6, 3.5);
      g.fillEllipse(11, 9, 6, 3.5);
    }
  }

  private drawMask() {
    const g = this.maskG;
    if (!g) return;
    g.clear();
    if (this.view === 'front') {
      const h = this.look.kind === 'dog' ? 30 : 25;
      g.lineStyle(3.5, 0x3a3f4f, 1);
      g.strokeRoundedRect(-15.5, -5, 31, h, 7);
      g.lineStyle(2.2, 0x3a3f4f, 1);
      g.lineBetween(-14.5, 4, 14.5, 4);
      g.lineBetween(-14, 13, 14, 13);
      g.lineBetween(0, -5, 0, h - 5);
      g.lineStyle(1.5, OUT, 0.8);
      g.strokeRoundedRect(-17, -6.5, 34, h + 3, 8);
    } else {
      g.lineStyle(2.5, 0x3a3f4f, 1);
      g.lineBetween(-16, 2, 16, 2);
      g.lineBetween(-15, 10, 15, 10);
    }
  }

  private drawTail() {
    const g = this.tail;
    if (!g) return;
    g.clear();
    const L = this.look;
    if (L.furStyle === 'curly') {
      cloud(g, L.fur, [
        [2, -4, 5],
        [5, -11, 6],
        [3, -18, 5.5],
      ]);
    } else {
      poly(g, L.fur, [
        ...qcurve(-2, 0, 14, -8, 12, -30, 10),
        { x: 9, y: -26 },
        { x: 6, y: -27 },
        ...qcurve(4, -22, 6, -10, 2, -1, 8),
      ]);
    }
  }

  // ------------------------------------------------------------------ API
  setView(v: View) {
    if (v === this.view) return;
    this.view = v;
    this.redraw();
  }

  setExpression(e: Expression) {
    if (e === this.expression) return;
    this.expression = e;
    this.drawFace();
    this.bake('face');
  }

  setPose(p: Pose) {
    this.pose = p;
    this.im.bat.setVisible(p === 'bat' || (this.action === 'swing' && this.im.bat.visible));
  }

  setSelected(on: boolean) {
    this.im.ring.setVisible(on);
  }

  setHoldingBall(on: boolean) {
    this.holdBall = on;
    this.im.ballDot.setVisible(on);
  }

  showBat(on: boolean) {
    this.im.bat.setVisible(on);
  }

  showMask(on: boolean) {
    this.maskOn = on;
    this.im.maskG?.setVisible(on);
  }

  play(a: Action, dur?: number) {
    const d: Record<Action, number> = {
      swing: 0.55,
      throw: 0.3,
      catch: 0.35,
      celebrate: 1.2,
      windup: 0.55,
      release: 0.3,
      slide: 0.6,
      nod: 0.4,
      confused: 0.75,
      shakeHead: 0.55,
      shakeFur: 0.4,
      sad: 0.9,
      paw: 0.9,
      flinch: 0.35,
    };
    this.action = a;
    this.actionT = 0;
    this.actionDur = dur ?? d[a];
    if (a === 'swing') this.im.bat.setVisible(true);
    if (a === 'confused') this.say('?', '#ffe14d', 0.8);
  }

  /** Goutte de sueur (gêne). */
  sweat() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x7fd3ff, 1);
    g.fillCircle(0, 0, 4);
    g.fillTriangle(-3.6, -1.5, 3.6, -1.5, 0, -9);
    g.lineStyle(2, OUT, 1);
    g.strokeCircle(0, 0, 4);
    g.setPosition(18, 26);
    this.fx.add(g);
    this.scene.tweens.add({ targets: g, y: 36, alpha: 0, duration: 900, onComplete: () => g.destroy() });
  }

  isBusy() {
    return this.action !== null;
  }

  wag(seconds = 1.2) {
    this.wagT = Math.max(this.wagT, seconds);
  }

  flareEars(seconds = 0.5) {
    this.earFlare = seconds;
  }

  /** Petit symbole au-dessus de la tête (?, !, étoiles, bulle). */
  say(text: string, color = '#ffffff', seconds = 0.9, size = 22) {
    const tx = this.scene.add
      .text(0, 0, text, {
        fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif',
        fontSize: size + 'px',
        color,
      })
      .setOrigin(0.5)
      .setResolution(textRes(2));
    tx.setStroke('#111111', 5);
    this.fx.add(tx);
    this.scene.tweens.add({ targets: tx, y: -16, duration: 220, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: tx,
      alpha: 0,
      delay: seconds * 1000,
      duration: 200,
      onComplete: () => tx.destroy(),
    });
  }

  /** Bulle de signe de la receveuse (nombre de doigts). */
  signBubble(fingers: number, big: boolean, seconds: number) {
    const c = this.scene.add.container(0, -6);
    const g = this.scene.add.graphics();
    const s = big ? 1.5 : 1;
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-18 * s, -34 * s, 36 * s, 28 * s, 9);
    g.lineStyle(3, OUT, 1);
    g.strokeRoundedRect(-18 * s, -34 * s, 36 * s, 28 * s, 9);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-5, -7 * s, 5, -7 * s, 0, 2);
    g.lineStyle(3, OUT, 1);
    g.lineBetween(-5, -6 * s, 0, 2);
    g.lineBetween(5, -6 * s, 0, 2);
    // patte + doigts
    const pawC = this.look.kind === 'dog' ? this.look.fur : this.look.skin;
    g.fillStyle(pawC, 1);
    g.fillEllipse(0, -14 * s, 14 * s, 9 * s);
    g.lineStyle(2, OUT, 1);
    g.strokeEllipse(0, -14 * s, 14 * s, 9 * s);
    for (let i = 0; i < fingers; i++) {
      const x = (-((fingers - 1) * 3.4) / 2 + i * 3.4) * s;
      g.fillStyle(pawC, 1);
      g.fillRoundedRect(x - 1.4 * s, -29 * s, 2.8 * s, 11 * s, 1.4 * s);
      g.lineStyle(1.6, OUT, 1);
      g.strokeRoundedRect(x - 1.4 * s, -29 * s, 2.8 * s, 11 * s, 1.4 * s);
    }
    c.add(g);
    this.fx.add(c);
    c.setScale(0.2);
    this.scene.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: seconds * 1000, duration: 120, onComplete: () => c.destroy() });
  }

  /** Vitesse de déplacement (pi/s) et direction à l'écran : anime la course et choisit la vue. */
  setMotion(speed: number, dirX: number, dirY: number) {
    this.moveSpeed = speed;
    if (speed > 0.5) {
      if (Math.abs(dirX) > 0.15) this.facing = dirX >= 0 ? 1 : -1;
      if (dirY < -0.35) this.setView('back');
      else if (dirY > 0.35) this.setView('front');
    }
  }

  // ------------------------------------------------------------------ animation
  tick(dt: number) {
    this.time += dt;
    const x: PartXf = {
      legLr: 0,
      legRr: 0,
      legLsy: 1,
      legRsy: 1,
      armLr: 0.12,
      armRr: -0.12,
      bodyY: Math.sin(this.time * 2.4) * 0.6,
      bodyR: 0,
      headR: Math.sin(this.time * 1.3) * 0.02,
      headY: 0,
      batR: -0.7,
      earR: Math.sin(this.time * 1.7) * 0.05,
      tailR: Math.sin(this.time * 2.2) * 0.12,
      bodyX: 0,
    };

    // pose de base
    if (this.pose === 'crouch') {
      x.legLsy = 0.5;
      x.legRsy = 0.5;
      x.legLr = 0.55;
      x.legRr = -0.55;
      x.bodyY = 11;
      x.armRr = this.view === 'back' ? -0.3 : -0.9;
      x.armLr = 0.5;
    } else if (this.pose === 'bat') {
      x.armLr = -0.9;
      x.armRr = 0.7;
      x.batR = -0.75 + Math.sin(this.time * 3) * 0.06;
    } else if (this.pose === 'ready') {
      x.legLr = 0.18;
      x.legRr = -0.18;
      x.bodyY = 2;
      x.armLr = 0.5;
      x.armRr = -0.5;
    }

    // course
    if (this.moveSpeed > 0.5 && this.action !== 'slide') {
      this.runPhase += dt * (6 + this.moveSpeed * 0.32);
      const s = Math.sin(this.runPhase);
      x.legLr = s * 0.62;
      x.legRr = -s * 0.62;
      x.legLsy = 1;
      x.legRsy = 1;
      x.armLr = -s * 0.75;
      x.armRr = s * 0.75;
      x.bodyY = -Math.abs(Math.cos(this.runPhase)) * 3;
      x.earR = -0.35 - Math.abs(s) * 0.25;
      if (this.look.kind === 'dog') x.tailR = s * 0.35;
    }

    // action ponctuelle
    if (this.action) {
      this.actionT += dt;
      const p = Math.min(1, this.actionT / this.actionDur);
      switch (this.action) {
        case 'swing': {
          const q = Math.min(1, p / 0.35);
          x.batR = -0.75 + q * 3.1;
          x.armLr = -0.9 + q * 2.2;
          x.armRr = 0.7 - q * 1.4;
          x.bodyR = 0.12 * Math.sin(q * Math.PI);
          if (p > 0.35) x.batR = 2.35 + (p - 0.35) * 0.4;
          break;
        }
        case 'throw': {
          const back = this.view === 'front' ? 1 : -1;
          x.armLr = p < 0.4 ? back * (2.8 * (p / 0.4)) : back * (2.8 - 3.8 * ((p - 0.4) / 0.6));
          x.bodyR = -0.1 * Math.sin(p * Math.PI);
          break;
        }
        case 'catch':
          x.armRr = this.view === 'front' ? -2.3 : -0.6;
          x.bodyY -= 2 * Math.sin(p * Math.PI);
          break;
        case 'celebrate':
        case 'paw': {
          const jump = this.action === 'celebrate' ? Math.abs(Math.sin(p * Math.PI * 3)) * 16 : 0;
          x.bodyY = -jump;
          x.armLr = 2.6 + Math.sin(this.time * 16) * 0.2;
          x.armRr = this.action === 'celebrate' ? -2.6 - Math.sin(this.time * 16) * 0.2 : x.armRr;
          x.tailR = Math.sin(this.time * 24) * 0.7;
          x.earR = -0.6;
          break;
        }
        case 'windup': {
          if (p < 0.4) {
            x.armLr = 0.9 * (p / 0.4);
            x.armRr = -0.9 * (p / 0.4);
          } else {
            const q = (p - 0.4) / 0.6;
            x.legRr = -0.9 * q;
            x.legRsy = 1 - 0.35 * q;
            x.armLr = 0.9 + 1.9 * q;
            x.armRr = -0.9 + 0.3 * q;
            x.bodyY = -3 * q;
            x.earR = -0.5 * q;
          }
          break;
        }
        case 'release': {
          x.armLr = 2.8 - 4.4 * Math.min(1, p / 0.5);
          x.armRr = -0.5;
          x.legRr = -0.9 * (1 - p);
          x.legRsy = 0.65 + 0.35 * p;
          x.bodyR = -0.15 * Math.sin(p * Math.PI);
          x.earR = -1.0 * (1 - p);
          break;
        }
        case 'slide':
          x.bodyR = -1.25 * Math.sign(this.facing || 1) * Math.min(1, p * 4);
          x.bodyY = 10;
          x.bodyX = -6 * this.facing;
          x.armLr = 2.6;
          x.armRr = -2.6;
          break;
        case 'nod':
          x.headY = Math.abs(Math.sin(p * Math.PI * 2)) * 3;
          break;
        case 'confused':
          x.headR = 0.3 * Math.sin(Math.min(1, p * 3) * Math.PI * 0.5);
          x.earR = 0.3;
          break;
        case 'shakeHead':
        case 'shakeFur':
          x.headR = Math.sin(p * Math.PI * 8) * (this.action === 'shakeFur' ? 0.18 : 0.25);
          if (this.action === 'shakeFur') x.bodyX = Math.sin(p * Math.PI * 10) * 1.2;
          break;
        case 'sad':
          x.headY = 3;
          x.headR = 0.1;
          x.armLr = 0.05;
          x.armRr = -0.05;
          x.earR = 0.25;
          break;
        case 'flinch':
          x.bodyY = 2 * Math.sin(p * Math.PI);
          x.earR = -0.9 * Math.sin(p * Math.PI);
          x.headR = -0.08;
          break;
      }
      if (this.actionT >= this.actionDur) {
        if (this.action === 'swing' && this.pose !== 'bat') this.im.bat.setVisible(false);
        this.action = null;
      }
    }

    if (this.wagT > 0) {
      this.wagT -= dt;
      x.tailR = Math.sin(this.time * 26) * 0.6;
    }
    if (this.earFlare > 0) {
      this.earFlare -= dt;
      x.earR = -1.1;
    }

    // application (les images sont cuites à l'échelle res : on divise)
    const im = this.im;
    const k = 1 / this.res;
    im.legL.rotation = x.legLr;
    im.legR.rotation = x.legRr;
    im.legL.setScale(k, k * x.legLsy);
    im.legR.setScale(k, k * x.legRsy);
    const bodyDrop = (1 - Math.min(x.legLsy, x.legRsy)) * 22;
    this.body2.y = x.bodyY + (this.pose === 'crouch' ? 0 : bodyDrop * 0.5);
    this.body2.x = x.bodyX;
    this.body2.rotation = x.bodyR;
    im.armL.rotation = x.armLr;
    im.armR.rotation = x.armRr;
    this.head.rotation = x.headR;
    this.head.y = HEAD_Y + x.headY;
    im.bat.rotation = x.batR;
    if (im.earL && im.earR) {
      im.earL.rotation = -x.earR;
      im.earR.rotation = x.earR;
    }
    if (im.tail) im.tail.rotation = x.tailR;
    if (this.holdBall) {
      // la balle suit le gant
      const a = im.armR.rotation;
      im.ballDot.setPosition(im.armR.x - Math.sin(a) * 19, im.armR.y + Math.cos(a) * 19 - 4);
    }
    // les pièces des jambes s'enfoncent dans l'accroupissement
    im.legL.y = HIP_Y + (1 - x.legLsy) * 6;
    im.legR.y = HIP_Y + (1 - x.legRsy) * 6;
    this.body2.scaleX = this.facing;
    this.fx.scaleX = this.facing; // garde le texte lisible
  }

  /** Échelle finale = perspective × taille du personnage. */
  applyScale(perspective: number) {
    this.setScale(this.baseScale * perspective);
  }
}
