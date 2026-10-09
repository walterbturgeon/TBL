import Phaser from 'phaser';
import type { TeamConfig } from '../config/teams';
import { bakeTexture, bakedImage } from '../util/bake';
import { hex, rand } from '../util/math';
import { LOW } from '../util/quality';

const OUT = 0x141414;

/** Couleur d'une équipe assez claire pour les lumières (le noir des Baddies devient rouge). */
export function teamGlow(t: TeamConfig): number {
  const p = hex(t.colors.primary);
  const lum = ((p >> 16) & 255) * 0.3 + ((p >> 8) & 255) * 0.59 + (p & 255) * 0.11;
  return lum < 60 ? hex(t.colors.secondary) : p;
}

/** Scène de spectacle hip-hop : mur, écrans DEL, haut-parleurs, foule, plancher brillant, projecteurs. */
export class StageRenderer {
  private scene: Phaser.Scene;
  private cones: { img: Phaser.GameObjects.Image; base: number; side: number }[] = [];
  private crowd: { img: Phaser.GameObjects.Image; baseY: number; ph: number }[] = [];
  private spots: Phaser.GameObjects.Image[] = [];
  private flash: Phaser.GameObjects.Rectangle;
  private color = 0xffffff;

  constructor(scene: Phaser.Scene, left: TeamConfig, right: TeamConfig) {
    this.scene = scene;
    const k = LOW ? 0.5 : 1;
    const key = 'dance_stage';
    if (!scene.textures.exists(key)) {
      const g = new Phaser.GameObjects.Graphics(scene);
      if (k !== 1) g.scaleCanvas(k, k);
      this.drawStatic(g);
      g.generateTexture(key, 1920 * k, 1080 * k);
      g.destroy();
    }
    scene.add.image(0, 0, key).setOrigin(0).setDepth(-1000).setScale(1 / k);

    // projecteurs (cônes de lumière additifs)
    bakeTexture(scene, 'dance_cone', [-260, 0, 260, 900], 0.5, (cg) => {
      for (let i = 0; i < 7; i++) {
        const w = 60 + i * 30;
        cg.fillStyle(0xffffff, 0.05);
        cg.fillTriangle(0, 0, -w, 900, w, 900);
      }
    });
    [
      [330, 1],
      [760, -1],
      [1160, 1],
      [1590, -1],
    ].forEach(([x, side], i) => {
      const img = bakedImage(scene, 'dance_cone', [-260, 0, 260, 900], 0.5, x, -20);
      img.setBlendMode(Phaser.BlendModes.ADD).setDepth(-700).setAlpha(0.9);
      img.rotation = side * 0.25;
      this.cones.push({ img, base: side * 0.22, side: i % 2 ? -1 : 1 });
    });

    // cercles de lumière au sol sous chaque équipe
    bakeTexture(scene, 'dance_spot', [-300, -80, 300, 80], 0.5, (sg) => {
      for (let i = 0; i < 6; i++) {
        sg.fillStyle(0xffffff, 0.08);
        sg.fillEllipse(0, 0, 600 - i * 80, 160 - i * 22);
      }
    });
    for (const [t, x] of [
      [left, 430],
      [right, 1490],
    ] as const) {
      const img = bakedImage(scene, 'dance_spot', [-300, -80, 300, 80], 0.5, x, 900);
      img.setBlendMode(Phaser.BlendModes.ADD).setDepth(-600).setTint(teamGlow(t)).setAlpha(0.8);
      this.spots.push(img);
    }

    this.spawnCrowd(left, right);
    // éclair blanc sur les temps forts
    this.flash = scene.add.rectangle(960, 540, 1920, 1080, 0xffffff, 0).setDepth(-500).setBlendMode(Phaser.BlendModes.ADD);
  }

  setColor(c: number) {
    this.color = c;
    this.cones.forEach((cn, i) => cn.img.setTint(i % 2 ? 0xffffff : c));
  }

  /** beat : position dans la musique (en temps) ; energy : 0 au repos, 1 pendant un round. */
  update(beat: number, energy: number) {
    const dip = Math.pow(Math.cos(Math.PI * beat), 2);
    const bar = beat / 4;
    this.cones.forEach((cn, i) => {
      cn.img.rotation = cn.base + Math.sin(bar * Math.PI + i) * 0.22 * cn.side * (0.3 + energy);
      cn.img.setAlpha(0.35 + 0.55 * energy * (0.6 + 0.4 * dip));
    });
    for (const c of this.crowd) c.img.y = c.baseY - (4 + 8 * energy) * Math.pow(Math.cos(Math.PI * (beat + c.ph)), 2);
    for (const s of this.spots) s.setAlpha(0.45 + 0.4 * energy * dip);
  }

