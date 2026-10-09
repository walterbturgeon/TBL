import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import type { TeamConfig } from '../config/teams';
import { bakeTexture, bakedImage } from '../util/bake';
import { hex, rand } from '../util/math';
import { LOW } from '../util/quality';
import { COURT } from './VolleyConfig';
import { vproject } from './VolleyProjection';

const OUT = 0x141414;

const scr = (pts: [number, number, number?][]) =>
  pts.map(([x, y, z]) => {
    const s = vproject(x, y, z ?? 0);
    return { x: s.x, y: s.y };
  });

/** Gymnase : mur, gradins, plancher, terrain, filet. Dessiné une fois, puis gardé comme texture. */
export class CourtRenderer {
  private scene: Phaser.Scene;
  private fans: { g: Phaser.GameObjects.Image; baseY: number }[] = [];

  constructor(scene: Phaser.Scene, left: TeamConfig, right: TeamConfig) {
    this.scene = scene;
    const key = 'gym_' + left.id + '_' + right.id;
    const k = LOW ? 0.5 : 1;
    const g = new Phaser.GameObjects.Graphics(scene);
    if (k !== 1) g.scaleCanvas(k, k);
    this.drawGym(g, left, right);
    this.drawCourt(g);
    if (!scene.textures.exists(key)) g.generateTexture(key, GAME_WIDTH * k, GAME_HEIGHT * k);
    g.destroy();
    scene.add.image(0, 0, key).setOrigin(0).setDepth(-1000).setScale(1 / k);
    this.spawnFans(left, right);
    this.drawNet();
    const font = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
    scene.add
      .text(960, 70, 'TURCAU OLYMPIC  ·  VOLLEYBALL', { fontFamily: font, fontSize: '30px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setStroke('#111111', 6)
      .setDepth(-990);
    // bancs des équipes avec leur nom
    for (const [team, side] of [
      [left, -1],
      [right, 1],
    ] as const) {
      const s = vproject(side * 6, -1.6, 0);
      scene.add
        .text(s.x, s.y, team.short, { fontFamily: font, fontSize: '26px', color: team.colors.secondary })
        .setOrigin(0.5)
        .setStroke('#111111', 6)
        .setDepth(-990);
    }
  }

  private drawGym(g: Phaser.GameObjects.Graphics, left: TeamConfig, right: TeamConfig) {
    // mur
    g.fillStyle(0x2c3a73, 1);
    g.fillRect(0, 0, GAME_WIDTH, 520);
    g.fillStyle(0x24305f, 1);
    for (let x = 0; x < GAME_WIDTH; x += 120) g.fillRect(x, 0, 60, 520);
    // bannières des équipes
    for (const [team, x] of [
      [left, 330],
      [right, 1590],
    ] as const) {
      g.fillStyle(hex(team.colors.primary), 1);
      g.fillRect(x - 110, 110, 220, 120);
      g.fillTriangle(x - 110, 230, x + 110, 230, x, 280);
      g.lineStyle(5, OUT, 1);
      g.strokeRect(x - 110, 110, 220, 120);
      g.fillStyle(hex(team.colors.secondary), 1);
      g.fillRect(x - 110, 110, 220, 14);
    }
    // gradins
    for (let i = 0; i < 6; i++) {
      const y = 300 + i * 34;
      g.fillStyle(i % 2 ? 0x8c97a8 : 0x9ea8b8, 1);
      g.fillRect(0, y, GAME_WIDTH, 34);
      g.lineStyle(2, 0x6f7a8c, 1);
      g.lineBetween(0, y, GAME_WIDTH, y);
    }
    // plancher de bois
    g.fillStyle(0xd9a066, 1);
    g.fillRect(0, 504, GAME_WIDTH, GAME_HEIGHT - 504);
    g.lineStyle(2, 0xc48a52, 0.7);
    for (let y = -3; y <= 14; y += 0.6) {
      const a = vproject(-14, y);
      const b = vproject(14, y);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(4, OUT, 1);
    g.lineBetween(0, 504, GAME_WIDTH, 504);
  }

  private drawCourt(g: Phaser.GameObjects.Graphics) {
    const H = COURT.half;
    const W = COURT.width;
    // zone libre bleue, puis terrain orange
    const free = scr([
      [-H - 2.6, -1.4],
      [H + 2.6, -1.4],
      [H + 2.6, W + 2],
      [-H - 2.6, W + 2],
    ]);
    g.fillStyle(0x2d6cdf, 1);
    g.fillPoints(free, true);
    g.lineStyle(3, OUT, 0.6);
    g.strokePoints(free, true, true);
    const court = scr([
      [-H, 0],
      [H, 0],
      [H, W],
      [-H, W],
    ]);
    g.fillStyle(0xe9813a, 1);
    g.fillPoints(court, true);
    // lignes
    g.lineStyle(5, 0xffffff, 1);
    g.strokePoints(court, true, true);
    for (const x of [-COURT.attack, COURT.attack]) {
      const l = scr([
        [x, 0],
        [x, W],
      ]);
      g.lineStyle(4, 0xffffff, 0.95);
      g.lineBetween(l[0].x, l[0].y, l[1].x, l[1].y);
    }
    const c = scr([
      [0, 0],
      [0, W],
    ]);
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(c[0].x, c[0].y, c[1].x, c[1].y);
  }

  /** Filet : au-dessus des joueuses, avec un maillage transparent (on voit à travers). */
  private drawNet() {
    const g = this.scene.add.graphics().setDepth(2500);
    const y0 = -0.4;
    const y1 = COURT.width + 0.4;
    const top = COURT.netH;
    const bot = COURT.netH - 1;
    // poteaux
    for (const y of [-0.9, COURT.width + 0.9]) {
      const a = vproject(0, y, 0);
      const b = vproject(0, y, top + 0.35);
      g.lineStyle(10, 0x555c6b, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(3, OUT, 1);
      g.strokeRect(b.x - 5, b.y, 10, a.y - b.y);
    }
    // maillage
    const quad = scr([
      [0, y0, top],
      [0, y1, top],
      [0, y1, bot],
      [0, y0, bot],
    ]);
    g.fillStyle(0x111111, 0.22);
    g.fillPoints(quad, true);
    g.lineStyle(1.5, 0x111111, 0.55);
    for (let y = y0; y <= y1 + 0.01; y += 0.45) {
      const a = vproject(0, y, top);
      const b = vproject(0, y, bot);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let z = bot; z <= top + 0.01; z += 0.2) {
      const a = vproject(0, y0, z);
      const b = vproject(0, y1, z);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // bande blanche du haut et câble du bas
    const ta = vproject(0, y0, top);
    const tb = vproject(0, y1, top);
    g.lineStyle(9, OUT, 1);
    g.lineBetween(ta.x, ta.y, tb.x, tb.y);
    g.lineStyle(6, 0xffffff, 1);
    g.lineBetween(ta.x, ta.y, tb.x, tb.y);
    const ba = vproject(0, y0, bot);
    const bb = vproject(0, y1, bot);
    g.lineStyle(3, 0xffffff, 0.9);
    g.lineBetween(ba.x, ba.y, bb.x, bb.y);
    // antennes rouges et blanches
    for (const y of [0, COURT.width]) {
      for (let i = 0; i < 4; i++) {
        const a = vproject(0, y, top + i * 0.2);
        const b = vproject(0, y, top + (i + 1) * 0.2);
        g.lineStyle(5, i % 2 ? 0xffffff : 0xe3262e, 1);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }

  private spawnFans(left: TeamConfig, right: TeamConfig) {
    const shirts = [hex(left.colors.primary), hex(right.colors.primary), 0xffffff, 0xffd23f, 0x3fa7d6, 0xe76f51, 0x8e5cc2];
    const skins = [0xf7cfa6, 0xe0a878, 0xb57a4c, 0x7a4b2a, 0xf2d0b5];
    const hairs = [0x2b1a10, 0x6b3e1f, 0xe8c45a, 0x141414, 0xa0522d, 0x888888];
    const B: [number, number, number, number] = [-10, -20, 10, 9];
    const VARIANTS = 16;
    for (let i = 0; i < VARIANTS; i++) {
      bakeTexture(this.scene, 'gymfan_' + i, B, 2, (gg) => {
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
    for (let row = 0; row < 6; row++) {
      const y = 330 + row * 34;
      for (let x = 20; x < GAME_WIDTH; x += rand(26, 42)) {
        if (LOW && Math.random() < 0.6) continue;
        const img = bakedImage(this.scene, 'gymfan_' + Math.floor(Math.random() * VARIANTS), B, 2, x, y);
        img.setScale(1.55 / 2);
        img.setDepth(-900 + row);
        this.fans.push({ g: img, baseY: y });
      }
    }
  }

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
}

