import { Sound } from '../audio/Sound';
import { DANCE } from './DanceConfig';
import { CHORD_NOTES, layoutOf, sectionAt, type Section, type Song } from './Songs';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Ev {
  t: number; // secondes depuis le début de la chanson
  play: (when: number) => void;
}

/**
 * Joue une chanson de danse avec Web Audio et donne l'horloge de la musique entendue.
 * Les notes sont programmées un peu à l'avance : le rythme reste exact même si l'image ralentit.
 */
export class BeatPlayer {
  readonly song: Song;
  readonly spb: number; // secondes par temps
  readonly length: number; // durée totale (s)
  readonly sections: Section[];
  private ctx: AudioContext | null;
  private noise: AudioBuffer | null;
  private out: GainNode | null = null;
  private events: Ev[] = [];
  private idx = 0;
  private start0 = 0; // temps de l'AudioContext au début de la chanson
  private offset = 0; // horloge entendue − performance.now() (filtrée)
  private offsetOk = false;
  private playing = false;
  private pausedAt = 0;

  constructor(song: Song) {
    this.song = song;
    this.ctx = Sound.ctx;
    this.noise = Sound.noiseBuffer;
    this.spb = 60 / song.bpm;
    const lay = layoutOf(song);
    this.sections = lay.sections;
    this.length = lay.totalBars * 4 * this.spb;
    this.build(lay.totalBars);
  }

  get ready() {
    return !!this.ctx;
  }

  get isPlaying() {
    return this.playing;
  }

