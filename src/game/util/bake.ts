import Phaser from 'phaser';

/**
 * Dessine une fois avec Graphics, puis garde le résultat comme texture.
 * Une image coûte beaucoup moins cher qu'un Graphics, qui est recalculé à chaque image.
 * bounds = [x0, y0, x1, y1] dans le repère du dessin ; res = finesse de la texture.
 */
export function bakeTexture(
  scene: Phaser.Scene,
  key: string,
  bounds: [number, number, number, number],
  res: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
) {
  if (scene.textures.exists(key)) return key;
  const g = new Phaser.GameObjects.Graphics(scene);
  g.scaleCanvas(res, res);
  g.translateCanvas(-bounds[0], -bounds[1]);
  draw(g);
  g.generateTexture(key, Math.ceil((bounds[2] - bounds[0]) * res), Math.ceil((bounds[3] - bounds[1]) * res));
  g.destroy();
  return key;
}

/** Image placée pour que le point (0, 0) du dessin tombe sur (x, y). */
export function bakedImage(scene: Phaser.Scene, key: string, bounds: [number, number, number, number], res: number, x: number, y: number) {
  const img = scene.add.image(x, y, key);
  img.setOrigin(-bounds[0] / (bounds[2] - bounds[0]), -bounds[1] / (bounds[3] - bounds[1]));
  img.setScale(1 / res);
  return img;
}
