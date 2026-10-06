import Phaser from 'phaser';
import { CONTROLS, DIFFICULTY, FIELD, PACE, PHYSICS, RULES, TIMING_AI, VIEW, type DifficultySettings } from '../config/gameConfig';
import { ALL_TEAMS, rosterOf, stat, teamById, type CharacterDef, type Position, type TeamConfig } from '../config/teams';
import { Ball, pitchPos, stepBall } from '../entities/Ball';
import { Fielder } from '../entities/Fielder';
import { Runner } from '../entities/Runner';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { computeContact, timingLabel, windowsFor, type Contact, type TimingWindows } from '../systems/BattingSystem';
import { planPitch, type PitchPlan, type PitcherStats } from '../systems/PitchingSystem';
import {
  assignDefense,
  ballTimeToBase,
  chooseThrow,
  containThrow,
  coverOf,
  coverSpot,
  intercept,
  outable,
  predict,
  type Sample,
} from '../systems/FieldingSystem';
import { advanceAll, computeForces, removeForcesAhead, retreatAll, shouldAdvance } from '../systems/RunningSystem';
import { aiSwing } from '../systems/AISystem';
import { GameStats } from '../systems/Stats';
import { Save } from '../systems/Save';
import { Sound } from '../audio/Sound';
import { Stadium } from '../audio/Stadium';
import { Controls } from '../input/Controls';
import { FieldRenderer } from '../world/FieldRenderer';
import { BASES, MOUND, isFairPosition, project } from '../world/Projection';
import { chance, clamp, dist, gauss, lerp, rand, segDist } from '../util/math';
import type { HudState } from './HudScene';
import { isTouch } from '../util/device';
import { traceLive } from '../util/trace';

type Phase = 'intro' | 'banner' | 'sign' | 'aim' | 'windup' | 'pitch' | 'live' | 'walk' | 'dead' | 'over';

interface TeamRT {
  cfg: TeamConfig;
  fielders: Fielder[];
  human: boolean;
  idx: number;
  score: number;
  line: number[];
  hits: number;
  halves?: number;
}

export interface GameSummary {
  home: number;
  away: number;
  homeId: string;
  homeName: string;
  awayName: string;
  result: 'win' | 'loss' | 'tie';
  mvpId: string | null;
  mvpText: string;
  hits: number;
  homeRuns: number;
  outsMade: number;
  strikeouts: number;
  lineHome: number[];
  lineAway: number[];
}

const L = FIELD.baseDistance;

/** Positions défensives de départ (pieds). */
const SPOTS: Record<Position, { x: number; y: number }> = {
  P: { x: 0, y: 45.3 },
  C: { x: 0, y: -4.4 },
  '1B': { x: 55, y: 61 },
  '2B': { x: 25, y: 106 },
  SS: { x: -27, y: 104 },
  '3B': { x: -55, y: 59 },
  LF: { x: -88, y: 158 },
  CF: { x: 0, y: 180 },
  RF: { x: 88, y: 158 },
};

