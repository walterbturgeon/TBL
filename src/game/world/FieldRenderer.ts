import Phaser from 'phaser';
import { FIELD, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { BASES, MOUND, project } from './Projection';
import { hex, pick, rand } from '../util/math';
import { bakeTexture, bakedImage } from '../util/bake';
import type { TeamConfig } from '../config/teams';

type P = { x: number; y: number };
const OUT = 0x141414;
const L = FIELD.baseDistance;
const R = FIELD.fenceRadius;
const W = FIELD.foulWall;
const D = L / Math.SQRT2;

const toScreen = (pts: P[], z = 0) => pts.map((p) => {
  const s = project(p.x, p.y, z);
  return { x: s.x, y: s.y };
});

function circleWorld(cx: number, cy: number, r: number, n = 28): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function arcWorld(cx: number, cy: number, r: number, a0: number, a1: number, n = 40): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    // angle mesuré depuis l'axe +y (champ centre), positif vers +x
    out.push({ x: cx + Math.sin(a) * r, y: cy + Math.cos(a) * r });
  }
  return out;
}

/** Point le long de la ligne des fausses balles (côté s) à la distance a, décalé de d vers l'extérieur. */
function lineSide(s: number, a: number, d: number): P {
  const ux = s / Math.SQRT2;
  const uy = 1 / Math.SQRT2;
  const nx = s / Math.SQRT2;
  const ny = -1 / Math.SQRT2;
  return { x: a * ux + d * nx, y: a * uy + d * ny };
}

interface Fan {
  g: Phaser.GameObjects.Image;
  baseY: number;
}

export class FieldRenderer {
  private scene: Phaser.Scene;
  private fans: Fan[] = [];
  private board: {
    home: Phaser.GameObjects.Text;
    away: Phaser.GameObjects.Text;
    homeName: Phaser.GameObjects.Text;
    awayName: Phaser.GameObjects.Text;
    inning: Phaser.GameObjects.Text;
  };

  constructor(scene: Phaser.Scene, home: TeamConfig, away: TeamConfig) {
    this.scene = scene;
    // le stade est dessiné une fois, puis gardé comme une seule texture
    const key = 'stadium_' + home.id + '_' + away.id;
    const g = new Phaser.GameObjects.Graphics(scene);
    this.drawGround(g);
    this.drawStands(g, home, away);
    this.drawInfield(g);
    this.drawLines(g);
    this.drawFence(g);
    if (!scene.textures.exists(key)) g.generateTexture(key, GAME_WIDTH, GAME_HEIGHT);
    g.destroy();
    scene.add.image(0, 0, key).setOrigin(0).setDepth(-1000);
    this.board = this.drawScoreboard(home, away);
    this.spawnFans(home, away);
  }

