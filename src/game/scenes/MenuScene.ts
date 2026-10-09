import Phaser from 'phaser';
import { VERSION } from '../config/gameConfig';
import { KUNITS, NOMADS, TURCAU, type CharacterDef, type TeamConfig } from '../config/teams';
import { BILLY, STELLA } from '../config/dogs';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { OlympicRenderer } from '../world/OlympicRenderer';
import { bakeTexture, bakedImage } from '../util/bake';
import { Sound } from '../audio/Sound';
import { DancePreview } from '../dance/Preview';
import { Save } from '../systems/Save';
import { button, cartoonText, toggleFullscreen, type MenuButton } from '../ui/ui';
import { pick, rand } from '../util/math';
import { canInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../util/install';
import { isTouch } from '../util/device';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  private buttons: MenuButton[] = [];
  private sel = 0;
  private rigs: CartoonRig[] = [];
  private billy!: CartoonRig;
  private stella!: CartoonRig;
  private volley: CartoonRig[] = [];
  private dancers: CartoonRig[] = [];
  private actT = 0;
  private danceT = 0;
  private clock = 0;
  // ballon de volleyball qui passe d'une joueuse à l'autre
  private vball!: Phaser.GameObjects.Image;
  private vT = 0;
  private vFrom = 0;

  create() {
    this.cameras.main.fadeIn(300, 15, 26, 61);
    DancePreview.stop(); // la musique de danse reste dans les écrans de la danse
    this.rigs = []; // les personnages du menu précédent sont détruits
    this.buttons = [];
    this.volley = [];
    this.dancers = [];
    this.clock = 0;
    this.vT = 0;
    this.vFrom = 0;
    // page d'accueil olympique : un coin pour chaque sport
    new OlympicRenderer(this);

    // logo
    const logo = this.add.container(960, 230);
    // 5 étoiles de couleur (à la place des 5 anneaux) : 3 en haut, 2 en bas
    const ball = this.add.graphics();
    const star = (cx: number, cy: number, r: number) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
      return pts;
    };
    const stars: [number, number, number, number][] = [
      [-96, -178, 0x1b6fd6, 0x111111],
      [0, -178, 0x222222, 0xffffff],
      [96, -178, 0xd62828, 0x111111],
      [-48, -140, 0xffc93c, 0x111111],
      [48, -140, 0x2fae4a, 0x111111],
    ];
    // fond foncé : cache le tableau du stade derrière les étoiles
    ball.fillStyle(0x000000, 0.35);
    ball.fillRoundedRect(-238, -224, 488, 132, 30);
    ball.fillStyle(0x0f1a3d, 0.95);
    ball.fillRoundedRect(-244, -230, 488, 132, 30);
    ball.lineStyle(6, 0x111111, 1);
    ball.strokeRoundedRect(-244, -230, 488, 132, 30);
    ball.lineStyle(2, 0xffd23f, 0.8);
    ball.strokeRoundedRect(-236, -222, 472, 116, 24);
    for (const [x, y, fill, line] of stars) {
      const pts = star(x, y, 36);
      ball.fillStyle(fill, 1);
      ball.fillPoints(pts, true);
      ball.lineStyle(7, line, 1);
      ball.strokePoints(pts, true, true);
    }
    const t1 = this.add.text(0, -30, 'TURCAU', {
      fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif',
      fontSize: '150px',
      color: '#ffd23f',
    });
    t1.setOrigin(0.5).setStroke('#111111', 22).setShadow(6, 8, '#000000', 0, true, false);
    const t2 = cartoonText(this, 0, 92, 'OLYMPIC', 80, '#ffffff').setOrigin(0.5);
    t2.setStroke('#1b2a6b', 14);
    logo.add([ball, t1, t2]);
    this.tweens.add({ targets: logo, y: 240, angle: 1.2, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // coin baseball (à gauche) : Billy au monticule et Stella derrière le marbre
    this.billy = this.addRig(BILLY, 230, 930, 2.9, false, TURCAU);
    this.stella = this.addRig(STELLA, 440, 955, 2.9, true, TURCAU);
    this.stella.showMask(false);
    // coin volleyball (à droite) : deux Nomads de chaque côté du petit filet
    const nom = NOMADS.lineup;
    this.volley = [this.addRig(nom[0], 1460, 935, 2.4, false, NOMADS, 'volley'), this.addRig(nom[4], 1720, 935, 2.4, false, NOMADS, 'volley')];
    this.volley[0].facing = 1;
    this.volley[1].facing = -1;
    bakeTexture(this, 'menu_vball', [-12, -12, 12, 12], 3, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, 10);
      g.fillStyle(0xffd23f, 1);
      g.slice(0, 0, 10, -2.2, -1.0, false);
      g.fillPath();
      g.fillStyle(0x3f7fd6, 1);
      g.slice(0, 0, 10, 0.4, 1.6, false);
      g.fillPath();
      g.lineStyle(2.6, 0x141414, 1);
      g.strokeCircle(0, 0, 10);
    });
    this.vball = bakedImage(this, 'menu_vball', [-12, -12, 12, 12], 3, 1460, 800).setScale(1.6 / 3).setDepth(2000);
    // coin danse (en bas, au centre) : les K-Units dansent sur la musique
    const crew = KUNITS.lineup.slice(0, 6);
    crew.forEach((p, i) => {
      const r = this.addRig(p, 960 + (i - (crew.length - 1) / 2) * 110, 1060, 1.5, false, KUNITS, 'dance');
      r.groove = 1;
      this.dancers.push(r);
    });
    // noms des coins
    cartoonText(this, 330, 1040, 'BASEBALL', 30, '#ffd23f').setOrigin(0.5);
    cartoonText(this, 1590, 1040, 'VOLLEYBALL', 30, '#ffd23f').setOrigin(0.5);
    // toucher un coin = aller à ce sport
    const zone = (x: number, y: number, w: number, h: number, sport: string) =>
      this.add
        .zone(x, y, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          Sound.play('select');
          this.go('TeamSelect', { sport });
        });
    zone(330, 880, 520, 360, 'baseball');
    zone(1590, 880, 560, 360, 'volley');
    zone(960, 1020, 720, 120, 'dance');

    // boutons
    const labels: [string, () => void][] = [
      ['BASEBALL', () => this.go('TeamSelect', { sport: 'baseball' })],
      ['VOLLEYBALL', () => this.go('TeamSelect', { sport: 'volley' })],
      ['DANSE', () => this.go('TeamSelect', { sport: 'dance' })],
      ['JOUEUSES', () => this.go('Roster')],
      ['OPTIONS', () => this.go('Options')],
    ];
    this.buttons = labels.map(([l, fn], i) => {
      const b = button(this, 960, 452 + i * 88, l, 440, 76, fn);
      b.c.on('pointerover', () => this.select(i));
      return b;
    });
    this.select(0);

    const rec = Save.records();
    cartoonText(this, 30, 1050, `v${VERSION}`, 18, '#c9d4ff').setOrigin(0, 0.5);
    // fiches des 3 sports (en haut à gauche)
    const fiches: string[] = [];
    if (rec.gamesPlayed > 0) fiches.push(`Baseball ${rec.wins}-${rec.losses}`);
    if ((rec.volleyWins ?? 0) + (rec.volleyLosses ?? 0) > 0) fiches.push(`Volleyball ${rec.volleyWins ?? 0}-${rec.volleyLosses ?? 0}`);
    if ((rec.danceWins ?? 0) + (rec.danceLosses ?? 0) > 0) fiches.push(`Danse ${rec.danceWins ?? 0}-${rec.danceLosses ?? 0}`);
    if (fiches.length) cartoonText(this, 30, 140, `Fiches (V-D) :\n${fiches.join('\n')}`, 22, '#ffffff').setOrigin(0, 0);
    cartoonText(this, 1890, 1050, 'F : plein écran', 18, '#c9d4ff').setOrigin(1, 0.5);
    const help = cartoonText(this, 960, 396, '↑ ↓ puis ENTRÉE', 20, '#c9d4ff').setOrigin(0.5);
    this.tweens.add({ targets: help, alpha: 0.4, duration: 800, yoyo: true, repeat: -1 });

    this.addInstallButton();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.on('pointerdown', () => this.unlockAudio());
    if (Sound.ctx) Sound.menuMusic();
  }

  /** Bouton INSTALLER (Android) ou explication (iPhone) : le jeu installé s'ouvre en plein écran. */
  private addInstallButton() {
    if (isStandalone()) return;
    let btn: ReturnType<typeof button> | null = null;
    const refresh = () => {
      btn?.c.destroy();
      btn = null;
      if (!canInstall()) return;
      btn = button(this, 1700, 70, 'INSTALLER LE JEU', 380, 70, () => {
        void promptInstall();
      });
    };
    refresh();
    const off = onInstallChange(() => {
      if (this.scene.isActive()) refresh();
    });
    this.events.once('shutdown', off);
    if (isIOS() && isTouch()) {
      cartoonText(this, 1890, 40, 'Plein écran sur iPhone :', 20, '#ffd23f').setOrigin(1, 0.5);
      cartoonText(this, 1890, 70, 'Partager  ⬆  puis « Sur l’écran d’accueil »', 20, '#ffffff').setOrigin(1, 0.5);
    }
  }

  private addRig(def: CharacterDef, x: number, y: number, scale: number, catcher: boolean, team: TeamConfig, outfit?: 'volley' | 'dance') {
    const r = new CartoonRig(this, lookFor(def, team, { detail: true, catcherGear: catcher, volley: outfit === 'volley', dance: outfit === 'dance' }));
    this.add.existing(r);
    r.setPosition(x, y);
    r.setDepth(y);
    r.baseScale = scale * (def.kind === 'dog' ? def.heightScale : def.height / 66);
    r.applyScale(1);
    this.rigs.push(r);
    return r;
  }

  private unlockAudio() {
    Sound.unlock();
    const s = Save.settings;
    Sound.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
    Sound.menuMusic();
  }

  private select(i: number) {
    if (i !== this.sel) Sound.play('click');
    this.sel = i;
    this.buttons.forEach((b, k) => b.setSelected(k === i));
  }

  private onKey(e: KeyboardEvent) {
    this.unlockAudio();
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') this.select((this.sel + this.buttons.length - 1) % this.buttons.length);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') this.select((this.sel + 1) % this.buttons.length);
    else if (k === 'Enter' || k === ' ') {
      Sound.play('select');
      this.buttons[this.sel].c.emit('pointerdown');
    } else if (k === 'f' || k === 'F') toggleFullscreen(this);
  }

  private go(key: string, data?: object) {
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(220, 15, 26, 61);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, data));
  }

  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.clock += dt;
    // les danseuses suivent le rythme de la musique du menu (100 temps par minute)
    const beat = (this.clock * 100) / 60;
    for (const d of this.dancers) d.beat = beat;
    for (const r of this.rigs) r.tick(dt);

    // baseball : Billy et Stella s'amusent
    this.actT -= dt;
    if (this.actT <= 0) {
      this.actT = rand(1.4, 2.6);
      if (Math.random() < 0.5) {
        this.billy.play(pick(['windup', 'celebrate', 'shakeFur', 'nod'] as const));
        this.billy.wag(1.2);
      } else {
        this.stella.play(pick(['paw', 'nod', 'catch'] as const));
        this.stella.wag(1);
      }
    }

    // danse : un pas sur un temps sur deux
    const b = Math.floor(beat);
    if (b !== this.danceT) {
      this.danceT = b;
      if (b % 2 === 0) {
        const moves = ['danceL', 'danceR', 'danceUp', 'danceDown'] as const;
        const m = moves[Math.floor(b / 2) % 4];
        // de temps en temps, un mouvement de breakdance
        const brk = b % 16 === 8 ? pick(['headspin', 'windmill', 'freeze'] as const) : null;
        this.dancers.forEach((d, i) => {
          if (brk && i === 2) d.play(brk, 1.2);
          else d.play(m, 0.45);
        });
      }
    }

    // volleyball : le ballon passe par-dessus le filet, d'une joueuse à l'autre
    const flight = 1.3;
    this.vT += dt;
    if (this.vT >= flight) {
      this.vT -= flight;
      this.vFrom = 1 - this.vFrom;
      const hitter = this.volley[this.vFrom];
      hitter?.play(pick(['bump', 'set', 'bump'] as const));
    }
    const a = this.volley[this.vFrom];
    const c = this.volley[1 - this.vFrom];
    if (a && c) {
      const u = this.vT / flight;
      this.vball.x = a.x + (c.x - a.x) * u;
      this.vball.y = 820 - Math.sin(u * Math.PI) * 190;
      this.vball.rotation += dt * 6;
    }
  }
}
