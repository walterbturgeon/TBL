import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { Stadium } from '../audio/Stadium';
import { rosterOf, sportTeam, stat, teamsFor, type CharacterDef, type TeamConfig } from '../config/teams';
import { BeatPlayer } from '../dance/BeatPlayer';
import { DANCE, GRADE_COLOR, GRADE_LABEL, comboMul, type Grade } from '../dance/DanceConfig';
import { SONGS, ROUNDS, chartOf, sectionAt, type Lane, type Note } from '../dance/Songs';
import { StageRenderer, teamGlow } from '../dance/StageRenderer';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Save } from '../systems/Save';
import { Progress, atLevel } from '../systems/Progress';
import { button, cartoonText, onTvBack, panel, toggleFullscreen, type MenuButton } from '../ui/ui';
import { bakeTexture, bakedImage } from '../util/bake';
import { isTouch } from '../util/device';
import { clamp } from '../util/math';

type Phase = 'pick' | 'play' | 'results';
type Side = 'me' | 'ai';

interface Dancer {
  rig: CartoonRig;
  def: CharacterDef;
  front: boolean;
}

// piste des flèches, au centre de l'écran
const LANE_X = [810, 910, 1010, 1110];
const TOP_Y = 96;
const TARGET_Y = 870;
const ARROW_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // la flèche de base pointe vers le haut
const MOVES = ['danceL', 'danceDown', 'danceUp', 'danceR'] as const;
/** Breakdance : seulement sur un appui PARFAIT (← footwork, ↓ freeze, ↑ headspin, → windmill). */
const BREAKS = ['footwork', 'freeze', 'headspin', 'windmill'] as const;
const BREAK_NAMES = ['FOOTWORK !', 'FREEZE !', 'HEADSPIN !', 'WINDMILL !'];
const KEY_LANE: Record<string, Lane> = {
  ArrowLeft: 0,
  ArrowDown: 1,
  ArrowUp: 2,
  ArrowRight: 3,
  a: 0,
  A: 0,
  s: 1,
  S: 1,
  w: 2,
  W: 2,
  d: 3,
  D: 3,
};
const ARROW_B: [number, number, number, number] = [-46, -46, 46, 46];

/**
 * DANSE : battle entre deux équipes de danse, comme Just Dance avec des flèches.
 * Les flèches descendent ; on appuie (← ↓ ↑ →, ou on touche l'écran) quand elles arrivent dans la cible.
 * Chaque bonne flèche fait danser ton équipe. 3 rounds ; l'équipe qui gagne 2 rounds gagne la battle.
 */
export class DanceScene extends Phaser.Scene {
  constructor() {
    super('Dance');
  }

  private phase: Phase = 'pick';
  private paused = false;
  private leaving = false;
  private mine!: TeamConfig;
  private opp!: TeamConfig;
  private stage!: StageRenderer;
  private player: BeatPlayer | null = null;
  private songIdx = 0;
  private notes: Note[] = [];
  private head = 0;
  private sprites = new Map<Note, Phaser.GameObjects.Image>();
  private crews: Record<Side, Dancer[]> = { me: [], ai: [] };
  private crewRound = 0;
  // difficulté du round en cours (fixe ou progressive)
  private scroll = 1.65;
  private win = { perfect: 60, great: 105, good: 150 };
  private aiOdds = [0.28, 0.32, 0.18];
  private sessionStart = 0; // temps de jeu (s) au début de la chanson
  private levelIdx = -1;
  private touch = false;

  // pointage
  private score: Record<Side, number> = { me: 0, ai: 0 };
  private roundScore: Record<Side, number> = { me: 0, ai: 0 };
  private rounds: Record<Side, number> = { me: 0, ai: 0 };
  private combo = 0;
  private aiCombo = 0;
  private bestCombo = 0;
  private counts: Record<Grade, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  private meter = 0.5;
  private sectionIdx = -1;
  private lastBeat = -99;
  private energy = 0;

  // affichage
  private ui!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private meterG!: Phaser.GameObjects.Graphics;
  private judgeTxt!: Phaser.GameObjects.Text;
  private breakTxt!: Phaser.GameObjects.Text;
  private comboTxt!: Phaser.GameObjects.Text;
  private bannerTxt!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private roundTxt!: Phaser.GameObjects.Text;
  private led: Record<Side, { name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text; stars: Phaser.GameObjects.Graphics }> = {} as never;
  private receptors: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private highway!: Phaser.GameObjects.Container;
  private pads!: Phaser.GameObjects.Container; // bouton pause et zones de toucher (téléphone)
  private pauseBox: Phaser.GameObjects.Container | null = null;
  private buttons: MenuButton[] = [];
  private sel = 0;
  private cards: { box: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number }[] = [];
  private onVis = () => {
    if (document.hidden && this.phase === 'play' && !this.paused) this.setPaused(true);
  };

