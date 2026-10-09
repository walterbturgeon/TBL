import { BeatPlayer } from './BeatPlayer';
import type { Song } from './Songs';

/**
 * Aperçu de la musique de danse choisie : la seule musique de fond dans les écrans de la danse
 * (choix des équipes, choix de la musique). Il joue le premier round en boucle et passe
 * d'un écran à l'autre sans recommencer.
 */
let player: BeatPlayer | null = null;
let timer: number | null = null;
let loopFrom = 0;
let loopTo = 0;

function tick() {
  if (!player) return;
  player.update();
  if (player.isPlaying && player.now() > loopTo) player.start(loopFrom);
}

export const DancePreview = {
  /** Joue l'aperçu d'une chanson (rien ne change si elle joue déjà). */
  play(song: Song) {
    if (player && player.song.id === song.id && player.isPlaying) return;
    this.stop();
    const p = new BeatPlayer(song);
    if (!p.ready) return;
    const r1 = p.sections.find((s) => s.kind === 'round' && s.round === 0)!;
    loopFrom = r1.startBar * 4 * p.spb;
    loopTo = loopFrom + Math.min(8, r1.bars) * 4 * p.spb;
    p.start(loopFrom);
    player = p;
    timer = window.setInterval(tick, 50);
  },
  stop() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    player?.stop();
    player = null;
  },
  /** Lecteur en cours (pour faire danser les personnages au rythme), ou null. */
  get player() {
    return player;
  },
};
