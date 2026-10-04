import Phaser from 'phaser';
import { Save } from '../systems/Save';
import { Sound } from '../audio/Sound';
import { hex, rand } from '../util/math';
import { cartoonText, onTvBack, panel } from '../ui/ui';
import { isTouch } from '../util/device';

export interface HudState {
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  inning: number;
  innings: number;
  top: boolean;
  outs: number;
  balls: number;
  strikes: number;
  bases: boolean[];
  batter: string;
  pitcher: string;
  offenseHuman: boolean;
  hint: string;
  pitchLabel: string;
  muted: boolean;
  sprint: number; // -1 = cachée
}

/** Interface par-dessus le jeu : pointage, compte, buts occupés, messages, pause. */
export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  private dyn!: Phaser.GameObjects.Graphics;
  private t: Record<string, Phaser.GameObjects.Text> = {};
  private hintBox!: Phaser.GameObjects.Graphics;
  private state: HudState | null = null;
  private popupY = 0;
  private popupT = 0;
  private pause: Phaser.GameObjects.Container | null = null;
  private pauseSel = 0;
  private pauseItems: { label: () => string; act: (dir: number) => void }[] = [];
  private pauseTexts: Phaser.GameObjects.Text[] = [];
  private handlers: [string, (...a: never[]) => void][] = [];
  private sprintBtn: Phaser.GameObjects.Container | null = null;
  private popups: Phaser.GameObjects.Text[] = [];
  private bannerUntil = 0;
  private touch = false;

  create() {
    // panneau du pointage
    panel(this, 22, 20, 470, 206);
    panel(this, 1920 - 22 - 400, 20, 400, 128);
    this.dyn = this.add.graphics();
    this.hintBox = this.add.graphics();

    const T = (k: string, x: number, y: number, s: string, size: number, color = '#ffffff', ox = 0) => {
      this.t[k] = cartoonText(this, x, y, s, size, color).setOrigin(ox, 0.5);
    };
    T('awayName', 70, 58, '', 30);
    T('homeName', 70, 104, '', 30);
    T('awayScore', 330, 58, '0', 36, '#ffffff', 1);
    T('homeScore', 330, 104, '0', 36, '#ffffff', 1);
    T('inning', 44, 150, '', 26, '#ffd23f');
    T('outsLbl', 236, 150, 'RETRAITS', 18, '#ffffff');
    T('ballsLbl', 44, 196, 'BALLES', 18, '#ffffff');
    T('strikesLbl', 236, 196, 'PRISES', 18, '#ffffff');
    T('batLbl', 1920 - 400, 48, 'AU BÂTON', 17, '#ffd23f');
    T('batter', 1920 - 400, 78, '', 28);
    T('pitLbl', 1920 - 400, 112, 'LANCEUR', 17, '#ffd23f');
    T('pitcher', 1920 - 260, 112, '', 22);
    T('pitch', 1920 - 22, 172, '', 22, '#7fd3ff', 1);
    T('hint', 960, 1040, '', 24, '#ffffff', 0.5);
    T('mute', 1900, 1040, '', 18, '#ffffff', 1);
    T('timing', 960, 800, '', 44, '#7dff7a', 0.5);
    T('sprintLbl', 960 - 150 - 100, 982, 'SPRINT', 18, '#ffd23f');
    this.t.sprintLbl.setVisible(false);
    this.t.timing.setAlpha(0);

    const on = (ev: string, fn: (...a: never[]) => void) => {
      this.game.events.on(ev, fn, this);
      this.handlers.push([ev, fn]);
    };
    on('hud-state', (s: HudState) => this.applyState(s));
    on('hud-popup', (p: { text: string; color: string; size: number; sub?: string }) => this.popup(p));
    on('hud-banner', (b: { title: string; sub: string; color: string }) => this.banner(b));
    on('hud-timing', (p: { text: string; color: string }) => this.timing(p));
    on('hud-confetti', (big: boolean) => this.confetti(big ? 160 : 70));
    on('hud-pause', () => this.openPause());
    this.events.once('shutdown', () => {
      for (const [ev, fn] of this.handlers) this.game.events.off(ev, fn, this);
      this.handlers = [];
    });

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.pauseKey(e));
    // Retour de la télécommande : ferme la pause si elle est ouverte
    onTvBack(this, () => {
      if (this.pause) this.closePause();
    });

    // bouton pause à l'écran (souris, tactile, curseur de la télé)
    const pb = this.add.container(70, 1030);
    const pg = this.add.graphics();
    pg.fillStyle(0x0f1a3d, 0.85);
    pg.fillCircle(0, 0, 34);
    pg.lineStyle(4, 0x111111, 1);
    pg.strokeCircle(0, 0, 34);
    pg.lineStyle(2, 0xffd23f, 0.9);
    pg.strokeCircle(0, 0, 28);
    pg.fillStyle(0xffffff, 1);
    pg.fillRoundedRect(-11, -13, 8, 26, 2);
    pg.fillRoundedRect(3, -13, 8, 26, 2);
    pb.add(pg);
    pb.setSize(72, 72);
    pb.setInteractive({ useHandCursor: true });
    pb.on('pointerdown', () => {
      if (!this.pause) this.game.events.emit('tv-back');
    });

    // bouton SPRINT pour les écrans tactiles (pas de flèches sur un téléphone)
    this.touch = isTouch();
    if (this.touch) {
      const sb = this.add.container(1790, 900);
      const sg = this.add.graphics();
      sg.fillStyle(0x000000, 0.35);
      sg.fillCircle(5, 7, 84);
      sg.fillStyle(0xe3262e, 0.92);
      sg.fillCircle(0, 0, 84);
      sg.lineStyle(6, 0x111111, 1);
      sg.strokeCircle(0, 0, 84);
      sg.lineStyle(3, 0xffd23f, 1);
      sg.strokeCircle(0, 0, 74);
      sb.add(sg);
      sb.add(cartoonText(this, 0, -8, 'SPRINT', 30, '#ffffff').setOrigin(0.5));
      sb.add(cartoonText(this, 0, 28, 'tape vite !', 16, '#ffd23f').setOrigin(0.5));
      sb.setSize(176, 176);
      sb.setInteractive({ useHandCursor: true });
      sb.on('pointerdown', () => {
        this.game.events.emit('touch-sprint');
        this.tweens.add({ targets: sb, scale: 0.9, duration: 50, yoyo: true });
      });
      sb.setVisible(false);
      this.sprintBtn = sb;
    }
  }

  update(_t: number, dms: number) {
    this.popupT -= dms / 1000;
    if (this.popupT <= 0) this.popupY = 0;
  }

  private applyState(s: HudState) {
    this.state = s;
    const t = this.t;
    t.awayName.setText(s.awayName);
    t.homeName.setText(s.homeName);
    t.awayScore.setText(String(s.awayScore));
    t.homeScore.setText(String(s.homeScore));
    t.inning.setText(`MANCHE ${s.inning}${s.top ? ' ▲' : ' ▼'}`);
    t.batter.setText(s.batter);
    t.pitcher.setText(s.pitcher);
    t.pitch.setText(s.pitchLabel ? `Lancer : ${s.pitchLabel}` : '');
    t.mute.setText(s.muted ? 'SON COUPÉ' : '');
    const pauseTxt = this.touch ? '❚❚ : pause' : 'ÉCHAP : pause';
    t.hint.setText(s.hint ? `${s.hint}     ·     ${pauseTxt}` : pauseTxt);
    this.sprintBtn?.setVisible(s.sprint >= 0);

    const g = this.dyn;
    g.clear();
    // pastilles de couleur et équipe au bâton
    const chip = (y: number, color: string, batting: boolean) => {
      g.fillStyle(hex(color), 1);
      g.fillRoundedRect(40, y - 14, 20, 28, 5);
      g.lineStyle(3, 0x111111, 1);
      g.strokeRoundedRect(40, y - 14, 20, 28, 5);
      if (batting) {
        g.fillStyle(0xffd23f, 1);
        g.fillTriangle(350, y, 362, y - 8, 362, y + 8);
      }
    };
    chip(58, s.awayColor, s.top);
    chip(104, s.homeColor, !s.top);
    g.lineStyle(2, 0xffffff, 0.25);
    g.lineBetween(40, 128, 472, 128);
    // retraits, balles, prises
    const dots = (x: number, y: number, n: number, max: number, color: number) => {
      for (let i = 0; i < max; i++) {
        g.fillStyle(i < n ? color : 0x2a3150, 1);
        g.fillCircle(x + i * 26, y, 9);
        g.lineStyle(2.5, 0x111111, 1);
        g.strokeCircle(x + i * 26, y, 9);
      }
    };
    dots(360, 150, s.outs, 3, 0xff5d5d);
    dots(140, 196, s.balls, 3, 0x7dff7a);
    dots(320, 196, s.strikes, 2, 0xffd23f);
    // losange des buts
    const cx = 420;
    const cy = 82;
    const base = (x: number, y: number, on: boolean) => {
      g.fillStyle(on ? 0xffd23f : 0x2a3150, 1);
      g.fillPoints(
        [
          { x, y: y - 11 },
          { x: x + 11, y },
          { x, y: y + 11 },
          { x: x - 11, y },
        ],
        true,
      );
      g.lineStyle(2.5, 0x111111, 1);
      g.strokePoints(
        [
          { x, y: y - 11 },
          { x: x + 11, y },
          { x, y: y + 11 },
          { x: x - 11, y },
        ],
        true,
        true,
      );
    };
    base(cx + 26, cy, s.bases[0]);
    base(cx, cy - 26, s.bases[1]);
    base(cx - 26, cy, s.bases[2]);
    base(cx, cy + 26, false);

    // jauge de sprint
    if (s.sprint >= 0) {
      const bw = 300;
      const bx = 960 - bw / 2;
      const by = 972;
      g.fillStyle(0x0f1a3d, 0.85);
      g.fillRoundedRect(bx - 110, by - 6, bw + 124, 32, 12);
      g.fillStyle(0x0b1230, 1);
      g.fillRoundedRect(bx, by, bw, 20, 10);
      g.fillStyle(s.sprint > 0.75 ? 0x7dff7a : s.sprint > 0.35 ? 0xffe14d : 0x7fd3ff, 1);
      if (s.sprint > 0) g.fillRoundedRect(bx, by, Math.max(20, bw * s.sprint), 20, 10);
      g.lineStyle(3, 0x111111, 1);
      g.strokeRoundedRect(bx, by, bw, 20, 10);
    }
    t.sprintLbl.setVisible(s.sprint >= 0);

    // barre d'aide
    const w = t.hint.width + 60;
    this.hintBox.clear();
    this.hintBox.fillStyle(0x0f1a3d, 0.78);
    this.hintBox.fillRoundedRect(960 - w / 2, 1016, w, 48, 14);
    this.hintBox.lineStyle(3, 0x111111, 1);
    this.hintBox.strokeRoundedRect(960 - w / 2, 1016, w, 48, 14);
  }

  // ---------------------------------------------------------------- messages
  private popup(p: { text: string; color: string; size: number; sub?: string }) {
    // pendant la bannière de manche, les messages passent au-dessus d'elle
    const y = (this.time.now < this.bannerUntil ? 300 : 400) + this.popupY;
    this.popupY = (this.popupY + 78) % 234;
    this.popupT = 0.9;
    const tx = cartoonText(this, 960, y, p.text, p.size, p.color).setOrigin(0.5).setDepth(50);
    this.popups.push(tx);
    tx.once('destroy', () => (this.popups = this.popups.filter((x) => x !== tx)));
    tx.setScale(0.2);
    this.tweens.add({ targets: tx, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: tx, y: y - 40, alpha: 0, delay: 1000, duration: 380, onComplete: () => tx.destroy() });
    if (p.sub) {
      const st = cartoonText(this, 960, y + p.size * 0.75, p.sub, 24, '#ffffff').setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: st, alpha: 0, delay: 1600, duration: 400, onComplete: () => st.destroy() });
    }
  }

  private timing(p: { text: string; color: string }) {
    const t = this.t.timing;
    this.tweens.killTweensOf(t);
    t.setText(p.text).setColor(p.color).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 300 });
  }

  private banner(b: { title: string; sub: string; color: string }) {
    for (const p of [...this.popups]) p.destroy();
    this.popupY = 0;
    this.bannerUntil = this.time.now + 1900;
    const c = this.add.container(-1920, 520).setDepth(40);
    const g = this.add.graphics();
    g.fillStyle(0x0f1a3d, 0.92);
    g.fillRect(0, -80, 1920, 160);
    g.fillStyle(hex(b.color), 1);
    g.fillRect(0, -80, 1920, 10);
    g.fillRect(0, 70, 1920, 10);
    g.lineStyle(4, 0x111111, 1);
    g.lineBetween(0, -80, 1920, -80);
    g.lineBetween(0, 80, 1920, 80);
    c.add(g);
    c.add(cartoonText(this, 960, -18, b.title, 64, b.color).setOrigin(0.5));
    c.add(cartoonText(this, 960, 42, b.sub, 30, '#ffffff').setOrigin(0.5));
    this.tweens.add({ targets: c, x: 0, duration: 380, ease: 'Cubic.Out' });
    this.tweens.add({ targets: c, x: 1920, delay: 1300, duration: 320, ease: 'Cubic.In', onComplete: () => c.destroy() });
  }

  private confetti(n: number) {
    const colors = [0xffd23f, 0xff5d5d, 0x7fd3ff, 0x7dff7a, 0xffffff, 0xff8fd8];
    for (let i = 0; i < n; i++) {
      const r = this.add.rectangle(rand(0, 1920), rand(-200, -20), rand(8, 16), rand(12, 22), colors[i % colors.length]).setDepth(60);
      r.setStrokeStyle(2, 0x111111);
      this.tweens.add({
        targets: r,
        y: 1150,
        x: r.x + rand(-160, 160),
        angle: rand(-540, 540),
        duration: rand(1800, 3200),
        delay: rand(0, 600),
        onComplete: () => r.destroy(),
      });
    }
  }

  // ---------------------------------------------------------------- pause
  private openPause() {
    if (this.pause) return;
    const st = () => Save.settings;
    const vol = () => Sound.setVolumes(st().musicVolume, st().sfxVolume, st().muted);
    this.pauseItems = [
      { label: () => 'REPRENDRE', act: () => this.closePause() },
      {
        label: () => `MUSIQUE  ◀ ${st().musicVolume} ▶`,
        act: (d) => {
          Save.updateSettings({ musicVolume: Phaser.Math.Clamp(st().musicVolume + (d || 1), 0, 10) });
          vol();
        },
      },
      {
        label: () => `EFFETS  ◀ ${st().sfxVolume} ▶`,
        act: (d) => {
          Save.updateSettings({ sfxVolume: Phaser.Math.Clamp(st().sfxVolume + (d || 1), 0, 10) });
          vol();
          Sound.play('click');
        },
      },
      {
        label: () => `SON : ${st().muted ? 'COUPÉ' : 'ACTIF'}`,
        act: () => {
          Save.updateSettings({ muted: !st().muted });
          vol();
        },
      },
      {
        label: () => `AIDE AU TIMING : ${st().timingAid ? 'OUI' : 'NON'}`,
        act: () => Save.updateSettings({ timingAid: !st().timingAid }),
      },
      {
        label: () => 'RECOMMENCER LA PARTIE',
        act: () => {
          this.closePause(false);
          this.scene.start('Game');
        },
      },
      {
        label: () => 'MENU PRINCIPAL',
        act: () => {
          this.closePause(false);
          Sound.ambience(false);
          this.scene.stop('Game');
          this.scene.start('Menu');
        },
      },
    ];
    const c = this.add.container(0, 0).setDepth(100);
    const bg = this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.55);
    c.add(bg);
    const pg = this.add.graphics();
    pg.fillStyle(0x1b2a6b, 1);
    pg.fillRoundedRect(960 - 330, 170, 660, 720, 26);
    pg.lineStyle(6, 0x111111, 1);
    pg.strokeRoundedRect(960 - 330, 170, 660, 720, 26);
    pg.lineStyle(3, 0xffd23f, 1);
    pg.strokeRoundedRect(960 - 316, 184, 632, 692, 18);
    c.add(pg);
    c.add(cartoonText(this, 960, 250, 'PAUSE', 70, '#ffd23f').setOrigin(0.5));
    this.pauseTexts = this.pauseItems.map((it, i) => {
      const tx = cartoonText(this, 960, 350 + i * 76, it.label(), 34, '#ffffff').setOrigin(0.5);
      tx.setInteractive({ useHandCursor: true });
      tx.on('pointerover', () => {
        this.pauseSel = i;
        this.refreshPause();
      });
      tx.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.pauseSel = i;
        const dir = p.x > 960 + tx.width / 4 ? 1 : p.x < 960 - tx.width / 4 ? -1 : 0;
        this.pauseItems[i].act(dir);
        this.refreshPause();
      });
      c.add(tx);
      return tx;
    });
    c.add(cartoonText(this, 960, 850, '↑ ↓ choisir   ·   ← → régler   ·   ENTRÉE valider   ·   ÉCHAP reprendre', 18, '#c9d4ff').setOrigin(0.5));
    this.pause = c;
    this.pauseSel = 0;
    this.refreshPause();
  }

  private refreshPause() {
    this.pauseTexts.forEach((t, i) => {
      t.setText(this.pauseItems[i].label());
      t.setColor(i === this.pauseSel ? '#ffd23f' : '#ffffff');
      t.setScale(i === this.pauseSel ? 1.08 : 1);
    });
  }

  private closePause(resume = true) {
    this.pause?.destroy();
    this.pause = null;
    if (resume) this.scene.resume('Game');
  }

  private pauseKey(e: KeyboardEvent) {
    if (!this.pause) return;
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      this.closePause();
      return;
    }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') this.pauseSel = (this.pauseSel + this.pauseItems.length - 1) % this.pauseItems.length;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') this.pauseSel = (this.pauseSel + 1) % this.pauseItems.length;
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.pauseItems[this.pauseSel].act(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.pauseItems[this.pauseSel].act(1);
    else if (k === 'Enter' || k === ' ') this.pauseItems[this.pauseSel].act(0);
    else return;
    Sound.play('click');
    if (this.pause) this.refreshPause();
  }
}
