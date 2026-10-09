// =====================================================================
//  ÉQUIPES : couleurs, positions défensives et ordre au bâton.
// =====================================================================
import { PLAYERS, SKIN_DEFAULT, type PlayerConfig } from './players';
import { BILLY, STELLA, type DogConfig } from './dogs';

export type CharacterDef = PlayerConfig | DogConfig;

/** Positions défensives : 7 joueuses de champ + lanceur + receveuse = 9, comme au vrai baseball. */
export type Position = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';

export const POSITION_LABEL: Record<Position, string> = {
  P: 'Lanceur',
  C: 'Receveuse',
  '1B': '1er but',
  '2B': '2e but',
  SS: 'Arrêt-court',
  '3B': '3e but',
  LF: 'Champ gauche',
  CF: 'Champ centre',
  RF: 'Champ droit',
};

export interface TeamColors {
  primary: string; // chandail
  secondary: string; // détails, numéros
  pants: string;
  socks: string;
  cap: string;
  capLogo: string;
}

export type Sport = 'baseball' | 'volley';

export interface TeamConfig {
  id: string;
  /** sports où l'équipe joue (absent : les deux) */
  sports?: Sport[];
  name: string; // nom long
  short: string; // nom au tableau de pointage
  colors: TeamColors;
  defense: Record<Position, CharacterDef>;
  /** Rotation : changements de position d'une demi-manche défensive à l'autre (cycle). */
  rotation?: Partial<Record<Position, CharacterDef>>[];
  lineup: CharacterDef[]; // ordre au bâton
  logoLetter: string;
}

const byId = (id: string) => PLAYERS.find((p) => p.id === id)!;

export const TURCAU: TeamConfig = {
  id: 'turcau',
  sports: ['baseball'], // au volleyball, ce sont les Nomads
  name: 'Les Baddies',
  short: 'BADDIES',
  logoLetter: 'B',
  colors: {
    primary: '#232328', // chandail noir
    secondary: '#e3262e', // détails et numéros rouges
    pants: '#ffffff',
    socks: '#e3262e',
    cap: '#232328',
    capLogo: '#e3262e',
  },
  defense: {
    P: BILLY,
    C: STELLA,
    '1B': byId('oceane'),
    '2B': byId('alexia'),
    SS: byId('dannylee'),
    '3B': byId('josephine'),
    LF: byId('ophelie'),
    CF: byId('charlie'),
    RF: byId('kellyanne'),
  },
  // une demi-manche sur deux, Lily et Kaelie jouent au champ extérieur
  rotation: [{}, { LF: byId('lily'), RF: byId('kaelie') }],
  lineup: ['charlie', 'dannylee', 'ophelie', 'oceane', 'kellyanne', 'josephine', 'lily', 'alexia', 'kaelie'].map(byId),
};

// ---------------- Équipe adverse générique ----------------
function rival(
  id: string,
  name: string,
  number: number,
  hairColor: string,
  hairStyle: PlayerConfig['hairStyle'],
  power: number,
  speed: number,
  defense: number,
  height = 64,
  extra: Partial<PlayerConfig> = {},
): PlayerConfig {
  return {
    id,
    kind: 'girl',
    name,
    number,
    height,
    hairColor,
    hairStyle,
    eyeColor: '#4a3020',
    skinColor: SKIN_DEFAULT,
    power,
    speed,
    defense,
    bats: 'R',
    expression: 'neutral',
    personality: 'Adversaire',
    ...extra,
  };
}

const VIS = {
  p: rival('v_p', 'Gabrielle', 11, '#c0602a', 'ponytail', 5, 6, 6, 67),
  c: rival('v_c', 'Juliette', 2, '#2b1a10', 'bob', 6, 4, 7, 64),
  b1: rival('v_1b', 'Mégane', 14, '#e8c45a', 'long', 7, 5, 6, 68),
  b2: rival('v_2b', 'Zoé', 4, '#3a2412', 'pigtails', 4, 7, 6, 61),
  ss: rival('v_ss', 'Rosalie', 6, '#141414', 'ponytail', 5, 7, 7, 63),
  b3: rival('v_3b', 'Florence', 10, '#8a4a22', 'bun', 6, 5, 6, 65),
  lf: rival('v_lf', 'Maude', 17, '#d9a441', 'curly', 6, 6, 5, 64),
  rf: rival('v_rf', 'Léa', 21, '#5a3418', 'long', 5, 6, 5, 62),
  cf: rival('v_cf', 'Noémie', 8, '#2b1a10', 'braid', 5, 7, 6, 64),
};