  // ---------------------------------------------------------- sol
  private drawGround(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x2f7a3b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // arbres en arrière-plan
    for (let i = 0; i < 40; i++) {
      const x = rand(0, GAME_WIDTH);
      const y = rand(0, 130);
      const r = rand(22, 40);
      g.fillStyle(0x245f2e, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(3, OUT, 0.6);
      g.strokeCircle(x, y, r);
    }
    for (let i = 0; i < 25; i++) {
      const x = pick([rand(0, 260), rand(1660, GAME_WIDTH)]);
      const y = rand(120, GAME_HEIGHT);
      const r = rand(24, 44);
      g.fillStyle(0x2a6b33, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(3, OUT, 0.5);
      g.strokeCircle(x, y, r);
      g.fillStyle(0x3d8d45, 1);
      g.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.45);
    }

    // aire de jeu : filet arrière, murs le long des lignes, clôture en arc
    const outline = this.playArea();
    g.fillStyle(0x59b84a, 1);
    g.fillPoints(toScreen(outline), true);
    // bandes de tonte
    for (let r = 100, i = 0; r < R - 10; r += 13, i++) {
      if (i % 2) continue;
      const a = Math.PI / 4;
      const pts = [...arcWorld(0, 0, r, -a, a, 30), ...arcWorld(0, 0, Math.min(R - 12, r + 13), a, -a, 30)];
      g.fillStyle(0x63c454, 1);
      g.fillPoints(toScreen(pts), true);
    }
    // piste d'avertissement
    const ang = this.wallAngle();
    const track = [...arcWorld(0, 0, R - 11, -ang, ang, 50), ...arcWorld(0, 0, R, ang, -ang, 50)];
    g.fillStyle(0xc98b4a, 1);
    g.fillPoints(toScreen(track), true);
    g.lineStyle(4, OUT, 1);
    g.strokePoints(toScreen(outline), true, true);
  }

  private wallAngle() {
    // angle où le mur des fausses balles rencontre la clôture
    for (let a = 45; a < 80; a += 0.25) {
      const rad = (a * Math.PI) / 180;
      const x = Math.sin(rad) * R;
      const y = Math.cos(rad) * R;
      const d = (x - y) / Math.SQRT2;
      if (d >= W) return rad;
    }
    return (60 * Math.PI) / 180;
  }

  private playArea(): P[] {
    const ang = this.wallAngle();
    const B = FIELD.backstop;
    const left: P[] = [];
    const right: P[] = [];
    const aEnd = R * Math.cos(ang - Math.PI / 4); // longueur le long de la ligne jusqu'à la clôture
    for (let a = -40; a <= aEnd; a += 10) {
      const pl = lineSide(-1, a, W);
      const pr = lineSide(1, a, W);
      if (pl.y >= -B) left.push(pl);
      if (pr.y >= -B) right.push(pr);
    }
    const xb = W * Math.SQRT2 - B;
    return [{ x: xb, y: -B }, { x: -xb, y: -B }, ...left, ...arcWorld(0, 0, R, -ang, ang, 60), ...right.reverse()];
  }

  // ---------------------------------------------------------- champ intérieur
  private drawInfield(g: Phaser.GameObjects.Graphics) {
    const t = 99; // la ligne rencontre l'arc du champ intérieur
    const r = 74;
    const p1 = { x: t / Math.SQRT2, y: t / Math.SQRT2 };
    const a1 = Math.atan2(p1.x - MOUND.x, p1.y - MOUND.y);
    const dirt = [{ x: 0, y: 0 }, p1, ...arcWorld(MOUND.x, MOUND.y, r, a1, -a1, 40), { x: -p1.x, y: p1.y }];
    g.fillStyle(0xd98a4a, 1);
    g.fillPoints(toScreen(dirt), true);
    g.lineStyle(3, OUT, 0.7);
    g.strokePoints(toScreen(dirt), true, true);
    // gazon du losange
    const C = { x: 0, y: D };
    const inset = (b: P, k: number) => {
      const dx = C.x - b.x;
      const dy = C.y - b.y;
      const l = Math.hypot(dx, dy);
      return { x: b.x + (dx / l) * k, y: b.y + (dy / l) * k };
    };
    const grass = [inset(BASES[0], 13), inset(BASES[1], 11), inset(BASES[2], 11), inset(BASES[3], 11)];
    g.fillStyle(0x5fbd4e, 1);
    g.fillPoints(toScreen(grass), true);
    g.lineStyle(2, OUT, 0.35);
    g.strokePoints(toScreen(grass), true, true);
    // cercles de terre autour des buts
    for (const k of [1, 2, 3]) {
      g.fillStyle(0xd98a4a, 1);
      g.fillPoints(toScreen(circleWorld(BASES[k].x, BASES[k].y, 8)), true);
    }
    g.fillStyle(0xd98a4a, 1);
    g.fillPoints(toScreen(circleWorld(0, 0, 13)), true);
    g.lineStyle(2.5, OUT, 0.5);
    g.strokePoints(toScreen(circleWorld(0, 0, 13)), true, true);
    // monticule
    g.fillStyle(0xe6a064, 1);
    g.fillPoints(toScreen(circleWorld(MOUND.x, MOUND.y, 9)), true);
    g.lineStyle(3, OUT, 0.7);
    g.strokePoints(toScreen(circleWorld(MOUND.x, MOUND.y, 9)), true, true);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      toScreen([
        { x: -1.2, y: MOUND.y + 0.3 },
        { x: 1.2, y: MOUND.y + 0.3 },
        { x: 1.2, y: MOUND.y - 0.3 },
        { x: -1.2, y: MOUND.y - 0.3 },
      ]),
      true,
    );
    // cercles d'attente
    for (const s of [-1, 1]) {
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokePoints(toScreen(circleWorld(s * 30, -8, 2.5, 16)), true, true);
    }
  }