  /** Démarre (ou redémarre) la chanson à la position at (s). */
  start(at = 0, lead = 0.12) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume();
    this.cut();
    const bus = Sound.musicBus(DANCE.musicBoost);
    if (!bus) return;
    // compresseur : le mélange sonne plus fort et plus « club », sans saturer
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.out = ctx.createGain();
    this.out.connect(comp);
    comp.connect(bus);
    this.start0 = ctx.currentTime + lead - at;
    this.idx = this.events.findIndex((e) => e.t >= at - 0.001);
    if (this.idx < 0) this.idx = this.events.length;
    this.playing = true;
    this.offsetOk = false;
    this.syncClock(); // l'horloge est juste dès le départ
  }

  /** Programme les sons des 0,3 prochaines secondes (à appeler à chaque image). */
  update() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const horizon = ctx.currentTime + 0.3;
    while (this.idx < this.events.length && this.start0 + this.events[this.idx].t < horizon) {
      const e = this.events[this.idx++];
      const when = Math.max(ctx.currentTime, this.start0 + e.t);
      e.play(when);
    }
    this.syncClock();
  }

  /** Horloge : temps de la musique au haut-parleur, lissé pour éviter les sauts. */
  private syncClock() {
    const ctx = this.ctx!;
    const now = performance.now() / 1000;
    let heard: number;
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) heard = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    else heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const off = heard - now;
    if (!this.offsetOk || Math.abs(off - this.offset) > 0.08) {
      this.offset = off;
      this.offsetOk = true;
    } else this.offset += (off - this.offset) * 0.05;
  }

  /** Position (s) de la musique entendue au moment performance.now() = stampMs. */
  timeAt(stampMs: number) {
    if (!this.playing) return this.pausedAt;
    return stampMs / 1000 + this.offset - this.start0 + DANCE.offsetMs / 1000;
  }

  /** Position (s) de la musique entendue maintenant. */
  now() {
    return this.timeAt(performance.now());
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.now();
    this.cut();
  }

  /** Reprend un peu avant l'endroit de la pause, pour avoir le temps de se replacer. */
  resume(rewind = 1.2) {
    this.start(Math.max(0, this.pausedAt - rewind), 0.15);
  }

  stop() {
    this.cut();
  }

  private cut() {
    this.playing = false;
    if (this.out) {
      const g = this.out;
      const ctx = this.ctx!;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      window.setTimeout(() => g.disconnect(), 120);
    }
    this.out = null;
  }

  // ================================================================ partition
  private build(totalBars: number) {
    const s = this.song;
    const step = this.spb / 4;
    const ev = this.events;
    const on = (str: string | undefined, i: number) => !!str && str[i] !== '.' && str[i] !== undefined;
    for (let bar = 0; bar < totalBars; bar++) {
      const sec = sectionAt(this.sections, bar);
      const inSec = bar - sec.startBar;
      const lastOfPhrase = inSec % 4 === 3;
      const chord = s.chords[bar % s.chords.length];
      const kick = lastOfPhrase && sec.kind === 'round' ? s.fill.kick : s.kick;
      const snare = lastOfPhrase && sec.kind === 'round' ? s.fill.snare : s.snare;
      const hat = lastOfPhrase && sec.kind === 'round' ? s.fill.hat : s.hat;
      // ce qui joue dans chaque partie
      const full = sec.kind === 'round' || (sec.kind === 'outro' && inSec === 0);
      const drums = full || (sec.kind === 'intro' && inSec === 1);
      const finalHit = sec.kind === 'outro' && inSec === 1;
      for (let i = 0; i < 16; i++) {
        const t = (bar * 16 + i) * step + (i % 2 === 1 ? s.swing * step : 0);
        const push = (play: (w: number) => void) => ev.push({ t, play });
        if (finalHit) {
          if (i === 0) {
            push((w) => {
              this.kick(w, 1);
              this.crash(w, 0.5);
              this.keys(w, chord.root, chord.type, 2.5, 0.16);
              this.bass(w, chord.root, 2, 0.4);
            });
          }
          continue;
        }
        if (drums && on(kick, i)) push((w) => this.kick(w, i === 0 ? 1 : 0.85));
        if (drums && on(snare, i)) push((w) => this.snare(w, 0.55));
        if (drums && on(s.clap, i)) push((w) => this.clap(w, 0.45));
        if (on(hat, i) && (drums || sec.kind === 'intro')) {
          const open = hat[i] === 'o';
          push((w) => this.hat(w, i % 4 === 0 ? 0.2 : 0.13, open));
        }
        if ((full || (sec.kind === 'intro' && inSec === 1)) && on(s.bass, i)) {
          const c = s.bass[i];
          const iv = c === '3' ? CHORD_NOTES[chord.type][1] : c === '5' ? 7 : c === '7' ? CHORD_NOTES[chord.type][3] % 12 : c === 'O' ? 12 : 0;
          // durée : jusqu'à la prochaine note de basse
          let len = 1;
          while (i + len < 16 && s.bass[i + len] === '.') len++;
          const dur = Math.min(len * step, s.bassType === '808' ? 6 * step : 3 * step);
          push((w) => this.bass(w, chord.root + iv, dur, 0.42));
        }
        if (on(s.keys, i)) {
          const dur = s.keysType === 'pad' ? 16 * step : s.keysType === 'rhodes' ? 6 * step : step * 0.9;
          push((w) => this.keys(w, chord.root, chord.type, dur, s.keysType === 'stab' ? 0.07 : 0.1));
        }
        // pause entre deux rounds : claps sur 2 et 4, montée de bruit, roulement
        if (sec.kind === 'break') {
          if (i === 4 || i === 12) push((w) => this.clap(w, 0.5));
          if (i % 4 === 0) push((w) => this.bass(w, chord.root, step * 2, 0.3));
          if (inSec === 1 && i === 0) push((w) => this.riser(w, 16 * step));
          if (inSec === 1 && i >= 12) push((w) => this.snare(w, 0.25 + (i - 12) * 0.1));
        }
        // klaxon au début de chaque round
        if (sec.kind === 'round' && inSec === 0 && i === 0) push((w) => {
          this.horn(w);
          this.crash(w, 0.4);
        });
      }
    }
    ev.sort((a, b) => a.t - b.t);
  }

  // ================================================================ instruments
  private gainEnv(w: number, peak: number, attack: number, decay: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), w + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, w + attack + decay);
    g.connect(this.out!);
    return g;
  }

  private noiseSrc(w: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // le bruit dure 2 s : en boucle pour les sons plus longs
    src.start(w, Math.random() * 1.5);
    src.stop(w + dur + 0.05);
    return src;
  }

  private kick(w: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, w);
    o.frequency.exponentialRampToValueAtTime(44, w + 0.12);
    const g = this.gainEnv(w, v, 0.003, 0.38);
    o.connect(g);
    o.start(w);
    o.stop(w + 0.45);
    // petit clic : la grosse caisse s'entend aussi sur le haut-parleur d'un téléphone
    const n = this.noiseSrc(w, 0.02);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    n.connect(f);
    f.connect(this.gainEnv(w, v * 0.25, 0.001, 0.015));
  }

  private snare(w: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const n = this.noiseSrc(w, 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.7;
    n.connect(f);
    f.connect(this.gainEnv(w, v, 0.002, 0.2));
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, w);
    o.frequency.exponentialRampToValueAtTime(160, w + 0.08);
    o.connect(this.gainEnv(w, v * 0.5, 0.002, 0.09));
    o.start(w);
    o.stop(w + 0.12);
  }

  private clap(w: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const n = this.noiseSrc(w, 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    // trois petites claques très rapprochées, puis la queue
    g.gain.setValueAtTime(v, w);
    g.gain.setValueAtTime(v * 0.2, w + 0.009);
    g.gain.setValueAtTime(v, w + 0.013);
    g.gain.setValueAtTime(v * 0.2, w + 0.022);
    g.gain.setValueAtTime(v, w + 0.026);
    g.gain.exponentialRampToValueAtTime(0.0001, w + 0.2);
    n.connect(f);
    f.connect(g);
    g.connect(this.out);
  }

  private hat(w: number, v: number, open: boolean) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const n = this.noiseSrc(w, open ? 0.3 : 0.06);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    n.connect(f);
    f.connect(this.gainEnv(w, v, 0.001, open ? 0.22 : 0.035));
  }

  private crash(w: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const n = this.noiseSrc(w, 1.6);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    n.connect(f);
    f.connect(this.gainEnv(w, v * 0.5, 0.002, 1.4));
  }

  private bass(w: number, midi: number, dur: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const type = this.song.bassType;
    const f0 = mtof(midi);
    const g = ctx.createGain();
    g.connect(this.out);
    if (type === '808') {
      // 808 : sinus grave et long, + harmonique pour les petits haut-parleurs
      g.gain.setValueAtTime(0.0001, w);
      g.gain.exponentialRampToValueAtTime(v * 1.2, w + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, w + dur + 0.4);
      for (const [mul, lvl, kind] of [
        [1, 1, 'sine'],
        [2, 0.35, 'triangle'],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = kind;
        o.frequency.setValueAtTime(f0 * mul * 1.25, w);
        o.frequency.exponentialRampToValueAtTime(f0 * mul, w + 0.06);
        const lg = ctx.createGain();
        lg.gain.value = lvl;
        o.connect(lg);
        lg.connect(g);
        o.start(w);
        o.stop(w + dur + 0.45);
      }
      return;
    }
    const o = ctx.createOscillator();
    o.type = type === 'slap' ? 'square' : 'sawtooth';
    o.frequency.value = f0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = type === 'slap' ? 6 : 3;
    const top = type === 'slap' ? 2200 : 900;
    f.frequency.setValueAtTime(top, w);
    f.frequency.exponentialRampToValueAtTime(type === 'slap' ? 300 : 220, w + Math.min(dur, 0.25));
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(v, w + 0.006);
    g.gain.exponentialRampToValueAtTime(v * 0.5, w + Math.min(dur, 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, w + dur + 0.05);
    o.connect(f);
    f.connect(g);
    o.start(w);
    o.stop(w + dur + 0.1);
  }

  private keys(w: number, root: number, type: keyof typeof CHORD_NOTES, dur: number, v: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const kind = this.song.keysType;
    // accord une ou deux octaves au-dessus de la basse
    const base = root + (root < 40 ? 24 : 12);
    for (const iv of CHORD_NOTES[type]) {
      const f0 = mtof(base + iv);
      if (kind === 'rhodes') {
        // piano électrique : sinus doux + petit son de cloche
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f0;
        o.connect(this.gainEnv(w, v, 0.004, dur + 0.6));
        o.start(w);
        o.stop(w + dur + 0.7);
        const b = ctx.createOscillator();
        b.type = 'sine';
        b.frequency.value = f0 * 2.01;
        b.connect(this.gainEnv(w, v * 0.3, 0.002, 0.4));
        b.start(w);
        b.stop(w + 0.5);
      } else if (kind === 'stab') {
        // coup d'accord de cuivres, court
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f0;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 2400;
        o.connect(f);
        f.connect(this.gainEnv(w, v, 0.004, dur));
        o.start(w);
        o.stop(w + dur + 0.05);
      } else {
        // nappe sombre, attaque lente
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f0;
        o.detune.value = (Math.random() - 0.5) * 12;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, w);
        g.gain.exponentialRampToValueAtTime(v * 0.8, w + 0.35);
        g.gain.setValueAtTime(v * 0.8, w + dur * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, w + dur + 0.3);
        g.connect(this.out);
        o.connect(g);
        o.start(w);
        o.stop(w + dur + 0.35);
      }
    }
  }

  /** Klaxon de battle : « BWAAP BWAAP BWAAAAP ». */
  private horn(w: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    for (const [dt, len] of [
      [0, 0.12],
      [0.17, 0.12],
      [0.34, 0.4],
    ] as const) {
      const t = w + dt;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      g.gain.setValueAtTime(0.22, t + len - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      f.connect(g);
      g.connect(this.out);
      for (const fr of [466, 470, 699]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fr, t);
        o.frequency.linearRampToValueAtTime(fr * 0.97, t + len);
        o.connect(f);
        o.start(t);
        o.stop(t + len + 0.02);
      }
    }
  }

  /** Montée de bruit avant un round. */
  private riser(w: number, dur: number) {
    if (!this.out) return;
    const ctx = this.ctx!;
    const n = this.noiseSrc(w, dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, w);
    f.frequency.exponentialRampToValueAtTime(7000, w + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(0.25, w + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, w + dur + 0.05);
    n.connect(f);
    f.connect(g);
    g.connect(this.out);
  }
}
