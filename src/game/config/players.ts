// =====================================================================
//  JOUEUSES DE TURCAU BASEBALL LEAGUE
//  Change librement les valeurs ci-dessous : le jeu les relit au démarrage.
//  Statistiques sur 10. Taille (height) en pouces : 5 pi 10 po = 70.
// =====================================================================

export type HairStyle = 'ponytail' | 'curly' | 'long' | 'bun' | 'pigtails' | 'bob' | 'braid' | 'wavy' | 'short' | 'curlyShort';
export type Expression =
  | 'confident'
  | 'energetic'
  | 'calm'
  | 'determined'
  | 'enthusiastic'
  | 'focused'
  | 'happy'
  | 'attentive'
  | 'neutral'
  | 'surprised'
  | 'sad'
  | 'embarrassed';

export interface PlayerConfig {
  id: string;
  kind: 'girl';
  name: string;
  nick?: string; // nom court affiché (sinon : le prénom)
  number: number;
  height: number; // pouces
  hairColor: string;
  hairStyle: HairStyle;
  eyeColor: string;
  skinColor: string;
  freckles?: boolean;
  beard?: boolean;
  power: number;
  speed: number;
  defense: number;
  throwing?: number; // si absent : calculé à partir de la défensive
  bats: 'R' | 'L';
  hitPhrase?: string; // phrase de bande dessinée quand la personne frappe loin (plus de la moitié du champ)
  expression: Expression; // expression du portrait
  personality: string; // texte court pour le menu
  uniformColor?: string; // remplace la couleur de l'équipe pour cette joueuse
}

export const SKIN_DEFAULT = '#f7cfa6';

export const PLAYERS: PlayerConfig[] = [
  {
    id: 'ophelie',
    kind: 'girl',
    name: 'Ophélie Turgeon',
    number: 9,
    height: 70,
    hairColor: '#6b3e1f',
    hairStyle: 'ponytail',
    eyeColor: '#3b8fe0',
    skinColor: SKIN_DEFAULT,
    power: 8,
    speed: 6,
    defense: 8,
    hitPhrase: 'Regarde-la partir !',
    bats: 'R',
    expression: 'confident',
    personality: 'Confiante',
  },
  {
    id: 'alexia',
    kind: 'girl',
    name: 'Alexia Laliberté',
    number: 3,
    height: 65,
    hairColor: '#f2cf5b',
    hairStyle: 'curly',
    eyeColor: '#8cc8f5',
    skinColor: SKIN_DEFAULT,
    power: 6,
    speed: 8,
    defense: 7,
    hitPhrase: 'Ho, la Baddie !',
    bats: 'R',
    expression: 'energetic',
    personality: 'Énergique',
  },
  {
    id: 'josephine',
    kind: 'girl',
    name: 'Joséphine Bergeron',
    number: 7,
    height: 66,
    hairColor: '#5a3418',
    hairStyle: 'long',
    eyeColor: '#6b4423',
    skinColor: SKIN_DEFAULT,
    power: 7,
    speed: 7,
    defense: 7,
    hitPhrase: 'Tranquille… pis loin !',
    bats: 'R',
    expression: 'calm',
    personality: 'Calme',
  },
  {
    id: 'oceane',
    kind: 'girl',
    name: 'Océane',
    number: 22,
    height: 71,
    hairColor: '#7a4524',
    hairStyle: 'bun',
    eyeColor: '#6b4423',
    skinColor: SKIN_DEFAULT,
    power: 9,
    speed: 5,
    defense: 8,
    hitPhrase: 'Bye bye la balle !',
    bats: 'R',
    expression: 'determined',
    personality: 'Déterminée',
  },
  {
    id: 'charlie',
    kind: 'girl',
    name: 'Charlie Pigeon',
    number: 1,
    height: 61,
    hairColor: '#6e3b1c',
    hairStyle: 'pigtails',
    eyeColor: '#6b4423',
    skinColor: SKIN_DEFAULT,
    freckles: true,
    power: 4,
    speed: 10,
    defense: 8,
    hitPhrase: 'Yé ! Ça part !',
    bats: 'R',
    expression: 'enthusiastic',
    personality: 'Enthousiaste',
  },
  {
    id: 'dannylee',
    kind: 'girl',
    name: 'Danny-Lee',
    number: 5,
    height: 62,
    hairColor: '#1a1a1a',
    hairStyle: 'bob',
    eyeColor: '#5a3a1e',
    skinColor: SKIN_DEFAULT,
    power: 5,
    speed: 9,
    defense: 9,
    hitPhrase: 'Dans le mille !',
    bats: 'R',
    expression: 'focused',
    personality: 'Concentrée',
  },
  // Nouvelles joueuses. Les yeux, les statistiques et les numéros sont des propositions : change-les ici.
  // Phrases de BD (hitPhrase) : celle d'Alexia vient de l'utilisateur ; les autres sont des propositions.
  {
    id: 'kellyanne',
    kind: 'girl',
    name: 'Kellyanne',
    number: 12,
    height: 70,
    hairColor: '#8a5530', // châtain
    hairStyle: 'braid',
    eyeColor: '#4f9a5b',
    skinColor: SKIN_DEFAULT,
    power: 8,
    speed: 6,
    defense: 7,
    hitPhrase: 'Ça, c’est une claque !',
    bats: 'R',
    expression: 'happy',
    personality: 'Joyeuse',
  },
  {
    id: 'lily',
    kind: 'girl',
    name: 'Lily',
    number: 15,
    height: 67,
    hairColor: '#3b2210', // brun foncé
    hairStyle: 'wavy',
    eyeColor: '#6b4423',
    skinColor: SKIN_DEFAULT,
    power: 7,
    speed: 6,
    defense: 8,
    hitPhrase: 'Elle s’en va !',
    bats: 'R',
    expression: 'attentive',
    personality: 'Attentive',
  },
  {
    id: 'kaelie',
    kind: 'girl',
    name: 'Kaelie',
    number: 2,
    height: 62,
    hairColor: '#f3d36b', // blond
    hairStyle: 'ponytail',
    eyeColor: '#3b8fe0',
    skinColor: SKIN_DEFAULT,
    power: 5,
    speed: 9,
    defense: 7,
    hitPhrase: 'Pow ! En plein dedans !',
    bats: 'R',
    expression: 'enthusiastic',
    personality: 'Pétillante',
  },
];

/** Prénom court montré dans l'interface (ex. « OPHÉLIE »). */
export function shortName(fullName: string): string {
  return fullName.split(' ')[0].toUpperCase();
}