  private drawLines(g: Phaser.GameObjects.Graphics) {
    // lignes des fausses balles
    for (const s of [-1, 1]) {
      const end = { x: (s * R) / Math.SQRT2, y: R / Math.SQRT2 };
      const pts: P[] = [];
      for (let i = 0; i <= 20; i++) pts.push({ x: (end.x * i) / 20, y: (end.y * i) / 20 });
      g.lineStyle(4, 0xffffff, 1);
      g.strokePoints(toScreen(pts), false);
      // poteau de fausse balle
      const top = project(end.x, end.y, 22);
      const bot = project(end.x, end.y, 0);
      g.lineStyle(5, 0xffd23f, 1);
      g.lineBetween(bot.x, bot.y, top.x, top.y);
    }
    // rectangles des frappeuses
    for (const s of [-1, 1]) {
      const box = [
        { x: s * 1.3, y: -3 },
        { x: s * 4.3, y: -3 },
        { x: s * 4.3, y: 3 },
        { x: s * 1.3, y: 3 },
      ];
      g.lineStyle(2.5, 0xffffff, 0.9);
      g.strokePoints(toScreen(box), true, true);
    }
    // buts
    for (const k of [1, 2, 3]) {
      const b = BASES[k];
      const h = 1.3;
      const pts = [
        { x: b.x, y: b.y + h },
        { x: b.x + h, y: b.y },
        { x: b.x, y: b.y - h },
        { x: b.x - h, y: b.y },
      ];
      g.fillStyle(0xffffff, 1);
      g.fillPoints(toScreen(pts), true);
      g.lineStyle(2.5, OUT, 1);
      g.strokePoints(toScreen(pts), true, true);
    }
    const plate = [
      { x: -0.75, y: 0.75 },
      { x: 0.75, y: 0.75 },
      { x: 0.75, y: 0 },
      { x: 0, y: -0.75 },
      { x: -0.75, y: 0 },
    ];
    g.fillStyle(0xffffff, 1);
    g.fillPoints(toScreen(plate), true);
    g.lineStyle(2.5, OUT, 1);
    g.strokePoints(toScreen(plate), true, true);
  }

