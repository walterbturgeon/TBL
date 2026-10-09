import Phaser from 'phaser';
import { DIFFICULTY } from '../config/gameConfig';
import { positionsOf, rosterOf, sportTeam, stat, teamsFor, type Sport, type TeamConfig } from '../config/teams';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Sound } from '../audio/Sound';
import { Save } from '../systems/Save';
import { Progress } from '../systems/Progress';
import { DancePreview } from '../dance/Preview';
import { SONGS } from '../dance/Songs';
import { Stadium } from '../audio/Stadium';
import { button, cartoonText, onTvBack, panel, statBar, toggleFullscreen, type MenuButton } from '../ui/ui';
import { hex } from '../util/math';

/**
 * Avant la partie, en 4 étapes :
 *  1. choisir ton équipe   2. voir ses joueurs
 *  3. choisir l'adversaire 4. voir ses joueurs, puis AU JEU !
 */
type Step = 'mine' | 'mineRoster' | 'opp' | 'oppRoster';

export class TeamSelectScene extends Phaser.Scene {
  constructor() {
    super('TeamSelect');
  }

  private step: Step = 'mine';
  private mine!: TeamConfig;
  private opp!: TeamConfig;
  private sel = 0;
  private list: TeamConfig[] = [];
  private page: Phaser.GameObjects.Container | null = null;
  private rigs: CartoonRig[] = [];
  private frames: Phaser.GameObjects.Graphics[] = [];
  private boxes: { x: number; y: number; w: number; h: number }[] = [];
  private cardRigs: CartoonRig[][] = [];
  private nextBtn: MenuButton | null = null;
  private sport: Sport = 'baseball';
  private leaving = false; // déjà en route vers la partie ou le menu

  private teams() {
    return teamsFor(this.sport);
  }

  /** Joueuses montrées pour une équipe (au volleyball et à la danse : sans les chiens). */
  private playersOf(t: TeamConfig) {
    const all = rosterOf(t);
    return this.sport === 'baseball' ? all : all.filter((c) => c.kind !== 'dog');
  }

  /** Réglages où chaque sport garde son équipe et son adversaire. */
  private keys(): { mine: 'myTeam' | 'volleyTeam' | 'danceTeam'; opp: 'opponent' | 'volleyOpponent' | 'danceOpponent' } {
    if (this.sport === 'volley') return { mine: 'volleyTeam', opp: 'volleyOpponent' };
    if (this.sport === 'dance') return { mine: 'danceTeam', opp: 'danceOpponent' };
    return { mine: 'myTeam', opp: 'opponent' };
  }