export const VISITORS: TeamConfig = {
  id: 'visiteur',
  name: 'Visiteuses (nom à déterminer)', // change le nom ici quand il sera choisi
  short: 'VISITEUR',
  logoLetter: 'V',
  colors: {
    primary: '#1f4fa8',
    secondary: '#ffd23f',
    pants: '#f3f0e6',
    socks: '#1f4fa8',
    cap: '#1f4fa8',
    capLogo: '#ffd23f',
  },
  defense: { P: VIS.p, C: VIS.c, '1B': VIS.b1, '2B': VIS.b2, SS: VIS.ss, '3B': VIS.b3, LF: VIS.lf, CF: VIS.cf, RF: VIS.rf },
  lineup: [VIS.b2, VIS.ss, VIS.b1, VIS.b3, VIS.cf, VIS.lf, VIS.rf, VIS.c, VIS.p],
};

// ---------------- Occupation Double Québec 2026 ----------------
// Distribution de départ fournie par l'utilisateur. Grandeur = milieu de la plage donnée (pouces).
// Les statistiques et les numéros sont des propositions : change-les ici.
const BRUN = '#5a3418';
const BRUN2 = '#6b3e1f';
const BRUN3 = '#4e2c14';
const BRUN_FONCE = '#3b2210';
const BLOND = '#e8c45a';
const NOIR = '#141414';
const YEUX_BRUNS = '#6b4423';
const YEUX_CLAIRS = '#7fb7d9';

const ODC = {
  alexandrie: rival('od_alexandrie', 'Alexandrie Chapdelaine', 1, BRUN, 'wavy', 6, 6, 6, 67, { eyeColor: YEUX_BRUNS }),
  alexa: rival('od_alexa', 'Alexa Nadeau', 2, BLOND, 'long', 5, 7, 6, 66, { eyeColor: '#5aa6e0' }),
  amelie: rival('od_amelie', 'Amélie Fournier', 3, BRUN2, 'wavy', 5, 6, 6, 66, { eyeColor: YEUX_BRUNS }),
  rebecca: rival('od_rebecca', 'Rébecca Fortin', 4, BRUN3, 'wavy', 6, 5, 7, 66, { eyeColor: YEUX_BRUNS }),
  zhara: rival('od_zhara', 'Zhara Veilleux', 5, '#24160c', 'curly', 5, 7, 6, 66, { eyeColor: YEUX_BRUNS }),
  sabrina: rival('od_sabrina', 'Sabrina Fontaine', 6, '#704020', 'wavy', 6, 6, 6, 67, { eyeColor: YEUX_BRUNS }),
  imane: rival('od_imane', 'Imane', 7, BRUN_FONCE, 'wavy', 5, 6, 6, 66, { eyeColor: YEUX_BRUNS }),
  emma: rival('od_emma', 'Emma Santoyo', 8, '#33200f', 'wavy', 5, 7, 5, 66, { eyeColor: YEUX_BRUNS }),
  maxim: rival('od_maxim', 'Maxim Bernatchez', 9, BLOND, 'wavy', 6, 6, 5, 67, { eyeColor: YEUX_CLAIRS }),
  billy: rival('od_billy', 'Billy Bélanger', 10, BRUN, 'short', 7, 6, 5, 73, { eyeColor: YEUX_CLAIRS, nick: 'Billy B.' }),
  brian: rival('od_brian', 'Brian St-Amour', 11, BRUN2, 'short', 7, 6, 6, 71, { eyeColor: YEUX_BRUNS }),
  jacob: rival('od_jacob', 'Jacob Ladouceur', 12, BRUN_FONCE, 'short', 7, 5, 6, 73, { eyeColor: YEUX_BRUNS }),
  tristan: rival('od_tristan', 'Tristan Joseph', 13, NOIR, 'curlyShort', 6, 7, 6, 71, { eyeColor: YEUX_BRUNS, nick: 'Titou' }),
};

