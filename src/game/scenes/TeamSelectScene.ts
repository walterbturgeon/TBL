import Phaser from 'phaser';
import { DIFFICULTY } from '../config/gameConfig';
import { OPPONENTS, TURCAU, stat, type TeamConfig } from '../config/teams';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Sound } from '../audio/Sound';
import { Save } from '../systems/Save';
import { button, cartoonText, onTvBack, panel, toggleFullscreen } from '../ui/ui';
import { hex } from '../util/math';

/** Choix de l'équipe adverse avant la partie. */
export class TeamSelectScene extends Phaser.Scene {
  constructor() {
    super('TeamSelect');
  }

  private sel = 0;
  private frames: Phaser.GameObjects.Graphics[] = [];
  private rigs: CartoonRig[][] = [];
  private boxes: { x: number; y: number; w: number; h: number }[] = [];

  create() {
    this.cameras.main.fadeIn(250, 15, 26, 61);
    this.frames = [];
    this.rigs = [];
    this.boxes = [];
    this.add.rectangle(960, 540, 1920, 1080, 0x16245a);
    cartoonText(this, 960, 70, 'CHOISIS L’ÉQUIPE ADVERSE', 58, '#ffd23f').setOrigin(0.5);
    cartoonText(this, 960, 135, `${TURCAU.name.toUpperCase()}  contre…`, 30, '#ffffff').setOrigin(0.5);

    const n = OPPONENTS.length;
    const W = 540;
    const H = 660;
    const gap = 40;
    const x0 = (1920 - n * W - (n - 1) * gap) / 2;
    OPPONENTS.forEach((t, i) => {
      const x = x0 + i * (W + gap);
      const y = 190;
      this.boxes.push({ x, y, w: W, h: H });
      this.card(t, x, y, W, H);
      const zone = this.add.zone(x + W / 2, y + H / 2, W, H).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => {
        this.select(i);
        this.start();
      });
      this.frames.push(this.add.graphics());
    });
    cartoonText(this, 960, 900, `Difficulté : ${DIFFICULTY[Save.settings.difficulty].label}   ·   ${Save.settings.innings} manche${Save.settings.innings > 1 ? 's' : ''}`, 26, '#c9d4ff').setOrigin(0.5);
    cartoonText(this, 960, 1010, '← → choisir   ·   ESPACE ou OK : jouer   ·   ÉCHAP ou RETOUR : menu', 24, '#ffffff').setOrigin(0.5);
    button(this, 130, 70, '← RETOUR', 200, 64, () => this.back());

    const saved = OPPONENTS.findIndex((t) => t.id === Save.settings.opponent);
    this.sel = -1;
    this.select(Math.max(0, saved));

    onTvBack(this, () => this.back());
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      Sound.unlock();
      const k = e.key;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') this.select((this.sel + 1) % n);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.select((this.sel + n - 1) % n);
      else if (k === 'Enter' || k === ' ') this.start();
      else if (k === 'Escape' || k === 'Backspace') this.back();
      else if (k === 'f' || k === 'F') toggleFullscreen(this);
    });
  }

  private card(t: TeamConfig, x: number, y: number, W: number, H: number) {
    panel(this, x, y, W, H, 0x0f1a3d, 0.95);
    const g = this.add.graphics();
    g.fillStyle(hex(t.colors.primary), 1);
    g.fillRoundedRect(x + 16, y + 16, W - 32, 100, 14);
    g.lineStyle(4, 0x111111, 1);
    g.strokeRoundedRect(x + 16, y + 16, W - 32, 100, 14);
    g.fillStyle(hex(t.colors.secondary), 1);
    g.fillRect(x + 16, y + 100, W - 32, 8);
    const name = cartoonText(this, x + W / 2, y + 62, t.name.toUpperCase(), 34, t.colors.secondary).setOrigin(0.5);
    if (name.width > W - 60) name.setScale((W - 60) / name.width);
    // trois personnages de l'équipe
    const show = [t.defense.SS, t.defense.P, t.defense.CF];
    const row: CartoonRig[] = [];
    show.forEach((c, k) => {
      const r = new CartoonRig(this, lookFor(c, t, { detail: true }));
      this.add.existing(r);
      r.baseScale = 2.1 * (stat.height(c) / 66);
      r.setPosition(x + W / 2 + (k - 1) * 150, y + 470);
      r.applyScale(1);
      row.push(r);
      cartoonText(this, x + W / 2 + (k - 1) * 150, y + 500, stat.shortName(c), 20, '#ffffff').setOrigin(0.5);
    });
    this.rigs.push(row);
    const avg = (key: 'power' | 'speed' | 'defense') => t.lineup.reduce((s, c) => s + stat[key](c), 0) / t.lineup.length;
    cartoonText(this, x + W / 2, y + 560, `Frappe ${avg('power').toFixed(1)}  ·  Vitesse ${avg('speed').toFixed(1)}  ·  Défensive ${avg('defense').toFixed(1)}`, 18, '#7fd3ff').setOrigin(0.5);
    cartoonText(this, x + W / 2, y + 610, `${t.lineup.length} joueurs au bâton`, 18, '#c9d4ff').setOrigin(0.5);
  }

  private select(i: number) {
    if (i === this.sel) return;
    if (this.sel >= 0) Sound.play('click');
    this.sel = i;
    this.frames.forEach((f, k) => {
      f.clear();
      if (k !== i) return;
      const b = this.boxes[k];
      f.lineStyle(8, 0xffd23f, 1);
      f.strokeRoundedRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16, 24);
    });
    for (const r of this.rigs[i] ?? []) r.play('celebrate', 1);
  }

  private start() {
    const t = OPPONENTS[this.sel];
    Save.updateSettings({ opponent: t.id });
    Sound.play('select');
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(220, 15, 26, 61);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game'));
  }

  private back() {
    this.input.keyboard!.removeAllListeners();
    Sound.play('select');
    this.scene.start('Menu');
  }

  update(_t: number, dms: number) {
    for (const row of this.rigs) for (const r of row) r.tick(dms / 1000);
  }
}
