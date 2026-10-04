import { Save } from '../systems/Save';

/**
 * Qualité choisie au démarrage (change dans les options ; le jeu redémarre).
 * normal = ordinateur et téléphone récents ; light = télé ; canvas = télé sans WebGL.
 */
export const QUALITY = Save.settings.quality;
export const LOW = QUALITY !== 'normal';

export const QUALITY_LABEL: Record<string, string> = {
  normal: 'Normale',
  light: 'Légère (télé)',
  canvas: 'Très légère',
};