export const OD2026: TeamConfig = {
  id: 'od2026',
  name: 'Occupation Double 2026',
  short: 'OD 2026',
  logoLetter: 'O',
  colors: {
    primary: '#12a6a6',
    secondary: '#ffffff',
    pants: '#ffffff',
    socks: '#ff5fa2',
    cap: '#ff5fa2',
    capLogo: '#ffffff',
  },
  // les filles d'abord en défensive
  defense: {
    P: ODC.sabrina,
    C: ODC.rebecca,
    '1B': ODC.alexandrie,
    '2B': ODC.alexa,
    SS: ODC.zhara,
    '3B': ODC.amelie,
    LF: ODC.imane,
    CF: ODC.emma,
    RF: ODC.maxim,
  },
  // les 13 personnes frappent : les filles d'abord, puis les gars
  lineup: [
    ODC.alexandrie,
    ODC.alexa,
    ODC.amelie,
    ODC.rebecca,
    ODC.zhara,
    ODC.sabrina,
    ODC.imane,
    ODC.emma,
    ODC.maxim,
    ODC.billy,
    ODC.brian,
    ODC.jacob,
    ODC.tristan,
  ],
};

// ---------------- Les Écureuils (équipe générique) ----------------
const ECU = {
  p: rival('e_p', 'Camille', 12, '#6b3e1f', 'ponytail', 5, 6, 6, 65),
  c: rival('e_c', 'Rose', 3, '#e8c45a', 'bun', 5, 4, 7, 63),
  b1: rival('e_1b', 'Laurence', 22, '#141414', 'wavy', 6, 5, 6, 67),
  b2: rival('e_2b', 'Alice', 7, '#a0522d', 'pigtails', 4, 8, 6, 60),
  ss: rival('e_ss', 'Éloïse', 1, '#3a2412', 'braid', 5, 7, 7, 62),
  b3: rival('e_3b', 'Jade', 9, '#2b1a10', 'bob', 6, 6, 6, 64),
  lf: rival('e_lf', 'Clara', 15, '#d9a441', 'long', 6, 6, 5, 65),
  cf: rival('e_cf', 'Mia', 5, '#c0602a', 'curly', 5, 7, 6, 61),
  rf: rival('e_rf', 'Sophie', 18, '#5a3418', 'ponytail', 5, 6, 5, 64),
};

export const ECUREUILS: TeamConfig = {
  id: 'ecureuils',
  name: 'Les Écureuils',
  short: 'ÉCUREUILS',
  logoLetter: 'E',
  colors: {
    primary: '#2f8f3a',
    secondary: '#ffb238',
    pants: '#f3f0e6',
    socks: '#2f8f3a',
    cap: '#ff8c1a',
    capLogo: '#ffffff',
  },
  defense: { P: ECU.p, C: ECU.c, '1B': ECU.b1, '2B': ECU.b2, SS: ECU.ss, '3B': ECU.b3, LF: ECU.lf, CF: ECU.cf, RF: ECU.rf },
  lineup: [ECU.b2, ECU.ss, ECU.b1, ECU.b3, ECU.cf, ECU.lf, ECU.rf, ECU.c, ECU.p],
};

