import Phaser from 'phaser';
import { DIFFICULTY, type DifficultySettings } from '../config/gameConfig';
import { ALL_TEAMS, rosterOf, stat, teamById, type CharacterDef, type TeamConfig } from '../config/teams';
import { CartoonRig, lookFor } from '../entities/CartoonRig';
import { Sound } from '../audio/Sound';
import { Stadium } from '../audio/Stadium';
import { Save } from '../systems/Save';
import { Controls } from '../input/Controls';
import { CourtRenderer } from '../volley/CourtRenderer';
import { COURT, ROT_SPOTS, VDIG_HELP, VPHYS, VRULES, VTIMING, VVIEW, vMoveSpeed } from '../volley/VolleyConfig';
import { vproject } from '../volley/VolleyProjection';
import { bakeTexture, bakedImage } from '../util/bake';
import { chance, clamp, dist, gauss, rand } from '../util/math';
import { isTouch } from '../util/device';
import { onTvBack } from '../ui/ui';
import type { VHudState } from './HudScene';
import type { GameSummary } from './GameScene';

type SideId = 'L' | 'R';
type Kind = 'receive' | 'set' | 'attack';
type Phase = 'intro' | 'serveAim' | 'serveWait' | 'rally' | 'point' | 'over';

const G = VPHYS.g;

/** Une joueuse sur le terrain de volleyball. */
class VPlayer {
  def: CharacterDef;
  side: SideId;
  rig: CartoonRig;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  /** multiplicateur de vitesse pendant une course vers la balle (1 = normal) */
  rush = 1;
  private lastSx = 0;
  private lastSy = 0;

  constructor(scene: Phaser.Scene, def: CharacterDef, team: TeamConfig, side: SideId, x: number, y: number) {
    this.def = def;
    this.side = side;
    this.rig = new CartoonRig(scene, lookFor(def, team, { volley: true }));
    scene.add.existing(this.rig);
    this.rig.baseScale = VVIEW.charScale * (stat.height(def) / 66);
    this.rig.setPose('ready');
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.speed = vMoveSpeed(stat.speed(def));
  }

  setTarget(x: number, y: number) {
    this.tx = x;
    this.ty = y;
  }

  move(dt: number, mul = 1) {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const st = this.speed * this.rush * mul * dt;
    if (d <= st) {
      this.x = this.tx;
      this.y = this.ty;
    } else {
      this.x += (dx / d) * st;
      this.y += (dy / d) * st;
    }
  }

  sync(dt: number) {
    const s = vproject(this.x, this.y, 0);
    const vx = dt > 0 ? (s.x - this.lastSx) / dt : 0;
    const vy = dt > 0 ? (s.y - this.lastSy) / dt : 0;
    this.lastSx = s.x;
    this.lastSy = s.y;
    const l = Math.hypot(vx, vy) || 1;
    const sp = Math.hypot(vx, vy) / (VVIEW.pxX * s.s);
    this.rig.setMotion(sp, vx / l, vy / l);
    if (sp < 0.3) {
      // au repos : face au filet
      this.rig.facing = this.side === 'L' ? 1 : -1;
      this.rig.setView('front');
    }
    this.rig.setPosition(s.x, s.y);
    this.rig.applyScale(s.s);
    this.rig.setDepth(s.y);
    this.rig.tick(dt);
  }

  destroy() {
    this.rig.destroy();
  }
}

interface VLine {
  points: number;
  kills: number;
  aces: number;
  blocks: number;
  digs: number;
  sets: number;
}

interface Side {
  id: SideId;
  cfg: TeamConfig;
  human: boolean;
  dir: -1 | 1; // signe des x de son demi-terrain
  court: VPlayer[]; // index 0..5 = positions 1..6
  bench: CharacterDef[];
  score: number;
  sets: number;
  setScores: number[];
  touches: number;
  lastToucher: VPlayer | null;
}

interface Pending {
  kind: Kind;
  side: Side;
  player: VPlayer;
  time: number;
  at: { x: number; y: number; z: number };
  dive: boolean;
  incoming: number; // difficulté de la balle reçue (0 à 1)
  smash?: boolean; // la balle reçue vient d'un smash
}

export class VolleyScene extends Phaser.Scene {
  constructor() {
    super('Volley');
  }