  // ---------------------------------------------------------- clôture
  private drawFence(g: Phaser.GameObjects.Graphics) {
    const ang = this.wallAngle();
    const arc = arcWorld(0, 0, R, -ang, ang, 70);
    const H = FIELD.fenceHeight;
    const bottom = toScreen(arc, 0);
    const top = toScreen(arc, H);
    g.fillStyle(0x1f5e3a, 1);
    g.fillPoints([...bottom, ...top.slice().reverse()], true);
    g.lineStyle(3, OUT, 1);
    g.strokePoints([...bottom, ...top.slice().reverse()], true, true);
    g.lineStyle(4, 0xffd23f, 1);
    g.strokePoints(top, false);
    // distance au champ centre
    const c = project(0, R, H * 0.45);
    this.scene.add
      .text(c.x, c.y, String(R), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(-990);
    // murets le long des lignes
    for (const s of [-1, 1]) {
      const pts: P[] = [];
      for (let a = -24; a <= R * Math.cos(ang - Math.PI / 4); a += 10) {
        const p = lineSide(s, a, W);
        if (p.y >= -FIELD.backstop) pts.push(p);
      }
      const b = toScreen(pts, 0);
      const t = toScreen(pts, 3);
      g.fillStyle(0x2d4fa0, 1);
      g.fillPoints([...b, ...t.reverse()], true);
    }
    // filet arrière
    const xb = W * Math.SQRT2 - FIELD.backstop;
    const n0 = project(-xb, -FIELD.backstop, 0);
    const n1 = project(xb, -FIELD.backstop, 0);
    const n2 = project(xb, -FIELD.backstop, 14);
    const n3 = project(-xb, -FIELD.backstop, 14);
    g.fillStyle(0x2b2b2b, 0.25);
    g.fillPoints([n0, n1, n2, n3], true);
    g.lineStyle(1, 0x111111, 0.35);
    for (let i = 0; i <= 16; i++) {
      const x = -xb + (2 * xb * i) / 16;
      const a = project(x, -FIELD.backstop, 0);
      const b = project(x, -FIELD.backstop, 14);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(3, OUT, 1);
    g.lineBetween(n3.x, n3.y, n2.x, n2.y);
  }

  // ---------------------------------------------------------- estrades et abris
  private drawStands(g: Phaser.GameObjects.Graphics, home: TeamConfig, away: TeamConfig) {
    for (const s of [-1, 1]) {
      // estrades
      const stand = [lineSide(s, -6, W + 18), lineSide(s, 175, W + 18), lineSide(s, 175, W + 62), lineSide(s, -6, W + 62)];
      g.fillStyle(0x8c97a8, 1);
      g.fillPoints(toScreen(stand), true);
      g.lineStyle(3, OUT, 1);
      g.strokePoints(toScreen(stand), true, true);
      for (let d = W + 24; d < W + 62; d += 7) {
        const a = toScreen([lineSide(s, -6, d), lineSide(s, 175, d)]);
        g.lineStyle(3, 0xc4ccd8, 1);
        g.lineBetween(a[0].x, a[0].y, a[1].x, a[1].y);
      }
      // abri des joueuses
      const team = s > 0 ? home : away;
      const dug = [lineSide(s, 30, W + 1), lineSide(s, 78, W + 1), lineSide(s, 78, W + 14), lineSide(s, 30, W + 14)];
      g.fillStyle(0x2b2f3a, 1);
      g.fillPoints(toScreen(dug), true);
      g.lineStyle(3, OUT, 1);
      g.strokePoints(toScreen(dug), true, true);
      const stripe = [lineSide(s, 30, W + 1), lineSide(s, 78, W + 1), lineSide(s, 78, W + 4), lineSide(s, 30, W + 4)];
      g.fillStyle(hex(team.colors.primary), 1);
      g.fillPoints(toScreen(stripe), true);
      const c = project(lineSide(s, 54, W + 8).x, lineSide(s, 54, W + 8).y);
      this.scene.add
        .text(c.x, c.y, team.short, {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: '18px',
          color: team.colors.secondary,
        })
        .setOrigin(0.5)
        .setRotation(s * -0.62)
        .setStroke('#111111', 4)
        .setDepth(-990);
    }
    // gradins derrière la clôture
    const ang = this.wallAngle();
    const band = [...arcWorld(0, 0, R + 6, -ang, ang, 50), ...arcWorld(0, 0, R + 40, ang, -ang, 50)];
    g.fillStyle(0x8c97a8, 1);
    g.fillPoints(toScreen(band), true);
    g.lineStyle(3, OUT, 1);
    g.strokePoints(toScreen(band), true, true);
  }

  private spawnFans(home: TeamConfig, away: TeamConfig) {
    const shirts = [hex(home.colors.primary), hex(home.colors.primary), 0xffffff, 0xffd23f, 0x3fa7d6, 0xe76f51, hex(away.colors.primary), 0x8e5cc2];
    const skins = [0xf7cfa6, 0xe0a878, 0xb57a4c, 0x7a4b2a, 0xf2d0b5];
    const hairs = [0x2b1a10, 0x6b3e1f, 0xe8c45a, 0x141414, 0xa0522d, 0x888888];
    // quelques modèles de spectateurs, cuits en textures
    const B: [number, number, number, number] = [-10, -20, 10, 9];
    const VARIANTS = 24;
    for (let i = 0; i < VARIANTS; i++) {
      bakeTexture(this.scene, 'fan_' + home.id + '_' + i, B, 2, (gg) => {
        gg.fillStyle(shirts[i % shirts.length], 1);
        gg.fillRoundedRect(-7, -6, 14, 12, 4);
        gg.lineStyle(2, OUT, 1);
        gg.strokeRoundedRect(-7, -6, 14, 12, 4);
        gg.fillStyle(skins[(i * 7) % skins.length], 1);
        gg.fillCircle(0, -11, 6);
        gg.lineStyle(2, OUT, 1);
        gg.strokeCircle(0, -11, 6);
        gg.fillStyle(hairs[(i * 5) % hairs.length], 1);
        gg.slice(0, -11, 6, Math.PI, 0, false);
        gg.fillPath();
      });
    }
    const add = (p: P) => {
      const s = project(p.x, p.y);
      const sc = 0.75 * s.s + 0.2;
      const img = bakedImage(this.scene, 'fan_' + home.id + '_' + Math.floor(Math.random() * VARIANTS), B, 2, s.x, s.y);
      img.setScale(sc / 2);
      img.setDepth(s.y - 3000);
      this.fans.push({ g: img, baseY: s.y });
    };
    for (const s of [-1, 1]) {
      for (let d = W + 26; d < W + 62; d += 7) {
        for (let a = 4; a < 170; a += rand(9, 17)) add(lineSide(s, a + rand(-2, 2), d));
      }
    }
    const ang = this.wallAngle();
    for (let r = R + 14; r < R + 40; r += 9) {
      for (let a = -ang + 0.05; a < ang - 0.05; a += rand(0.035, 0.07)) {
        if (Math.abs(a) < 0.17 && r > R + 20) continue; // place du tableau
        add({ x: Math.sin(a) * r, y: Math.cos(a) * r });
      }
    }
  }

  /** Les spectateurs se lèvent (0..1 = proportion de la foule). */
  cheer(level = 0.6) {
    for (const f of this.fans) {
      if (Math.random() > level) continue;
      this.scene.tweens.add({
        targets: f.g,
        y: f.baseY - rand(6, 14),
        duration: rand(120, 200),
        yoyo: true,
        repeat: Math.floor(rand(1, 4)),
        delay: rand(0, 250),
        ease: 'Sine.Out',
      });
    }
  }

  // ---------------------------------------------------------- tableau de pointage
  private drawScoreboard(home: TeamConfig, away: TeamConfig) {
    const c = project(0, R + 34, 0);
    const x = c.x;
    const y = Math.max(62, c.y - 30);
    const g = this.scene.add.graphics().setDepth(-900);
    g.fillStyle(0x1b1f2b, 1);
    g.fillRoundedRect(x - 230, y - 52, 460, 104, 12);
    g.lineStyle(5, OUT, 1);
    g.strokeRoundedRect(x - 230, y - 52, 460, 104, 12);
    g.lineStyle(3, 0xffd23f, 1);
    g.strokeRoundedRect(x - 222, y - 44, 444, 88, 8);
    g.fillStyle(0x3a3f4f, 1);
    g.fillRect(x - 12, y + 52, 24, 40);
    const font = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
    this.scene.add
      .text(x, y - 32, 'TURCAU BASEBALL LEAGUE', { fontFamily: font, fontSize: '17px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setDepth(-899);
    const mk = (tx: number, ty: number, s: string, size: number, color: string, ox = 0) =>
      this.scene.add.text(tx, ty, s, { fontFamily: font, fontSize: size + 'px', color }).setOrigin(ox, 0.5).setDepth(-899);
    return {
      awayName: mk(x - 200, y - 2, away.short, 22, '#ffffff'),
      homeName: mk(x - 200, y + 26, home.short, 22, '#ffffff'),
      away: mk(x + 120, y - 2, '0', 26, '#ff8f6b', 1),
      home: mk(x + 120, y + 26, '0', 26, '#7fd3ff', 1),
      inning: mk(x + 200, y + 12, '1▲', 22, '#ffd23f', 1),
    };
  }

  updateBoard(homeScore: number, awayScore: number, inning: number, top: boolean) {
    this.board.home.setText(String(homeScore));
    this.board.away.setText(String(awayScore));
    this.board.inning.setText(`${inning}${top ? '▲' : '▼'}`);
  }
}