// ---------------- L'ITAQ ----------------
// Émilie, Maryse et Renaud : fournis par l'utilisateur (cheveux et grandeur).
// Les coiffures non précisées, les yeux, les statistiques, les numéros et les couleurs sont des propositions.
// Les 6 autres personnes sont inventées pour compléter l'équipe.
const ITQ = {
  emilie: rival('itaq_emilie', 'Émilie Cauchy', 3, '#f2cf5b', 'curly', 6, 6, 7, 66, { eyeColor: '#5aa6e0', hitPhrase: 'Grosse torche !' }),
  maryse: rival('itaq_maryse', 'Maryse', 7, '#5a3418', 'ponytail', 5, 7, 6, 64, { eyeColor: '#6b4423', hitPhrase: 'Houle ma poule !' }),
  renaud: rival('itaq_renaud', 'Renaud Masawipi', 12, '#141414', 'short', 7, 6, 6, 67, { eyeColor: '#6b4423', hitPhrase: 'Enwoye Despati !' }),
  // personnes inventées
  laurie: rival('itaq_laurie', 'Laurie', 4, '#8a5530', 'braid', 5, 7, 6, 63),
  felix: rival('itaq_felix', 'Félix', 9, '#3b2210', 'curlyShort', 6, 6, 6, 69),
  annabelle: rival('itaq_annabelle', 'Annabelle', 15, '#e8c45a', 'bun', 5, 6, 7, 65),
  xavier: rival('itaq_xavier', 'Xavier', 21, '#6b3e1f', 'short', 7, 5, 6, 70),
  coralie: rival('itaq_coralie', 'Coralie', 8, '#c0602a', 'wavy', 5, 7, 6, 64),
  olivier: rival('itaq_olivier', 'Olivier', 18, '#2b1a10', 'short', 6, 6, 5, 68),
};

export const ITAQ: TeamConfig = {
  id: 'itaq',
  name: 'L’ITAQ',
  short: 'ITAQ',
  logoLetter: 'I',
  colors: {
    primary: '#5b2a86', // violet
    secondary: '#f2c14e', // or
    pants: '#f3f0e6',
    socks: '#5b2a86',
    cap: '#5b2a86',
    capLogo: '#f2c14e',
  },
  defense: {
    P: ITQ.renaud,
    C: ITQ.maryse,
    '1B': ITQ.xavier,
    '2B': ITQ.laurie,
    SS: ITQ.emilie,
    '3B': ITQ.felix,
    LF: ITQ.annabelle,
    CF: ITQ.coralie,
    RF: ITQ.olivier,
  },
  lineup: [ITQ.emilie, ITQ.laurie, ITQ.renaud, ITQ.xavier, ITQ.maryse, ITQ.felix, ITQ.coralie, ITQ.annabelle, ITQ.olivier],
};

// ---------------- Les Nomads (volleyball seulement) ----------------
// Fournis par l'utilisateur : les noms, les cheveux, la peau de Marley, Mia qui ne tient pas en place, Helena calme.
// Ophélie, Océane et Lily : mêmes grandeurs, yeux, numéros et statistiques que chez les Baddies.
// Les autres grandeurs (65 po), les yeux, les numéros, les statistiques et les couleurs sont des propositions.
const fromBaddies = (id: string, extra: Partial<PlayerConfig>): PlayerConfig => ({ ...byId(id), id: 'nom_' + id, name: byId(id).name.split(' ')[0], ...extra });
const NOM = {
  ophelie: fromBaddies('ophelie', { hairStyle: 'long', hairStreak: '#f2cf5b' }), // brun lisse, mèche blonde
  oceane: fromBaddies('oceane', { hairStyle: 'long' }), // brun lisse
  lily: fromBaddies('lily', { hairStyle: 'wavy' }), // brun vagué
  valentina: rival('nom_valentina', 'Valentina', 4, '#141414', 'looseCurls', 6, 6, 7, 65, { expression: 'happy', personality: 'Nomade' }),
  nebai: rival('nom_nebai', 'Nebai', 11, '#5a3418', 'long', 6, 7, 6, 65, { expression: 'happy', personality: 'Nomade' }),
  alicia: rival('nom_alicia', 'Alicia', 13, '#6b3e1f', 'veryLong', 7, 6, 6, 65, { expression: 'happy', personality: 'Nomade' }),
  marley: rival('nom_marley', 'Marley', 17, '#141414', 'long', 7, 6, 6, 65, { skinColor: '#8a5634', expression: 'happy', personality: 'Nomade' }),
  mia: rival('nom_mia', 'Mia', 21, '#8a5530', 'shoulder', 5, 9, 7, 65, { vibe: 'hyper', expression: 'energetic', personality: 'Ne tient pas en place' }),
  helena: rival('nom_helena', 'Helena', 8, '#f2cf5b', 'long', 6, 5, 8, 65, { vibe: 'calm', expression: 'calm', personality: 'Calme' }),
};

