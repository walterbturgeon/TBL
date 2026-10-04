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
import { isTouch } from './game/util/device';

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

// Télécommande : Retour et Lecture/Pause = pause dans la partie, retour au menu ailleurs.
const TV_KEYS = ['GoBack', 'BrowserBack', 'MediaPlayPause', 'MediaPlay', 'MediaPause'];
window.addEventListener('keydown', (e) => {
  if (TV_KEYS.includes(e.key) || e.keyCode === 179) {
    e.preventDefault();
    game.events.emit('tv-back');
  }
});
// Sur une télé, le bouton Retour du navigateur quitte la page : on le remplace par « pause ».
const isTV = /AFT|Silk|SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|GoogleTV|Android TV|CrKey/i.test(navigator.userAgent);
if (isTV) {
  history.pushState({ tbl: true }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ tbl: true }, '');
    game.events.emit('tv-back');
  });
}

// Téléphone : au premier toucher, plein écran et écran bloqué à l'horizontale (Android ; iPhone l'ignore).
if (isTouch()) {
  const goFull = () => {
    window.removeEventListener('pointerup', goFull);
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      Promise.resolve(p)
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => undefined);
    } catch {
      /* pas de plein écran sur cet appareil : le jeu marche quand même */
    }
  };
  window.addEventListener('pointerup', goFull);
}

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
