import { Stadium } from './Stadium';

/**
 * Sons synthétisés avec Web Audio : aucun fichier à télécharger, donc le jeu marche hors ligne.
 * Chaque son a une petite variation aléatoire pour ne pas devenir répétitif.
 */
type SfxName =
  | 'bat'
  | 'batWeak'
  | 'glove'
  | 'throw'
  | 'step'
  | 'slide'
  | 'crowd'
  | 'cheer'
  | 'applause'
  | 'out'
  | 'strike'
  | 'ball'
  | 'strikeout'
  | 'run'
  | 'homerun'
  | 'bark'
  | 'pant'
  | 'wag'
  | 'boing'
  | 'click'
  | 'select'
  | 'charge'
  | 'whoosh'
  | 'foul'
  | 'bump'
  | 'setTouch'
  | 'spike'
  | 'whistle';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const vary = (v: number, p = 0.07) => v * (1 + (Math.random() * 2 - 1) * p);

class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private musicOn = false;
  private musicKind: 'organ' | 'olympic' = 'organ';
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private lastPlay = new Map<string, number>();
  private vol = { music: 4, sfx: 7, muted: false };
  private crowdNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** À appeler lors d'un geste de l'utilisateur (clavier, souris, toucher). */
  unlock() {
    // iPhone : sans cela, le bouton du mode silencieux coupe les sons du jeu (mais pas ceux du stade)
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') session.type = 'playback';
    } catch {
      /* pas d'audioSession : rien à faire */
    }
    if (!this.ctx) Stadium.unlock();
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state !== 'running' && !this.background) {
      void this.ctx.resume();
      // iPhone : un son vide joué pendant le geste débloque vraiment le son
      try {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = b;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch {
        /* rien */
      }
    }
  }

  private background = false;

  /** Le jeu passe en arrière-plan (autre application, écran verrouillé) : silence complet. */
  suspend() {
    this.background = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  /** Le jeu revient à l'écran. */
  resume() {
    this.background = false;
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** Nouvelle sortie branchée sur la musique (suit le volume de la musique). boost : gain en plus. */
  musicBus(boost = 1): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.gain.value = boost;
    g.connect(this.music);
    return g;
  }

  /** Bruit blanc de 2 s (pour les caisses claires, les charlestons…). */
  get noiseBuffer(): AudioBuffer | null {
    return this.ctx ? this.noise : null;
  }

  setVolumes(music: number, sfx: number, muted: boolean) {
    this.vol = { music, sfx, muted };
    this.applyVolumes();
    Stadium.setVolumes(music, sfx, muted);
  }

  /** Musique des menus : thème olympique (cuivres, timbales, tambour) pour tous les sports. */
  menuMusic() {
    Stadium.stopAll(0.5); // aucun son du stade de baseball dans les menus
    this.ambience(false);
    this.startMusic('olympic');
  }

  /** Musique du baseball (avant la partie) : la chanson de 1908 si elle charge, sinon l'orgue synthétisé. */
  baseballMusic() {
    if (Stadium.loop('menuSong', () => this.startMusic('organ'))) this.stopMusic();
    else this.startMusic('organ');
  }

  /** Volleyball : bruit de foule du gymnase, sans musique de baseball. */
  gymAudio(on: boolean) {
    if (on) {
      this.stopMusic();
      Stadium.stopAll(0.5);
    }
    this.ambience(on);
  }

  /** Sons pendant une partie : ambiance de vraie foule (sinon foule et musique synthétisées). */
  gameAudio(on: boolean) {
    if (on) {
      Stadium.stop('menuSong', 1);
      const real = Stadium.loop('ambience', () => {
        this.ambience(true);
        this.startMusic('organ');
      });
      if (real) {
        this.stopMusic();
        this.ambience(false);
      } else {
        this.ambience(true);
        this.startMusic('organ');
      }
    } else {
      Stadium.stop('ambience', 0.8);
      this.ambience(false);
    }
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : 1, t, 0.02);
    this.sfx.gain.setTargetAtTime((this.vol.sfx / 10) * 0.9, t, 0.02);
    this.music.gain.setTargetAtTime((this.vol.music / 10) * 0.35, t, 0.02);
  }

  // ---------------------------------------------------------- briques
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode = this.sfx, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  private burst(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number, dest: AudioNode = this.sfx, attack = 0.002) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = vary(1, 0.1);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + dur + 0.05);
  }

  // ---------------------------------------------------------- effets
  play(name: SfxName, intensity = 1) {
    if (!this.ctx || this.vol.muted) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    const minGap: Partial<Record<SfxName, number>> = { step: 0.09, glove: 0.05, crowd: 0.6, cheer: 0.8, bark: 0.25, pant: 1.5 };
    if (now - last < (minGap[name] ?? 0.02)) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const k = vary(1, 0.06);
    switch (name) {
      case 'bat':
        this.burst(t, 0.05, 0.9 * intensity, 'highpass', 1800 * k, 0.7);
        this.tone('triangle', 1250 * k, 520, t, 0.07, 0.55 * intensity);
        this.tone('sine', 180 * k, 90, t, 0.12, 0.5 * intensity);
        break;
      case 'batWeak':
        this.burst(t, 0.04, 0.4, 'bandpass', 1200 * k, 1.2);
        this.tone('triangle', 700 * k, 380, t, 0.05, 0.25);
        break;
      case 'foul':
        this.burst(t, 0.03, 0.35, 'highpass', 2200 * k, 0.8);
        break;
      case 'glove':
        this.burst(t, 0.06, 0.8, 'lowpass', 1100 * k, 0.8);
        this.tone('sine', 190 * k, 85, t, 0.09, 0.55);
        break;
      case 'throw':
      case 'whoosh':
        this.burst(t, 0.16, name === 'throw' ? 0.25 : 0.35, 'bandpass', 500 * k, 1.4, 2300);
        break;
      case 'step':
        this.burst(t, 0.03, 0.12, 'lowpass', 520 * k, 0.8);
        break;
      case 'slide':
        this.burst(t, 0.4, 0.5, 'lowpass', 1800, 0.6, 250, this.sfx, 0.02);
        break;
      case 'crowd':
        this.swell(1.6 * intensity, 0.18 * intensity);
        break;
      case 'cheer':
        this.swell(2.6, 0.35 * intensity);
        this.applause(2.2, 0.6 * intensity);
        break;
      case 'applause':
        this.applause(1.8, 0.6 * intensity);
        break;
      case 'out':
        this.tone('square', 520 * k, 520 * k, t, 0.09, 0.12);
        this.tone('square', 330 * k, 300 * k, t + 0.1, 0.16, 0.12);
        break;
      case 'strike':
        this.tone('sine', 988 * k, 988 * k, t, 0.12, 0.2);
        break;
      case 'ball':
        this.tone('sine', 523 * k, 523 * k, t, 0.1, 0.12);
        break;
      case 'strikeout':
        [72, 76, 79, 84].forEach((m, i) => this.tone('square', mtof(m), mtof(m), t + i * 0.08, 0.14, 0.12));
        break;
      case 'run':
        this.tone('triangle', mtof(84), mtof(84), t, 0.12, 0.3);
        this.tone('triangle', mtof(88), mtof(88), t + 0.12, 0.25, 0.3);
        this.swell(1.8, 0.2);
        break;
      case 'homerun':
        [67, 72, 76, 79].forEach((m, i) => this.tone('square', mtof(m), mtof(m), t + i * 0.12, 0.16, 0.13));
        [72, 76, 79, 84].forEach((m) => this.tone('square', mtof(m), mtof(m), t + 0.5, 0.9, 0.08));
        this.swell(3.5, 0.45);
        this.applause(3.2, 0.8);
        break;
      case 'charge':
        // fanfare de stade traditionnelle
        [67, 72, 76, 79, 76, 79].forEach((m, i) => {
          const tt = t + [0, 0.13, 0.26, 0.39, 0.62, 0.75][i];
          this.tone('sawtooth', mtof(m), mtof(m), tt, i === 5 ? 0.5 : 0.11, 0.06);
          this.tone('square', mtof(m - 12), mtof(m - 12), tt, i === 5 ? 0.5 : 0.11, 0.04);
        });
        break;
      case 'bark': {
        // petit jappement discret, deux fois
        for (const off of [0, 0.13]) {
          const o = this.ctx.createOscillator();
          const f = this.ctx.createBiquadFilter();
          const g = this.ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(vary(620), t + off);
          o.frequency.exponentialRampToValueAtTime(vary(1050), t + off + 0.03);
          o.frequency.exponentialRampToValueAtTime(vary(520), t + off + 0.09);
          f.type = 'bandpass';
          f.frequency.value = 1400;
          f.Q.value = 2;
          this.env(g, t + off, 0.005, 0.3, 0.09);
          o.connect(f).connect(g).connect(this.sfx);
          o.start(t + off);
          o.stop(t + off + 0.15);
        }
        break;
      }
      case 'pant':
        for (let i = 0; i < 3; i++) this.burst(t + i * 0.16, 0.08, 0.1, 'bandpass', 1500, 1.5);
        break;
      case 'wag':
        for (let i = 0; i < 3; i++) this.burst(t + i * 0.09, 0.05, 0.08, 'bandpass', 900, 1.2);
        break;
      case 'boing': {
        const o = this.tone('sine', 220, 220, t, 0.45, 0.2);
        o.frequency.setValueAtTime(220, t);
        o.frequency.linearRampToValueAtTime(520, t + 0.12);
        o.frequency.linearRampToValueAtTime(260, t + 0.4);
        break;
      }
      case 'click':
        this.tone('square', 1300, 1300, t, 0.025, 0.06);
        break;
      // ---- volleyball
      case 'bump': // manchette : son sourd
        this.tone('sine', 170 * k, 105, t, 0.12, 0.55);
        this.burst(t, 0.05, 0.4, 'lowpass', 700 * k, 0.8);
        break;
      case 'setTouch': // passe : petit son doux
        this.burst(t, 0.04, 0.3, 'bandpass', 1300 * k, 1.2);
        this.tone('sine', 420 * k, 300, t, 0.06, 0.25);
        break;
      case 'spike': // smash : claquement
        this.burst(t, 0.06, 0.95 * intensity, 'highpass', 1500 * k, 0.7);
        this.tone('triangle', 320 * k, 120, t, 0.11, 0.6 * intensity);
        break;
      case 'whistle': {
        // sifflet de l'arbitre : son aigu avec trille
        const o = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 2900 * k;
        lfo.frequency.value = 38;
        lg.gain.value = 120;
        lfo.connect(lg).connect(o.frequency);
        this.env(g, t, 0.01, 0.16, 0.32);
        o.connect(g).connect(this.sfx);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.4);
        lfo.stop(t + 0.4);
        break;
      }
      case 'select':
        this.tone('square', 880, 880, t, 0.05, 0.07);
        this.tone('square', 1320, 1320, t + 0.05, 0.08, 0.07);
        break;
    }
  }

  private swell(dur: number, peak: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = vary(750, 0.15);
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
  }

  private applause(dur: number, peak: number) {
    const t = this.ctx!.currentTime;
    const n = Math.round(dur * 45);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * dur;
      const fade = 1 - (tt - t) / dur;
      this.burst(tt, 0.012, peak * 0.25 * (0.3 + fade), 'highpass', 1500 + Math.random() * 2500, 0.7);
    }
  }

  /** Bruit de foule de fond (très léger). */
  ambience(on: boolean) {
    if (!this.ctx) return;
    if (on && !this.crowdNode) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 650;
      f.Q.value = 0.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.025;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      this.crowdNode = { src, gain: g };
    } else if (!on && this.crowdNode) {
      this.crowdNode.src.stop();
      this.crowdNode = null;
    }
  }

  // ---------------------------------------------------------- musique
  /** Musique synthétisée en boucle : organ = orgue de stade (baseball) ; olympic = thème des menus. */
  startMusic(kind: 'organ' | 'olympic' = 'organ') {
    if (!this.ctx) return;
    if (this.musicOn && this.musicKind === kind) return;
    this.stopMusic();
    this.musicKind = kind;
    this.musicOn = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule() {
    if (!this.ctx || !this.musicOn) return;
    if (this.musicKind === 'olympic') return this.scheduleOlympic();
    const spb = 60 / 116 / 2; // croches à 116 bpm
    // progression I – vi – IV – V (do majeur), deux variations de mélodie
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ];
    const rhythm = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0];
    const shapeA = [2, 0, 1, 2, 0, 1, 0, 2, 3, 0, 2, 0, 1, 0, 0, 0];
    const shapeB = [0, 0, 1, 0, 0, 2, 0, 3, 2, 0, 1, 0, 2, 1, 0, 0];
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 16) % 4;
      const s = this.step % 16;
      const phrase = Math.floor(this.step / 64) % 2;
      const ch = chords[bar];
      // basse
      if (s % 4 === 0) this.tone('triangle', mtof(ch[0] - 24), mtof(ch[0] - 24), t, spb * 1.6, 0.35, this.music);
      if (s % 4 === 2) this.tone('triangle', mtof(ch[2] - 24), mtof(ch[2] - 24), t, spb * 0.9, 0.22, this.music);
      // accords courts (orgue)
      if (s % 8 === 4) for (const n of ch) this.tone('square', mtof(n), mtof(n), t, spb * 0.7, 0.025, this.music);
      // mélodie
      if (rhythm[s]) {
        const shape = phrase === 0 ? shapeA : shapeB;
        const idx = shape[s];
        const note = idx === 3 ? ch[0] + 12 : ch[idx] + 12;
        this.tone('square', mtof(note), mtof(note), t, spb * 0.8, 0.045, this.music);
      }
      // charleston léger
      if (s % 2 === 1) this.burst(t, 0.02, 0.05, 'highpass', 7000, 0.7, undefined, this.music);
      this.nextNoteTime += spb;
      this.step++;
    }
  }

  /**
   * Thème olympique (composition originale) : fanfare de cuivres, trompette, timbales et tambour de marche.
   * Do majeur, 100 temps par minute, 8 mesures en boucle.
   */
  private scheduleOlympic() {
    const ctx = this.ctx!;
    const spb = 60 / 100 / 4; // doubles-croches à 100 bpm
    // accords (do, fa, sol, do / la mineur, fa, sol, do)
    const chords = [
      [48, 60, 64, 67],
      [53, 60, 65, 69],
      [55, 59, 62, 67],
      [48, 60, 64, 67],
      [57, 60, 64, 69],
      [53, 60, 65, 69],
      [55, 59, 62, 67],
      [48, 60, 64, 72],
    ];
    // mélodie de trompette : [pas, note MIDI, durée en pas]
    const melody: [number, number, number][][] = [
      [[0, 67, 3], [3, 72, 3], [6, 76, 2], [8, 79, 6]],
      [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 77, 4]],
      [[0, 74, 3], [3, 67, 3], [6, 71, 2], [8, 74, 6]],
      [[0, 72, 8], [8, 76, 4], [12, 79, 4]],
      [[0, 81, 3], [3, 76, 3], [6, 72, 2], [8, 76, 6]],
      [[0, 77, 3], [3, 81, 3], [6, 84, 2], [8, 81, 6]],
      [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 71, 4]],
      [[0, 72, 12]],
    ];
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const barN = Math.floor(this.step / 16);
      const bar = barN % 8;
      const s = this.step % 16;
      const ch = chords[bar];
      // fanfare de cuivres : long, court, long
      if (s === 0) this.brass(t, ch.slice(1), spb * 5, 0.09);
      if (s === 6) this.brass(t, ch.slice(1), spb * 1.5, 0.07);
      if (s === 8) this.brass(t, ch.slice(1), spb * 7, 0.08);
      // trompette (la mélodie entre au 2e tour : le premier tour présente les cuivres)
      if (barN >= 8 || bar >= 4) for (const [st, note, len] of melody[bar]) if (st === s) this.trumpet(t, mtof(note), spb * len, 0.09);
      // basse et timbales sur les temps 1 et 3
      if (s === 0 || s === 8) {
        this.tone('triangle', mtof(ch[0] - 12), mtof(ch[0] - 12), t, spb * 6, 0.3, this.music);
        this.timpani(t, mtof(s === 0 ? ch[0] - 12 : ch[0] - 5), 0.5);
      }
      // roulement de timbales à la fin de chaque phrase de 4 mesures
      if (bar % 4 === 3 && s >= 12) {
        this.timpani(t, mtof(43), 0.12 + (s - 12) * 0.05);
        this.timpani(t + spb / 2, mtof(43), 0.1 + (s - 12) * 0.05);
      }
      // tambour de marche
      if (s === 4 || s === 12) this.burst(t, 0.09, 0.13, 'bandpass', 1900, 0.8, undefined, this.music);
      if (s === 14 || s === 15) this.burst(t, 0.04, 0.04, 'bandpass', 2100, 0.9, undefined, this.music);
      // cymbale au début de chaque phrase
      if (s === 0 && bar % 4 === 0) this.burst(t, 1.2, 0.05, 'highpass', 6000, 0.6, undefined, this.music);
      this.nextNoteTime += spb;
      this.step++;
    }
  }

  /** Accord de cuivres : dents de scie adoucies, attaque un peu lente. */
  private brass(t: number, notes: number[], dur: number, v: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.08);
    f.frequency.linearRampToValueAtTime(1400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.04);
    g.gain.setValueAtTime(v, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    f.connect(g);
    g.connect(this.music);
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = (Math.random() - 0.5) * 10;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** Trompette : dent de scie filtrée, avec un léger vibrato. */
  private trumpet(t: number, freq: number, dur: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 0.98, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.008, t + Math.min(0.3, dur));
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    const len = Math.max(0.1, dur * 0.92);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.03);
    g.gain.setValueAtTime(v * 0.85, t + len * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
    o.connect(f);
    f.connect(g);
    g.connect(this.music);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.1);
    lfo.stop(t + len + 0.1);
  }

  /** Timbale : son grave et rond qui descend un peu. */
  private timpani(t: number, freq: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(this.music);
    o.start(t);
    o.stop(t + 1);
    // frappe de la baguette
    this.burst(t, 0.03, v * 0.25, 'lowpass', 900, 0.7, undefined, this.music);
  }
}

export const Sound = new SoundEngine();
