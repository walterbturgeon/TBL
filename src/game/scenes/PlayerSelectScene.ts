import Phaser from 'phaser';
import { TURCAU, POSITION_LABEL, stat, type CharacterDef, type Position } from '../config/teams';
import { PLAYERS } from '../config/players';
import { BILLY, STELLA } from '../config/dogs';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Sound } from '../audio/Sound';
import { Save } from '../systems/Save';
import { button, cartoonText, onTvBack, panel, statBar, toggleFullscreen } from '../ui/ui';

const COLS = 6;
const W = 296;
const H = 470;
const GAP = 14;

/** Menu « JOUEUSES » : portraits, rôles et statistiques de tous les personnages. */
export class PlayerSelectScene extends Phaser.Scene {
  constructor() {
    super('Roster');
  }

  private cards: { g: Phaser.GameObjects.Graphics; rig: CartoonRig; x: number; y: number }[] = [];
  private sel = 0;

  create() {
    this.cameras.main.fadeIn(250, 15, 26, 61);
    this.cards = [];
    this.sel = 0;
    this.add.rectangle(960, 540, 1920, 1080, 0x16245a);
    const bg = this.add.graphics();
    for (let i = 0; i < 30; i++) {
      bg.fillStyle(i % 2 ? 0x1b2a6b : 0x18276a, 1);
      bg.fillRect(i * 70 - 200, 0, 70, 1080);
    }
    cartoonText(this, 960, 46, TURCAU.name.toUpperCase(), 50, '#ffd23f').setOrigin(0.5);

    const roster: CharacterDef[] = [...PLAYERS, BILLY, STELLA];
    const career = Save.records().career;
    const x0 = (1920 - COLS * W - (COLS - 1) * GAP) / 2;
    roster.forEach((c, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = x0 + col * (W + GAP);
      const y = 92 + row * (H + 14);
      panel(this, x, y, W, H, c.kind === 'dog' ? 0x2a1f5c : 0x0f1a3d, 0.92);
      const cx = x + W / 2;

      const nameT = cartoonText(this, x + 18, y + 34, stat.shortName(c), 30, '#ffffff').setOrigin(0, 0.5);
      const maxW = W - 18 - 70;
      if (nameT.width > maxW) nameT.setScale(maxW / nameT.width);
      const ng = this.add.graphics();
      ng.fillStyle(0xffd23f, 1);
      ng.fillCircle(x + W - 36, y + 34, 22);
      ng.lineStyle(4, 0x111111, 1);
      ng.strokeCircle(x + W - 36, y + 34, 22);
      cartoonText(this, x + W - 36, y + 34, String(c.number), 20, '#1b2a6b').setOrigin(0.5).setStroke('#ffffff', 4);

      // portrait en pied
      const rig = new CartoonRig(this, lookFor(c, TURCAU, { detail: true, catcherGear: c.id === 'stella' }));
      this.add.existing(rig);
      rig.baseScale = 2.05 * (stat.height(c) / 66);
      rig.setPosition(cx, y + 256);
      rig.applyScale(1);
      if (c.id === 'stella') rig.showMask(false);

      const pos = this.positionsOf(c);
      const size = c.kind === 'dog' ? c.breed : `${Math.floor(c.height / 12)} pi ${c.height % 12} po`;
      cartoonText(this, cx, y + 276, size, 17, '#ffffff').setOrigin(0.5);
      cartoonText(this, cx, y + 300, pos, 16, '#7fd3ff').setOrigin(0.5);
      cartoonText(this, cx, y + 324, c.personality, 16, '#7dff7a').setOrigin(0.5);

      const bars: [string, number][] =
        c.kind === 'dog'
          ? c.role === 'pitcher'
            ? [
                ['Puissance', c.pitching],
                ['Contrôle', c.control],
                ['Effet', c.movement],
                ['Défensive', c.defense],
              ]
            : [
                ['Réception', c.catching],
                ['Défensive', c.defense],
                ['Vitesse', c.speed],
                ['Lancer', c.throwing],
              ]
          : [
              ['Puissance', c.power],
              ['Vitesse', c.speed],
              ['Défensive', c.defense],
            ];
      const colors = [0xff7b5c, 0x7fd3ff, 0x7dff7a, 0xffd23f];
      bars.forEach(([lbl, v], k) => statBar(this, x + 16, y + 354 + k * 24, lbl, v, W - 30, colors[k], 96, 14));
      const cl = career[c.id];
      if (cl && cl.games > 0) {
        const txt =
          c.kind === 'dog' && c.role === 'pitcher'
            ? `${cl.games} PJ · ${cl.k} RAB · ${cl.mvp} ★`
            : `${cl.games} PJ · ${cl.hits} CS · ${cl.hr} CC · ${cl.mvp} ★`;
        cartoonText(this, cx, y + H - 18, txt, 14, '#ffd23f').setOrigin(0.5);
      }
      const hit = this.add.zone(cx, y + H / 2, W, H).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.select(i));
      this.cards.push({ g: this.add.graphics(), rig, x, y });
    });
    cartoonText(this, 960, 1062, 'FLÈCHES : voir   ·   ÉCHAP ou ENTRÉE : retour', 20, '#c9d4ff').setOrigin(0.5);
    button(this, 120, 46, '← RETOUR', 190, 58, () => this.back());
    this.select(0);

    const n = roster.length;
    onTvBack(this, () => this.back());
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      Sound.unlock();
      const k = e.key;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') this.select((this.sel + 1) % n);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.select((this.sel + n - 1) % n);
      else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'ArrowUp' || k === 'w' || k === 'W')
        this.select(Math.min(n - 1, (this.sel + COLS) % (COLS * 2)));
      else if (k === 'Escape' || k === 'Enter' || k === ' ' || k === 'Backspace') this.back();
      else if (k === 'f' || k === 'F') toggleFullscreen(this);
    });
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length === 0) this.back();
    });
  }

  /** Position(s) défensive(s) du personnage, rotation comprise. */
  private positionsOf(c: CharacterDef) {
    const out = new Set<string>();
    for (const p of Object.keys(TURCAU.defense) as Position[]) if (TURCAU.defense[p].id === c.id) out.add(POSITION_LABEL[p]);
    for (const r of TURCAU.rotation ?? [])
      for (const p of Object.keys(r) as Position[]) if (r[p]?.id === c.id) out.add(POSITION_LABEL[p]);
    return out.size ? [...out].join(' · ') : 'Frappeuse';
  }

  private select(i: number) {
    if (i !== this.sel) Sound.play('click');
    this.sel = i;
    this.cards.forEach((c, k) => {
      c.g.clear();
      if (k === i) {
        c.g.lineStyle(7, 0xffd23f, 1);
        c.g.strokeRoundedRect(c.x - 6, c.y - 6, W + 12, H + 12, 22);
      }
    });
    const r = this.cards[i].rig;
    r.play(r.look.kind === 'dog' ? (r.look.id === 'billy' ? 'celebrate' : 'paw') : 'celebrate', 1);
    if (r.look.kind === 'dog') {
      r.wag(1.5);
      if (r.look.id === 'billy') Sound.play('bark');
    }
  }

  private back() {
    this.input.keyboard!.removeAllListeners();
    Sound.play('select');
    this.scene.start('Menu');
  }

  update(_t: number, dms: number) {
    for (const c of this.cards) c.rig.tick(dms / 1000);
  }
}
