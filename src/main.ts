import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PlayerSelectScene } from './game/scenes/PlayerSelectScene';
import { OptionsScene } from './game/scenes/OptionsScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { GameScene } from './game/scenes/GameScene';
import { HudScene } from './game/scenes/HudScene';
import { ResultScene } from './game/scenes/ResultScene';
import { Sound } from './game/audio/Sound';
import { Save } from './game/systems/Save';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0f1a3d',
  // la scène garde son ratio 16:9 sur 1366×768, 1920×1080, 2560×1440, etc.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, roundPixels: false },
  input: { keyboard: true, gamepad: false },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, TeamSelectScene, PlayerSelectScene, OptionsScene, GameScene, HudScene, ResultScene],
});

// Le son démarre au premier geste de l'utilisateur (règle des navigateurs).
const unlock = () => {
  Sound.unlock();
  const s = Save.settings;
  Sound.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
};
window.addEventListener('keydown', unlock, { capture: true });
window.addEventListener('pointerdown', unlock, { capture: true });

// La barre d'espace et les flèches ne doivent pas faire défiler la page.
window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});

// PWA : service worker en production seulement (Vite gère le rechargement en développement).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* hors ligne non disponible : le jeu fonctionne quand même */
    });
  });
}

(window as unknown as { game: Phaser.Game }).game = game;