  // ================================================================ création
  create() {
    const s = Save.settings;
    this.phase = 'pick';
    this.paused = false;
    this.leaving = false;
    this.player = null;
    this.notes = [];
    this.head = 0;
    this.sprites = new Map();
    this.crews = { me: [], ai: [] };
    this.crewRound = 0;
    this.applyLevel(Progress.level('dance'));
    this.levelIdx = Progress.stage('dance').index;
    this.touch = isTouch();
    this.pauseBox = null;
    this.buttons = [];
    this.cards = [];
    this.receptors = [];
    this.glows = [];
    this.songIdx = Math.max(0, SONGS.findIndex((x) => x.id === s.danceSong));
    this.resetScores();

    this.mine = sportTeam('dance', s.danceTeam);
    this.opp = sportTeam('dance', s.danceOpponent);
    if (this.opp.id === this.mine.id) this.opp = teamsFor('dance').find((t) => t.id !== this.mine.id)!;

    // toutes les autres musiques s'arrêtent : la musique de danse prend toute la place
    Sound.stopMusic();
    Sound.ambience(false);
    Stadium.stopAll(0.3);

    this.stage = new StageRenderer(this, this.mine, this.opp);
    this.stage.setColor(SONGS[this.songIdx].color);
    this.bakeArrows();
    this.buildHighway();
    this.buildHud();
    this.setCrews(0, false);

    this.ui = this.add.container(0, 0).setDepth(3000);
    this.showPick();

    // multi-touch : deux pouces en même temps
    const extra = 4 - this.input.manager.pointersTotal;
    if (extra > 0) this.input.addPointer(extra);
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    onTvBack(this, () => this.back());
    document.addEventListener('visibilitychange', this.onVis);
    // arrière-plan (autre application, écran verrouillé) : pause
    const onHidden = () => {
      if (this.phase === 'play' && !this.paused) this.setPaused(true);
    };
    this.game.events.on('app-hidden', onHidden);
    this.events.once('shutdown', () => {
      this.game.events.off('app-hidden', onHidden);
      document.removeEventListener('visibilitychange', this.onVis);
      this.player?.stop();
      this.player = null;
    });
  }

  private resetScores() {
    this.score = { me: 0, ai: 0 };
    this.roundScore = { me: 0, ai: 0 };
    this.rounds = { me: 0, ai: 0 };
    this.combo = 0;
    this.aiCombo = 0;
    this.bestCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.meter = 0.5;
    this.sectionIdx = -1;
    this.lastBeat = -99;
    this.energy = 0;
  }

