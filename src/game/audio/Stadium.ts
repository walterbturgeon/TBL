import { STADIUM_CLIPS, type ClipId } from '../config/sounds';
import { LOW } from '../util/quality';

/**
 * Sons du stade (orgue, foule, chants) lus en continu depuis Freesound et Wikimedia Commons.
 * Un élément <audio> par son : pas besoin de télécharger les fichiers dans le jeu.
 * Si un son ne charge pas (pas d'Internet), failed(id) devient vrai et le jeu garde ses sons synthétisés.
 */
class StadiumAudio {
  private els = new Map<ClipId, HTMLAudioElement>();
  private bad = new Set<ClipId>();
  private stopTimers = new Map<ClipId, number>();
  private fadeTimers = new Map<ClipId, number>();
  private target = new Map<ClipId, number>(); // volume relatif voulu pour chaque son en cours
  private vol = { music: 4, sfx: 7, muted: false };
  private onFail = new Map<ClipId, () => void>();
  enabled = true;
  private started = false;

  /** Prépare les éléments audio (sans les jouer). */
  init(enabled: boolean) {
    this.enabled = enabled;
    if (this.started || !enabled) return;
    this.started = true;
    for (const id of Object.keys(STADIUM_CLIPS) as ClipId[]) {
      const c = STADIUM_CLIPS[id];
      const el = new Audio();
      // sur une télé, un son se charge seulement quand le jeu en a besoin
      el.preload = LOW ? 'none' : 'auto';
      el.loop = !!c.loop;
      el.addEventListener('error', () => {
        this.bad.add(id);
        const cb = this.onFail.get(id);
        this.onFail.delete(id);
        cb?.();
      });
      el.src = c.url;
      this.els.set(id, el);
    }
  }

  /** Au premier geste : « débloque » chaque son (nécessaire sur iPhone). */
  unlock() {
    for (const el of this.els.values()) {
      if (!el.paused) continue;
      el.muted = true;
      const p = el.play();
      if (p)
        p.then(() => {
          // si le jeu a demandé ce son entre-temps (muted remis à false), on le laisse jouer
          if (!el.muted) return;
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        }).catch(() => {
          el.muted = false;
        });
    }
  }

  failed(id: ClipId) {
    return !this.enabled || this.bad.has(id) || !this.els.has(id);
  }

  setVolumes(music: number, sfx: number, muted: boolean) {
    this.vol = { music, sfx, muted };
    for (const [id, el] of this.els) if (!el.paused) el.volume = this.level(id, this.target.get(id) ?? 1);
  }

  private level(id: ClipId, rel: number) {
    if (this.vol.muted) return 0;
    const c = STADIUM_CLIPS[id];
    const base = c.kind === 'music' ? this.vol.music / 10 : (this.vol.sfx / 10) * 0.9;
    return Math.max(0, Math.min(1, base * c.vol * rel));
  }

  /** Joue un son une fois. Retourne vrai si le son du stade remplace le son synthétisé. */
  play(id: ClipId, opts: { rel?: number; dur?: number; start?: number } = {}): boolean {
    if (this.failed(id)) return false;
    const el = this.els.get(id)!;
    const c = STADIUM_CLIPS[id];
    this.clearTimers(id);
    const rel = opts.rel ?? 1;
    this.target.set(id, rel);
    try {
      el.currentTime = opts.start ?? 0;
    } catch {
      /* pas encore chargé : le son part du début */
    }
    el.muted = false;
    el.volume = this.level(id, rel);
    el.play().catch(() => undefined);
    const dur = opts.dur ?? c.dur;
    if (dur && !c.loop) this.stopTimers.set(id, window.setTimeout(() => this.stop(id, 0.7), dur * 1000));
    return true;
  }

  /** Joue un son en boucle (musique du menu, ambiance de foule). onFail : appelé si le son ne charge pas. */
  loop(id: ClipId, onFail?: () => void): boolean {
    if (this.failed(id)) {
      onFail?.();
      return false;
    }
    if (onFail) this.onFail.set(id, onFail);
    const el = this.els.get(id)!;
    this.clearTimers(id);
    this.target.set(id, 1);
    el.loop = true;
    el.muted = false;
    el.volume = this.level(id, 1);
    if (el.paused) el.play().catch(() => undefined);
    return true;
  }

  /** Arrête un son avec un fondu (secondes). */
  stop(id: ClipId, fade = 0.5) {
    const el = this.els.get(id);
    if (!el) return;
    this.onFail.delete(id);
    this.clearTimers(id);
    if (el.paused) return;
    if (fade <= 0) {
      el.pause();
      return;
    }
    const start = el.volume;
    const t0 = performance.now();
    const h = window.setInterval(() => {
      const u = Math.min(1, (performance.now() - t0) / (fade * 1000));
      el.volume = start * (1 - u);
      if (u >= 1) {
        window.clearInterval(h);
        this.fadeTimers.delete(id);
        el.pause();
      }
    }, 40);
    this.fadeTimers.set(id, h);
  }

  stopAll(fade = 0.5) {
    for (const id of this.els.keys()) this.stop(id, fade);
  }

  private held: ClipId[] = [];

  /** Arrière-plan : met en pause tous les sons ; les sons en boucle reprendront au retour. */
  pauseAll() {
    this.held = [];
    for (const [id, el] of this.els) {
      if (el.paused) continue;
      this.clearTimers(id);
      if (el.loop && !el.muted) this.held.push(id);
      el.pause();
    }
  }

  resumeAll() {
    for (const id of this.held) this.els.get(id)?.play().catch(() => undefined);
    this.held = [];
  }

  private clearTimers(id: ClipId) {
    const s = this.stopTimers.get(id);
    if (s) window.clearTimeout(s);
    this.stopTimers.delete(id);
    const f = this.fadeTimers.get(id);
    if (f) window.clearInterval(f);
    this.fadeTimers.delete(id);
  }
}

export const Stadium = new StadiumAudio();
