// =====================================================================
//  SONS DU STADE : enregistrements réels chargés en ligne (pas stockés dans le jeu).
//  Toutes les sources sont libres de droit : CC0 (Freesound) ou domaine public (Wikimedia Commons).
//  Sans connexion, le jeu utilise ses sons synthétisés à la place.
// =====================================================================

export type ClipId =
  | 'menuSong'
  | 'organWrigley'
  | 'chargeLong'
  | 'chargeShort'
  | 'gallop'
  | 'ambience'
  | 'kidsCheer'
  | 'bigCheer'
  | 'cheer'
  | 'claps';

export interface ClipConfig {
  url: string;
  kind: 'music' | 'sfx'; // quel curseur de volume l'utilise
  vol: number; // volume relatif (0 à 1)
  loop?: boolean;
  dur?: number; // jouer seulement les N premières secondes (avec fondu)
  credit: string;
  source: string;
}

const FS = 'https://cdn.freesound.org/previews/';

export const STADIUM_CLIPS: Record<ClipId, ClipConfig> = {
  menuSong: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/cd/MeekerBallGame.ogg/MeekerBallGame.ogg.mp3',
    kind: 'music',
    vol: 0.75,
    loop: true,
    credit: '« Take Me Out to the Ball Game », Edward Meeker, 1908 — domaine public',
    source: 'https://commons.wikimedia.org/wiki/File:MeekerBallGame.ogg',
  },
  organWrigley: {
    url: FS + '151/151373_2657167-hq.mp3',
    kind: 'music',
    vol: 0.9,
    credit: 'Orgue de Wrigley Field (treblebooster) — CC0',
    source: 'https://freesound.org/people/treblebooster/sounds/151373/',
  },
  chargeLong: {
    url: FS + '380/380696_167075-hq.mp3',
    kind: 'music',
    vol: 0.9,
    credit: 'Fanfare de cavalerie de stade, longue (vckhaze) — CC0',
    source: 'https://freesound.org/people/vckhaze/sounds/380696/',
  },
  chargeShort: {
    url: FS + '380/380695_167075-hq.mp3',
    kind: 'music',
    vol: 0.9,
    credit: 'Fanfare de cavalerie de stade, courte (vckhaze) — CC0',
    source: 'https://freesound.org/people/vckhaze/sounds/380695/',
  },
  gallop: {
    url: FS + '649/649371_14228776-hq.mp3',
    kind: 'music',
    vol: 0.75,
    dur: 8,
    credit: 'Riff d’orgue « galop » (trader_one) — CC0',
    source: 'https://freesound.org/people/trader_one/sounds/649371/',
  },
  ambience: {
    url: FS + '424/424295_3609277-hq.mp3',
    kind: 'sfx',
    vol: 0.18, // fond discret : la foule ne doit pas devenir un souffle
    loop: true,
    credit: 'Ambiance de foule, Fenway Park (Douglas711) — CC0',
    source: 'https://freesound.org/people/Douglas711/sounds/424295/',
  },
  kidsCheer: {
    url: FS + '675/675109_2524442-hq.mp3',
    kind: 'sfx',
    vol: 0.75,
    dur: 6,
    credit: 'Enfants qui encouragent (craigsmith) — CC0',
    source: 'https://freesound.org/people/craigsmith/sounds/675109/',
  },
  bigCheer: {
    url: FS + '629/629884_612689-hq.mp3',
    kind: 'sfx',
    vol: 0.8,
    dur: 10,
    credit: 'Grande foule qui chante et applaudit, Montréal (kyles) — CC0',
    source: 'https://freesound.org/people/kyles/sounds/629884/',
  },
  cheer: {
    url: FS + '397/397434_4019029-hq.mp3',
    kind: 'sfx',
    vol: 0.7,
    dur: 5,
    credit: 'Foule qui applaudit (FoolBoyMedia) — CC0',
    source: 'https://freesound.org/people/FoolBoyMedia/sounds/397434/',
  },
  claps: {
    url: FS + '18/18364_71309-hq.mp3',
    kind: 'sfx',
    vol: 0.75,
    credit: 'Applaudissements rythmés de baseball (jasinski) — CC0',
    source: 'https://freesound.org/people/jasinski/sounds/18364/',
  },
};
