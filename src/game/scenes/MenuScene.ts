import Phaser from 'phaser';
import { VERSION } from '../config/gameConfig';
import { TURCAU, VISITORS } from '../config/teams';
import { BILLY, STELLA } from '../config/dogs';
import { PLAYERS } from '../config/players';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { FieldRenderer } from '../world/FieldRenderer';
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
  private actT = 0;

  create() {
    this.cameras.main.fadeIn(300, 15, 26, 61);
    DancePreview.stop(); // la musique de danse reste dans les écrans de la danse
    this.rigs = []; // les personnages du menu précédent sont détruits
    this.buttons = [];
    new FieldRenderer(this, TURCAU, VISITORS);
    this.add.rectangle(960, 540, 1920, 1080, 0x0f1a3d, 0.5);

    // logo
    const logo = this.add.container(960, 230);
    const ball = this.add.graphics();
    ball.fillStyle(0xffffff, 1);
    ball.fillCircle(0, 0, 150);
    ball.lineStyle(8, 0x111111, 1);
    ball.strokeCircle(0, 0, 150);
    ball.lineStyle(6, 0xd62828, 1);
    ball.beginPath();
    ball.arc(-210, 0, 150, -0.75, 0.75);
    ball.strokePath();
    ball.beginPath();
    ball.arc(210, 0, 150, Math.PI - 0.75, Math.PI + 0.75);
    ball.strokePath();
    ball.setAlpha(0.95);
    const t1 = this.add.text(0, -30, 'TURCAU', {
      fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif',
      fontSize: '150px',
      color: '#ffd23f',
    });
    t1.setOrigin(0.5).setStroke('#111111', 22).setShadow(6, 8, '#000000', 0, true, false);
    const t2 = cartoonText(this, 0, 90, 'BASEBALL LEAGUE', 66, '#ffffff').setOrigin(0.5);
    t2.setStroke('#1b2a6b', 14);
    logo.add([ball, t1, t2]);
    this.tweens.add({ targets: logo, y: 240, angle: 1.2, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Billy et Stella
    this.billy = this.addRig(BILLY, 330, 930, 3.3, false);
    this.stella = this.addRig(STELLA, 1590, 930, 3.3, true);
    this.stella.showMask(false);
    // les joueuses
    const step = 96;
    PLAYERS.forEach((p, i) => this.addRig(p, 960 + (i - (PLAYERS.length - 1) / 2) * step, 1062, 1.65, false));

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
    if (rec.gamesPlayed > 0)
      cartoonText(this, 960, 892, `Fiche : ${rec.wins} V – ${rec.losses} D${rec.ties ? ` – ${rec.ties} N` : ''}`, 24, '#ffd23f').setOrigin(0.5);
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

  private addRig(def: Parameters<typeof lookFor>[0], x: number, y: number, scale: number, catcher: boolean) {
    const r = new CartoonRig(this, lookFor(def, TURCAU, { detail: true, catcherGear: catcher }));
    this.add.existing(r);
    r.setPosition(x, y);
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
    const dt = dms / 1000;
    for (const r of this.rigs) r.tick(dt);
    this.actT -= dt;
    if (this.actT <= 0) {
      this.actT = rand(1.4, 2.6);
      const who = pick([0, 1, 2]);
      if (who === 0) {
        this.billy.play(pick(['celebrate', 'shakeFur', 'nod'] as const));
        this.billy.wag(1.2);
      } else if (who === 1) {
        this.stella.play(pick(['paw', 'nod', 'shakeHead'] as const));
        this.stella.wag(1);
      } else {
        const g = pick(this.rigs.slice(2));
        g.play('celebrate', 1);
      }
    }
  }
}