  // ---------------------------------------------------------------- flèches
  private bakeArrows() {
    const shape = [
      { x: 0, y: -40 },
      { x: 38, y: -2 },
      { x: 15, y: -2 },
      { x: 15, y: 38 },
      { x: -15, y: 38 },
      { x: -15, y: -2 },
      { x: -38, y: -2 },
    ];
    DANCE.laneColors.forEach((c, i) => {
      bakeTexture(this, 'darrow_' + i, ARROW_B, 2, (g) => {
        g.fillStyle(c, 1);
        g.fillPoints(shape, true);
        g.lineStyle(6, 0x111111, 1);
        g.strokePoints(shape, true, true);
        g.fillStyle(0xffffff, 0.45);
        g.fillTriangle(0, -30, 24, -6, -8, -6);
      });
    });
    bakeTexture(this, 'darrow_target', ARROW_B, 2, (g) => {
      g.fillStyle(0x000000, 0.35);
      g.fillPoints(shape, true);
      g.lineStyle(5, 0xffffff, 0.9);
      g.strokePoints(shape, true, true);
    });
    bakeTexture(this, 'darrow_glow', ARROW_B, 2, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(0, 0, 44 - i * 9);
      }
    });
  }

  private buildHighway() {
    this.highway = this.add.container(0, 0).setDepth(2000);
    const g = this.add.graphics();
    g.fillStyle(0x05030c, 0.55);
    g.fillRoundedRect(752, 70, 416, 880, 22);
    g.lineStyle(4, 0xffffff, 0.25);
    g.strokeRoundedRect(752, 70, 416, 880, 22);
    for (let i = 1; i < 4; i++) {
      g.lineStyle(2, 0xffffff, 0.08);
      g.lineBetween(760 + i * 100, 80, 760 + i * 100, 940);
    }
    // ligne des cibles
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(756, TARGET_Y - 48, 408, 96);
    this.highway.add(g);
    for (let i = 0; i < 4; i++) {
      const glow = bakedImage(this, 'darrow_glow', ARROW_B, 2, LANE_X[i], TARGET_Y).setTint(DANCE.laneColors[i]).setAlpha(0);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      const r = bakedImage(this, 'darrow_target', ARROW_B, 2, LANE_X[i], TARGET_Y);
      r.rotation = ARROW_ROT[i];
      this.highway.add([glow, r]);
      this.glows.push(glow);
      this.receptors.push(r);
    }
  }

  // ---------------------------------------------------------------- tableau
  private buildHud() {
    this.hud = this.add.container(0, 0).setDepth(2500);
    for (const [side, team, x0] of [
      ['me', this.mine, 120],
      ['ai', this.opp, 1200],
    ] as const) {
      const glow = teamGlow(team);
      const col = '#' + glow.toString(16).padStart(6, '0');
      const name = cartoonText(this, x0 + 300, 160, team.short, 52, col).setOrigin(0.5);
      if (name.width > 540) name.setScale(540 / name.width);
      const score = cartoonText(this, x0 + 300, 240, '0', 64, '#ffffff').setOrigin(0.5);
      const stars = this.add.graphics();
      this.hud.add([name, score, stars]);
      this.led[side] = { name, score, stars };
    }
    this.meterG = this.add.graphics();
    this.roundTxt = cartoonText(this, 960, 40, 'BATTLE DE DANSE', 26, '#ffd23f').setOrigin(0.5);
    this.comboTxt = cartoonText(this, 960, 640, '', 44, '#ffffff').setOrigin(0.5).setAlpha(0.9);
    this.judgeTxt = cartoonText(this, 960, 760, '', 56, '#ffffff').setOrigin(0.5).setAlpha(0);
    this.breakTxt = cartoonText(this, 960, 812, '', 36, '#ffd23f').setOrigin(0.5).setAlpha(0);
    this.bannerTxt = cartoonText(this, 960, 470, '', 110, '#ffd23f').setOrigin(0.5).setAlpha(0);
    this.bannerSub = cartoonText(this, 960, 570, '', 44, '#ffffff').setOrigin(0.5).setAlpha(0);
    this.hud.add([this.meterG, this.roundTxt, this.comboTxt, this.judgeTxt, this.breakTxt]);
    this.bannerTxt.setDepth(2900);
    this.bannerSub.setDepth(2900);
    // bouton pause (téléphone) et zones de toucher : seulement pendant la battle
    this.pads = this.add.container(0, 0).setVisible(false);
    this.hud.add(this.pads);
    if (this.touch) {
      const pb = cartoonText(this, 50, 50, '❚❚', 40, '#ffffff').setOrigin(0.5);
      this.pads.add(pb);
      DANCE.laneColors.forEach((c, i) => {
        const x = 240 + i * 480;
        const pad = this.add.graphics();
        pad.fillStyle(c, 0.28);
        pad.fillRoundedRect(x - 230, 1012, 460, 62, 18);
        pad.lineStyle(3, c, 0.8);
        pad.strokeRoundedRect(x - 230, 1012, 460, 62, 18);
        const t = cartoonText(this, x, 1043, DANCE.laneSymbols[i], 40, '#ffffff').setOrigin(0.5);
        this.pads.add([pad, t]);
      });
    }
    this.refreshHud();
  }

  private refreshHud() {
    for (const side of ['me', 'ai'] as const) {
      const l = this.led[side];
      l.score.setText(String(this.score[side]));
      const x0 = side === 'me' ? 120 : 1200;
      l.stars.clear();
      for (let i = 0; i < ROUNDS; i++) {
        const cx = x0 + 300 + (i - (ROUNDS - 1) / 2) * 60;
        const won = i < this.rounds[side];
        l.stars.fillStyle(won ? 0xffd23f : 0x333344, 1);
        l.stars.fillCircle(cx, 318, 18);
        l.stars.lineStyle(4, 0x111111, 1);
        l.stars.strokeCircle(cx, 318, 18);
      }
    }
  }

  private drawMeter() {
    const g = this.meterG;
    g.clear();
    if (this.phase !== 'play') return;
    const x = 760;
    const w = 400;
    const y = 62;
    const h = 22;
    const split = x + w * this.meter;
    g.fillStyle(teamGlow(this.mine), 1);
    g.fillRect(x, y, split - x, h);
    g.fillStyle(teamGlow(this.opp), 1);
    g.fillRect(split, y, x + w - split, h);
    g.lineStyle(4, 0x111111, 1);
    g.strokeRect(x, y, w, h);
    g.fillStyle(0xffffff, 1);
    g.fillRect(split - 3, y - 6, 6, h + 12);
  }

  // ---------------------------------------------------------------- équipes
  private members(team: TeamConfig, round: number): CharacterDef[] {
    const list = rosterOf(team).filter((c) => c.kind !== 'dog');
    const out: CharacterDef[] = [];
    for (let k = 0; k < DANCE.crewSize; k++) out.push(list[(round * DANCE.crewSize + k) % list.length]);
    return out;
  }

  /** Met sur scène les danseuses d'un round (une nouvelle équipe de 4 à chaque round). */
  private setCrews(round: number, animate: boolean) {
    this.crewRound = round;
    for (const side of ['me', 'ai'] as const) {
      for (const d of this.crews[side]) d.rig.destroy();
      const team = side === 'me' ? this.mine : this.opp;
      const cx = side === 'me' ? 430 : 1490;
      const spots = [
        { x: cx - 215, y: 805, front: false },
        { x: cx + 215, y: 805, front: false },
        { x: cx, y: 785, front: false },
        { x: cx, y: 1000, front: true },
      ];
      // la première du groupe est devant (la meneuse)
      const defs = this.members(team, round);
      const order = [defs[1], defs[2], defs[3], defs[0]];
      this.crews[side] = order.map((def, i) => {
        const sp = spots[i];
        const rig = new CartoonRig(this, lookFor(def, team, { dance: true }));
        this.add.existing(rig);
        rig.setPosition(sp.x, sp.y);
        rig.setDepth(sp.y);
        rig.baseScale = (sp.front ? 2.85 : 2.3) * (stat.height(def) / 66);
        rig.applyScale(1);
        rig.groove = 1;
        if (animate) {
          rig.setScale(0);
          this.tweens.add({ targets: rig, scale: rig.baseScale, duration: 320, delay: i * 60, ease: 'Back.Out' });
        }
        return { rig, def, front: sp.front };
      });
    }
  }

  /** Pas de danse de l'équipe. perfect : un mouvement de breakdance au lieu du pas hip-hop. */
  private crewMove(side: Side, lane: Lane, all = true, perfect = false) {
    const spb = this.player?.spb ?? 0.5;
    if (perfect) {
      const dur = clamp(spb * 2, 0.7, 1.5);
      for (const d of this.crews[side]) if (all || d.front) d.rig.play(BREAKS[lane], dur);
      return;
    }
    const dur = clamp(spb * 0.85, 0.3, 0.55);
    for (const d of this.crews[side]) if (all || d.front) d.rig.play(MOVES[lane], dur);
  }

  private crewStumble(side: Side) {
    const lead = this.crews[side].find((d) => d.front);
    lead?.rig.play('flinch', 0.4);
  }

  // ================================================================ choix de la musique
  private showPick() {
    this.phase = 'pick';
    this.ui.removeAll(true);
    this.cards = [];
    this.buttons = [];
    this.highway.setVisible(false);
    this.pads.setVisible(false);
    this.comboTxt.setText('');
    this.roundTxt.setText('BATTLE DE DANSE');
    const bg = this.add.rectangle(960, 540, 1920, 1080, 0x05030c, 0.55);
    this.ui.add(bg);
    this.ui.add(cartoonText(this, 960, 445, 'CHOISIS LA MUSIQUE', 56, '#ffd23f').setOrigin(0.5));
    this.ui.add(cartoonText(this, 960, 500, `${this.mine.name}  contre  ${this.opp.name}`, 26, '#ffffff').setOrigin(0.5));
    // grille de 4 colonnes
    const W = 400;
    const H = 150;
    const cols = 4;
    const x0 = (1920 - (cols * W + (cols - 1) * 28)) / 2;
    SONGS.forEach((song, i) => {
      const x = x0 + (i % cols) * (W + 28);
      const y = 545 + Math.floor(i / cols) * (H + 22);
      this.ui.add(panel(this, x, y, W, H, 0x120a26, 0.95));
      const g = this.add.graphics();
      g.fillStyle(song.color, 1);
      g.fillRoundedRect(x + 16, y + 14, W - 32, 10, 5);
      this.ui.add(g);
      const tt = cartoonText(this, x + W / 2, y + 52, song.title.toUpperCase(), 34, '#ffffff').setOrigin(0.5);
      if (tt.width > W - 30) tt.setScale((W - 30) / tt.width);
      this.ui.add(tt);
      this.ui.add(cartoonText(this, x + W / 2, y + 94, song.style, 24, '#' + song.color.toString(16).padStart(6, '0')).setOrigin(0.5));
      this.ui.add(cartoonText(this, x + W / 2, y + 126, `${song.bpm} BPM`, 18, '#c9d4ff').setOrigin(0.5));
      const box = this.add.graphics();
      this.ui.add(box);
      this.cards.push({ box, x, y, w: W, h: H });
    });
    const st = Progress.stage('dance');
    const lvl = Progress.on ? `${st.text}   ·   la difficulté monte à chaque chanson` : `Difficulté : ${st.name}  (dans les OPTIONS)`;
    this.ui.add(cartoonText(this, 960, 908, lvl, 24, st.color).setOrigin(0.5));
    // musique coupée dans les OPTIONS : on le dit, sinon la danse se fait en silence
    const st0 = Save.settings;
    if (st0.muted || st0.musicVolume === 0)
      this.ui.add(cartoonText(this, 960, 395, 'La musique est coupée : monte-la dans les OPTIONS', 28, '#ff9f43').setOrigin(0.5));
    const go = button(this, 960, 975, 'DANSER !', 380, 84, () => this.startBattle());
    go.setSelected(true);
    this.ui.add(go.c);
    const help = this.touch ? 'Touche une musique pour l’écouter' : '← → ↑ ↓ choisir   ·   ESPACE ou OK : danser   ·   ÉCHAP : retour';
    this.ui.add(cartoonText(this, 960, 1045, help, 22, '#ffffff').setOrigin(0.5));
    this.pickSong(this.songIdx, true);
  }

  private pickSong(i: number, force = false) {
    if (i === this.songIdx && !force) return;
    this.songIdx = i;
    Save.updateSettings({ danceSong: SONGS[i].id });
    this.cards.forEach((c, k) => {
      c.box.clear();
      if (k !== i) return;
      c.box.lineStyle(8, 0xffd23f, 1);
      c.box.strokeRoundedRect(c.x - 8, c.y - 8, c.w + 16, c.h + 16, 24);
    });
    this.stage.setColor(SONGS[i].color);
    // aperçu : la musique joue à partir du premier round
    this.player?.stop();
    this.player = null;
    if (!Sound.ctx) return;
    this.player = new BeatPlayer(SONGS[i]);
    this.player.start(this.roundStart(0));
  }

  private roundStart(r: number) {
    const p = this.player ?? new BeatPlayer(SONGS[this.songIdx]);
    const sec = p.sections.find((s) => s.kind === 'round' && s.round === r)!;
    return sec.startBar * 4 * p.spb;
  }

  // ================================================================ battle
  private startBattle() {
    Sound.unlock();
    this.player?.stop();
    this.ui.removeAll(true);
    this.cards = [];
    this.buttons = [];
    this.resetScores();
    this.refreshHud();
    for (const im of this.sprites.values()) im.destroy();
    this.sprites.clear();
    // la chanson va plus vite aux niveaux très durs ; chaque round a la chorégraphie de son niveau
    this.sessionStart = Progress.seconds('dance');
    const d0 = Progress.levelAt(this.sessionStart);
    const base = SONGS[this.songIdx];
    const song = { ...base, bpm: Math.round(base.bpm * atLevel(d0, DANCE.tempo)) };
    this.player = new BeatPlayer(song);
    const p = this.player;
    const roundAt = (r: number) => p.sections.find((x) => x.kind === 'round' && x.round === r)!.startBar * 4 * p.spb;
    this.notes = chartOf(song, (r) => Progress.levelAt(this.sessionStart + roundAt(r)));
    this.applyLevel(d0);
    this.head = 0;
    this.setCrews(0, true);
    this.highway.setVisible(true);
    this.pads.setVisible(true);
    this.player.start(0, 0.35);
    this.phase = 'play';
    this.paused = false;
  }

  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    const p = this.player;
    if (p && !this.paused) p.update();
    const t = p ? p.now() : 0;
    const beat = p ? t / p.spb : this.time.now / 600;
    const playing = this.phase === 'play' && !this.paused;

    // les danseuses bougent au rythme
    for (const side of ['me', 'ai'] as const)
      for (const d of this.crews[side]) {
        d.rig.beat = beat;
        if (!this.paused) d.rig.tick(dt);
      }
    const target = this.phase === 'play' && p ? (sectionAt(p.sections, Math.floor(beat / 4)).kind === 'round' ? 1 : 0.35) : 0.6;
    this.energy += (target - this.energy) * Math.min(1, dt * 4);
    this.stage.update(beat, this.energy);

    if (this.phase === 'pick' && p && t > this.roundStart(0) + 8 * 4 * p.spb) p.start(this.roundStart(0)); // aperçu en boucle
    if (playing && p) {
      Progress.add('dance', dt);
      this.onBeats(beat);
      this.onSections(beat);
      this.updateNotes(t);
      this.updateAi(t);
      if (t > p.length + 0.4) this.showResults();
    }
    this.meter += ((this.roundScore.me + 300) / (this.roundScore.me + this.roundScore.ai + 600) - this.meter) * Math.min(1, dt * 5);
    this.drawMeter();
  }

  /** Événements à chaque temps : décompte du début. */
  private onBeats(beat: number) {
    const b = Math.floor(beat);
    if (b === this.lastBeat) return;
    const prev = this.lastBeat;
    this.lastBeat = b;
    if (b < prev) return; // reprise après une pause : on ne rejoue pas les événements
    const words: Record<number, string> = { 4: '3', 5: '2', 6: '1', 7: 'DANSEZ !' };
    if (words[b]) this.banner(words[b], '', b === 7 ? '#7dff7a' : '#ffffff', 0.5);
  }

  /** Début et fin des rounds. */
  private onSections(beat: number) {
    const p = this.player!;
    const bar = Math.floor(beat / 4);
    const idx = p.sections.findIndex((s) => bar >= s.startBar && bar < s.startBar + s.bars);
    if (idx < 0 || idx <= this.sectionIdx) {
      // dans la pause : la nouvelle équipe monte sur scène une mesure avant le round
      const sec = p.sections[this.sectionIdx];
      if (sec && sec.kind === 'break' && bar === sec.startBar + 1 && this.crewRound !== sec.round + 1) this.setCrews(sec.round + 1, true);
      return;
    }
    const sec = p.sections[idx];
    const prevSec = p.sections[this.sectionIdx];
    this.sectionIdx = idx;
    if (prevSec && prevSec.kind === 'round') this.endRound(prevSec.round);
    if (sec.kind === 'round') {
      this.roundScore = { me: 0, ai: 0 };
      // niveau du round (la vitesse des flèches change seulement entre deux rounds)
      this.applyLevel(Progress.level('dance'));
      const st = Progress.stage('dance');
      const up = Progress.on && st.index > this.levelIdx;
      this.levelIdx = st.index;
      this.roundTxt.setText(`ROUND ${sec.round + 1} / ${ROUNDS}${Progress.on ? `   ·   ${st.text}` : ''}`);
      const sub = up ? `${st.text} !` : sec.round === ROUNDS - 1 ? 'Dernier round !' : '';
      this.banner(`ROUND ${sec.round + 1}`, sub, '#ffd23f', up ? 1.8 : 1.1);
      this.stage.pulse(0.3);
    }
  }

  private endRound(r: number) {
    const meWin = this.roundScore.me >= this.roundScore.ai; // égalité : ton équipe (le plaisir d'abord)
    const w: Side = meWin ? 'me' : 'ai';
    this.rounds[w]++;
    this.refreshHud();
    const team = meWin ? this.mine : this.opp;
    this.banner(`ROUND ${r + 1} :`, `${team.name.toUpperCase()} !`, meWin ? '#7dff7a' : '#ff9f43', 1.6);
    for (const d of this.crews[w]) d.rig.play('celebrate', 1.2);
    for (const d of this.crews[meWin ? 'ai' : 'me']) d.rig.play('shakeHead', 0.8);
    this.stage.cheer();
    Sound.play(meWin ? 'cheer' : 'crowd', 0.6);
  }

  private updateNotes(t: number) {
    const scroll = this.scroll;
    const miss = this.win.good / 1000;
    // avance le début de la liste
    while (this.head < this.notes.length && this.notes[this.head].done && this.notes[this.head].aiDone) this.head++;
    for (let i = this.head; i < this.notes.length; i++) {
      const n = this.notes[i];
      const dtn = n.time - t;
      if (dtn > scroll + 0.1) break;
      if (!n.done && dtn < -miss) {
        // flèche manquée
        n.done = true;
        this.grade('miss', n.lane);
      }
      let im = this.sprites.get(n);
      if (!n.done) {
        if (!im) {
          im = bakedImage(this, 'darrow_' + n.lane, ARROW_B, 2, LANE_X[n.lane], TOP_Y);
          im.rotation = ARROW_ROT[n.lane];
          this.highway.add(im);
          this.sprites.set(n, im);
        }
        im.y = TARGET_Y - (dtn / scroll) * (TARGET_Y - TOP_Y);
        im.setAlpha(im.y < TOP_Y + 40 ? clamp((im.y - TOP_Y + 20) / 60, 0, 1) : 1);
      } else if (im && !im.getData('leaving')) {
        this.sprites.delete(n);
        im.destroy();
      }
    }
  }

  private updateAi(t: number) {
    const odds = this.aiOdds;
    for (let i = this.head; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.time > t) break;
      if (n.aiDone) continue;
      n.aiDone = true;
      const r = Math.random();
      const g: Grade = r < odds[0] ? 'perfect' : r < odds[0] + odds[1] ? 'great' : r < odds[0] + odds[1] + odds[2] ? 'good' : 'miss';
      if (g === 'miss') {
        this.aiCombo = 0;
        this.crewStumble('ai');
      } else {
        this.aiCombo++;
        const pts = DANCE.points[g] * comboMul(this.aiCombo);
        this.score.ai += pts;
        this.roundScore.ai += pts;
        this.crewMove('ai', n.lane, true, g === 'perfect');
      }
    }
    this.led.ai.score.setText(String(this.score.ai));
  }

  /** Appui sur une flèche (clavier ou écran). stampMs : moment de l'appui (performance.now()). */
  private hit(lane: Lane, stampMs: number) {
    const p = this.player;
    if (!p || this.phase !== 'play' || this.paused) return;
    const t = p.timeAt(stampMs);
    const win = this.win.good / 1000;
    let best: Note | null = null;
    for (let i = this.head; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.time > t + win) break;
      if (n.done || n.lane !== lane) continue;
      if (Math.abs(n.time - t) <= win && (!best || Math.abs(n.time - t) < Math.abs(best.time - t))) best = n;
    }
    this.flashLane(lane);
    if (!best) {
      // appui sans flèche : la danseuse bouge quand même, mais le combo repart à zéro
      this.crews.me.find((d) => d.front)?.rig.play(MOVES[lane], 0.4);
      if (this.combo > 0) this.comboBreak();
      return;
    }
    best.done = true;
    const ms = Math.abs(best.time - t) * 1000;
    const W = this.win;
    const g: Grade = ms <= W.perfect ? 'perfect' : ms <= W.great ? 'great' : 'good';
    const im = this.sprites.get(best);
    if (im) {
      im.setData('leaving', true);
      this.sprites.delete(best);
      im.y = TARGET_Y;
      this.tweens.add({ targets: im, scale: im.scale * 1.6, alpha: 0, duration: 160, onComplete: () => im.destroy() });
    }
    this.grade(g, lane);
  }

  private grade(g: Grade, lane: Lane) {
    this.counts[g]++;
    if (g === 'miss') {
      this.comboBreak();
      this.crewStumble('me');
    } else {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const pts = DANCE.points[g] * comboMul(this.combo);
      this.score.me += pts;
      this.roundScore.me += pts;
      this.crewMove('me', lane, true, g === 'perfect');
      if (g === 'perfect') {
        // nom du mouvement de breakdance sous PARFAIT
        this.breakTxt.setText(BREAK_NAMES[lane]);
        this.tweens.killTweensOf(this.breakTxt);
        this.breakTxt.setAlpha(1).setScale(0.6);
        this.tweens.add({ targets: this.breakTxt, scale: 1, duration: 160, ease: 'Back.Out' });
        this.tweens.add({ targets: this.breakTxt, alpha: 0, delay: 500, duration: 220 });
      }
      if (this.combo % 10 === 0) {
        this.stage.pulse(0.18);
        this.stage.cheer();
      }
      this.led.me.score.setText(String(this.score.me));
    }
    this.judgeTxt.setText(GRADE_LABEL[g]).setColor(GRADE_COLOR[g]);
    this.tweens.killTweensOf(this.judgeTxt);
    this.judgeTxt.setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.judgeTxt, scale: 1, duration: 120, ease: 'Back.Out' });
    this.tweens.add({ targets: this.judgeTxt, alpha: 0, delay: 380, duration: 200 });
    const mul = comboMul(this.combo);
    this.comboTxt.setText(this.combo >= 3 ? `COMBO ${this.combo}${mul > 1 ? `   ×${mul}` : ''}` : '');
  }

  private comboBreak() {
    this.combo = 0;
    this.comboTxt.setText('');
  }

  private flashLane(lane: Lane) {
    const gl = this.glows[lane];
    const r = this.receptors[lane];
    this.tweens.killTweensOf([gl, r]);
    gl.setAlpha(1).setScale(1.25 / 2);
    r.setScale(0.6);
    this.tweens.add({ targets: gl, alpha: 0, scale: 1.6 / 2, duration: 220 });
    this.tweens.add({ targets: r, scale: 0.5, duration: 120 });
  }

  private banner(text: string, sub: string, color: string, seconds: number) {
    for (const o of [this.bannerTxt, this.bannerSub]) this.tweens.killTweensOf(o);
    this.bannerTxt.setText(text).setColor(color).setAlpha(1).setScale(0.4);
    this.bannerSub.setText(sub).setAlpha(sub ? 1 : 0);
    this.tweens.add({ targets: this.bannerTxt, scale: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: [this.bannerTxt, this.bannerSub], alpha: 0, delay: seconds * 1000, duration: 250 });
  }

  // ================================================================ fin de la battle
  private showResults() {
    this.phase = 'results';
    this.player?.stop();
    this.highway.setVisible(false);
    this.pads.setVisible(false);
    this.comboTxt.setText('');
    this.judgeTxt.setAlpha(0);
    this.roundTxt.setText('BATTLE TERMINÉE');
    for (const im of this.sprites.values()) im.destroy();
    this.sprites.clear();
    const meWin = this.rounds.me > this.rounds.ai;
    const winner = meWin ? this.mine : this.opp;
    for (const d of this.crews[meWin ? 'me' : 'ai']) d.rig.play('celebrate', 2);
    for (const d of this.crews[meWin ? 'ai' : 'me']) d.rig.play('sad', 2);
    if (meWin) {
      if (!Stadium.play('bigCheer', { dur: 4 })) Sound.play('applause', 0.7);
    } else Sound.play('crowd', 0.5);
    this.stage.cheer();
    const rec = Save.records();
    if (meWin) rec.danceWins = (rec.danceWins ?? 0) + 1;
    else rec.danceLosses = (rec.danceLosses ?? 0) + 1;
    Save.saveRecords(rec);

    this.ui.removeAll(true);
    this.ui.add(panel(this, 460, 150, 1000, 640, 0x120a26, 0.95));
    this.ui.add(cartoonText(this, 960, 230, meWin ? 'VICTOIRE !' : 'DÉFAITE…', 72, meWin ? '#7dff7a' : '#ff9f43').setOrigin(0.5));
    const t = cartoonText(this, 960, 310, `${winner.name.toUpperCase()} GAGNENT LA BATTLE`, 40, '#ffd23f').setOrigin(0.5);
    if (t.width > 940) t.setScale(940 / t.width);
    this.ui.add(t);
    this.ui.add(cartoonText(this, 960, 380, `Rounds : ${this.rounds.me} – ${this.rounds.ai}     ·     Points : ${this.score.me} – ${this.score.ai}`, 30, '#ffffff').setOrigin(0.5));
    const c = this.counts;
    const lines: [string, number, string][] = [
      ['PARFAIT', c.perfect, GRADE_COLOR.perfect],
      ['SUPER', c.great, GRADE_COLOR.great],
      ['BIEN', c.good, GRADE_COLOR.good],
      ['MANQUÉ', c.miss, GRADE_COLOR.miss],
    ];
    lines.forEach(([l, v, col], i) => {
      const x = 600 + i * 240;
      this.ui.add(cartoonText(this, x, 470, l, 26, col).setOrigin(0.5));
      this.ui.add(cartoonText(this, x, 520, String(v), 44, '#ffffff').setOrigin(0.5));
    });
    const sec = Math.floor(Progress.seconds('dance'));
    const st = Progress.stage('dance');
    const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    this.ui.add(cartoonText(this, 960, 600, `Meilleur combo : ${this.bestCombo}`, 28, '#c9d4ff').setOrigin(0.5));
    if (Progress.on) this.ui.add(cartoonText(this, 960, 640, `Temps de danse : ${time}   ·   ${st.text}`, 26, st.color).setOrigin(0.5));
    // SUIVANTE : la chanson d'après, un peu plus difficile (la session continue)
    const labels: [string, () => void][] = [
      ['SUIVANTE', () => this.nextSong()],
      ['REJOUER', () => this.startBattle()],
      ['MUSIQUE', () => this.showPick()],
      ['MENU', () => this.leave()],
    ];
    this.buttons = labels.map(([l, fn], i) => {
      const b = button(this, 960 + (i - 1.5) * 245, 715, l, 225, 72, fn);
      this.ui.add(b.c);
      return b;
    });
    this.sel = 0;
    this.buttons.forEach((b, k) => b.setSelected(k === 0));
  }

  private nextSong() {
    this.songIdx = (this.songIdx + 1) % SONGS.length;
    Save.updateSettings({ danceSong: SONGS[this.songIdx].id });
    this.stage.setColor(SONGS[this.songIdx].color);
    this.startBattle();
  }

  /** Réglages selon le niveau D : vitesse des flèches, fenêtres de timing, force de l'ordinateur. */
  private applyLevel(d: number) {
    this.scroll = atLevel(d, DANCE.scroll);
    this.win = { perfect: atLevel(d, DANCE.windows.perfect), great: atLevel(d, DANCE.windows.great), good: atLevel(d, DANCE.windows.good) };
    this.aiOdds = [atLevel(d, DANCE.ai.perfect), atLevel(d, DANCE.ai.great), atLevel(d, DANCE.ai.good)];
  }

  // ================================================================ commandes
  private onKey(e: KeyboardEvent) {
    if (this.leaving) return;
    Sound.unlock();
    const k = e.key;
    if (k === 'f' || k === 'F') return toggleFullscreen(this);
    if (k === 'Escape' || k === 'Backspace') return this.back();
    if (this.paused) {
      if (k === ' ' || k === 'Enter') this.setPaused(false);
      return;
    }
    if (this.phase === 'play') {
      const lane = KEY_LANE[k];
      if (lane !== undefined && !e.repeat) this.hit(lane, e.timeStamp);
      return;
    }
    if (this.phase === 'pick') {
      const n = SONGS.length;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.pickSong((this.songIdx + n - 1) % n);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.pickSong((this.songIdx + 1) % n);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.pickSong((this.songIdx + n - 4) % n);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.pickSong((this.songIdx + 4) % n);
      else if (k === ' ' || k === 'Enter') this.startBattle();
      if (!this.player) this.pickSong(this.songIdx, true); // le son vient d'être permis
      return;
    }
    if (this.phase === 'results') {
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.selectBtn(this.sel - 1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.selectBtn(this.sel + 1);
      else if (k === ' ' || k === 'Enter') this.buttons[this.sel]?.c.emit('pointerdown');
    }
  }

  private selectBtn(i: number) {
    const n = this.buttons.length;
    this.sel = (i + n) % n;
    this.buttons.forEach((b, k) => b.setSelected(k === this.sel));
    Sound.play('click');
  }

  private onPointer(p: Phaser.Input.Pointer) {
    if (this.leaving) return;
    Sound.unlock();
    const stamp = p.event && 'timeStamp' in p.event ? p.event.timeStamp : performance.now();
    if (this.paused) {
      this.setPaused(false);
      return;
    }
    if (this.phase === 'play') {
      if (this.touch && p.x < 110 && p.y < 110) return this.setPaused(true);
      // l'écran est partagé en 4 colonnes : ←  ↓  ↑  →
      const lane = clamp(Math.floor(p.x / 480), 0, 3) as Lane;
      this.hit(lane, stamp);
      return;
    }
    if (this.phase === 'pick') {
      const i = this.cards.findIndex((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
      if (i >= 0) this.pickSong(i, !this.player);
      else if (!this.player) this.pickSong(this.songIdx, true);
    }
  }

  private back() {
    if (this.phase === 'play') {
      if (this.paused) this.leave();
      else this.setPaused(true);
      return;
    }
    this.leave();
  }

  private setPaused(on: boolean) {
    if (on === this.paused || this.phase !== 'play') return;
    this.paused = on;
    this.pauseBox?.destroy();
    this.pauseBox = null;
    if (on) {
      this.player?.pause();
      this.tweens.pauseAll();
      const c = this.add.container(0, 0).setDepth(3500);
      c.add(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6));
      c.add(cartoonText(this, 960, 440, 'PAUSE', 90, '#ffd23f').setOrigin(0.5));
      const how = this.touch ? 'Touche l’écran pour continuer' : 'ESPACE ou OK : continuer   ·   ÉCHAP : quitter';
      c.add(cartoonText(this, 960, 560, how, 32, '#ffffff').setOrigin(0.5));
      if (this.touch) {
        const q = button(this, 960, 700, 'QUITTER', 300, 80, () => this.leave());
        c.add(q.c);
      }
      this.pauseBox = c;
    } else {
      this.tweens.resumeAll();
      this.player?.resume();
    }
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.player?.stop();
    this.player = null;
    this.input.keyboard!.removeAllListeners();
    this.cameras.main.fadeOut(220, 15, 26, 61);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
  }
}

