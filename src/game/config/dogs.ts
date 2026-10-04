// =====================================================================
//  BILLY (lanceur) ET STELLA (receveuse)
//  Change librement les valeurs. Statistiques sur 10.
// =====================================================================
import type { Expression } from './players';

export type FurStyle = 'curly' | 'wavy';

export interface DogConfig {
  id: string;
  kind: 'dog';
  name: string;
  species: 'chien';
  breed: string;
  furColor: string;
  furLight: string; // museau et ventre
  furStyle: FurStyle;
  role: 'pitcher' | 'catcher';
  number: number;
  heightScale: number; // 1 = taille moyenne d'une joueuse
  bodyWidth: number; // 1 = normal ; plus grand = plus robuste
  speed: number;
  defense: number;
  pitching: number; // vitesse du lancer
  control: number; // précision
  movement: number; // effet
  catching: number;
  throwing: number;
  power: number; // au bâton (non utilisé dans l'alignement par défaut)
  expression: Expression;
  personality: string;
  uniformColor?: string;
}

export const BILLY: DogConfig = {
  id: 'billy',
  kind: 'dog',
  name: 'Billy',
  species: 'chien',
  breed: 'Goldendoodle',
  furColor: '#f1d79a',
  furLight: '#fbeccb',
  furStyle: 'curly',
  role: 'pitcher',
  number: 99,
  heightScale: 1.05,
  bodyWidth: 1,
  speed: 6,
  defense: 7,
  pitching: 8,
  control: 7,
  movement: 6,
  catching: 6,
  throwing: 8,
  power: 5,
  expression: 'happy',
  personality: 'Joyeux et un peu excité',
};

export const STELLA: DogConfig = {
  id: 'stella',
  kind: 'dog',
  name: 'Stella',
  species: 'chien',
  breed: 'Golden Retriever',
  furColor: '#dba44a',
  furLight: '#f2cf8a',
  furStyle: 'wavy',
  role: 'catcher',
  number: 19,
  heightScale: 1.0,
  bodyWidth: 1.15,
  speed: 5,
  defense: 9,
  pitching: 5,
  control: 7,
  movement: 4,
  catching: 9,
  throwing: 7,
  power: 6,
  expression: 'attentive',
  personality: 'Calme et attentive',
};

export const DOGS: DogConfig[] = [BILLY, STELLA];
