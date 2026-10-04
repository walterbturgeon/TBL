import Phaser from 'phaser';
import { Sound } from '../audio/Sound';

export const FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif';

/** Texte cartoon : gros contour noir et petite ombre. */
export function cartoonText(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#ffffff') {
  const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, align: 'center' });
  t.setStroke('#111111', Math.max(4, Math.round(size / 6)));
  t.setShadow(3, 4, '#000000', 0, true, false);
  return t;
}

/** Panneau arrondi bleu foncé avec contour noir épais. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = 0x0f1a3d, alpha = 0.86) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 5, y + 7, w, h, 18);
  g.fillStyle(color, alpha);
  g.fillRoundedRect(x, y, w, h, 18);
  g.lineStyle(5, 0x111111, 1);
  g.strokeRoundedRect(x, y, w, h, 18);
  g.lineStyle(2, 0xffd23f, 0.8);
  g.strokeRoundedRect(x + 7, y + 7, w - 14, h - 14, 12);
  return g;
}

export interface MenuButton {
  c: Phaser.GameObjects.Container;
  setSelected(on: boolean): void;
  label: Phaser.GameObjects.Text;
}

/** Gros bouton cartoon. */
export function button(scene: Phaser.Scene, x: number, y: number, label: string, w = 420, h = 92, onClick?: () => void): MenuButton {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (sel: boolean) => {
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 8, w, h, 24);
    g.fillStyle(sel ? 0xffd23f : 0x1b2a6b, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    g.fillStyle(0xffffff, sel ? 0.35 : 0.12);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + 8, w - 20, h * 0.35, 16);
    g.lineStyle(6, 0x111111, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
  };
  draw(false);
  const t = cartoonText(scene, 0, 0, label, Math.round(h * 0.42), '#ffffff').setOrigin(0.5);
  c.add([g, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  if (onClick)
    c.on('pointerdown', () => {
      Sound.unlock();
      Sound.play('select');
      onClick();
    });
  return {
    c,
    label: t,
    setSelected(on: boolean) {
      draw(on);
      t.setColor(on ? '#1b2a6b' : '#ffffff');
      t.setStroke(on ? '#ffffff' : '#111111', Math.max(4, Math.round(h * 0.07)));
      scene.tweens.killTweensOf(c);
      scene.tweens.add({ targets: c, scale: on ? 1.06 : 1, duration: 120, ease: 'Back.Out' });
    },
  };
}

/** Barre de statistique (1 à 10). */
export function statBar(scene: Phaser.Scene, x: number, y: number, label: string, value: number, w = 300, color = 0xffd23f, labelW = 150, size = 17) {
  const g = scene.add.graphics();
  const t = cartoonText(scene, x, y, label, size, '#ffffff').setOrigin(0, 0.5);
  const bx = x + labelW;
  const bw = w - labelW - 26;
  g.fillStyle(0x0b1230, 1);
  g.fillRoundedRect(bx, y - 9, bw, 18, 9);
  g.fillStyle(color, 1);
  g.fillRoundedRect(bx, y - 9, Math.max(18, (bw * value) / 10), 18, 9);
  g.lineStyle(3, 0x111111, 1);
  g.strokeRoundedRect(bx, y - 9, bw, 18, 9);
  for (let i = 1; i < 10; i++) {
    g.lineStyle(1, 0x000000, 0.35);
    g.lineBetween(bx + (bw * i) / 10, y - 8, bx + (bw * i) / 10, y + 8);
  }
  const v = cartoonText(scene, bx + bw + 8, y, String(value), size, '#ffffff').setOrigin(0, 0.5);
  return [g, t, v];
}

/**
 * Bouton Retour de la télécommande (ou Lecture/Pause) : appelle fn tant que la scène est active.
 * Voir main.ts pour la détection de la touche.
 */
export function onTvBack(scene: Phaser.Scene, fn: () => void) {
  scene.game.events.on('tv-back', fn);
  scene.events.once('shutdown', () => scene.game.events.off('tv-back', fn));
}

/** Bascule le plein écran (doit venir d'un geste de l'utilisateur). */
export function toggleFullscreen(scene: Phaser.Scene) {
  if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
  else scene.scale.startFullscreen();
}
