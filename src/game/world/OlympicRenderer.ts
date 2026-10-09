import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { rand } from '../util/math';
import { LOW } from '../util/quality';

const OUT = 0x141414;
/** Couleurs des 5 étoiles du logo (bleu, noir, rouge, jaune, vert). */
export const STAR_COLORS = [0x1b6fd6, 0x222222, 0xd62828, 0xffc93c, 0x2fae4a];

/**
 * Page d'accueil « olympique » : ciel, stade, piste d'athlétisme, fanions, et trois coins de sport
 * (monticule de baseball à gauche, sable de volleyball à droite, scène de danse en bas).
 * Dessiné une fois, puis gardé comme texture.
 */
export class OlympicRenderer {
  constructor(scene: Phaser.Scene) {
    const key = 'olympic_bg';
    const k = LOW ? 0.5 : 1;
    if (!scene.textures.exists(key)) {
      const g = new Phaser.GameObjects.Graphics(scene);
      if (k !== 1) g.scaleCanvas(k, k);
      this.draw(g);
      g.generateTexture(key, GAME_WIDTH * k, GAME_HEIGHT * k);
      g.destroy();
    }
    scene.add.image(0, 0, key).setOrigin(0).setDepth(-1000).setScale(1 / k);
  }

  private draw(g: Phaser.GameObjects.Graphics) {
    // ciel (bandes du bleu foncé au bleu pâle)
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x2a62c9),
        Phaser.Display.Color.ValueToColor(0xa9dcff),
        100,
        t * 100,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, i * 40, GAME_WIDTH, 41);
    }
    // soleil
    g.fillStyle(0xfff3b0, 0.25);
    g.fillCircle(1680, 150, 120);
    g.fillStyle(0xffe066, 1);
    g.fillCircle(1680, 150, 70);
    g.lineStyle(5, OUT, 0.6);
    g.strokeCircle(1680, 150, 70);
    // nuages
    for (const [cx, cy, s] of [
      [260, 170, 1],
      [620, 110, 0.7],
      [1330, 200, 0.85],
    ]) {
      g.fillStyle(0xffffff, 0.9);
      for (const [dx, dy, r] of [
        [-60, 10, 36],
        [-20, -14, 48],
        [30, -6, 42],
        [70, 12, 32],
      ])
        g.fillCircle(cx + dx * s, cy + dy * s, r * s);
      g.fillRect(cx - 90 * s, cy + 8 * s, 190 * s, 34 * s);
    }

    // tours d'éclairage
    for (const x of [140, 1780]) {
      g.fillStyle(0x4a5368, 1);
      g.fillRect(x - 8, 250, 16, 260);
      g.fillStyle(0x2c3344, 1);
      g.fillRoundedRect(x - 60, 220, 120, 54, 8);
      g.lineStyle(4, OUT, 1);
      g.strokeRoundedRect(x - 60, 220, 120, 54, 8);
      g.fillStyle(0xfff7c2, 1);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillCircle(x - 42 + i * 28, 236 + j * 22, 8);
    }

    // gradins du stade (arc de cercle à l'horizon)
    const top = (x: number) => 470 - 70 * Math.sin((x / GAME_WIDTH) * Math.PI);
    const stand: { x: number; y: number }[] = [];
    for (let x = 0; x <= GAME_WIDTH; x += 40) stand.push({ x, y: top(x) });
    stand.push({ x: GAME_WIDTH, y: 640 }, { x: 0, y: 640 });
    g.fillStyle(0x5d6b8a, 1);
    g.fillPoints(stand, true);
    // rangées et foule (petits points de couleur)
    for (let row = 0; row < 7; row++) {
      for (let x = 10; x < GAME_WIDTH; x += rand(12, 20)) {
        const y = top(x) + 22 + row * 24;
        if (y > 630 || (LOW && Math.random() < 0.5)) continue;
        g.fillStyle([0xffffff, 0xffd23f, 0xe76f51, 0x3fa7d6, 0x7dff7a, 0xff5fa2, 0xf2d0b5][Math.floor(Math.random() * 7)], 0.9);
        g.fillCircle(x, y, 5);
      }
    }
    g.lineStyle(8, 0x2c3344, 1);
    g.strokePoints(stand.slice(0, -2), false);
    // bord du stade
    g.fillStyle(0x2c3344, 1);
    g.fillRect(0, 630, GAME_WIDTH, 18);

    // piste d'athlétisme (ellipses en perspective) et pelouse
    const cx = 960;
    const cy = 1180;
    g.fillStyle(0xc8553d, 1);
    g.fillEllipse(cx, cy, 2700, 1100);
    g.lineStyle(3, 0xffffff, 0.85);
    for (let i = 1; i <= 5; i++) g.strokeEllipse(cx, cy, 2700 - i * 70, 1100 - i * 34);
    g.fillStyle(0x3f9b46, 1);
    g.fillEllipse(cx, cy, 2240, 860);
    // bandes de gazon (ellipses plus petites, toujours dans la pelouse)
    g.fillStyle(0x47a84e, 1);
    for (let i = 1; i <= 3; i++) g.fillEllipse(cx, cy, 2240 - i * 300, 860 - i * 115);
    g.fillStyle(0x3f9b46, 1);
    for (let i = 1; i <= 3; i++) g.fillEllipse(cx, cy, 2240 - i * 300 - 150, 860 - i * 115 - 58);

    // coin baseball : monticule de terre et marbre
    g.fillStyle(0xc88a52, 1);
    g.fillEllipse(330, 930, 520, 150);
    g.lineStyle(4, 0x9c6538, 1);
    g.strokeEllipse(330, 930, 520, 150);
    g.fillStyle(0xffffff, 1);
    g.fillRect(310, 960, 40, 10);
    // coin volleyball : carré de sable
    g.fillStyle(0xe9c98a, 1);
    g.fillEllipse(1590, 930, 560, 160);
    g.lineStyle(4, 0xc9a464, 1);
    g.strokeEllipse(1590, 930, 560, 160);
    // petit filet de volleyball
    g.lineStyle(6, 0x555c6b, 1);
    g.lineBetween(1590, 950, 1590, 760);
    g.fillStyle(0x111111, 0.25);
    g.fillRect(1584, 770, 12, 70);
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(1584, 770, 1596, 770);
    // scène de danse au centre, en bas : plancher sombre avec bord néon
    g.fillStyle(0x1a1030, 1);
    g.fillRoundedRect(600, 975, 720, 110, 18);
    g.lineStyle(6, 0xff3cac, 1);
    g.strokeRoundedRect(600, 975, 720, 110, 18);
    g.lineStyle(2, 0x3fd0ff, 0.8);
    for (let x = 640; x < 1300; x += 60) g.lineBetween(x, 980, x - 20, 1080);

    // fanions aux couleurs des 5 étoiles
    const sag = (x: number) => 40 + 50 * Math.sin((x / GAME_WIDTH) * Math.PI);
    g.lineStyle(3, 0x333333, 1);
    const rope: { x: number; y: number }[] = [];
    for (let x = 0; x <= GAME_WIDTH; x += 40) rope.push({ x, y: sag(x) });
    g.strokePoints(rope, false);
    let n = 0;
    for (let x = 30; x < GAME_WIDTH; x += 70, n++) {
      const y = sag(x);
      g.fillStyle(STAR_COLORS[n % 5], 1);
      g.fillTriangle(x - 22, y, x + 22, y + 2, x, y + 46);
      g.lineStyle(2, OUT, 1);
      g.strokeTriangle(x - 22, y, x + 22, y + 2, x, y + 46);
    }
  }
}