  create(data?: { sport?: Sport }) {
    this.sport = data?.sport ?? 'baseball';
    this.leaving = false;
    // nouvelle session : la difficulté progressive repart du niveau 1
    Progress.reset(this.sport);
    // la musique de baseball joue seulement pour le baseball ; à la danse, la seule musique est la chanson choisie
    if (Sound.ctx) {
      if (this.sport === 'dance') {
        Sound.stopMusic();
        Stadium.stopAll(0.4);
        DancePreview.play(SONGS.find((x) => x.id === Save.settings.danceSong) ?? SONGS[0]);
      } else {
        DancePreview.stop();
        if (this.sport === 'baseball') Sound.baseballMusic();
        else Sound.menuMusic();
      }
    }
    this.cameras.main.fadeIn(250, 15, 26, 61);
    this.add.rectangle(960, 540, 1920, 1080, 0x16245a);
    // chaque sport garde ses propres choix (au volleyball : les Nomads au lieu des Baddies)
    const s = Save.settings;
    const k = this.keys();
    this.mine = sportTeam(this.sport, s[k.mine]);
    this.opp = sportTeam(this.sport, s[k.opp]);
    if (this.opp.id === this.mine.id) this.opp = this.teams().find((t) => t.id !== this.mine.id)!;
    // la scène est réutilisée : on oublie les objets de la visite précédente
    this.page = null;
    this.rigs = [];
    this.show('mine');

    onTvBack(this, () => this.back());
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      Sound.unlock();
      const k = e.key;
      const isList = this.step === 'mine' || this.step === 'opp';
      if (isList && (k === 'ArrowRight' || k === 'd' || k === 'D')) this.select((this.sel + 1) % this.list.length);
      else if (isList && (k === 'ArrowLeft' || k === 'a' || k === 'A')) this.select((this.sel + this.list.length - 1) % this.list.length);
      else if (k === 'Enter' || k === ' ') this.next();
      else if (k === 'Escape' || k === 'Backspace') this.back();
      else if (k === 'f' || k === 'F') toggleFullscreen(this);
    });
  }

  // ---------------------------------------------------------------- navigation
  private show(step: Step) {
    this.step = step;
    this.page?.destroy();
    for (const r of this.rigs) r.destroy();
    this.rigs = [];
    this.frames = [];
    this.boxes = [];
    this.cardRigs = [];
    this.nextBtn = null;
    this.page = this.add.container(0, 0);
    if (step === 'mine' || step === 'opp') this.buildList();
    else this.buildRoster(step === 'mineRoster' ? this.mine : this.opp);
  }

  private next() {
    if (this.leaving) return;
    Sound.play('select');
    if (this.step === 'mine') {
      this.mine = this.list[this.sel];
      Save.updateSettings({ [this.keys().mine]: this.mine.id });
      if (this.opp.id === this.mine.id) this.opp = this.teams().find((t) => t.id !== this.mine.id)!;
      this.show('mineRoster');
    } else if (this.step === 'mineRoster') this.show('opp');
    else if (this.step === 'opp') {
      this.opp = this.list[this.sel];
      Save.updateSettings({ [this.keys().opp]: this.opp.id });
      this.show('oppRoster');
    } else this.start();
  }

  private back() {
    if (this.leaving) return;
    Sound.play('select');
    if (this.step === 'mine') {
      this.leaving = true;
      this.input.keyboard!.removeAllListeners();
      this.scene.start('Menu');
    } else if (this.step === 'mineRoster') this.show('mine');
    else if (this.step === 'opp') this.show('mineRoster');
    else this.show('opp');
  }

  private start() {
    if (this.leaving) return;
    this.leaving = true;
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(220, 15, 26, 61);
    const next = this.sport === 'volley' ? 'Volley' : this.sport === 'dance' ? 'Dance' : 'Game';
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(next));
  }

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.page!.add(o);
    return o;
  }

  private header(stepNo: number, title: string, sub: string) {
    this.add2(cartoonText(this, 960, 62, title, 56, '#ffd23f').setOrigin(0.5));
    this.add2(cartoonText(this, 960, 122, sub, 28, '#ffffff').setOrigin(0.5));
    const label = this.sport === 'volley' ? 'VOLLEYBALL' : this.sport === 'dance' ? 'DANSE' : 'BASEBALL';
    this.add2(cartoonText(this, 1890, 74, label, 22, '#ffd23f').setOrigin(1, 0.5));
    this.add2(cartoonText(this, 1890, 40, `Étape ${stepNo} de 4`, 20, '#c9d4ff').setOrigin(1, 0.5));
    const b = button(this, 130, 64, '← RETOUR', 200, 60, () => this.back());
    this.add2(b.c);
  }

  // ---------------------------------------------------------------- étapes 1 et 3 : liste des équipes
  private buildList() {
    const choosingMine = this.step === 'mine';
    this.list = choosingMine ? this.teams() : this.teams().filter((t) => t.id !== this.mine.id);
    const current = choosingMine ? this.mine : this.opp;
    this.header(
      choosingMine ? 1 : 3,
      choosingMine ? 'CHOISIS TON ÉQUIPE' : 'CHOISIS L’ÉQUIPE ADVERSE',
      choosingMine ? 'Avec qui veux-tu jouer ?' : `${this.mine.name.toUpperCase()}  contre…`,
    );
    const n = this.list.length;
    const gap = n > 3 ? 22 : 40;
    const W = Math.min(540, (1840 - (n - 1) * gap) / n);
    const H = 660;
    const x0 = (1920 - n * W - (n - 1) * gap) / 2;
    this.list.forEach((t, i) => {
      const x = x0 + i * (W + gap);
      const y = 190;
      this.boxes.push({ x, y, w: W, h: H });
      this.card(t, x, y, W, H);
      const zone = this.add2(this.add.zone(x + W / 2, y + H / 2, W, H).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => {
        this.select(i);
        this.next();
      });
      this.frames.push(this.add2(this.add.graphics()));
    });
    const s = Save.settings;
    const format =
      this.sport === 'volley'
        ? `${s.volleyPoints} points   ·   ${s.volleySets === 3 ? '3 sets' : '1 set'}`
        : this.sport === 'dance'
          ? 'Battle en 3 rounds'
          : `${s.innings} manche${s.innings > 1 ? 's' : ''}`;
    const diffTxt = s.progressive ? 'Progressive (monte avec le temps de jeu)' : DIFFICULTY[s.difficulty].label;
    this.add2(cartoonText(this, 960, 900, `Difficulté : ${diffTxt}   ·   ${format}`, 26, '#c9d4ff').setOrigin(0.5));
    this.add2(cartoonText(this, 960, 1010, '← → choisir   ·   ESPACE ou OK : voir les joueurs   ·   ÉCHAP : retour', 24, '#ffffff').setOrigin(0.5));
    this.sel = -1;
    this.select(Math.max(0, this.list.findIndex((t) => t.id === current.id)));
  }

  private card(t: TeamConfig, x: number, y: number, W: number, H: number) {
    this.add2(panel(this, x, y, W, H, 0x0f1a3d, 0.95));
    const g = this.add2(this.add.graphics());
    g.fillStyle(hex(t.colors.primary), 1);
    g.fillRoundedRect(x + 16, y + 16, W - 32, 100, 14);
    g.lineStyle(4, 0x111111, 1);
    g.strokeRoundedRect(x + 16, y + 16, W - 32, 100, 14);
    g.fillStyle(hex(t.colors.secondary), 1);
    g.fillRect(x + 16, y + 100, W - 32, 8);
    const name = this.add2(cartoonText(this, x + W / 2, y + 62, t.name.toUpperCase(), 34, t.colors.secondary).setOrigin(0.5));
    if (name.width > W - 50) name.setScale((W - 50) / name.width);
    // trois personnages de l'équipe
    const show = this.sport === 'baseball' ? [t.defense.SS, t.defense.P, t.defense.CF] : this.playersOf(t).slice(0, 3);
    const spread = Math.min(150, (W - 40) / 3);
    const row: CartoonRig[] = [];
    show.forEach((c, k) => {
      const r = new CartoonRig(this, lookFor(c, t, { detail: true, volley: this.sport === 'volley', dance: this.sport === 'dance' }));
      this.add.existing(r);
      r.baseScale = Math.min(2.1, spread / 52) * (stat.height(c) / 66);
      r.setPosition(x + W / 2 + (k - 1) * spread, y + 470);
      r.applyScale(1);
      row.push(r);
      this.rigs.push(r);
      const nm = this.add2(cartoonText(this, x + W / 2 + (k - 1) * spread, y + 500, stat.shortName(c), 20, '#ffffff').setOrigin(0.5));
      if (nm.width > spread - 6) nm.setScale((spread - 6) / nm.width);
    });
    this.cardRigs.push(row);
    const avg = (key: 'power' | 'speed' | 'defense') => t.lineup.reduce((s, c) => s + stat[key](c), 0) / t.lineup.length;
    const st = this.add2(
      cartoonText(this, x + W / 2, y + 560, `Frappe ${avg('power').toFixed(1)}  ·  Vitesse ${avg('speed').toFixed(1)}  ·  Défensive ${avg('defense').toFixed(1)}`, 18, '#7fd3ff').setOrigin(0.5),
    );
    if (st.width > W - 30) st.setScale((W - 30) / st.width);
    this.add2(cartoonText(this, x + W / 2, y + 610, `${this.playersOf(t).length} joueurs`, 18, '#c9d4ff').setOrigin(0.5));
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
    for (const r of this.cardRigs[i] ?? []) r.play('celebrate', 1);
  }

  // ---------------------------------------------------------------- étapes 2 et 4 : joueurs d'une équipe
  private buildRoster(t: TeamConfig) {
    const isMine = this.step === 'mineRoster';
    this.header(isMine ? 2 : 4, isMine ? 'TON ÉQUIPE' : 'L’ÉQUIPE ADVERSE', t.name.toUpperCase());
    const players = this.playersOf(t);
    const n = players.length;
    const cols = Math.min(7, Math.ceil(n / 2));
    const gap = 14;
    const W = Math.min(270, (1840 - (cols - 1) * gap) / cols);
    const H = 372;
    players.forEach((c, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === 0 ? Math.min(cols, n) : n - cols;
      const col = i % cols;
      const x0 = (1920 - inRow * W - (inRow - 1) * gap) / 2;
      const x = x0 + col * (W + gap);
      const y = 168 + row * (H + 16);
      this.add2(panel(this, x, y, W, H, c.kind === 'dog' ? 0x2a1f5c : 0x0f1a3d, 0.92));
      const volley = this.sport === 'volley';
      const dance = this.sport === 'dance';
      const isCatcher = this.sport === 'baseball' && t.defense.C.id === c.id;
      const r = new CartoonRig(this, lookFor(c, t, { detail: true, catcherGear: isCatcher, volley, dance }));
      this.add.existing(r);
      r.baseScale = 1.7 * (stat.height(c) / 66);
      r.setPosition(x + W / 2, y + 210);
      r.applyScale(1);
      if (isCatcher) r.showMask(false);
      this.rigs.push(r);
      const nm = this.add2(cartoonText(this, x + W / 2, y + 238, stat.shortName(c), 24, '#ffffff').setOrigin(0.5));
      if (nm.width > W - 20) nm.setScale((W - 20) / nm.width);
      const role = volley
        ? i < 6
          ? 'Sur le terrain'
          : 'Réserve (entre au service)'
        : dance
          ? `Danse au round ${Math.floor(i / 4) + 1}`
          : positionsOf(t, c);
      const info = this.add2(cartoonText(this, x + W / 2, y + 266, `#${c.number}  ·  ${role}`, 15, '#7fd3ff').setOrigin(0.5));
      if (info.width > W - 16) info.setScale((W - 16) / info.width);
      const bars: [string, number, number][] = [
        ['Frappe', stat.power(c), 0xff7b5c],
        ['Vitesse', stat.speed(c), 0x7fd3ff],
        ['Défense', stat.defense(c), 0x7dff7a],
      ];
      bars.forEach(([lbl, v, col2], k) => {
        for (const o of statBar(this, x + 12, y + 296 + k * 24, lbl, v, W - 20, col2, 74, 13)) this.add2(o);
      });
    });
    const last = isMine ? 'CONTINUER →' : 'AU JEU !';
    this.nextBtn = button(this, 1620, 1018, last, 360, 76, () => this.next());
    this.add2(this.nextBtn.c);
    this.nextBtn.setSelected(true);
    const chg = button(this, 300, 1018, '← CHANGER', 300, 76, () => this.back());
    this.add2(chg.c);
    this.add2(cartoonText(this, 960, 1018, 'ESPACE ou OK : ' + (isMine ? 'continuer' : 'jouer') + '   ·   ÉCHAP : changer', 22, '#c9d4ff').setOrigin(0.5));
  }

  update(_t: number, dms: number) {
    for (const r of this.rigs) r.tick(dms / 1000);
  }
}
