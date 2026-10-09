import Phaser from 'phaser';
import { rosterOf, stat, teamById } from '../config/teams';
import { PLAYERS } from '../config/players';
import { BILLY, STELLA } from '../config/dogs';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Sound } from '../audio/Sound';
import { Stadium } from '../audio/Stadium';
import { Save } from '../systems/Save';
import { button, cartoonText, onTvBack, panel, type MenuButton } from '../ui/ui';
import { rand } from '../util/math';
import type { GameSummary } from './GameScene';

/** Écran de victoire ou de défaite. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  private rig: CartoonRig | null = null;
  private buttons: MenuButton[] = [];
  private sel = 0;
  private celebT = 0;

  create(s: GameSummary) {
    this.cameras.main.fadeIn(300, 15, 26, 61);
    this.rig = null;
    const win = s.result === 'win';
    this.add.rectangle(960, 540, 1920, 1080, win ? 0x1b2a6b : 0x2a2340);
    const bg = this.add.graphics();
    for (let i = 0; i < 24; i++) {
      bg.fillStyle(0xffffff, 0.04);
      bg.slice(960, 1300, 1600, (i / 24) * Math.PI * 2, ((i + 0.5) / 24) * Math.PI * 2, false);
      bg.fillPath();
    }

    const title = win ? 'VICTOIRE !' : s.result === 'loss' ? 'DÉFAITE…' : 'MATCH NUL';
    const tt = cartoonText(this, 960, 100, title, 110, win ? '#ffd23f' : '#ffffff').setOrigin(0.5);
    this.tweens.add({ targets: tt, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    cartoonText(this, 960, 220, `${s.homeName}  ${s.home}   —   ${s.away}  ${s.awayName}`, 58, '#ffffff').setOrigin(0.5);

    // tableau des manches (ou des sets au volleyball)
    const volley = s.sport === 'volley';
    panel(this, 360, 285, 1200, 150);
    const n = volley ? Math.max(s.lineHome.length, 1) : Math.max(s.lineHome.length, s.lineAway.length, 3);
    const colW = Math.min(90, 760 / n);
    const x0 = 640;
    for (let i = 0; i < n; i++) cartoonText(this, x0 + i * colW, 315, volley ? `S${i + 1}` : String(i + 1), 22, '#ffd23f').setOrigin(0.5);
    cartoonText(this, x0 + n * colW + 30, 315, volley ? 'SETS' : 'P', 22, '#ffd23f').setOrigin(0.5);
    const row = (y: number, name: string, line: number[], total: number) => {
      cartoonText(this, 400, y, name, 28, '#ffffff').setOrigin(0, 0.5);
      for (let i = 0; i < n; i++) cartoonText(this, x0 + i * colW, y, line[i] === undefined ? '–' : String(line[i]), 28, '#ffffff').setOrigin(0.5);
      cartoonText(this, x0 + n * colW + 30, y, String(total), 30, '#7dff7a').setOrigin(0.5);
    };
    row(358, s.awayName, s.lineAway, s.away);
    row(402, s.homeName, s.lineHome, s.home);

    // meilleur personnage
    panel(this, 360, 465, 640, 440);
    cartoonText(this, 680, 505, 'MEILLEUR PERSONNAGE', 30, '#ffd23f').setOrigin(0.5);
    const team = teamById(s.homeId);
    const mvp = rosterOf(team).find((c) => c.id === s.mvpId);
    if (mvp) {
      const isCatcher = team.defense.C.id === mvp.id;
      const r = new CartoonRig(this, lookFor(mvp, team, { detail: true, catcherGear: isCatcher && !volley, volley }));
      this.add.existing(r);
      r.baseScale = 2.4 * (stat.height(mvp) / 66);
      r.setPosition(520, 850);
      r.applyScale(1);
      if (isCatcher && !volley) r.showMask(false);
      r.setExpression('happy');
      this.rig = r;
      cartoonText(this, 660, 600, stat.shortName(mvp), 44, '#ffffff').setOrigin(0, 0.5);
      cartoonText(this, 660, 648, `#${mvp.number}`, 28, '#7fd3ff').setOrigin(0, 0.5);
      const words = s.mvpText.split(' · ');
      words.forEach((w, i) => cartoonText(this, 660, 700 + i * 36, w, 22, '#ffffff').setOrigin(0, 0.5));
    } else {
      cartoonText(this, 680, 680, 'Toute l’équipe !', 36, '#ffffff').setOrigin(0.5);
    }

    // statistiques d'équipe
    panel(this, 1040, 465, 520, 440);
    const tn = cartoonText(this, 1300, 505, team.name.toUpperCase(), 30, '#ffd23f').setOrigin(0.5);
    if (tn.width > 480) tn.setScale(480 / tn.width);
    const lines: [string, number][] = s.statLines ?? [
      ['Coups sûrs', s.hits],
      ['Circuits', s.homeRuns],
      ['Retraits en défensive', s.outsMade],
      ['Retraits au bâton', s.strikeouts],
    ];
    lines.forEach(([l, v], i) => {
      cartoonText(this, 1080, 580 + i * 70, l, 26, '#ffffff').setOrigin(0, 0.5);
      cartoonText(this, 1520, 580 + i * 70, String(v), 36, '#7dff7a').setOrigin(1, 0.5);
    });
    const rec = Save.records();
    const fiche = volley
      ? `Fiche au volleyball : ${rec.volleyWins ?? 0} V – ${rec.volleyLosses ?? 0} D`
      : `Fiche : ${rec.wins} V – ${rec.losses} D${rec.ties ? ` – ${rec.ties} N` : ''}`;
    cartoonText(this, 1300, 870, fiche, 22, '#c9d4ff').setOrigin(0.5);

    this.buttons = [
      button(this, 760, 990, 'REJOUER', 380, 86, () => this.go(volley ? 'Volley' : 'Game')),
      button(this, 1160, 990, 'MENU', 380, 86, () => this.go('Menu')),
    ];
    this.buttons.forEach((b, i) => b.c.on('pointerover', () => this.select(i)));
    this.select(0);
    onTvBack(this, () => this.go('Menu'));
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'A' || k === 'D') this.select(1 - this.sel);
      else if (k === 'Enter' || k === ' ') {
        Sound.play('select');
        this.buttons[this.sel].c.emit('pointerdown');
      } else if (k === 'Escape') this.go('Menu');
    });

    if (win) {
      // fanfare d'orgue pour le baseball ; foule seulement pour le volleyball
      if (volley) {
        if (!Stadium.play('bigCheer', { dur: 4 })) Sound.play('cheer');
      } else if (!Stadium.play('chargeLong')) Sound.play('homerun');
      this.confetti();
    } else Sound.play('applause', 0.5);
  }

  private select(i: number) {
    this.sel = i;
    this.buttons.forEach((b, k) => b.setSelected(k === i));
  }

  private go(k: string) {
    this.input.keyboard!.removeAllListeners();
    this.scene.start(k);
  }

  private confetti() {
    const colors = [0xffd23f, 0xff5d5d, 0x7fd3ff, 0x7dff7a, 0xffffff];
    for (let i = 0; i < 140; i++) {
      const r = this.add.rectangle(rand(0, 1920), rand(-400, -20), rand(8, 16), rand(12, 22), colors[i % colors.length]);
      r.setStrokeStyle(2, 0x111111);
      this.tweens.add({ targets: r, y: 1150, x: r.x + rand(-200, 200), angle: rand(-600, 600), duration: rand(2200, 4200), delay: rand(0, 1500), onComplete: () => r.destroy() });
    }
  }

  update(_t: number, dms: number) {
    const dt = dms / 1000;
    if (this.rig) {
      this.rig.tick(dt);
      this.celebT -= dt;
      if (this.celebT <= 0) {
        this.celebT = 2.2;
        this.rig.play(this.rig.look.kind === 'dog' && this.rig.look.id === 'stella' ? 'paw' : 'celebrate', 1.2);
        if (this.rig.look.kind === 'dog') this.rig.wag(2);
      }
    }
  }
}
