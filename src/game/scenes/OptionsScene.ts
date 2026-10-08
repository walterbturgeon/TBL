import Phaser from 'phaser';
import { DIFFICULTY, type Difficulty } from '../config/gameConfig';
import { Sound } from '../audio/Sound';
import { Save, type Quality } from '../systems/Save';
import { QUALITY_LABEL } from '../util/quality';
import { Stadium } from '../audio/Stadium';
import { STADIUM_CLIPS } from '../config/sounds';
import { cartoonText, onTvBack, panel, toggleFullscreen } from '../ui/ui';

interface Item {
  label: () => string;
  act: (dir: number) => void;
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const INNINGS = [1, 3, 6, 9];

export class OptionsScene extends Phaser.Scene {
  constructor() {
    super('Options');
  }

  private items: Item[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private sel = 0;
  private controlsPanel: Phaser.GameObjects.Container | null = null;
  private confirmReset = false;
  private startQuality = Save.settings.quality;
  private reloadTimer: Phaser.Time.TimerEvent | null = null;

  create() {
    this.cameras.main.fadeIn(250, 15, 26, 61);
    this.controlsPanel = null;
    this.confirmReset = false;
    this.reloadTimer = null;
    this.add.rectangle(960, 540, 1920, 1080, 0x16245a);
    panel(this, 460, 70, 1000, 940, 0x0f1a3d, 0.95);
    cartoonText(this, 960, 140, 'OPTIONS', 70, '#ffd23f').setOrigin(0.5);
    const st = () => Save.settings;
    const vol = () => Sound.setVolumes(st().musicVolume, st().sfxVolume, st().muted);
    const step = (v: number, d: number, max: number) => (d === 0 ? (v + 1) % (max + 1) : Phaser.Math.Clamp(v + d, 0, max));
    this.items = [
      {
        label: () => `MUSIQUE   ◀ ${st().musicVolume} ▶`,
        act: (d) => {
          Save.updateSettings({ musicVolume: step(st().musicVolume, d, 10) });
          vol();
        },
      },
      {
        label: () => `EFFETS SONORES   ◀ ${st().sfxVolume} ▶`,
        act: (d) => {
          Save.updateSettings({ sfxVolume: step(st().sfxVolume, d, 10) });
          vol();
          Sound.play('bat');
        },
      },
      {
        label: () => `SON   ${st().muted ? 'COUPÉ' : 'ACTIF'}`,
        act: () => {
          Save.updateSettings({ muted: !st().muted });
          vol();
        },
      },
      { label: () => `PLEIN ÉCRAN   ${this.scale.isFullscreen ? 'OUI' : 'NON'}`, act: () => toggleFullscreen(this) },
      {
        label: () => `DIFFICULTÉ   ◀ ${DIFFICULTY[st().difficulty].label} ▶`,
        act: (d) => {
          const i = DIFFS.indexOf(st().difficulty);
          Save.updateSettings({ difficulty: DIFFS[(i + (d === 0 ? 1 : d) + 3) % 3] });
        },
      },
      {
        label: () => `MANCHES   ◀ ${st().innings} ▶`,
        act: (d) => {
          const i = Math.max(0, INNINGS.indexOf(st().innings));
          Save.updateSettings({ innings: INNINGS[(i + (d === 0 ? 1 : d) + INNINGS.length) % INNINGS.length] });
        },
      },
      {
        label: () => `VOLLEYBALL : POINTS PAR SET   ◀ ${st().volleyPoints} ▶`,
        act: (d) => {
          const list = [15, 21, 25];
          const i = Math.max(0, list.indexOf(st().volleyPoints));
          Save.updateSettings({ volleyPoints: list[(i + (d === 0 ? 1 : d) + list.length) % list.length] });
        },
      },
      {
        label: () => `VOLLEYBALL : SETS   ◀ ${st().volleySets === 3 ? '3 (2 gagnants)' : '1'} ▶`,
        act: () => Save.updateSettings({ volleySets: st().volleySets === 3 ? 1 : 3 }),
      },
      {
        label: () => `AIDE AU TIMING   ${st().timingAid ? 'OUI' : 'NON'}`,
        act: () => Save.updateSettings({ timingAid: !st().timingAid }),
      },
      {
        label: () => `QUALITÉ   ◀ ${QUALITY_LABEL[st().quality]} ▶${st().quality !== this.startQuality ? '  (redémarre…)' : ''}`,
        act: (d) => {
          const list: Quality[] = ['normal', 'light', 'canvas'];
          const i = list.indexOf(st().quality);
          Save.updateSettings({ quality: list[(i + (d === 0 ? 1 : d) + 3) % 3] });
          // le changement demande de recharger la page
          if (this.reloadTimer) this.reloadTimer.remove();
          this.reloadTimer = this.time.delayedCall(1400, () => {
            if (Save.settings.quality !== this.startQuality) location.reload();
          });
        },
      },
      {
        label: () => `SONS DU STADE (orgue, foule)   ${st().stadiumSounds ? 'OUI' : 'NON'}`,
        act: () => {
          const on = !st().stadiumSounds;
          Save.updateSettings({ stadiumSounds: on });
          if (on) {
            Stadium.init(true);
            Stadium.enabled = true;
            Sound.menuMusic();
          } else {
            Stadium.stopAll(0.3);
            Stadium.enabled = false;
            Sound.startMusic();
          }
        },
      },
      { label: () => 'CRÉDITS DES SONS', act: () => this.showCredits() },
      { label: () => 'COMMANDES', act: () => this.showControls() },
      { label: () => 'DIAGNOSTIC (si le jeu plante)', act: () => (location.href = './diag.html') },
      {
        label: () => (this.confirmReset ? 'CONFIRMER : EFFACER LES STATISTIQUES ?' : 'EFFACER LES STATISTIQUES'),
        act: () => {
          if (this.confirmReset) {
            Save.resetRecords();
            this.confirmReset = false;
            Sound.play('out');
          } else this.confirmReset = true;
        },
      },
      { label: () => 'RETOUR', act: () => this.back() },
    ];
    // la liste tient dans le panneau, même avec beaucoup d'options
    const rowH = Math.min(72, 700 / Math.max(1, this.items.length - 1));
    const size = rowH < 62 ? 28 : 34;
    this.texts = this.items.map((it, i) => {
      const t = cartoonText(this, 960, 228 + i * rowH, it.label(), size, '#ffffff').setOrigin(0.5);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.select(i));
      t.on('pointerdown', (p: Phaser.Input.Pointer) => {
        Sound.unlock();
        this.select(i);
        const dir = p.x > 960 + t.width / 4 ? 1 : p.x < 960 - t.width / 4 ? -1 : 0;
        this.items[i].act(dir);
        this.refresh();
      });
      return t;
    });
    cartoonText(this, 960, 975, '↑ ↓ choisir   ·   ← → régler   ·   ENTRÉE valider   ·   ÉCHAP retour', 20, '#c9d4ff').setOrigin(0.5);
    this.select(0);
    this.scale.on('fullscreenunsupported', () => this.refresh());
    this.scale.on('enterfullscreen', () => this.refresh());
    this.scale.on('leavefullscreen', () => this.refresh());

    onTvBack(this, () => {
      if (this.controlsPanel) {
        this.controlsPanel.destroy();
        this.controlsPanel = null;
      } else this.back();
    });
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      Sound.unlock();
      const k = e.key;
      if (this.controlsPanel) {
        this.controlsPanel.destroy();
        this.controlsPanel = null;
        return;
      }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') this.select((this.sel + this.items.length - 1) % this.items.length);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.select((this.sel + 1) % this.items.length);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.items[this.sel].act(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.items[this.sel].act(1);
      else if (k === 'Enter' || k === ' ') this.items[this.sel].act(0);
      else if (k === 'Escape' || k === 'Backspace') return this.back();
      else if (k === 'f' || k === 'F') toggleFullscreen(this);
      else return;
      Sound.play('click');
      this.refresh();
    });
  }

  private select(i: number) {
    if (i !== this.sel) this.confirmReset = false;
    this.sel = i;
    this.refresh();
  }

  private refresh() {
    if (!this.texts.length) return;
    this.texts.forEach((t, i) => {
      t.setText(this.items[i].label());
      t.setColor(i === this.sel ? '#ffd23f' : '#ffffff');
      t.setScale(i === this.sel ? 1.08 : 1);
    });
  }

  private showControls() {
    const c = this.add.container(0, 0);
    c.add(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6));
    c.add(panel(this, 420, 150, 1080, 780, 0x1b2a6b, 1));
    c.add(cartoonText(this, 960, 215, 'COMMANDES', 56, '#ffd23f').setOrigin(0.5));
    const rows: [string, string][] = [
      ['ESPACE  ou  OK', 'Frapper  ·  lancer  ·  plonger  ·  super lancer'],
      ['FLÈCHES', 'Tape vite : sprint !'],
      ['ÉCHAP  ou  RETOUR', 'Pause'],
    ];
    rows.forEach(([k, d], i) => {
      c.add(cartoonText(this, 860, 360 + i * 100, k, 40, '#7fd3ff').setOrigin(1, 0.5));
      c.add(cartoonText(this, 900, 360 + i * 100, d, 32, '#ffffff').setOrigin(0, 0.5));
    });
    c.add(cartoonText(this, 960, 690, 'Les coureuses courent toutes seules.', 28, '#7dff7a').setOrigin(0.5));
    c.add(cartoonText(this, 960, 740, 'La défenseure court seule vers la balle et lance seule si tu attends.', 24, '#7dff7a').setOrigin(0.5));
    c.add(cartoonText(this, 960, 800, 'Avec un curseur ou un écran tactile : clique n’importe où pour frapper.', 22, '#c9d4ff').setOrigin(0.5));
    c.add(cartoonText(this, 960, 890, 'Appuie sur une touche pour fermer', 20, '#c9d4ff').setOrigin(0.5));
    const z = this.add.zone(960, 540, 1920, 1080).setInteractive();
    z.on('pointerdown', () => {
      c.destroy();
      this.controlsPanel = null;
    });
    c.add(z);
    this.controlsPanel = c;
  }

  private showCredits() {
    const c = this.add.container(0, 0);
    c.add(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6));
    c.add(panel(this, 260, 110, 1400, 860, 0x1b2a6b, 1));
    c.add(cartoonText(this, 960, 170, 'CRÉDITS DES SONS', 50, '#ffd23f').setOrigin(0.5));
    c.add(cartoonText(this, 960, 225, 'Sons libres de droit : Freesound (CC0) et Wikimedia Commons (domaine public)', 22, '#c9d4ff').setOrigin(0.5));
    Object.values(STADIUM_CLIPS).forEach((clip, i) => {
      c.add(cartoonText(this, 320, 290 + i * 56, '• ' + clip.credit, 24, '#ffffff').setOrigin(0, 0.5));
    });
    c.add(cartoonText(this, 960, 920, 'Appuie sur une touche pour fermer', 20, '#c9d4ff').setOrigin(0.5));
    const z = this.add.zone(960, 540, 1920, 1080).setInteractive();
    z.on('pointerdown', () => {
      c.destroy();
      this.controlsPanel = null;
    });
    c.add(z);
    this.controlsPanel = c;
  }

  private back() {
    this.input.keyboard!.removeAllListeners();
    this.scale.removeAllListeners('enterfullscreen');
    this.scale.removeAllListeners('leavefullscreen');
    this.scale.removeAllListeners('fullscreenunsupported');
    Sound.play('select');
    this.scene.start('Menu');
  }
}
