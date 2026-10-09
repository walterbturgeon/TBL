import { BeatPlayer } from './BeatPlayer';
import type { Song } from './Songs';

/**
 * Musique de fond en boucle (volleyball) : joue le premier round d'une chanson sans fin,
 * sans silence entre deux tours. Elle suit le volume de la musique des OPTIONS.
 */
export class BeatLoop {
  private player: BeatPlayer | null = null;
  private timer: number | null = null;
  private boost: number;

  constructor(boost: number) {
    this.boost = boost;
  }

  /** Joue une chanson ; vrai si le son est prêt. */
  play(song: Song): boolean {
    this.stop();
    const p = new BeatPlayer(song);
    if (!p.ready) return false;
    const r = p.sections.find((s) => s.kind === 'round' && s.round === 0)!;
    const from = r.startBar * 4 * p.spb;
    p.setBoost(this.boost);
    p.setLoop(from, from + r.bars * 4 * p.spb);
    p.start(from, 0.2);
    this.player = p;
    this.timer = window.setInterval(() => this.player?.update(), 50);
    return true;
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.player?.stop();
    this.player = null;
  }

  get song() {
    return this.player?.song ?? null;
  }
}