export const NOMADS: TeamConfig = {
  id: 'nomads',
  sports: ['volley'],
  name: 'Les Nomads',
  short: 'NOMADS',
  logoLetter: 'N',
  colors: {
    primary: '#7b1e3a', // bordeaux
    secondary: '#ecd3a5', // sable
    pants: '#232328',
    socks: '#ecd3a5',
    cap: '#7b1e3a',
    capLogo: '#ecd3a5',
  },
  // positions de baseball obligatoires dans le type, mais l'équipe ne joue qu'au volleyball
  defense: {
    P: NOM.ophelie,
    C: NOM.oceane,
    '1B': NOM.lily,
    '2B': NOM.valentina,
    SS: NOM.mia,
    '3B': NOM.alicia,
    LF: NOM.nebai,
    CF: NOM.marley,
    RF: NOM.helena,
  },
  // volleyball : les 6 premières commencent sur le terrain, les 3 autres entrent au service
  lineup: [NOM.ophelie, NOM.oceane, NOM.lily, NOM.valentina, NOM.mia, NOM.alicia, NOM.nebai, NOM.marley, NOM.helena],
};

/** Équipes adverses offertes au joueur (menu JOUER). */
export const OPPONENTS: TeamConfig[] = [VISITORS, OD2026, ECUREUILS, ITAQ];

export function opponentById(id: string): TeamConfig {
  return OPPONENTS.find((t) => t.id === id) ?? VISITORS;
}

/** Toutes les équipes : n'importe laquelle peut être « ton équipe » ou l'adversaire. */
export const ALL_TEAMS: TeamConfig[] = [TURCAU, NOMADS, ...OPPONENTS];

export function teamById(id: string): TeamConfig {
  return ALL_TEAMS.find((t) => t.id === id) ?? TURCAU;
}

/** Équipes d'un sport (au volleyball : les Nomads au lieu des Baddies). */
export function teamsFor(sport: Sport): TeamConfig[] {
  return ALL_TEAMS.filter((t) => !t.sports || t.sports.includes(sport));
}

/** Équipe d'un sport selon son id ; si elle ne joue pas ce sport : la première équipe du sport. */
export function sportTeam(sport: Sport, id: string): TeamConfig {
  const list = teamsFor(sport);
  return list.find((t) => t.id === id) ?? list[0];
}

/** Tous les personnages d'une équipe, sans doublon : l'ordre au bâton, puis les autres. */
export function rosterOf(t: TeamConfig): CharacterDef[] {
  const out: CharacterDef[] = [];
  const add = (c: CharacterDef | undefined) => {
    if (c && !out.some((x) => x.id === c.id)) out.push(c);
  };
  t.lineup.forEach(add);
  (Object.keys(t.defense) as Position[]).forEach((p) => add(t.defense[p]));
  for (const r of t.rotation ?? []) (Object.keys(r) as Position[]).forEach((p) => add(r[p]));
  return out;
}

/** Position(s) défensive(s) d'un personnage, rotation comprise. */
export function positionsOf(t: TeamConfig, c: CharacterDef): string {
  const out = new Set<string>();
  for (const p of Object.keys(t.defense) as Position[]) if (t.defense[p].id === c.id) out.add(POSITION_LABEL[p]);
  for (const r of t.rotation ?? []) for (const p of Object.keys(r) as Position[]) if (r[p]?.id === c.id) out.add(POSITION_LABEL[p]);
  return out.size ? [...out].join(' · ') : 'Au bâton';
}

// ---------------- Accès aux statistiques communes ----------------
export const stat = {
  power: (c: CharacterDef) => c.power,
  speed: (c: CharacterDef) => c.speed,
  defense: (c: CharacterDef) => c.defense,
  throwing: (c: CharacterDef) => (c.kind === 'dog' ? c.throwing : c.throwing ?? Math.round((c.defense + c.power) / 2)),
  catching: (c: CharacterDef) => (c.kind === 'dog' ? c.catching : c.defense),
  /** taille en pouces (les chiens utilisent une taille équivalente) */
  height: (c: CharacterDef) => (c.kind === 'dog' ? 66 * c.heightScale : c.height),
  shortName: (c: CharacterDef) => (c.kind === 'girl' && c.nick ? c.nick : c.name.split(' ')[0]).toUpperCase(),
};