const BATTER_SPOT = { x: -7.5, y: 1.2 };
const DUGOUT_HOME = { x: 62, y: 14 }; // côté 1er but
const DUGOUT_AWAY = { x: -62, y: 14 }; // côté 3e but

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  private diff!: DifficultySettings;
  private innings = 3;
  private winHuman!: TimingWindows;
  private winAI!: TimingWindows;
  private home!: TeamRT;
  private away!: TeamRT;
  private inning = 1;
  private top = true;
  private outs = 0;
  private balls = 0;
  private strikes = 0;
  private runsHalf = 0;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private phaseDur = 0;
  private signStep = 0;
  private signConfused = false;
  private ball!: Ball;
  private field!: FieldRenderer;
  private controls!: Controls;
  private stats!: GameStats;
  private runners: Runner[] = [];
  private leaving: Runner[] = [];
  private batterDef: CharacterDef | null = null;
  private batterRig: CartoonRig | null = null;
  private playBatter: CharacterDef | null = null;
  private plan: PitchPlan | null = null;
  private pitchStart = 0;
  private swung = false;
  private swingMiss = false;
  private aiSwingAt: number | null = null;
  private aiSwingDelta = 0;
  private gameTime = 0;
  private perfAnchor = 0;
  private samples: Sample[] = [];
  private samplesAge = 0;
  private recomputeT = 0;
  private chaser: Fielder | null = null;
  private controlled: Fielder | null = null;
  private holder: Fielder | null = null;
  private fair: 'pending' | 'fair' | 'foul' = 'pending';
  private flyAlive = false;
  private batterRunner: Runner | null = null;
  private runsThisPlay: Runner[] = [];
  private settleT = 0;
  private liveT = 0;
  private outsThisPlay = 0;
  private throwInfo: { base: number; receiver: Fielder | null; T: number; t: number } | null = null;
  private ignoreCatch: { f: Fielder; t: number } | null = null;
  private prev = { x: 0, y: 0, z: 0 };
  private overlay!: Phaser.GameObjects.Graphics;
  private baseLabels: Phaser.GameObjects.Text[] = [];
  private cam = { zoom: 1, x: 960, y: 540 };
  private retAnim: { from: Fielder; to: Fielder; t: number; T: number; wag: boolean; started: boolean } | null = null;
  private deadNext: 'pitch' | 'batter' = 'pitch';
  private defOutsTurcau = 0;
  private pitchLabelT = 0;
  private dustT = 0;
  private hrBallT = 0;
  private gameOverQueued = false;
  private inp = { swing: false, advance: false, retreat: false, pause: false, mute: false, base: 0 };
  private swingQueue: number[] = [];
  private holdT = 0;
  private halves = 0; // demi-manches jouées (pour varier l'orgue)
  private torcheShown = false; // « GROSSE TORCHE ! » déjà montré pour cette frappe
  private pointerTap = false;
  private wantPause = false;
  private sprint = 0; // jauge de sprint (0 à 1)
  private touch = false;
  private pitchBonus: 'super' | 'good' | null = null;
  private meter!: Phaser.GameObjects.Graphics;
  private meterText!: Phaser.GameObjects.Text;
  private meterPos = 0;

  // ================================================================ création
  create() {
    const s = Save.settings;
    this.diff = DIFFICULTY[s.difficulty];
    this.innings = s.innings;
    this.winHuman = windowsFor(this.diff.timingWindowMul);
    this.winAI = windowsFor(1, TIMING_AI);
    this.stats = new GameStats();
    this.runners = [];
    this.leaving = [];
    this.inning = 1;
    this.top = true;
    this.defOutsTurcau = 0;
    this.gameOverQueued = false;
    this.gameTime = 0;
    this.cam = { zoom: 1, x: 960, y: 540 };
    // Phaser garde la même scène d'une partie à l'autre (REJOUER, RECOMMENCER) :
    // on oublie tout objet de la partie précédente, qui est maintenant détruit.
    this.baseLabels = [];
    this.retAnim = null;
    this.batterRig = null;
    this.batterDef = null;
    this.playBatter = null;
    this.batterRunner = null;
    this.holder = null;
    this.controlled = null;
    this.chaser = null;
    this.throwInfo = null;
    this.ignoreCatch = null;
    this.plan = null;
    this.samples = [];
    this.runsThisPlay = [];
    this.swingQueue = [];
    this.hudCache = '';
    this.torcheShown = false;
    this.sprint = 0;
    this.pitchBonus = null;
    this.pointerTap = false;
    this.wantPause = false;

    // ton équipe (à domicile) et l'équipe adverse, choisies avant la partie
    const mine = teamById(s.myTeam);
    let opp = teamById(s.opponent);
    if (opp.id === mine.id) opp = ALL_TEAMS.find((t) => t.id !== mine.id)!;
    this.field = new FieldRenderer(this, mine, opp);
    this.overlay = this.add.graphics().setDepth(-500);
    this.meter = this.add.graphics().setDepth(2600);
    this.meterText = this.add
      .text(0, 0, 'OK !', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#111111', 6)
      .setDepth(2601)
      .setVisible(false);
    for (let k = 1; k <= 4; k++) {
      const b = BASES[k % 4];
      const p = project(b.x, b.y);
      const t = this.add
        .text(p.x, p.y + 26, String(k), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '22px', color: '#ffe14d' })
        .setOrigin(0.5)
        .setStroke('#111111', 5)
        .setDepth(1500)
        .setVisible(false);
      this.baseLabels.push(t);
    }

    this.home = this.makeTeam(mine, true);
    this.away = this.makeTeam(opp, false);
    this.ball = new Ball(this);
    this.controls = new Controls(this);

    // l'heure exacte de la touche donne un timing précis, indépendant des images
    const action = (stamp: number) => this.swingQueue.push(this.gameTime + (stamp - this.perfAnchor) / 1000);
    this.input.keyboard!.on('keydown-SPACE', (e: KeyboardEvent) => action(e.timeStamp));
    this.input.keyboard!.on('keydown-ENTER', (e: KeyboardEvent) => action(e.timeStamp));
    // un clic (souris, écran tactile ou curseur de la télé) = même action que ESPACE
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      action(p.event.timeStamp);
      this.pointerTap = true;
    });
    const onBack = () => {
      if (!this.scene.isPaused()) this.wantPause = true;
    };
    this.game.events.on('tv-back', onBack);
    const onSprint = () => {
      this.sprint = Math.min(1, this.sprint + CONTROLS.sprintPerTap * 1.4);
    };
    this.game.events.on('touch-sprint', onSprint);
    this.events.once('shutdown', () => {
      this.game.events.off('tv-back', onBack);
      this.game.events.off('touch-sprint', onSprint);
    });
    this.touch = isTouch();
    this.events.off('resume');
    this.events.on('resume', () => {
      this.input.keyboard!.resetKeys();
      this.swingQueue = [];
      this.pointerTap = false;
    });
    this.events.once('shutdown', () => {
      Sound.gameAudio(false);
      this.input.keyboard!.removeAllListeners();
    });

    this.scene.launch('Hud');
    this.scene.bringToTop('Hud');
    Sound.gameAudio(true);
    this.halves = 0;
    this.setPhase('intro', 0.25);
  }

  private makeTeam(cfg: TeamConfig, human: boolean): TeamRT {
    const fielders = (Object.keys(SPOTS) as Position[]).map((p) => new Fielder(this, cfg.defense[p], p, cfg, SPOTS[p]));
    return { cfg, fielders, human, idx: 0, score: 0, line: [], hits: 0 };
  }

  /** Met en place la rotation défensive de cette demi-manche (ex. Lily et Kaelie au champ). */
  private applyRotation(team: TeamRT) {
    const rot = team.cfg.rotation;
    if (!rot || rot.length === 0) return;
    team.halves = (team.halves ?? -1) + 1;
    const over = rot[team.halves % rot.length];
    team.fielders = team.fielders.map((f) => {
      const want = over[f.pos] ?? team.cfg.defense[f.pos];
      if (want.id === f.def.id) return f;
      f.rig.destroy();
      return new Fielder(this, want, f.pos, team.cfg, SPOTS[f.pos]);
    });
  }

  private get offense() {
    return this.top ? this.away : this.home;
  }
  private get defense() {
    return this.top ? this.home : this.away;
  }
  private fielder(p: Position) {
    return this.defense.fielders.find((f) => f.pos === p)!;
  }
  private get pitcher() {
    return this.fielder('P');
  }
  private get catcher() {
    return this.fielder('C');
  }
  /** L'équipe du joueur est en défensive. */
  private get turcauDefends() {
    return this.defense.human;
  }
  /** Billy et Stella (ou d'autres chiens) sont au monticule et au marbre. */
  private get dogsDefend() {
    return this.catcher.def.kind === 'dog';
  }

  private setPhase(p: Phase, dur = 0) {
    traceLive('phase', `partie : manche ${this.inning}${this.top ? '▲' : '▼'}, ${this.outs} retrait(s), étape « ${p} »`);
    this.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
    this.signStep = 0;
  }

  private hud(event: string, data?: unknown) {
    this.game.events.emit(event, data);
  }

  private popup(text: string, color = '#ffe14d', size = 64, sub?: string) {
    this.hud('hud-popup', { text, color, size, sub });
  }

  // ================================================================ boucle
  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.readInput();
    this.gameTime += dt;
    this.perfAnchor = performance.now();
    this.phaseT += dt;

    if (this.inp.pause && this.phase !== 'over') {
      this.hud('hud-pause', true);
      this.scene.pause();
      return;
    }
    if (this.inp.mute) {
      Save.updateSettings({ muted: !Save.settings.muted });
      const st = Save.settings;
      Sound.setVolumes(st.musicVolume, st.sfxVolume, st.muted);
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= this.phaseDur) this.startHalf();
        break;
      case 'banner':
        if (this.phaseT >= this.phaseDur) {
          this.resetForPitch();
          this.startSign();
        }
        break;
      case 'sign':
        this.updateSign();
        break;
      case 'aim':
        this.updateAim();
        break;
      case 'windup':
        if (this.phaseT >= this.phaseDur) this.release();
        break;
      case 'pitch':
        this.updatePitch();
        break;
      case 'live':
        this.updateLive(dt);
        break;
      case 'walk':
        this.updateRunners(dt);
        if (this.runners.every((r) => r.out || r.scored || r.settled)) this.endWalk();
        break;
      case 'dead':
        this.updateRunners(dt);
        if (this.phaseT >= this.phaseDur) this.afterDead();
        break;
      case 'over':
        break;
    }
    this.swingQueue = [];

    // éléments toujours animés
    if (this.phase !== 'live' && this.phase !== 'walk' && this.phase !== 'dead') for (const r of this.runners) r.step(dt);
    if (this.phase === 'dead' || this.phase === 'banner' || this.phase === 'over') {
      for (const f of this.defense.fielders) if (!f.hasBall || f.pos === 'P') f.moveToward(dt, 0.8);
    }
    for (const f of this.defense.fielders) f.sync(dt);
    this.updateLeaving(dt);
    this.updateBatterRig(dt);
    this.updateReturn(dt);
    this.updateBallVisual(dt);
    this.drawOverlay();
    this.updateCamera(dt);
    this.emitHud(dt);
  }

  private readInput() {
    const c = this.controls;
    this.inp.swing = c.justDown('swing') || this.pointerTap;
    this.pointerTap = false;
    this.inp.advance = c.justDown('advance') && CONTROLS.manualRunning;
    this.inp.retreat = c.justDown('retreat') && CONTROLS.manualRunning;
    this.inp.pause = c.justDown('pause') || this.wantPause;
    this.wantPause = false;
    this.inp.mute = c.justDown('mute');
    const b = c.justDown('base1') ? 1 : c.justDown('base2') ? 2 : c.justDown('base3') ? 3 : c.justDown('base4') ? 4 : 0;
    this.inp.base = CONTROLS.numberKeyThrows ? b : 0;
  }

  // ================================================================ demi-manches
  private startHalf() {
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.runsHalf = 0;
    for (const r of this.runners) r.destroy();
    this.runners = [];
    this.batterRig?.destroy();
    this.batterRig = null;
    for (const f of this.offense.fielders) {
      f.setVisible(false);
      f.rig.setSelected(false);
    }
    this.applyRotation(this.defense);
    for (const f of this.defense.fielders) {
      f.setVisible(true);
      f.resetHome();
      f.rig.setSelected(false);
    }
    this.controlled = null;
    if (this.offense.line[this.inning - 1] === undefined) this.offense.line[this.inning - 1] = 0;
    this.field.updateBoard(this.home.score, this.away.score, this.inning, this.top);
    const extra = this.inning > this.innings ? ' (manche supplémentaire)' : '';
    this.hud('hud-banner', {
      title: `MANCHE ${this.inning} ${this.top ? '▲' : '▼'}${extra}`,
      sub: this.offense.human
        ? `${this.offense.cfg.name} au bâton !  Appuie sur ESPACE (ou OK) quand la balle arrive`
        : 'En défensive !  ESPACE (ou OK) pour lancer la balle',
      color: this.offense.human ? '#7fd3ff' : '#ffd23f',
    });
    Sound.play('crowd', 0.6);
    Stadium.play(this.halves++ % 2 === 0 ? 'organWrigley' : 'gallop');
    this.setPhase('banner', PACE.bannerTime);
    this.resetForPitch();
  }

  private endHalf() {
    if (this.top) {
      if (this.inning >= this.innings && this.home.score > this.away.score) return this.gameOver();
      this.top = false;
    } else {
      if (this.inning >= this.innings && this.home.score !== this.away.score) return this.gameOver();
      if (this.inning >= this.innings + RULES.maxExtraInnings) return this.gameOver();
      this.inning++;
      this.top = true;
    }
    this.startHalf();
  }

  private isWalkoff() {
    return !this.top && this.inning >= this.innings && this.home.score > this.away.score;
  }

  private afterDead() {
    if (this.isWalkoff()) return this.gameOver();
    const limit = RULES.runLimitPerHalf > 0 && this.runsHalf >= RULES.runLimitPerHalf;
    if (this.outs >= RULES.outsPerHalf || limit) {
      if (limit && this.outs < RULES.outsPerHalf) this.popup('LIMITE DE POINTS !', '#ffffff', 50, `${RULES.runLimitPerHalf} points maximum par demi-manche`);
      return this.endHalf();
    }
    if (this.deadNext === 'batter') this.nextBatter();
    this.resetForPitch();
    this.startSign();
  }

  private nextBatter() {
    this.offense.idx++;
    this.balls = 0;
    this.strikes = 0;
    if (this.batterRig) {
      this.batterRig.destroy();
      this.batterRig = null;
    }
  }

  private setupBatter() {
    const lineup = this.offense.cfg.lineup;
    const def = lineup[this.offense.idx % lineup.length];
    this.batterDef = def;
    const rig = new CartoonRig(this, lookFor(def, this.offense.cfg));
    this.add.existing(rig);
    rig.baseScale = VIEW.characterScale * (stat.height(def) / 66);
    rig.setPose('bat');
    rig.setView('front');
    rig.facing = 1;
    this.batterRig = rig;
  }

  /** Remet tout en place avant un lancer. */
  private resetForPitch() {
    this.finishReturn();
    // coureuses : sur leur but
    for (const r of this.runners) {
      const k = Math.round(r.d / L);
      r.d = k * L;
      r.target = k;
      r.lastBase = k;
      r.startBase = k;
      r.forcedTo = null;
      r.holdAt = null;
      r.manual = false;
      r.trot = false;
      r.isBatter = false;
      r.delay = 0;
      r.boost = 1;
      r.rig.setView('front');
    }
    this.batterRunner = null;
    if (!this.batterRig) this.setupBatter();
    for (const f of this.defense.fielders) {
      if (dist(f.x, f.y, f.homeX, f.homeY) > 2) f.resetHome();
      f.task = 'idle';
      f.coverBase = null;
      f.hasBall = false;
      f.diveT = 0;
      f.recoverT = 0;
      f.rig.setHoldingBall(false);
      f.rig.setSelected(false);
      f.rig.setPose(f.pos === 'C' ? 'crouch' : f.pos === 'P' ? 'stand' : 'ready');
      f.rig.setView(f.pos === 'C' ? 'back' : 'front');
      f.rig.setExpression(f.def.expression);
    }
    this.catcher.rig.showMask(true);
    const p = this.pitcher;
    p.hasBall = true;
    p.rig.setHoldingBall(true);
    this.holder = p;
    this.ball.state = 'held';
    this.ball.setPos(p.x, p.y, 4);
    this.ball.setVel(0, 0, 0);
    this.chaser = null;
    this.controlled = null;
    this.throwInfo = null;
    this.plan = null;
    this.swung = false;
    this.swingMiss = false;
    this.aiSwingAt = null;
    this.field.updateBoard(this.home.score, this.away.score, this.inning, this.top);
  }

  // ================================================================ lancer
  private pitcherStats(def: CharacterDef): PitcherStats {
    if (def.kind === 'dog') return { pitching: def.pitching, control: def.control, movement: def.movement };
    return { pitching: 4 + def.defense * 0.35, control: 6, movement: 5 };
  }

  private startSign() {
    const human = this.offense.human;
    const ps = this.pitcherStats(this.pitcher.def);
    this.plan = planPitch(ps, human ? this.diff.pitchSpeedMul : 1, human ? this.diff.aiStrikeChance : 0.64, human ? 0.04 : 0.1);
    const dogs = this.dogsDefend;
    if (human && chance(0.22)) Stadium.play('claps', { rel: 0.8 });
    this.signConfused = dogs && chance(0.18);
    const dur = dogs ? PACE.signTime + (this.signConfused ? PACE.confusedExtra : 0) : 0.45;
    this.setPhase('sign', dur);
    if (dogs) {
      this.catcher.rig.signBubble(this.plan.fingers, false, 0.45);
      if (chance(0.3)) this.pitcher.rig.play('shakeFur');
    }
  }

  private updateSign() {
    const dogs = this.dogsDefend;
    if (dogs) {
      const P = this.pitcher.rig;
      if (this.signStep === 0 && this.phaseT > 0.22) {
        this.signStep = 1;
        if (this.signConfused) {
          P.play('confused');
          Sound.play('boing');
        } else P.play('nod');
      }
      if (this.signConfused && this.signStep === 1 && this.phaseT > 0.55) {
        this.signStep = 2;
        this.catcher.rig.signBubble(this.plan!.fingers, true, 0.45);
      }
      if (this.signConfused && this.signStep === 2 && this.phaseT > 0.9) {
        this.signStep = 3;
        P.play('nod');
      }
    }
    if (this.phaseT >= this.phaseDur) {
      this.pitchBonus = null;
      if (this.turcauDefends) {
        this.setPhase('aim', 1.8);
        this.swingQueue = [];
        return;
      }
      this.pitcher.rig.play('windup');
      this.setPhase('windup', PACE.windupTime);
    }
  }

  /** Jauge de lancer : OK dans le vert = super lancer de Billy. */
  private updateAim() {
    const period = 1.25; // aiguille 20 % plus lente (plus facile d'avoir un super lancer)
    const u = (this.phaseT / period) % 1;
    this.meterPos = u < 0.5 ? u * 2 : 2 - u * 2;
    const pressed = this.inp.swing || this.swingQueue.length > 0;
    if (pressed || this.phaseT >= this.phaseDur) {
      const off = Math.abs(this.meterPos - 0.5);
      const ps = this.pitcherStats(this.pitcher.def);
      const type = this.plan!.type;
      if (pressed && off < 0.1) {
        this.pitchBonus = 'super';
        this.plan = planPitch(ps, 1.1, 0.92, 0, type);
        this.popup('SUPER LANCER !', '#7dff7a', 56);
        this.pitcher.rig.flareEars(0.8);
        this.pitcher.rig.wag(1);
        Sound.play('select');
      } else if (pressed && off < 0.24) {
        this.pitchBonus = 'good';
        this.plan = planPitch(ps, 1.04, 0.8, 0.03, type);
        this.popup('BON LANCER', '#ffe14d', 44);
      }
      this.pitcher.rig.play('windup');
      this.setPhase('windup', PACE.windupTime);
    }
  }

  private release() {
    const plan = this.plan!;
    const p = this.pitcher;
    p.hasBall = false;
    p.rig.setHoldingBall(false);
    p.rig.play('release');
    if (p.def.kind === 'dog') p.rig.flareEars(plan.type === 'fastball' ? 0.45 : 0.2);
    this.holder = null;
    this.ball.state = 'pitch';
    this.ball.pitch = plan.path;
    this.pitchStart = this.gameTime;
    this.ball.setPos(plan.path.x0, plan.path.y0, plan.path.z0);
    this.ball.sim.bounced = false;
    this.pitchLabelT = 1.6;
    Sound.play('throw');
    if (!this.offense.human) {
      const bonus = this.pitchBonus;
      const diff =
        bonus === 'super'
          ? { ...this.diff, aiTimingSd: this.diff.aiTimingSd + 55, aiWhiff: this.diff.aiWhiff + 0.18 }
          : bonus === 'good'
            ? { ...this.diff, aiTimingSd: this.diff.aiTimingSd + 22, aiWhiff: this.diff.aiWhiff + 0.07 }
            : this.diff;
      const d = aiSwing(plan, diff, this.winAI, this.strikes);
      if (d.swing) {
        const at = this.pitchStart + plan.path.T + d.deltaMs / 1000 - 0.03;
        this.aiSwingAt = clamp(at, this.pitchStart + 0.08, this.pitchStart + plan.path.T + 0.2);
        this.aiSwingDelta = d.deltaMs;
      }
    }
    this.setPhase('pitch');
  }

  private updatePitch() {
    const plan = this.plan!;
    const t = this.gameTime - this.pitchStart;
    const p = pitchPos(plan.path, t);
    this.ball.setPos(p.x, p.y, p.z);

    if (this.offense.human) {
      for (const ts of this.swingQueue) {
        if (this.swung) break;
        const delta = (ts - (this.pitchStart + plan.path.T)) * 1000;
        this.doSwing(delta, true);
        if (this.phase !== 'pitch') return;
      }
    } else if (this.aiSwingAt !== null && this.gameTime >= this.aiSwingAt && !this.swung) {
      this.doSwing(this.aiSwingDelta, false);
      if (this.phase !== 'pitch') return;
    }
    if (p.done) this.pitchCaught();
  }

  private doSwing(deltaMs: number, human: boolean) {
    if (this.swung || !this.batterRig || !this.batterDef) return;
    this.swung = true;
    this.batterRig.play('swing');
    Sound.play('whoosh');
    const plan = this.plan!;
    const w = human ? this.winHuman : this.winAI;
    const c = computeContact(deltaMs, w, stat.power(this.batterDef), plan.type, plan.strike, human ? 1 : this.diff.aiPowerMul);
    if (human) {
      const lbl = timingLabel(deltaMs, w);
      const col = lbl.startsWith('PARFAIT') ? '#7dff7a' : Math.abs(deltaMs) <= w.good ? '#ffe14d' : '#ff9f43';
      this.hud('hud-timing', { text: lbl, color: col });
    }
    if (c) this.doContact(c);
    else this.swingMiss = true;
  }

  private pitchCaught() {
    const plan = this.plan!;
    const C = this.catcher;
    C.hasBall = true;
    this.holder = C;
    this.ball.state = 'held';
    C.rig.play(plan.type === 'fastball' ? 'flinch' : 'catch');
    Sound.play('glove');
    const strike = this.swingMiss || plan.strike;
    const dogs = C.def.kind === 'dog';
    let wagOnReturn = false;
    this.deadNext = 'pitch';

    if (strike) {
      this.strikes++;
      if (this.strikes >= RULES.strikesForOut) {
        this.strikeout();
        this.deadNext = 'batter';
      } else {
        this.popup(this.swingMiss ? 'ÉLAN RATÉ !' : 'PRISE !', '#7fd3ff', 56);
        Sound.play('strike');
        if (this.swingMiss && this.batterRig) this.batterRig.setExpression('surprised');
        wagOnReturn = dogs;
        if (dogs) C.rig.wag(0.8);
      }
    } else {
      this.balls++;
      if (plan.path.wild && dogs) {
        C.rig.showMask(false);
        C.rig.play('shakeHead');
        this.pitcher.rig.play('sad');
        this.pitcher.rig.setExpression('embarrassed');
        this.pitcher.rig.sweat();
        this.time.delayedCall(900, () => {
          C.rig.showMask(true);
          this.pitcher.rig.setExpression('happy');
        });
        this.popup('OUPS !', '#ff9f43', 52);
      }
      if (this.balls >= RULES.ballsForWalk) {
        this.walk();
        return;
      }
      if (!plan.path.wild) this.popup('BALLE', '#ffffff', 50);
      Sound.play('ball');
    }
    this.setPhase('dead', PACE.afterPitch);
    this.startReturn(C, this.pitcher, 0.25, wagOnReturn);
  }

  private strikeout() {
    this.outs++;
    const bd = this.batterDef!;
    this.stats.line(bd).ab++;
    this.stats.line(this.pitcher.def).k++;
    this.stats.line(this.catcher.def).putouts++;
    if (this.turcauDefends) this.defOutsTurcau++;
    this.popup('RETRAIT AU BÂTON !', '#ff5d5d', 62);
    Sound.play('strikeout');
    if (this.turcauDefends) {
      this.pitcher.rig.play('celebrate');
      this.pitcher.rig.setExpression('happy');
      this.catcher.rig.play('paw');
      this.catcher.rig.wag(1.5);
      this.time.delayedCall(250, () => Sound.play('bark'));
      this.field.cheer(0.35);
      if (!Stadium.play('cheer', { dur: 4 })) Sound.play('applause', 0.6);
    }
    if (this.batterRig) {
      const r = new Runner(this, bd, this.offense.cfg, 0, this.batterRig);
      r.rig.setExpression('sad');
      r.rig.play('sad');
      r.leave(this.offense === this.home ? DUGOUT_HOME : DUGOUT_AWAY);
      this.leaving.push(r);
      this.batterRig = null;
    }
    this.balls = 0;
    this.strikes = 0;
  }

  private walk() {
    this.popup('BUT SUR BALLES', '#7dff7a', 56);
    Sound.play('ball');
    const bd = this.batterDef!;
    this.stats.line(bd).walks++;
    this.playBatter = bd;
    const br = new Runner(this, bd, this.offense.cfg, 0, this.batterRig!);
    br.isBatter = true;
    br.delay = 0.25;
    this.batterRig = null;
    for (const r of this.runners) r.startBase = r.onBase === -1 ? r.target : r.onBase;
    br.startBase = 0;
    this.runners.push(br);
    computeForces(this.runners);
    for (const r of this.runners) if (r.forcedTo !== null) r.target = r.forcedTo;
    this.runsThisPlay = [];
    this.deadNext = 'batter';
    if (this.dogsDefend) {
      this.catcher.rig.play('shakeHead');
      this.pitcher.rig.setExpression('embarrassed');
    }
    this.setPhase('walk');
  }

  private endWalk() {
    this.balls = 0;
    this.strikes = 0;
    this.setPhase('dead', 0.5);
    this.startReturn(this.catcher, this.pitcher, 0.1, false);
  }

  // ================================================================ frappe
  private doContact(c: Contact) {
    const strong = c.quality === 'perfect' || c.quality === 'good';
    Sound.play(strong ? 'bat' : 'batWeak', c.exitSpeed / 100);
    if (c.quality === 'perfect') this.cameras.main.shake(140, 0.004);
    const b = this.ball;
    b.state = 'batted';
    b.setPos(0.3, clamp(b.sim.y, 0.5, 4), 2.8);
    b.setVel(c.vx, c.vy, c.vz);
    b.sim.bounced = false;
    this.flyAlive = true;
    this.fair = 'pending';
    this.torcheShown = false;
    this.prev = { x: b.sim.x, y: b.sim.y, z: b.sim.z };

    // la frappeuse devient coureuse
    const bd = this.batterDef!;
    this.playBatter = bd;
    this.stats.line(bd).ab++;
    // phrase de bande dessinée propre à la frappeuse (ex. Maryse : « Houle ma poule ! »)
    if (bd.kind === 'girl' && bd.hitPhrase) this.hud('hud-comic', { text: bd.hitPhrase });
    const rig = this.batterRig!;
    this.batterRig = null;
    this.dropBat(rig);
    for (const r of this.runners) {
      r.startBase = r.onBase === -1 ? r.target : r.onBase;
      r.manual = false;
      r.holdAt = null;
    }
    const br = new Runner(this, bd, this.offense.cfg, 0, rig);
    br.isBatter = true;
    br.delay = 0.28;
    br.target = 1;
    br.startBase = 0;
    this.batterRunner = br;
    this.runners.push(br);
    computeForces(this.runners);

    // départ des coureuses selon le type de frappe
    this.samples = predict(b.sim);
    this.samplesAge = 0;
    const land = this.samples.find((s) => s.bounced);
    const tLand = land ? land.t : 5;
    for (const r of this.runners) {
      if (r.isBatter) continue;
      if (this.outs < 2 && c.launch > 16 && tLand > 1.0) {
        r.target = r.startBase + 1;
        r.holdAt = r.startBase * L + (r.forcedTo !== null ? 0.5 : 0.35) * L;
      } else if (this.outs < 2 && c.launch > 5) {
        r.target = r.startBase + 1;
        r.holdAt = r.startBase * L + 3;
      } else if (r.forcedTo !== null) {
        r.target = r.forcedTo;
      } else {
        r.target = r.startBase;
      }
    }

    // défense
    const react = this.defense.human ? 0.08 : this.diff.aiReaction;
    for (const f of this.defense.fielders) {
      f.reaction = react;
      f.hasBall = false;
      f.rig.setHoldingBall(false);
      f.rig.setPose('stand');
      f.speedMul = this.defense.human ? 1 : this.diff.aiFielderSpeedMul;
    }
    this.holder = null;
    this.throwInfo = null;
    this.chaser = null;
    this.recomputeT = 0;
    this.runsThisPlay = [];
    this.outsThisPlay = 0;
    this.settleT = 0;
    this.liveT = 0;
    this.sprint = 0;
    if (this.turcauDefends && c.launch > 45 && c.exitSpeed < 75) this.catcher.rig.showMask(false);
    this.setPhase('live');
  }

  private dropBat(rig: CartoonRig) {
    rig.showBat(false);
    rig.setPose('stand');
    const p = project(BATTER_SPOT.x, BATTER_SPOT.y);
    const g = this.add.graphics();
    g.fillStyle(0xd9a35b, 1);
    g.fillRoundedRect(-2, -30, 5, 32, 2);
    g.lineStyle(2.5, 0x141414, 1);
    g.strokeRoundedRect(-2, -30, 5, 32, 2);
    g.setPosition(p.x + 8, p.y - 30);
    g.setDepth(p.y + 1);
    this.tweens.add({ targets: g, x: p.x - 18, y: p.y - 4, rotation: -1.4, duration: 380, ease: 'Quad.Out' });
    this.tweens.add({ targets: g, alpha: 0, delay: 1400, duration: 400, onComplete: () => g.destroy() });
  }

  // ================================================================ jeu en cours
  private updateLive(dt: number) {
    this.liveT += dt;
    this.samplesAge += dt;
    const D = this.defense;
    const b = this.ball;

    // sprint : taper sur les flèches fait courir plus vite
    this.updateSprint(dt);
    const boost = 1 + CONTROLS.sprintMax * this.sprint;
    if (this.offense.human) for (const r of this.runners) r.boost = boost;

    // entrées de l'attaque humaine
    if (this.offense.human && b.state !== 'homerun') {
      if (this.inp.advance) {
        advanceAll(this.runners);
        Sound.play('click');
      }
      if (this.inp.retreat) {
        retreatAll(this.runners);
        Sound.play('click');
      }
    }
    if (b.state === 'homerun' && (this.inp.swing || this.swingQueue.length) && this.hrBallT > 1.2) {
      // passer le tour des buts
      for (const r of this.runners) if (!r.out && !r.scored) r.d = 4 * L - 0.5;
    }

    // balle
    if (b.state === 'batted' || b.state === 'thrown' || b.state === 'loose' || b.state === 'homerun') {
      this.prev = { x: b.sim.x, y: b.sim.y, z: b.sim.z };
      const sub = 3;
      for (let i = 0; i < sub; i++) {
        const ev = stepBall(b.sim, dt / sub);
        if (b.state === 'homerun') continue;
        if (ev.homerun && b.state === 'batted' && this.fair !== 'foul') {
          this.homeRun();
          break;
        }
        if (ev.fence) Sound.play('glove', 0.5);
        if (ev.wallFoul && b.state === 'batted' && this.fair === 'pending') {
          this.fair = 'foul';
          this.foulBall();
          return;
        }
        if (ev.bounce) this.onBounce();
        if (this.phase !== 'live') return;
      }
      if (b.state === 'homerun') this.hrBallT += dt;
    }
    if (this.throwInfo) this.throwInfo.t += dt;
    if (this.ignoreCatch) {
      this.ignoreCatch.t -= dt;
      if (this.ignoreCatch.t <= 0) this.ignoreCatch = null;
    }

    // frappe plus loin que la moitié du champ : effet de bande dessinée « GROSSE TORCHE ! »
    if (!this.torcheShown && (b.state === 'batted' || b.state === 'homerun') && this.fair !== 'foul') {
      if (Math.hypot(b.sim.x, b.sim.y) > FIELD.fenceRadius * 0.5 && isFairPosition(b.sim.x, b.sim.y)) {
        this.torcheShown = true;
        this.hud('hud-torche');
        Sound.play('crowd', 0.9);
        Sound.play('whoosh');
      }
    }

    // bonne ou fausse balle (balle au sol avant les buts)
    if (b.state === 'batted' && this.fair === 'pending' && b.sim.bounced) {
      const r = Math.hypot(b.sim.x, b.sim.y);
      if (r > 52 || b.groundSpeed() < 3 || b.sim.y < -1) {
        this.fair = isFairPosition(b.sim.x, b.sim.y) ? 'fair' : 'foul';
        if (this.fair === 'foul') return this.foulBall();
      }
    }

    // poursuite
    if (b.state === 'batted' || b.state === 'loose') {
      this.recomputeT -= dt;
      if (this.recomputeT <= 0) {
        this.recomputeT = 0.22;
        this.recomputeChase();
      }
    }

    // déplacement des défenseures
    for (const f of D.fielders) {
      if (b.state === 'homerun') {
        f.setTarget(f.x, f.y);
        continue;
      }
      if (D.human && f === this.controlled) {
        if (f.recoverT > 0) {
          f.recoverT -= dt;
          continue;
        }
        // OK pendant la poursuite = plongeon (portée du gant plus grande)
        const loose = b.state === 'batted' || b.state === 'loose' || b.state === 'thrown';
        if (this.inp.swing && !f.hasBall && loose && f.diveT <= 0) {
          this.inp.swing = false;
          this.swingQueue = [];
          f.diveT = CONTROLS.diveTime;
          f.reaction = 0;
          f.rig.play('slide', CONTROLS.diveTime + CONTROLS.diveRecover);
          Sound.play('slide');
          this.dust(f.x, f.y, 1.3);
        }
        const toT = Math.hypot(f.tx - f.x, f.ty - f.y);
        if (f.diveT > 0) {
          f.diveT -= dt;
          // le plongeon part vers la balle
          if (toT > 0.3) f.step(dt, f.tx - f.x, f.ty - f.y, 1.6);
          if (f.diveT <= 0) f.recoverT = CONTROLS.diveRecover;
          continue;
        }
        const mv = this.controls.moveVector();
        if (mv.x || mv.y) {
          f.reaction = 0;
          if (!f.hasBall && toT > 1.5) {
            // sprint guidé : la joueuse garde le cap vers la balle, les flèches l'accélèrent
            const ml = Math.hypot(mv.x, mv.y);
            f.step(dt, (0.7 * (f.tx - f.x)) / toT + (0.3 * mv.x) / ml, (0.7 * (f.ty - f.y)) / toT + (0.3 * mv.y) / ml, boost);
          } else f.moveDir(dt, mv.x, mv.y, boost);
          f.x = clamp(f.x, -190, 190);
          f.y = clamp(f.y, -20, FIELD.fenceRadius - 2);
        } else if (this.diff.assist > 0) f.moveToward(dt, this.diff.assist);
      } else f.moveToward(dt);
    }

    // attraper la balle
    if (b.state === 'batted' || b.state === 'thrown' || b.state === 'loose') {
      for (const f of D.fielders) {
        if (this.ignoreCatch && this.ignoreCatch.f === f) continue;
        if (b.sim.z > f.reachZ + (f.diveT > 0 ? 1.5 : 0)) continue;
        const sd = segDist(f.x, f.y, this.prev.x, this.prev.y, b.sim.x, b.sim.y);
        if (sd.d <= f.reach(CONTROLS.diveReach)) {
          const diving = f.diveT > 0;
          if (this.tryCatch(f)) {
            if (diving && this.ball.state === 'held') this.popup('PLONGEON !', '#7dff7a', 56);
            break;
          }
        }
      }
    }
    if (this.phase !== 'live') return;

    // décisions de la porteuse de balle
    const h = this.holder;
    if (h && b.state === 'held') {
      if (D.human && h === this.controlled) {
        this.holdT += dt;
        if (this.inp.base) this.throwTo(h, this.inp.base);
        else if (this.inp.swing || this.swingQueue.length || this.holdT > CONTROLS.autoThrowDelay) {
          this.holdT = 0;
          this.humanThrow(h);
        }
      } else {
        h.decideT -= dt;
        if (h.decideT <= 0) this.aiHolderDecide(h);
      }
    }

    // retraits (forcé ou touché)
    if (h && b.state === 'held') this.checkOuts(h);
    if (this.phase !== 'live') return;

    this.updateRunners(dt);
    if (this.phase !== 'live') return;

    // fin du jeu
    const active = this.runners.filter((r) => !r.out && !r.scored);
    const allSettled = active.every((r) => r.settled);
    if (b.state === 'homerun') {
      if (active.length === 0) this.endPlay();
    } else if (allSettled && b.state === 'held') {
      this.settleT += dt;
      if (this.settleT > (this.offense.human ? 0.85 : 0.45)) this.endPlay();
    } else this.settleT = 0;
    if (this.liveT > 25) this.endPlay();
  }

  private onBounce() {
    const b = this.ball;
    if (b.state === 'thrown') {
      // lancer raté : la balle est libre
      b.state = 'loose';
      this.throwInfo = null;
      this.recomputeT = 0;
      return;
    }
    if (b.state !== 'batted' || !this.flyAlive) return;
    this.flyAlive = false;
    const r = Math.hypot(b.sim.x, b.sim.y);
    if (this.fair === 'pending' && r > 52) {
      this.fair = isFairPosition(b.sim.x, b.sim.y) ? 'fair' : 'foul';
      if (this.fair === 'foul') return this.foulBall();
    }
    this.releaseHolds();
  }

  /** La balle touche le sol (ou est échappée) : les coureuses en attente décident. */
  private releaseHolds() {
    for (const rr of this.runners) {
      if (rr.holdAt === null || rr.out) continue;
      rr.holdAt = null;
      if (rr.forcedTo !== null) continue;
      const eta = this.etaTo(rr.target);
      const tRun = rr.timeTo(rr.target);
      if (tRun + 0.3 > eta) rr.target = rr.startBase;
    }
  }

  private recomputeChase() {
    const b = this.ball;
    const D = this.defense;
    this.samples = predict(b.sim);
    this.samplesAge = 0;
    let best: Fielder | null = null;
    let bestT = Infinity;
    let bestPt = { x: b.sim.x, y: b.sim.y };
    for (const f of D.fielders) {
      if (f.hasBall) continue;
      const i = intercept(f, this.samples, Math.max(0, f.reaction));
      if (f.pos === 'C' && Math.hypot(i.x, i.y) > 40) continue;
      if (i.t < bestT) {
        bestT = i.t;
        best = f;
        bestPt = { x: i.x, y: i.y };
      }
    }
    if (!best) return;
    this.chaser = best;
    best.setTarget(bestPt.x, bestPt.y);
    assignDefense(D.fielders, best, bestPt.x, bestPt.y);
    if (D.human && this.controlled !== best) this.setControlled(best);
  }

  private setControlled(f: Fielder | null) {
    if (this.controlled) this.controlled.rig.setSelected(false);
    this.controlled = f;
    if (f && this.defense.human) f.rig.setSelected(true);
  }

  private tryCatch(f: Fielder): boolean {
    const b = this.ball;
    const wasBatted = b.state === 'batted';
    const wasThrown = b.state === 'thrown';
    // petite chance d'échapper une balle difficile (plus faible avec une bonne défensive)
    const sp = b.speed();
    const defStat = stat.catching(f.def);
    // un ballon attrapé en pleine course est plus difficile : c'est plus amusant quand il y a des coups sûrs
    const running = Math.hypot(f.tx - f.x, f.ty - f.y) > 1.5 || dist(f.x, f.y, b.sim.x, b.sim.y) > f.catchR * 0.6;
    const base = wasThrown ? 0.015 : this.flyAlive ? 0.09 + (running ? 0.1 : 0) : 0.11 * (sp / 85);
    const err = base * ((11 - defStat) / 5);
    if (!wasThrown && chance(err)) {
      if (wasBatted && this.fair === 'pending') {
        this.fair = isFairPosition(b.sim.x, b.sim.y) ? 'fair' : 'foul';
        if (this.fair === 'foul') {
          this.foulBall();
          return true;
        }
      }
      b.state = 'loose';
      this.releaseHolds();
      b.setVel(-b.sim.vx * 0.25 + rand(-8, 8), -b.sim.vy * 0.25 + rand(-8, 8), Math.abs(b.sim.vz) * 0.3 + 4);
      this.flyAlive = false;
      this.ignoreCatch = { f, t: 0.45 };
      f.rig.play('flinch');
      f.rig.say('!', '#ff9f43', 0.6);
      Sound.play('glove', 0.5);
      this.recomputeT = 0;
      return false;
    }
    if (wasBatted && this.fair === 'pending' && b.sim.bounced) {
      this.fair = isFairPosition(b.sim.x, b.sim.y) ? 'fair' : 'foul';
      if (this.fair === 'foul') {
        this.foulBall();
        return true;
      }
    }
    // prise de possession
    b.state = 'held';
    b.setVel(0, 0, 0);
    this.holder = f;
    f.hasBall = true;
    f.rig.setHoldingBall(true);
    f.rig.play('catch');
    f.task = 'hold';
    f.setTarget(f.x, f.y);
    f.reaction = 0;
    Sound.play('glove');
    this.throwInfo = null;
    this.chaser = null;
    f.decideT = this.defense.human ? 0 : rand(0.1, 0.2) + this.diff.aiReaction * 0.4;
    this.holdT = 0;
    assignDefense(this.defense.fielders, null, f.x, f.y);
    if (this.defense.human) this.setControlled(f);

    if (wasBatted && this.flyAlive) this.flyOut(f);
    return true;
  }

  private flyOut(f: Fielder) {
    this.flyAlive = false;
    const br = this.batterRunner;
    this.stats.line(f.def).catches++;
    this.popup('ATTRAPÉ !', '#ff5d5d', 62);
    if (f.def.kind === 'dog') f.rig.wag(1.2);
    for (const r of this.runners) {
      if (r === br || r.out) continue;
      r.holdAt = null;
      r.forcedTo = null;
      r.target = r.startBase;
      r.manual = false;
    }
    if (br) this.makeOut(br, f, false);
  }

  private checkOuts(h: Fielder) {
    for (let k = 1; k <= 4; k++) {
      const b = BASES[k % 4];
      if (dist(h.x, h.y, b.x, b.y) > 3.0) continue;
      for (const r of [...this.runners]) {
        if (outable(r, k)) this.makeOut(r, h, r.forcedTo === k || r.delay > 0);
        if (this.phase !== 'live') return;
      }
    }
    for (const r of [...this.runners]) {
      if (r.out || r.scored || r.onBase !== -1 || r.delay > 0) continue;
      const p = r.pos;
      if (dist(h.x, h.y, p.x, p.y) <= 3.2) {
        this.makeOut(r, h, false);
        if (this.phase !== 'live') return;
      }
    }
  }

  private makeOut(r: Runner, f: Fielder, forced: boolean) {
    if (r.out) return;
    r.out = true;
    this.outs++;
    this.outsThisPlay++;
    this.stats.line(f.def).putouts++;
    if (this.turcauDefends) this.defOutsTurcau++;
    removeForcesAhead(this.runners, r);
    this.popup('RETRAIT !', '#ff5d5d', 60);
    Sound.play('out');
    r.rig.setExpression('sad');
    r.rig.play('sad');
    r.leave(this.offense === this.home ? DUGOUT_HOME : DUGOUT_AWAY);
    this.runners = this.runners.filter((x) => x !== r);
    this.leaving.push(r);
    if (this.turcauDefends) {
      f.rig.play('celebrate', 0.7);
      if (f.def.kind === 'dog') f.rig.wag(1.2);
      if (this.outs >= 3) {
        this.field.cheer(0.4);
        if (!Stadium.play('cheer', { dur: 4 })) Sound.play('applause', 0.5);
      }
    }
    if (this.outs >= RULES.outsPerHalf) {
      // un point marqué pendant un jeu qui finit par un retrait forcé ne compte pas
      const forceThird = forced || (r.isBatter && r.lastBase < 1);
      if (forceThird && this.runsThisPlay.length) {
        for (const s of this.runsThisPlay) {
          this.offense.score--;
          this.offense.line[this.inning - 1]--;
          this.runsHalf--;
          this.stats.line(s.def).runs--;
          if (this.playBatter) this.stats.line(this.playBatter).rbi--;
        }
        this.runsThisPlay = [];
        this.popup('LE POINT NE COMPTE PAS', '#ffffff', 40);
      }
      this.endPlay();
    }
  }

  // ---------------------------------------------------------------- lancers des défenseures
  private humanThrow(h: Fielder) {
    const c = chooseThrow(h, this.defense.fielders, this.runners);
    if (c) {
      const b = BASES[c.base % 4];
      if (dist(h.x, h.y, b.x, b.y) < 3) return;
      return this.throwTo(h, c.base);
    }
    const k = containThrow(h, this.runners);
    if (k !== null) return this.throwTo(h, k);
    if (h.pos !== 'P') this.throwTo(h, 0);
  }

  private aiHolderDecide(h: Fielder) {
    const c = chooseThrow(h, this.defense.fielders, this.runners);
    if (c) {
      if (c.run) {
        const s = coverSpot(c.base);
        h.setTarget(s.x, s.y);
        h.decideT = 0.25;
      } else this.throwTo(h, c.base);
      return;
    }
    const k = containThrow(h, this.runners);
    if (k !== null) return this.throwTo(h, k);
    const moving = this.runners.some((r) => !r.out && !r.scored && !r.settled);
    if (!moving && dist(h.x, h.y, MOUND.x, MOUND.y) > 70 && h.pos !== 'P') {
      this.throwTo(h, 0);
      return;
    }
    h.decideT = 0.2;
  }

  /** Lancer vers un but (1-4) ou vers le lanceur (0). */
  private throwTo(h: Fielder, base: number) {
    const D = this.defense;
    const spot = base === 0 ? { x: MOUND.x, y: MOUND.y - 1 } : coverSpot(base);
    let rec: Fielder | undefined = base === 0 ? this.fielder('P') : coverOf(D.fielders, base);
    if (!rec || rec === h) {
      if (dist(h.x, h.y, spot.x, spot.y) < 3) return;
      if (rec === h) {
        h.setTarget(spot.x, spot.y);
        return;
      }
      rec = D.fielders.filter((f) => f !== h).sort((a, b2) => dist(a.x, a.y, spot.x, spot.y) - dist(b2.x, b2.y, spot.x, spot.y))[0];
      rec.task = 'cover';
      rec.coverBase = base;
      rec.setTarget(spot.x, spot.y);
    }
    // de temps en temps, un lancer est imprécis (plus souvent de loin)
    const d0 = dist(h.x, h.y, spot.x, spot.y);
    const wild = base !== 0 && chance(0.03 + d0 / 3000);
    const aim = wild ? { x: spot.x + rand(-14, 14), y: spot.y + rand(-14, 14) } : spot;
    const d = dist(h.x, h.y, aim.x, aim.y);
    const T = Math.max(0.22, d / h.throwSpeed);
    const z0 = 5;
    const z1 = 4.3;
    const vz = (z1 - z0 + (PHYSICS.gravity * T * T) / 2) / T;
    const b = this.ball;
    b.state = 'thrown';
    b.setPos(h.x, h.y, z0);
    b.setVel((aim.x - h.x) / T, (aim.y - h.y) / T, vz);
    b.sim.bounced = false;
    this.prev = { x: h.x, y: h.y, z: z0 };
    h.hasBall = false;
    h.rig.setHoldingBall(false);
    h.rig.play('throw');
    h.task = 'backup';
    Sound.play('throw');
    this.holder = null;
    this.ignoreCatch = { f: h, t: 0.3 };
    this.throwInfo = { base, receiver: rec, T, t: 0 };
    if (D.human) this.setControlled(rec);
  }

  // ---------------------------------------------------------------- coureuses
  private etaTo(k: number): number {
    if (k > 4) return Infinity;
    const b = BASES[k % 4];
    const h = this.holder;
    if (this.ball.state === 'homerun') return Infinity;
    if (this.ball.state === 'held' && h) return ballTimeToBase(h, this.defense.fielders, k).t + 0.2;
    if (this.ball.state === 'thrown' && this.throwInfo) {
      const ti = this.throwInfo;
      const rem = Math.max(0, ti.T - ti.t);
      if (ti.base === k) return rem;
      const s = ti.base === 0 ? MOUND : coverSpot(ti.base);
      return rem + 0.35 + dist(s.x, s.y, b.x, b.y) / 75;
    }
    const c = this.chaser;
    if (c && this.samples.length) {
      const i = intercept(c, this.samples, Math.max(0, c.reaction));
      return Math.max(0, i.t - this.samplesAge) + 0.35 + dist(i.x, i.y, b.x, b.y) / c.throwSpeed;
    }
    return 3;
  }

  private updateRunners(dt: number) {
    this.dustT -= dt;
    const makeDust = this.dustT <= 0;
    if (makeDust) this.dustT = 0.16;
    for (const r of [...this.runners]) {
      r.step(dt);
      if (r.out || r.scored) continue;
      // poussière de sprint
      if (makeDust && !r.settled && r.delay <= 0) {
        const p = r.pos;
        this.dust(p.x, p.y, 0.6);
      }
      // glissade sur un jeu serré
      const toGo = Math.abs(r.target * L - r.d);
      if (r.sliding <= 0 && toGo < 7 && toGo > 1 && r.target > r.lastBase - 1 && this.phase === 'live' && this.ball.state !== 'homerun') {
        const k = r.target;
        const bb = BASES[k % 4];
        const close =
          (this.throwInfo && this.throwInfo.base === k) || (this.holder && dist(this.holder.x, this.holder.y, bb.x, bb.y) < 22);
        if (close) {
          r.sliding = 0.6;
          r.rig.play('slide');
          Sound.play('slide');
          this.dust(bb.x, bb.y, 1.4);
        }
      }
      if (r.target === 4 && r.d >= 4 * L - 0.01) {
        this.scoreRun(r);
        if (this.phase !== 'live' && this.phase !== 'walk') return;
        continue;
      }
      if (r.onBase === r.target && r.delay <= 0) {
        if (r.forcedTo === r.target) r.forcedTo = null;
        if (!r.manual && this.phase === 'live' && this.ball.state !== 'homerun' && r.holdAt === null) {
          let margin = this.offense.human ? 0.55 : this.diff.aiRunnerMargin;
          if (this.outs === 2) margin -= 0.15;
          if (shouldAdvance(r, this.runners, this.etaTo(r.target + 1), margin)) r.target++;
        }
      }
    }
  }

  private scoreRun(r: Runner) {
    r.scored = true;
    const O = this.offense;
    O.score++;
    O.line[this.inning - 1] = (O.line[this.inning - 1] ?? 0) + 1;
    this.runsHalf++;
    this.stats.line(r.def).runs++;
    if (this.playBatter) this.stats.line(this.playBatter).rbi++;
    this.runsThisPlay.push(r);
    this.runners = this.runners.filter((x) => x !== r);
    this.leaving.push(r);
    r.rig.play('celebrate');
    r.rig.setExpression('happy');
    r.leave(O === this.home ? DUGOUT_HOME : DUGOUT_AWAY, 2.6);
    this.field.updateBoard(this.home.score, this.away.score, this.inning, this.top);
    if (this.ball.state !== 'homerun') {
      this.popup('+1 POINT !', O.human ? '#7dff7a' : '#ff9f43', 58);
      Sound.play('run');
      if (O.human) Stadium.play('kidsCheer');
    }
    if (O.human) this.field.cheer(0.5);
    else if (this.turcauDefends) this.pitcher.rig.setExpression('sad');
    if (this.phase === 'live') {
      const limit = RULES.runLimitPerHalf > 0 && this.runsHalf >= RULES.runLimitPerHalf;
      if ((limit || this.isWalkoff()) && this.ball.state !== 'homerun') this.endPlay();
      if (this.isWalkoff() && this.ball.state !== 'homerun') this.popup('VICTOIRE AU DERNIER TOUR !', '#7dff7a', 56);
    }
  }

  private homeRun() {
    const b = this.ball;
    b.state = 'homerun';
    this.fair = 'fair';
    this.hrBallT = 0;
    for (const r of this.runners) {
      r.holdAt = null;
      r.forcedTo = null;
      r.target = 4;
      r.trot = true;
      r.manual = true;
      r.delay = Math.min(r.delay, 0.3);
    }
    if (this.playBatter) this.stats.hit(this.playBatter, 4);
    this.offense.hits++;
    this.batterRunner?.rig.play('celebrate', 1.5);
    this.popup('CIRCUIT !!!', '#ffd23f', 110, 'Appuie sur ESPACE (ou OK) pour accélérer');
    if (this.offense.human && Stadium.play('chargeLong')) Stadium.play('bigCheer');
    else Sound.play('homerun');
    this.field.cheer(1);
    this.hud('hud-confetti', this.offense.human);
    this.cameras.main.shake(260, 0.006);
    if (this.offense.human && Stadium.failed('chargeLong')) this.time.delayedCall(1300, () => Sound.play('charge'));
    if (this.turcauDefends) {
      this.pitcher.rig.play('sad');
      this.pitcher.rig.setExpression('embarrassed');
      this.pitcher.rig.sweat();
      this.catcher.rig.play('shakeHead');
    }
    for (const f of this.defense.fielders) {
      f.setTarget(f.x, f.y);
      if (f.pos === 'LF' || f.pos === 'RF') f.rig.setExpression('surprised');
    }
    this.batterRunner = null; // le coup sûr est déjà compté
  }

  private foulBall() {
    const b = this.ball;
    b.state = 'dead';
    Sound.play('foul');
    this.popup('FAUSSE BALLE', '#ffffff', 52);
    if (this.strikes < 2) this.strikes++;
    if (this.playBatter) this.stats.line(this.playBatter).ab--;
    const br = this.batterRunner;
    if (br) {
      this.runners = this.runners.filter((r) => r !== br);
      this.batterRig = br.rig;
      br.rig.setPose('bat');
      br.rig.showBat(true);
      br.rig.setView('front');
      br.rig.facing = 1;
      this.batterRunner = null;
    }
    for (const r of this.runners) {
      r.d = r.startBase * L;
      r.target = r.startBase;
      r.lastBase = r.startBase;
      r.holdAt = null;
      r.forcedTo = null;
    }
    for (const f of this.defense.fielders) {
      f.hasBall = false;
      f.rig.setHoldingBall(false);
      f.task = 'idle';
      f.setTarget(f.homeX, f.homeY);
    }
    this.setControlled(null);
    this.holder = null;
    this.deadNext = 'pitch';
    this.setPhase('dead', 0.9);
  }

  private endPlay() {
    if (this.phase !== 'live') return;
    this.deadNext = 'batter';
    const br = this.batterRunner;
    if (br && !br.out && this.fair !== 'foul') {
      const bases = br.scored ? 4 : br.lastBase;
      if (this.outsThisPlay === 0 && bases >= 1) {
        this.stats.hit(br.def, bases);
        this.offense.hits++;
        const labels = ['', 'SIMPLE !', 'DOUBLE !', 'TRIPLE !', 'CIRCUIT À L’INTÉRIEUR DU TERRAIN !'];
        this.popup(labels[bases], '#ffd23f', bases === 4 ? 46 : 64);
        if (this.offense.human) {
          this.field.cheer(0.3 + bases * 0.15);
          br.rig.play('celebrate', 0.8);
          // vraie fanfare d'orgue si elle est disponible, sinon les sons synthétisés
          if (!Stadium.play(bases >= 2 ? 'chargeLong' : 'chargeShort')) {
            Sound.play('applause', 0.4 + bases * 0.15);
            if (bases >= 2) this.time.delayedCall(500, () => Sound.play('charge'));
          }
        }
      } else if (bases >= 1) {
        this.popup('CHOIX DE LA DÉFENSIVE', '#ffffff', 40);
      }
    }
    for (const r of this.runners) {
      r.holdAt = null;
      r.manual = false;
      r.trot = false;
    }
    for (const f of this.defense.fielders) {
      f.task = 'idle';
      f.setTarget(f.homeX, f.homeY);
    }
    this.setControlled(null);
    this.batterRunner = null;
    this.setPhase('dead', PACE.afterPlay);
    // la balle revient au lanceur
    const h = this.holder;
    if (h && h !== this.pitcher && this.ball.state === 'held') this.startReturn(h, this.pitcher, 0.35, false);
  }

  // ================================================================ retour de balle au lanceur
  private startReturn(from: Fielder, to: Fielder, delay: number, wag: boolean) {
    this.retAnim = { from, to, t: -delay, T: 0.45, wag, started: false };
  }

  private updateReturn(dt: number) {
    const a = this.retAnim;
    if (!a) return;
    a.t += dt;
    if (a.t < 0) return;
    if (!a.started) {
      a.started = true;
      a.from.hasBall = false;
      a.from.rig.setHoldingBall(false);
      a.from.rig.play('throw');
    }
    const u = Math.min(1, a.t / a.T);
    const x = lerp(a.from.x, a.to.x, u);
    const y = lerp(a.from.y, a.to.y, u);
    this.ball.setPos(x, y, 5 + Math.sin(Math.PI * u) * 7);
    if (u >= 1) this.finishReturn();
  }

  private finishReturn() {
    const a = this.retAnim;
    if (!a) return;
    this.retAnim = null;
    a.from.hasBall = false;
    a.from.rig.setHoldingBall(false);
    a.to.hasBall = true;
    a.to.rig.setHoldingBall(true);
    a.to.rig.play('catch');
    if (a.started) Sound.play('glove', 0.4);
    if (a.wag) {
      a.to.rig.wag(1.2);
      Sound.play('wag');
    }
    if (this.phase !== 'live') {
      this.holder = a.to;
      this.ball.state = 'held';
    }
  }

  // ================================================================ rendu
  private updateBatterRig(dt: number) {
    const r = this.batterRig;
    if (!r) return;
    const s = project(BATTER_SPOT.x, BATTER_SPOT.y);
    r.setPosition(s.x, s.y);
    r.applyScale(s.s);
    r.setDepth(s.y);
    r.setMotion(0, 0, 0);
    r.tick(dt);
  }

  private updateLeaving(dt: number) {
    for (const r of [...this.leaving]) {
      if (!r.exiting) {
        r.leave(this.offense === this.home ? DUGOUT_HOME : DUGOUT_AWAY);
      }
      r.step(dt);
      if (r.exiting && r.exiting.t <= 0) {
        r.destroy();
        this.leaving = this.leaving.filter((x) => x !== r);
      }
    }
  }

  private updateBallVisual(dt: number) {
    const b = this.ball;
    const inFlight = b.state === 'pitch' || b.state === 'batted' || b.state === 'thrown' || b.state === 'loose';
    const hrVisible = b.state === 'homerun' && this.hrBallT < 1.6;
    const vis = inFlight || hrVisible || (this.retAnim !== null && this.retAnim.started);
    b.setVisible(vis);
    if (vis) b.render();
    if (this.pitchLabelT > 0) this.pitchLabelT -= dt;
  }

  private dust(x: number, y: number, size: number) {
    const p = project(x, y);
    const g = this.add.graphics();
    g.fillStyle(0xe8c9a0, 0.8);
    g.fillCircle(0, 0, 6 * size);
    g.lineStyle(2, 0x8a6a4a, 0.5);
    g.strokeCircle(0, 0, 6 * size);
    g.setPosition(p.x + rand(-6, 6), p.y + rand(-2, 2));
    g.setDepth(p.y - 2);
    this.tweens.add({ targets: g, scale: 2.2, alpha: 0, y: p.y - 8, duration: 420, onComplete: () => g.destroy() });
  }

  private updateSprint(dt: number) {
    const c = this.controls;
    let taps = 0;
    for (const a of ['up', 'down', 'left', 'right'] as const) if (c.justDown(a)) taps++;
    const held = c.isDown('up') || c.isDown('down') || c.isDown('left') || c.isDown('right');
    this.sprint = Math.min(1, this.sprint + taps * CONTROLS.sprintPerTap);
    this.sprint = Math.max(held ? CONTROLS.sprintHold : 0, this.sprint - dt * CONTROLS.sprintDecay);
    if (this.sprint > 0.6 && taps) {
      // poussière de sprint
      const who = this.offense.human ? this.runners.find((r) => !r.settled) : this.controlled;
      if (who) {
        const p = who instanceof Runner ? who.pos : { x: who.x, y: who.y };
        this.dust(p.x, p.y, 0.8);
      }
    }
  }

  private drawMeter() {
    const g = this.meter;
    g.clear();
    const on = this.phase === 'aim';
    this.meterText.setVisible(on);
    if (!on) return;
    const s = project(MOUND.x, MOUND.y, 0);
    const w = 260;
    const h = 30;
    const x = s.x - w / 2;
    const y = s.y - 150;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + 4, y + 5, w, h, 12);
    g.fillStyle(0xff5d5d, 1);
    g.fillRoundedRect(x, y, w, h, 12);
    g.fillStyle(0xffe14d, 1);
    g.fillRect(x + w * 0.26, y, w * 0.48, h);
    g.fillStyle(0x7dff7a, 1);
    g.fillRect(x + w * 0.4, y, w * 0.2, h);
    g.lineStyle(5, 0x111111, 1);
    g.strokeRoundedRect(x, y, w, h, 12);
    const nx = x + this.meterPos * w;
    g.fillStyle(0xffffff, 1);
    g.fillRect(nx - 4, y - 10, 8, h + 20);
    g.lineStyle(3, 0x111111, 1);
    g.strokeRect(nx - 4, y - 10, 8, h + 20);
    this.meterText.setPosition(s.x, y - 30).setText('OK dans le vert !');
  }

  private drawOverlay() {
    this.drawMeter();
    const g = this.overlay;
    g.clear();
    // anneau de timing (aide à la frappe)
    if (this.phase === 'pitch' && this.offense.human && Save.settings.timingAid && this.plan) {
      const t = this.gameTime - this.pitchStart;
      const rem = this.plan.path.T - t;
      if (rem > -0.1) {
        const p = project(0, 0.5);
        const r = 8 + Math.max(0, rem) * 75;
        const near = Math.abs(rem) < this.winHuman.good / 1000;
        g.lineStyle(5, near ? 0x7dff7a : 0xffffff, near ? 1 : 0.75);
        g.strokeEllipse(p.x, p.y, r * 2, r * 0.8);
        g.lineStyle(3, 0xffe14d, 0.9);
        g.strokeEllipse(p.x, p.y, 20, 8);
      }
    }
    // point de chute prévu d'un ballon
    const b = this.ball;
    if ((b.state === 'batted' || b.state === 'loose') && b.sim.z > 6 && this.samples.length) {
      const land = this.samples.find((s) => s.t > this.samplesAge && s.z <= 0.01);
      if (land) {
        const p = project(land.x, land.y);
        const pulse = 1 + Math.sin(this.gameTime * 10) * 0.12;
        g.lineStyle(3, 0xffe14d, 0.85);
        g.strokeEllipse(p.x, p.y, 34 * p.s * pulse, 12 * p.s * pulse);
        g.lineStyle(2, 0x141414, 0.6);
        g.strokeEllipse(p.x, p.y, 40 * p.s * pulse, 15 * p.s * pulse);
      }
    }
    // buts proposés quand la joueuse contrôlée tient la balle
    const showBases = this.phase === 'live' && this.defense.human && this.holder && this.holder === this.controlled;
    let bestBase = 0;
    if (showBases) {
      const c = chooseThrow(this.holder!, this.defense.fielders, this.runners);
      bestBase = c ? c.base : 0;
    }
    for (let k = 1; k <= 4; k++) {
      const lbl = this.baseLabels[k - 1];
      lbl.setVisible(!!showBases);
      if (!showBases) continue;
      const bb = BASES[k % 4];
      const p = project(bb.x, bb.y);
      const best = k === bestBase;
      lbl.setColor(best ? '#7dff7a' : '#ffe14d');
      lbl.setScale(best ? 1.3 + Math.sin(this.gameTime * 12) * 0.1 : 1);
      if (best) {
        g.lineStyle(4, 0x7dff7a, 0.9);
        g.strokeEllipse(p.x, p.y, 46, 18);
      }
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    let tz = 1;
    let tx = 960;
    let ty = 540;
    const b = this.ball;
    if (this.phase === 'live' && (b.state === 'batted' || b.state === 'loose' || b.state === 'homerun')) {
      const far = Math.hypot(b.sim.x, b.sim.y);
      if (b.sim.z > 18 || far > 120) {
        const s = b.screen();
        tz = 1.12;
        tx = lerp(960, s.x, 0.45);
        ty = lerp(540, s.y, 0.45);
      }
    } else if (this.phase === 'pitch' || this.phase === 'windup') {
      tz = 1.06;
      tx = 960;
      ty = 640;
    }
    const k = Math.min(1, dt * 2.2);
    this.cam.zoom += (tz - this.cam.zoom) * k;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    cam.setZoom(this.cam.zoom);
    cam.centerOn(this.cam.x, this.cam.y);
    cam.setBounds(0, 0, 1920, 1080);
  }

  private hudCache = '';
  private emitHud(_dt: number) {
    const O = this.offense;
    const D = this.defense;
    const bases = [1, 2, 3].map((k) => this.runners.some((r) => !r.out && !r.scored && r.onBase === k && r.target === k));
    let hint = '';
    if (O.human) {
      if (this.phase === 'live') hint = this.touch ? 'Tape vite sur SPRINT pour courir plus vite !' : 'Tape vite sur les FLÈCHES pour courir plus vite !';
      else if (this.phase === 'pitch' || this.phase === 'windup' || this.phase === 'sign') hint = 'ESPACE ou OK : frapper quand la balle arrive au marbre';
    } else {
      if (this.phase === 'live') {
        if (this.holder && this.holder === this.controlled) hint = 'ESPACE ou OK : lancer !';
        else hint = this.touch ? 'SPRINT : courir plus vite   ·   touche l’écran : plonger !' : 'FLÈCHES : sprint vers la balle   ·   OK : plonger !';
      } else if (this.phase === 'aim') hint = 'ESPACE ou OK quand l’aiguille est dans le VERT : super lancer !';
      else if (this.phase === 'pitch' || this.phase === 'windup' || this.phase === 'sign') hint = `${stat.shortName(this.pitcher.def)} lance… prépare-toi !`;
    }
    const batter = this.batterDef;
    const st: HudState = {
      homeName: this.home.cfg.short,
      awayName: this.away.cfg.short,
      homeColor: this.home.cfg.colors.primary,
      awayColor: this.away.cfg.colors.primary,
      homeScore: this.home.score,
      awayScore: this.away.score,
      inning: this.inning,
      innings: this.innings,
      top: this.top,
      outs: Math.min(3, this.outs),
      balls: this.balls,
      strikes: this.strikes,
      bases,
      batter: batter ? `${stat.shortName(batter)}  #${batter.number}` : '',
      pitcher: stat.shortName(D.fielders.find((f) => f.pos === 'P')!.def),
      offenseHuman: O.human,
      hint,
      pitchLabel: this.pitchLabelT > 0 && this.plan ? this.plan.label : '',
      sprint: this.phase === 'live' && this.ball.state !== 'homerun' ? Math.round(this.sprint * 10) / 10 : -1,
      muted: Save.settings.muted,
    };
    const key = JSON.stringify(st);
    if (key !== this.hudCache) {
      this.hudCache = key;
      this.hud('hud-state', st);
    }
  }

  // ================================================================ fin de partie
  private gameOver() {
    if (this.gameOverQueued) return;
    this.gameOverQueued = true;
    this.setPhase('over');
    const h = this.home.score;
    const a = this.away.score;
    const result: GameSummary['result'] = h > a ? 'win' : h < a ? 'loss' : 'tie';
    const ids = rosterOf(this.home.cfg).map((c) => c.id);
    const mvp = this.stats.mvp(ids);
    const hr = this.stats.sum(ids, 'hr');
    const k = this.stats.sum(ids, 'k');
    const rec = Save.records();
    rec.gamesPlayed++;
    if (result === 'win') rec.wins++;
    else if (result === 'loss') rec.losses++;
    else rec.ties++;
    rec.bestScore = Math.max(rec.bestScore, h);
    rec.bestMargin = Math.max(rec.bestMargin, h - a);
    rec.mostHomeRunsGame = Math.max(rec.mostHomeRunsGame, hr);
    Save.saveRecords(rec);
    this.stats.commit(ids, mvp ? mvp.def.id : null);
    const summary: GameSummary = {
      home: h,
      away: a,
      homeName: this.home.cfg.short,
      awayName: this.away.cfg.short,
      homeId: this.home.cfg.id,
      result,
      mvpId: mvp ? mvp.def.id : null,
      mvpText: mvp ? GameStats.describe(mvp.line, mvp.def.kind === 'dog' && mvp.def.role === 'pitcher') : '',
      hits: this.home.hits,
      homeRuns: hr,
      outsMade: this.defOutsTurcau,
      strikeouts: k,
      lineHome: this.home.line,
      lineAway: this.away.line,
    };
    this.popup('FIN DE LA PARTIE', '#ffffff', 72);
    if (result === 'win') {
      if (!Stadium.play('bigCheer')) Sound.play('cheer');
      Stadium.play('organWrigley');
      this.field.cheer(1);
    }
    this.time.delayedCall(2200, () => {
      Sound.gameAudio(false);
      this.scene.stop('Hud');
      this.scene.start('Result', summary);
    });
  }
}
