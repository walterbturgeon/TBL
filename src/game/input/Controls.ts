import Phaser from 'phaser';

/**
 * Couche d'entrée : le jeu lit des « actions », pas des touches.
 * Une manette pourra plus tard alimenter les mêmes actions (voir pollGamepad).
 */
export type ActionName =
  | 'swing' // ESPACE : frapper / lancer
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'advance' // E
  | 'retreat' // Q
  | 'pause' // ÉCHAP
  | 'confirm' // ENTRÉE
  | 'mute' // M
  | 'base1'
  | 'base2'
  | 'base3'
  | 'base4';

const BINDINGS: Record<ActionName, string[]> = {
  swing: ['SPACE'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  advance: ['E'],
  retreat: ['Q'],
  pause: ['ESC', 'P'],
  confirm: ['ENTER'],
  mute: ['M'],
  base1: ['ONE', 'NUMPAD_ONE'],
  base2: ['TWO', 'NUMPAD_TWO'],
  base3: ['THREE', 'NUMPAD_THREE'],
  base4: ['FOUR', 'NUMPAD_FOUR'],
};

export class Controls {
  private keys = new Map<ActionName, Phaser.Input.Keyboard.Key[]>();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    for (const [action, names] of Object.entries(BINDINGS) as [ActionName, string[]][]) {
      this.keys.set(
        action,
        names.map((n) => kb.addKey(Phaser.Input.Keyboard.KeyCodes[n as keyof typeof Phaser.Input.Keyboard.KeyCodes], true, false)),
      );
    }
  }

  isDown(a: ActionName) {
    return this.keys.get(a)!.some((k) => k.isDown);
  }

  justDown(a: ActionName) {
    let hit = false;
    for (const k of this.keys.get(a)!) if (Phaser.Input.Keyboard.JustDown(k)) hit = true;
    return hit;
  }

  /** Direction de déplacement à l'écran (x droite, y haut = vers le champ centre). */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y += 1;
    if (this.isDown('down')) y -= 1;
    return { x, y };
  }

  /** Point d'entrée futur pour la manette (non utilisé dans la version 0.1). */
  pollGamepad() {
    /* à venir */
  }
}