  /** Éclair blanc (début d'un round, combo). */
  pulse(strength = 0.25) {
    this.flash.setAlpha(strength);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 260, ease: 'Quad.Out' });
  }

  cheer() {
    for (const c of this.crowd) {
      if (Math.random() < 0.5) continue;
      this.scene.tweens.add({ targets: c.img, y: c.baseY - rand(14, 26), duration: rand(130, 200), yoyo: true, repeat: 2, delay: rand(0, 200) });
    }
  }

  private drawStatic(g: Phaser.GameObjects.Graphics) {
    // mur du fond (bandes de violet foncé)
    for (let i = 0; i < 14; i++) {
      g.fillStyle(Phaser.Display.Color.GetColor(22 + i * 2, 12 + i, 48 + i * 3), 1);
      g.fillRect(0, i * 40, 1920, 40);
    }
    // treillis de lumières en haut
    g.fillStyle(0x2a2a35, 1);
    g.fillRect(0, 0, 1920, 26);
    g.lineStyle(3, 0x4a4a5a, 1);
    for (let x = 0; x < 1920; x += 48) {
      g.lineBetween(x, 0, x + 24, 26);
      g.lineBetween(x + 24, 26, x + 48, 0);
    }
    // écrans DEL (les textes sont ajoutés par la scène)
    for (const x0 of [120, 1200]) {
      g.fillStyle(0x000000, 0.5);
      g.fillRoundedRect(x0 + 8, 118, 600, 250, 16);
      g.fillStyle(0x0a0a18, 1);
      g.fillRoundedRect(x0, 110, 600, 250, 16);
      g.lineStyle(6, 0x2c2c3c, 1);
      g.strokeRoundedRect(x0, 110, 600, 250, 16);
      g.lineStyle(1, 0x1c1c34, 1);
      for (let y = 118; y < 356; y += 6) g.lineBetween(x0 + 8, y, x0 + 592, y);
    }
    // haut-parleurs empilés sur les côtés
    for (const x0 of [0, 1800]) {
      for (let i = 0; i < 3; i++) {
        const y0 = 400 + i * 130;
        g.fillStyle(0x1c1c22, 1);
        g.fillRect(x0, y0, 120, 124);
        g.lineStyle(4, OUT, 1);
        g.strokeRect(x0, y0, 120, 124);
        g.fillStyle(0x34343e, 1);
        g.fillCircle(x0 + 60, y0 + 70, 40);
        g.fillStyle(0x15151a, 1);
        g.fillCircle(x0 + 60, y0 + 70, 18);
        g.fillStyle(0x34343e, 1);
        g.fillCircle(x0 + 60, y0 + 22, 12);
      }
    }
    // barrière devant la foule
    g.fillStyle(0x15101f, 1);
    g.fillRect(0, 520, 1920, 24);
    g.lineStyle(3, 0x3a3050, 1);
    g.lineBetween(0, 520, 1920, 520);
    // plancher brillant en perspective
    g.fillStyle(0x1a1030, 1);
    g.fillRect(0, 544, 1920, 536);
    const vx = 960;
    const vy = 300;
    g.lineStyle(2, 0x3a2a60, 0.8);
    for (let i = -14; i <= 14; i++) {
      const xb = vx + i * 160;
      const t = (544 - vy) / (1080 - vy);
      g.lineBetween(vx + (xb - vx) * t, 544, xb, 1080);
    }
    for (const y of [580, 630, 695, 775, 875, 1000]) g.lineBetween(0, y, 1920, y);
    // reflets
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(0, 548, 1920, 30);
  }

  private spawnCrowd(left: TeamConfig, right: TeamConfig) {
    const shirts = [teamGlow(left), teamGlow(right), 0xffffff, 0xffd23f, 0x3fd0ff, 0xff5fa2, 0x7dff7a];
    const B: [number, number, number, number] = [-12, -22, 12, 12];
    const V = 10;
    for (let i = 0; i < V; i++) {
      bakeTexture(this.scene, 'dfan_' + left.id + '_' + right.id + '_' + i, B, 2, (g) => {
        g.fillStyle(0x0c0818, 1);
        g.fillRoundedRect(-9, -6, 18, 18, 5);
        g.fillCircle(0, -12, 8);
        // lumière de contour de la couleur de l'équipe
        g.lineStyle(2, shirts[i % shirts.length], 0.9);
        g.strokeCircle(0, -12, 8);
        g.lineBetween(-9, -2, -9, 10);
        g.lineBetween(9, -2, 9, 10);
        if (i % 3 === 0) {
          // bras en l'air
          g.lineStyle(4, 0x0c0818, 1);
          g.lineBetween(-7, -4, -13, -20);
          g.lineBetween(7, -4, 13, -20);
        }
      });
    }
    for (let row = 0; row < 3; row++) {
      const y = 450 + row * 30;
      for (let x = 130 + row * 13; x < 1790; x += rand(30, 46)) {
        if (LOW && Math.random() < 0.5) continue;
        const img = bakedImage(this.scene, 'dfan_' + left.id + '_' + right.id + '_' + Math.floor(Math.random() * V), B, 2, x, y);
        img.setScale((1.7 + row * 0.25) / 2).setDepth(-800 + row);
        this.crowd.push({ img, baseY: y, ph: Math.random() < 0.5 ? 0 : 0.5 });
      }
    }
  }
}
