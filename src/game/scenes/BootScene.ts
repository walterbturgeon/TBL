import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { Save } from '../systems/Save';

/** Tout est dessiné en vecteurs et les sons sont synthétisés : rien à charger. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    document.getElementById('loading')?.remove();
    const s = Save.settings;
    Sound.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
    this.scene.start('Menu');
  }
}