  private diff!: DifficultySettings;
  private L!: Side;
  private R!: Side;
  private serving!: Side;
  private court!: CourtRenderer;
  private controls!: Controls;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private phaseDur = 0;
  private gameTime = 0;
  private perfAnchor = 0;
  private presses: number[] = [];
  private pointerTap = false;
  private wantPause = false;
  private ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, live: false };
  private ballImg!: Phaser.GameObjects.Image;
  private shadowImg!: Phaser.GameObjects.Image;
  private pending: Pending | null = null;
  private block: { side: Side; player: VPlayer; time: number; press: number | null } | null = null;
  private lastSide: Side | null = null;
  private attackInfo: { side: Side; player: VPlayer; q: number } | null = null;
  private serveInfo: { side: Side; player: VPlayer } | null = null;
  private setQ = 0.7;
  private timers: { at: number; fn: () => void }[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private meterPos = 0;
  private target = 21;
  private setsToWin = 1;
  private setNo = 1;
  private stats = new Map<string, VLine>();
  private hudCache = '';
  private touch = false;
  private crossSign = 0;

  // ================================================================ création
  create() {
    const s = Save.settings;
    this.diff = DIFFICULTY[s.difficulty];
    this.target = s.volleyPoints;
    this.setsToWin = s.volleySets === 3 ? 2 : 1;
    this.setNo = 1;
    this.gameTime = 0;
    this.phase = 'intro';
    this.pending = null;
    this.block = null;
    this.timers = [];
    this.stats = new Map();
    this.hudCache = '';
    this.presses = [];
    this.pointerTap = false;
    this.wantPause = false;
    this.lastSide = null;
    this.attackInfo = null;
    this.serveInfo = null;
    this.touch = isTouch();

    const mine = teamById(s.myTeam);
    let opp = teamById(s.opponent);
    if (opp.id === mine.id) opp = ALL_TEAMS.find((t) => t.id !== mine.id)!;
    this.court = new CourtRenderer(this, mine, opp);
    this.L = this.makeSide('L', mine, true);
    this.R = this.makeSide('R', opp, false);
    this.serving = this.L;

    // balle et ombre
    const BB: [number, number, number, number] = [-12, -12, 12, 12];
    bakeTexture(this, 'vball', BB, 3, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, 10);
      g.fillStyle(0xffd23f, 1);
      g.slice(0, 0, 10, -2.2, -1.0, false);
      g.fillPath();
      g.fillStyle(0x2d6cdf, 1);
      g.slice(0, 0, 10, 0.2, 1.4, false);
      g.fillPath();
      g.lineStyle(1.6, 0x141414, 0.8);
      g.beginPath();
      g.arc(-14, 0, 13, -0.75, 0.75);
      g.strokePath();
      g.beginPath();
      g.arc(14, 0, 13, Math.PI - 0.75, Math.PI + 0.75);
      g.strokePath();
      g.lineStyle(2.6, 0x141414, 1);
      g.strokeCircle(0, 0, 10);
    });
    bakeTexture(this, 'vshadow', [-14, -6, 14, 6], 2, (g) => {
      g.fillStyle(0x000000, 0.32);
      g.fillEllipse(0, 0, 24, 9);
    });
    this.shadowImg = bakedImage(this, 'vshadow', [-14, -6, 14, 6], 2, 0, 0).setDepth(-400);
    this.ballImg = bakedImage(this, 'vball', BB, 3, 0, 0).setDepth(3000);
    this.overlay = this.add.graphics().setDepth(2900);
    this.meter = this.add.graphics().setDepth(2950);

    // entrées : ESPACE / ENTRÉE / clic, avec l'heure exacte de l'appui
    this.controls = new Controls(this);
    const action = (stamp: number) => this.presses.push(this.gameTime + (stamp - this.perfAnchor) / 1000);
    this.input.keyboard!.on('keydown-SPACE', (e: KeyboardEvent) => action(e.timeStamp));
    this.input.keyboard!.on('keydown-ENTER', (e: KeyboardEvent) => action(e.timeStamp));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      action(p.event.timeStamp);
      this.pointerTap = true;
    });
    onTvBack(this, () => {
      if (!this.scene.isPaused()) this.wantPause = true;
    });
    this.events.off('resume');
    this.events.on('resume', () => {
      this.input.keyboard!.resetKeys();
      this.presses = [];
    });
    this.events.once('shutdown', () => {
      Sound.gameAudio(false);
      this.input.keyboard!.removeAllListeners();
    });

    this.registry.set('hudMode', 'volley');
    this.scene.launch('Hud');
    this.scene.bringToTop('Hud');
    Sound.gameAudio(true);
    this.setPhase('intro', 0.4);
  }

  private makeSide(id: SideId, cfg: TeamConfig, human: boolean): Side {
    // pas de chiens au volleyball ; les 6 premières sont sur le terrain, les autres en réserve
    const players = rosterOf(cfg).filter((c) => c.kind !== 'dog');
    const side: Side = {
      id,
      cfg,
      human,
      dir: id === 'L' ? -1 : 1,
      court: [],
      bench: players.slice(6),
      score: 0,
      sets: 0,
      setScores: [],
      touches: 0,
      lastToucher: null,
    };
    side.court = players.slice(0, 6).map((def, i) => {
      const s = this.spot(side, i + 1);
      return new VPlayer(this, def, cfg, id, s.x, s.y);
    });
    return side;
  }

  /** Position de rotation (1 à 6) dans le demi-terrain d'une équipe. */
  private spot(side: Side, pos: number) {
    const s = ROT_SPOTS[pos];
    return side.id === 'L' ? { x: s.x, y: s.y } : { x: -s.x, y: COURT.width - s.y };
  }

  private other(side: Side) {
    return side === this.L ? this.R : this.L;
  }

  private line(def: CharacterDef): VLine {
    let l = this.stats.get(def.id);
    if (!l) {
      l = { points: 0, kills: 0, aces: 0, blocks: 0, digs: 0, sets: 0 };
      this.stats.set(def.id, l);
    }
    return l;
  }

  private setPhase(p: Phase, dur = 0) {
    this.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
  }

  private hud(ev: string, data?: unknown) {
    this.game.events.emit(ev, data);
  }

  private at(delay: number, fn: () => void) {
    this.timers.push({ at: this.gameTime + delay, fn });
  }

  // ================================================================ balle
  private launch(tx: number, ty: number, tz: number, T: number) {
    const b = this.ball;
    b.vx = (tx - b.x) / T;
    b.vy = (ty - b.y) / T;
    b.vz = (tz - b.z + 0.5 * G * T * T) / T;
    b.live = true;
    this.crossSign = Math.sign(b.x) || this.crossSign;
  }

  /** Allonge le temps de vol jusqu'à ce que la balle passe au-dessus du filet (marge en mètres). */
  private clearNet(tx: number, tz: number, T: number, margin = 0.3) {
    const b = this.ball;
    if (Math.sign(tx) === Math.sign(b.x)) return T;
    for (let i = 0; i < 14; i++) {
      const vz = (tz - b.z + 0.5 * G * T * T) / T;
      const tn = T * (Math.abs(b.x) / (Math.abs(b.x) + Math.abs(tx)));
      const zn = b.z + vz * tn - 0.5 * G * tn * tn;
      if (zn > COURT.netH + margin) break;
      T *= 1.1;
    }
    return T;
  }

  private posAt(t: number) {
    const b = this.ball;
    return { x: b.x + b.vx * t, y: b.y + b.vy * t, z: b.z + b.vz * t - 0.5 * G * t * t };
  }

  /** Temps (s) avant que la balle descende à la hauteur zc. */
  private timeToZ(zc: number): number | null {
    const b = this.ball;
    const disc = b.vz * b.vz + 2 * G * (b.z - zc);
    if (disc < 0) return null;
    return (b.vz + Math.sqrt(disc)) / G;
  }

  // ================================================================ boucle
  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    const c = this.controls;
    const pressedKey = c.justDown('swing') || this.pointerTap;
    this.pointerTap = false;
    if (c.justDown('pause') || this.wantPause) {
      this.wantPause = false;
      if (this.phase !== 'over') {
        this.hud('hud-pause', true);
        this.scene.pause();
        return;
      }
    }
    if (c.justDown('mute')) {
      Save.updateSettings({ muted: !Save.settings.muted });
      const st = Save.settings;
      Sound.setVolumes(st.musicVolume, st.sfxVolume, st.muted);
    }
    this.gameTime += dt;
    this.perfAnchor = performance.now();
    this.phaseT += dt;

    // événements programmés (élan du smash, saut du bloc…)
    if (this.timers.length) {
      const due = this.timers.filter((tm) => tm.at <= this.gameTime);
      this.timers = this.timers.filter((tm) => tm.at > this.gameTime);
      for (const tm of due) tm.fn();
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= this.phaseDur) this.startSet();
        break;
      case 'serveAim':
        this.updateServeAim(pressedKey);
        break;
      case 'serveWait':
        if (this.phaseT >= this.phaseDur) this.doServe(this.aiServeQuality());
        break;
      case 'rally':
        this.updateRally(dt);
        break;
      case 'point':
        if (this.ball.live) this.stepBall(dt, false);
        if (this.phaseT >= this.phaseDur) this.afterPoint();
        break;
      case 'over':
        break;
    }
    this.presses = [];

    for (const side of [this.L, this.R]) {
      for (const p of side.court) {
        p.move(dt);
        p.sync(dt);
      }
    }
    this.renderBall();
    this.drawOverlay();
    this.emitHud();
  }

  // ================================================================ sets et service
  private startSet() {
    this.L.score = 0;
    this.R.score = 0;
    this.hud('hud-banner', {
      title: `SET ${this.setNo}`,
      sub: `${this.target} points  ·  ${this.L.cfg.name} contre ${this.R.cfg.name}`,
      color: '#ffd23f',
    });
    Sound.play('whistle');
    this.at(1.6, () => this.startServe());
    this.setPhase('point', 99);
  }

  private startServe() {
    const S = this.serving;
    const server = S.court[0];
    this.pending = null;
    this.block = null;
    this.attackInfo = null;
    this.ball.live = false;
    this.L.touches = 0;
    this.R.touches = 0;
    this.L.lastToucher = null;
    this.R.lastToucher = null;
    // tout le monde à sa place ; la serveuse derrière la ligne de fond
    for (const side of [this.L, this.R]) side.court.forEach((p, i) => {
      const s = this.spot(side, i + 1);
      p.setTarget(s.x, s.y);
    });
    const sx = S.dir * 9.8;
    const sy = S.id === 'L' ? 1.6 : COURT.width - 1.6;
    server.setTarget(sx, sy);
    server.x = sx;
    server.y = sy;
    this.ball.x = sx + -S.dir * 0.3;
    this.ball.y = sy;
    this.ball.z = 1.1;
    if (S.human) this.setPhase('serveAim', 3.5);
    else this.setPhase('serveWait', 1.1);
  }

  private updateServeAim(pressed: boolean) {
    const period = 1.15;
    const u = (this.phaseT / period) % 1;
    this.meterPos = u < 0.5 ? u * 2 : 2 - u * 2;
    if (pressed || this.phaseT >= this.phaseDur) {
      const off = Math.abs(this.meterPos - 0.5);
      let q = 0.6;
      if (pressed) {
        if (off < 0.1) {
          q = 1;
          this.hud('hud-popup', { text: 'SERVICE PUISSANT !', color: '#7dff7a', size: 50 });
        } else if (off < 0.24) q = 0.78;
        else q = 0.45;
      }
      this.doServe(q);
    }
  }

  private aiServeQuality() {
    const sv = this.serving.court[0].def;
    const adj = this.diff.label === 'Facile' ? -0.12 : this.diff.label === 'Difficile' ? 0.06 : 0;
    return clamp(gauss(0.55 + stat.power(sv) * 0.03 + adj, 0.15), 0.1, 1);
  }

  private doServe(q: number) {
    const S = this.serving;
    const O = this.other(S);
    const server = S.court[0];
    server.rig.play('serve');
    Sound.play('spike', 0.6);
    this.serveInfo = { side: S, player: server };
    this.lastSide = S;
    S.touches = 1;
    S.lastToucher = server;
    this.ball.z = 2.7;
    // faute de service (rare) : dans le filet
    const faultChance = S.human ? (q < 0.5 ? 0.25 : 0.02) : 0.05;
    let tx: number;
    let ty: number;
    let tz = 0;
    if (chance(faultChance)) {
      tx = O.dir * 0.4;
      ty = rand(2, 7);
      tz = 1.3;
    } else {
      tx = O.dir * rand(3.5, 8.3);
      ty = rand(0.8, COURT.width - 0.8);
    }
    let T = 1.75 - 0.55 * q;
    if (tz === 0) T = this.clearNet(tx, 0, T, 0.25 + (1 - q) * 0.5);
    this.launch(tx, ty, tz, T);
    this.setPhase('rally');
    this.at(0.05, () => this.planReceive(O, q * 0.85));
  }

  // ================================================================ échange
  private updateRally(dt: number) {
    this.stepBall(dt, true);
    if (this.phase !== 'rally') return;

    // contact prévu
    const pd = this.pending;
    if (pd) {
      if (pd.side.human) {
        const win = VTIMING.ok / 1000;
        for (const t of this.presses) {
          const delta = (t - pd.time) * 1000;
          if (Math.abs(delta) <= VTIMING.ok) {
            this.hud('hud-timing', { text: this.timingLabel(delta), color: Math.abs(delta) <= VTIMING.perfect ? '#7dff7a' : '#ffe14d' });
            this.resolve(pd, this.timingQuality(delta));
            break;
          } else if (delta < -VTIMING.ok) {
            this.hud('hud-timing', { text: 'TROP TÔT', color: '#ff9f43' });
          }
        }
        // sans appui : une touche faible automatique, au plus tard juste avant que la balle touche le sol
        const b = this.ball;
        const landsNow = b.vz < 0 && b.z + b.vz * dt * 1.5 <= 0.05;
        if (this.pending === pd && (this.gameTime > pd.time + win || landsNow)) {
          this.resolve(pd, null);
        }
      } else if (this.gameTime >= pd.time) {
        this.resolve(pd, null);
      }
    }
    // bloc de l'équipe du joueur : on garde le dernier appui avant le smash
    if (this.block && this.block.side.human) {
      for (const t of this.presses) if (t <= this.block.time + 0.05) this.block.press = t;
    }
  }

  /** Avance la balle ; gère le filet et le sol. */
  private stepBall(dt: number, rules: boolean) {
    const b = this.ball;
    if (!b.live) return;
    const prevX = b.x;
    b.vz -= G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (rules && Math.sign(prevX) !== Math.sign(b.x) && prevX !== 0) {
      // la balle traverse le plan du filet
      const toward = b.x > 0 ? this.R : this.L;
      if (b.z < COURT.netH + 0.11 || b.y < -0.25 || b.y > COURT.width + 0.25) {
        // dans le filet (ou à côté des antennes) : faute de l'équipe qui a touché en dernier
        b.vx = -b.vx * 0.15;
        b.vy *= 0.3;
        b.vz = Math.min(b.vz, 0);
        b.x = prevX;
        Sound.play('glove', 0.5);
        const loser = this.lastSide ?? this.other(toward);
        this.awardPoint(this.other(loser), b.z < COURT.netH + 0.11 ? 'FILET !' : 'DEHORS !');
        return;
      }
      toward.touches = 0;
      toward.lastToucher = null;
    }
    if (b.z <= 0) {
      b.z = 0;
      b.live = false;
      Sound.play('bump', 0.7);
      if (rules) this.onLand();
    }
  }

  private onLand() {
    const b = this.ball;
    const inside = Math.abs(b.x) <= COURT.half + 0.05 && b.y >= -0.05 && b.y <= COURT.width + 0.05;
    this.pending = null;
    if (inside) {
      const landSide = b.x < 0 ? this.L : this.R;
      const winner = this.other(landSide);
      if (this.attackInfo && this.attackInfo.side === winner) {
        // smash gagnant
        const a = this.attackInfo.player;
        this.line(a.def).kills++;
        const phrase = a.def.kind === 'girl' ? a.def.hitPhrase : undefined;
        if (phrase) this.hud('hud-comic', { text: phrase });
        this.awardPoint(winner, 'SMASH !');
      } else if (this.serveInfo && this.serveInfo.side === winner && landSide.touches === 0) {
        this.line(this.serveInfo.player.def).aces++;
        this.awardPoint(winner, 'ACE !');
      } else this.awardPoint(winner, 'POINT !');
    } else {
      const loser = this.lastSide ?? this.serving;
      this.awardPoint(this.other(loser), 'DEHORS !');
    }
  }

  /** Qui va chercher la balle qui arrive dans le demi-terrain de side ? */
  private planReceive(side: Side, incoming: number, smash = false) {
    if (this.phase !== 'rally' || !this.ball.live) return;
    // l'équipe du joueur touche la balle plus haut : un appui un peu en retard arrive encore avant le sol
    const tc = this.timeToZ(side.human ? VDIG_HELP.contactZ : 0.9);
    if (tc === null) return;
    const p = this.posAt(tc);
    if (p.x * side.dir < 0.2) return; // pas encore de ce côté
    // balle qui va sortir : on la laisse tomber
    const tl = this.timeToZ(0) ?? tc;
    const land = this.posAt(tl);
    const out = Math.abs(land.x) > COURT.half + 0.3 || land.y < -0.3 || land.y > COURT.width + 0.3;
    if (out) return;
    // l'équipe du joueur a de l'aide : réaction, course et plongeon
    const help = side.human;
    const rush = help ? VDIG_HELP.rush : 1;
    for (const pl of side.court) pl.rush = 1;
    let best: VPlayer | null = null;
    let bestNeed = Infinity;
    for (const pl of side.court) {
      if (pl === side.lastToucher) continue;
      const need = dist(pl.x, pl.y, p.x, p.y) / (pl.speed * rush) + (help ? VDIG_HELP.reaction : 0.15);
      if (need < bestNeed) {
        bestNeed = need;
        best = pl;
      }
    }
    if (!best) return;
    best.rush = rush;
    let dive = false;
    if (bestNeed > tc + 0.05) {
      // plongeon : un peu plus de portée
      if (dist(best.x, best.y, p.x, p.y) - (help ? VDIG_HELP.diveReach : 1.8) <= best.speed * rush * tc) dive = true;
      else {
        best.setTarget(p.x, p.y);
        return; // trop loin : la balle va tomber
      }
    }
    best.setTarget(p.x - side.dir * 0.15, p.y);
    this.pending = { kind: 'receive', side, player: best, time: this.gameTime + tc, at: p, dive, incoming, smash };
  }

  private timingLabel(deltaMs: number) {
    const a = Math.abs(deltaMs);
    if (a <= VTIMING.perfect) return 'PARFAIT !';
    if (a <= VTIMING.good) return deltaMs < 0 ? 'UN PEU TÔT' : 'UN PEU TARD';
    return deltaMs < 0 ? 'TÔT' : 'TARD';
  }

  private timingQuality(deltaMs: number) {
    const a = Math.abs(deltaMs);
    if (a <= VTIMING.perfect) return 1;
    if (a <= VTIMING.good) return 0.8;
    return 0.6;
  }

  private aiQuality(pl: VPlayer, kind: Kind, incoming: number) {
    const d = pl.def;
    const st = kind === 'attack' ? stat.power(d) : kind === 'set' ? (stat.defense(d) + stat.speed(d)) / 2 : stat.defense(d);
    const adj = this.diff.label === 'Facile' ? -0.1 : this.diff.label === 'Difficile' ? 0.06 : 0;
    return clamp(gauss(0.42 + st * 0.045 - incoming * 0.18 + adj, 0.16), 0.05, 1);
  }

  /** Exécute un contact (manchette, passe ou smash). */
  private resolve(pd: Pending, humanQ: number | null) {
    this.pending = null;
    const pl = pd.player;
    const side = pd.side;
    // la joueuse est à la balle
    if (dist(pl.x, pl.y, this.ball.x, this.ball.y) < 2.2) {
      pl.x = this.ball.x - side.dir * 0.15;
      pl.y = this.ball.y;
      pl.setTarget(pl.x, pl.y);
    }
    pl.rush = 1;
    let q: number;
    if (side.human) {
      q = humanQ ?? VDIG_HELP.autoQ * rand(0.7, 1.2);
      q *= 1 - pd.incoming * 0.1;
    } else q = this.aiQuality(pl, pd.kind, pd.incoming);
    if (pd.dive) q *= side.human ? VDIG_HELP.diveMul : 0.75;
    side.touches++;
    side.lastToucher = pl;
    this.lastSide = side;
    this.serveInfo = null;
    const b = this.ball;
    b.z = Math.max(b.z, pd.kind === 'attack' ? pd.at.z : 0.8);

    if (pd.kind === 'receive') {
      pl.rig.play(pd.dive ? 'slide' : 'bump', pd.dive ? 0.8 : undefined);
      Sound.play('bump');
      this.line(pl.def).digs++;
      this.attackInfo = null;
      const noPress = side.human && humanQ === null;
      const weakMiss = q < 0.25 ? (noPress ? VDIG_HELP.autoMiss : 0.4) : 0;
      // sans appui, un smash est souvent raté : la touche reste utile
      const smashMiss = noPress && pd.smash ? VDIG_HELP.smashAutoMiss : 0;
      if (chance(Math.max(weakMiss, smashMiss))) {
        // manchette ratée : la balle part hors du terrain
        this.hud('hud-popup', { text: 'OUPS !', color: '#ff9f43', size: 48 });
        this.launch(side.dir * rand(9.6, 11), rand(-1.5, COURT.width + 1.5), 0, 1.0);
        return;
      }
      if (q < 0.32 && chance(0.5)) {
        // la balle repasse directement de l'autre côté
        const O = this.other(side);
        const fx = O.dir * rand(2.5, 7.5);
        this.launch(fx, rand(1, 8), 0, this.clearNet(fx, 0, 1.6, 0.4));
        this.at(0.05, () => this.planReceive(O, 0.2));
        return;
      }
      this.planSet(side, pl, q);
    } else if (pd.kind === 'set') {
      pl.rig.play('set');
      Sound.play('setTouch');
      this.line(pl.def).sets++;
      this.planAttack(side, pl, q);
    } else {
      Sound.play('spike', 0.6 + 0.4 * q);
      this.doAttack(side, pl, q);
    }
  }

  private planSet(side: Side, passer: VPlayer, q: number) {
    let setter = side.court[1];
    if (setter === passer) setter = side.court[2];
    const tx = side.dir * (0.9 + (1 - q) * rand(0, 2));
    const ty = clamp(COURT.width / 2 + (1 - q) * rand(-2.6, 2.6), 1, COURT.width - 1);
    const T = 1.3 + (1 - q) * 0.3;
    this.launch(tx, ty, 2.4, T);
    setter.setTarget(tx + side.dir * 0.2, ty);
    this.pending = { kind: 'set', side, player: setter, time: this.gameTime + T, at: { x: tx, y: ty, z: 2.4 }, dive: false, incoming: 0 };
  }

  private planAttack(side: Side, setter: VPlayer, q: number) {
    this.setQ = q;
    const front = [side.court[1], side.court[2], side.court[3]].filter((p) => p !== setter);
    const attacker = front[Math.floor(Math.random() * front.length)];
    const lane = clamp(attacker.y + (1 - q) * rand(-1.5, 1.5), 0.7, COURT.width - 0.7);
    const cz = 2.75 + (stat.height(attacker.def) - 64) * 0.012;
    const cx = side.dir * 0.8;
    const T = 1.05 + (1 - q) * 0.3;
    this.launch(cx, lane, cz, T);
    // élan puis saut
    attacker.setTarget(side.dir * 2.6, lane);
    this.at(T - 0.6, () => attacker.setTarget(cx + side.dir * 0.1, lane));
    this.at(T - 0.32, () => attacker.rig.play('spike'));
    this.pending = { kind: 'attack', side, player: attacker, time: this.gameTime + T, at: { x: cx, y: lane, z: cz }, dive: false, incoming: 0 };
    // bloc adverse : la joueuse de l'avant la plus proche du couloir
    const O = this.other(side);
    const blockers = [O.court[1], O.court[2], O.court[3]];
    const blocker = blockers.reduce((a, c) => (Math.abs(c.y - lane) < Math.abs(a.y - lane) ? c : a));
    blocker.setTarget(O.dir * 0.55, lane);
    this.block = { side: O, player: blocker, time: this.gameTime + T, press: null };
    this.at(T - 0.28, () => blocker.rig.play('block'));
  }

  private doAttack(side: Side, attacker: VPlayer, q0: number) {
    const O = this.other(side);
    const q = q0 * (0.6 + 0.4 * this.setQ);
    const b = this.ball;
    // bloc ?
    const bl = this.block;
    this.block = null;
    if (bl && bl.side === O) {
      let chanceBlock: number;
      if (O.human) {
        if (bl.press === null) chanceBlock = 0.1;
        else {
          const d = Math.abs(bl.press - bl.time) * 1000;
          chanceBlock = d <= VTIMING.perfect ? 0.42 : d <= VTIMING.good ? 0.3 : d <= VTIMING.ok ? 0.18 : 0.06;
        }
      } else {
        const adj = this.diff.label === 'Facile' ? -0.05 : this.diff.label === 'Difficile' ? 0.05 : 0;
        // environ 1 smash sur 10 est bloqué par l'ordinateur
        chanceBlock = 0.08 + stat.defense(bl.player.def) * 0.012 + (stat.height(bl.player.def) - 64) * 0.006 - q * 0.12 + adj;
      }
      if (chance(clamp(chanceBlock, 0.03, 0.8))) {
        // BLOC : la balle retombe dans le camp de l'attaquante
        this.line(bl.player.def).blocks++;
        this.lastSide = O;
        this.attackInfo = null;
        b.x = side.dir * 0.25;
        b.z = 2.5;
        this.launch(side.dir * rand(0.8, 2.6), clamp(b.y + rand(-1, 1), 0.3, COURT.width - 0.3), 0, 0.5);
        Sound.play('spike', 0.8);
        this.hud('hud-popup', { text: 'BLOC !', color: '#7fd3ff', size: 64 });
        return;
      }
    }
    // cible : un endroit libre dans le camp adverse
    const aimY = this.controls.isDown('up') ? 1 : this.controls.isDown('down') ? -1 : 0;
    // contre l'équipe du joueur, l'ordinateur essaie moins d'endroits : il vise moins bien
    const tries = O.human ? VDIG_HELP.aimTries[this.diff.label] ?? 4 : 16;
    let best = { x: O.dir * 5, y: 4.5 };
    let bestScore = -Infinity;
    for (let i = 0; i < tries; i++) {
      const c = { x: O.dir * rand(2.2, 8.4), y: rand(0.6, COURT.width - 0.6) };
      let m = Infinity;
      for (const p of O.court) if (!bl || p !== bl.player) m = Math.min(m, dist(p.x, p.y, c.x, c.y));
      const score = m + (side.human ? aimY * (c.y - 4.5) * 0.6 : 0) + rand(0, 0.6);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    const v = (12.5 + stat.power(attacker.def) * 1.1) * (0.5 + 0.5 * q) * (O.human ? VDIG_HELP.spikeSpeedMul : 1);
    let T = Math.max(0.35, dist(b.x, b.y, best.x, best.y) / v);
    // la balle doit passer au-dessus du filet
    for (let i = 0; i < 12; i++) {
      const vz = (0 - b.z + 0.5 * G * T * T) / T;
      const tn = T * (Math.abs(b.x) / (Math.abs(b.x) + Math.abs(best.x)));
      const zn = b.z + vz * tn - 0.5 * G * tn * tn;
      if (zn > COURT.netH + 0.18) break;
      T *= 1.12;
    }
    this.launch(best.x, best.y, 0, T);
    this.attackInfo = { side, player: attacker, q };
    if (q > 0.85) this.court.cheer(0.25);
    this.at(0.03, () => this.planReceive(O, q, true));
  }

  // ================================================================ points
  private awardPoint(winner: Side, reason: string) {
    if (this.phase !== 'rally') return;
    this.pending = null;
    this.block = null;
    for (const p of [...this.L.court, ...this.R.court]) p.rush = 1;
    winner.score++;
    Sound.play('whistle');
    const human = winner.human;
    this.hud('hud-popup', { text: reason, color: human ? '#7dff7a' : '#ff9f43', size: 60, sub: `Point ${winner.cfg.short}` });
    if (human) {
      this.court.cheer(0.5);
      if (!Stadium.play('kidsCheer', { dur: 3 })) Sound.play('applause', 0.5);
      for (const p of winner.court) if (chance(0.5)) p.rig.play('celebrate', 0.8);
    } else Sound.play('crowd', 0.5);
    // changement de service : l'équipe qui gagne le point en recevant fait sa rotation
    if (winner !== this.serving) {
      this.rotate(winner);
      this.serving = winner;
    }
    this.setPhase('point', 1.7);
  }

  /** Rotation : 2→1, 3→2… et une remplaçante entre au service (tout le monde joue). */
  private rotate(side: Side) {
    side.court = [side.court[1], side.court[2], side.court[3], side.court[4], side.court[5], side.court[0]];
    if (side.bench.length) {
      const out = side.court[0];
      const def = side.bench.shift()!;
      side.bench.push(out.def);
      const np = new VPlayer(this, def, side.cfg, side.id, out.x, out.y);
      out.destroy();
      side.court[0] = np;
    }
  }

  private afterPoint() {
    const L = this.L.score;
    const R = this.R.score;
    const t = this.target;
    const done = ((L >= t || R >= t) && Math.abs(L - R) >= VRULES.winBy) || L >= VRULES.cap || R >= VRULES.cap;
    if (!done) {
      this.startServe();
      return;
    }
    const w = L > R ? this.L : this.R;
    w.sets++;
    this.L.setScores.push(L);
    this.R.setScores.push(R);
    if (w.sets >= this.setsToWin) return this.matchOver();
    this.setNo++;
    this.serving = this.other(w);
    this.hud('hud-popup', { text: `SET À ${w.cfg.short} !`, color: '#ffd23f', size: 64 });
    this.at(1.4, () => this.startSet());
    this.setPhase('point', 99);
  }

  private matchOver() {
    this.setPhase('over');
    const L = this.L;
    const R = this.R;
    const result: GameSummary['result'] = L.sets > R.sets ? 'win' : 'loss';
    const ids = rosterOf(L.cfg).filter((c) => c.kind !== 'dog');
    let best: CharacterDef | null = null;
    let bestScore = -1;
    for (const c of ids) {
      const l = this.stats.get(c.id);
      if (!l) continue;
      const sc = l.kills * 3 + l.aces * 3 + l.blocks * 3 + l.digs + l.sets * 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    const sum = (k: keyof VLine) => ids.reduce((a, c) => a + (this.stats.get(c.id)?.[k] ?? 0), 0);
    const bl = best ? this.stats.get(best.id)! : null;
    const mvpText = bl
      ? [
          bl.kills ? `${bl.kills} smash${bl.kills > 1 ? 's' : ''} gagnant${bl.kills > 1 ? 's' : ''}` : '',
          bl.aces ? `${bl.aces} ace${bl.aces > 1 ? 's' : ''}` : '',
          bl.blocks ? `${bl.blocks} bloc${bl.blocks > 1 ? 's' : ''}` : '',
          bl.digs ? `${bl.digs} réception${bl.digs > 1 ? 's' : ''}` : '',
          bl.sets ? `${bl.sets} passe${bl.sets > 1 ? 's' : ''}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
    const rec = Save.records();
    if (result === 'win') rec.volleyWins = (rec.volleyWins ?? 0) + 1;
    else rec.volleyLosses = (rec.volleyLosses ?? 0) + 1;
    Save.saveRecords(rec);
    const summary: GameSummary = {
      sport: 'volley',
      home: L.sets,
      away: R.sets,
      homeId: L.cfg.id,
      homeName: L.cfg.short,
      awayName: R.cfg.short,
      result,
      mvpId: best ? best.id : null,
      mvpText,
      hits: 0,
      homeRuns: 0,
      outsMade: 0,
      strikeouts: 0,
      lineHome: L.setScores,
      lineAway: R.setScores,
      statLines: [
        ['Points gagnés', L.setScores.reduce((a, b) => a + b, 0)],
        ['Smashs gagnants', sum('kills')],
        ['Aces', sum('aces')],
        ['Blocs', sum('blocks')],
      ],
    };
    this.hud('hud-popup', { text: 'FIN DU MATCH', color: '#ffffff', size: 72 });
    if (result === 'win') {
      this.court.cheer(1);
      if (!Stadium.play('bigCheer')) Sound.play('cheer');
      this.hud('hud-confetti', true);
    }
    this.time.delayedCall(2200, () => {
      Sound.gameAudio(false);
      this.scene.stop('Hud');
      this.scene.start('Result', summary);
    });
  }

  // ================================================================ rendu
  private renderBall() {
    const b = this.ball;
    const ground = vproject(b.x, b.y, 0);
    const air = vproject(b.x, b.y, b.z);
    const lift = Math.min(1, b.z / 8);
    this.shadowImg.setPosition(ground.x, ground.y);
    this.shadowImg.setScale((ground.s * (1 - lift * 0.4)) / 2);
    this.shadowImg.setAlpha(1 - lift * 0.5);
    this.ballImg.setPosition(air.x, air.y);
    this.ballImg.setScale((air.s * 1.15) / 3);
    this.ballImg.setRotation(this.ballImg.rotation + (b.live ? 0.25 : 0));
  }

  private drawOverlay() {
    const g = this.overlay;
    g.clear();
    // anneau de timing pour les touches de l'équipe du joueur
    const pd = this.pending;
    if (pd && pd.side.human && this.phase === 'rally') {
      const rem = pd.time - this.gameTime;
      if (rem < 1.4) {
        const p = vproject(pd.at.x, pd.at.y, pd.at.z);
        const r = 14 + Math.max(0, rem) * 90;
        const near = Math.abs(rem) < VTIMING.good / 1000;
        g.lineStyle(6, near ? 0x7dff7a : 0xffffff, near ? 1 : 0.8);
        g.strokeCircle(p.x, p.y, r);
        g.lineStyle(3, 0x111111, 0.7);
        g.strokeCircle(p.x, p.y, r + 4);
      }
    }
    // anneau du bloc
    const bl = this.block;
    if (bl && bl.side.human && this.phase === 'rally') {
      const rem = bl.time - this.gameTime;
      if (rem < 1.2 && rem > -0.1) {
        const p = vproject(bl.player.x, bl.player.y, 3.0);
        const r = 12 + Math.max(0, rem) * 80;
        const near = Math.abs(rem) < VTIMING.good / 1000;
        g.lineStyle(6, near ? 0x7fd3ff : 0xffffff, near ? 1 : 0.7);
        g.strokeCircle(p.x, p.y, r);
      }
    }
    // jauge de service
    const m = this.meter;
    m.clear();
    if (this.phase === 'serveAim') {
      const sv = this.serving.court[0];
      const s = vproject(sv.x, sv.y, 0);
      const w = 240;
      const h = 28;
      const x = clamp(s.x - w / 2, 20, 1920 - w - 20);
      const y = s.y - 230;
      m.fillStyle(0x000000, 0.35);
      m.fillRoundedRect(x + 4, y + 5, w, h, 12);
      m.fillStyle(0xff5d5d, 1);
      m.fillRoundedRect(x, y, w, h, 12);
      m.fillStyle(0xffe14d, 1);
      m.fillRect(x + w * 0.26, y, w * 0.48, h);
      m.fillStyle(0x7dff7a, 1);
      m.fillRect(x + w * 0.4, y, w * 0.2, h);
      m.lineStyle(5, 0x111111, 1);
      m.strokeRoundedRect(x, y, w, h, 12);
      const nx = x + this.meterPos * w;
      m.fillStyle(0xffffff, 1);
      m.fillRect(nx - 4, y - 10, 8, h + 20);
      m.lineStyle(3, 0x111111, 1);
      m.strokeRect(nx - 4, y - 10, 8, h + 20);
    }
  }

  private emitHud() {
    const pd = this.pending;
    const ok = this.touch ? 'Touche l’écran' : 'ESPACE ou OK';
    let hint = '';
    if (this.phase === 'serveAim') hint = `${ok} dans le VERT : service puissant !`;
    else if (this.phase === 'serveWait') hint = 'Prépare-toi à recevoir !';
    else if (this.phase === 'rally') {
      if (pd && pd.side.human) {
        const what = pd.kind === 'receive' ? 'MANCHETTE' : pd.kind === 'set' ? 'PASSE' : 'SMASH ! (FLÈCHES ↑↓ : viser)';
        hint = `${ok} quand la balle arrive dans l’anneau : ${what}`;
      } else if (this.block && this.block.side.human) hint = `${ok} au moment du smash : BLOC !`;
    }
    const st: VHudState = {
      left: { name: this.L.cfg.short, color: this.L.cfg.colors.primary, score: this.L.score, sets: this.L.sets },
      right: { name: this.R.cfg.short, color: this.R.cfg.colors.primary, score: this.R.score, sets: this.R.sets },
      serving: this.serving.id,
      server: stat.shortName(this.serving.court[0].def),
      setNo: this.setNo,
      target: this.target,
      setsToWin: this.setsToWin,
      hint,
      muted: Save.settings.muted,
    };
    const key = JSON.stringify(st);
    if (key !== this.hudCache) {
      this.hudCache = key;
      this.hud('hud-vstate', st);
    }
  }
}
