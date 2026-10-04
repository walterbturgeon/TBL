import Phaser from 'phaser';
import { LOW } from './quality';

/**
 * Atlas de textures : toutes les pièces des personnages d'une scène sont dessinées dans
 * quelques grands canvas partagés (au lieu d'un canvas par pièce).
 * Certains navigateurs de télé plantent quand il y a des centaines de canvas.
 * Les atlas d'une scène sont retirés de la mémoire quand la scène se ferme.
 */
const SIZE = LOW ? 1024 : 2048;
const PAD = 1;

interface Registry {
  atlases: string[];
  frames: Map<string, string>; // nom de la pièce → clé de l'atlas
  key: string;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  rowH: number;
  dirty: Set<string>;
  flushQueued: boolean;
}

const registries = new WeakMap<Phaser.Scene, Registry>();
let serial = 0;

function newAtlas(scene: Phaser.Scene, reg: Registry | null): Registry {
  const key = `atlas_${scene.sys.settings.key}_${serial++}`;
  const tex = scene.textures.createCanvas(key, SIZE, SIZE)!;
  const r: Registry = reg ?? {
    atlases: [],
    frames: new Map(),
    key,
    ctx: tex.getContext(),
    x: 0,
    y: 0,
    rowH: 0,
    dirty: new Set(),
    flushQueued: false,
  };
  r.atlases.push(key);
  r.key = key;
  r.ctx = tex.getContext();
  r.x = 0;
  r.y = 0;
  r.rowH = 0;
  return r;
}

function registry(scene: Phaser.Scene): Registry {
  let reg = registries.get(scene);
  if (!reg) {
    const r = newAtlas(scene, null);
    reg = r;
    registries.set(scene, r);
    scene.events.once('shutdown', () => {
      for (const k of r.atlases) if (scene.textures.exists(k)) scene.textures.remove(k);
      registries.delete(scene);
    });
  }
  return reg;
}

/** Envoie les atlas modifiés à la carte graphique, une seule fois avant le rendu. */
function queueFlush(scene: Phaser.Scene, reg: Registry) {
  if (reg.flushQueued) return;
  reg.flushQueued = true;
  scene.events.once('prerender', () => {
    reg.flushQueued = false;
    for (const k of reg.dirty) {
      const t = scene.textures.get(k) as Phaser.Textures.CanvasTexture;
      if (t && t.refresh) t.refresh();
    }
    reg.dirty.clear();
  });
}

type TargetCam = { setScene(s: Phaser.Scene): void; setViewport(x: number, y: number, w: number, h: number): void; scrollX: number; scrollY: number };

/**
 * Dessine le contenu de g (repère local) dans l'atlas de la scène.
 * Retourne la clé de l'atlas et le nom du cadre à utiliser avec image.setTexture(atlas, cadre).
 */
export function bakeToAtlas(
  scene: Phaser.Scene,
  name: string,
  g: Phaser.GameObjects.Graphics,
  b: [number, number, number, number],
  res: number,
): { atlas: string; frame: string } {
  const reg = registry(scene);
  const known = reg.frames.get(name);
  if (known) return { atlas: known, frame: name };

  const w = Math.ceil((b[2] - b[0]) * res);
  const h = Math.ceil((b[3] - b[1]) * res);
  if (reg.x + w + PAD * 2 > SIZE) {
    reg.x = 0;
    reg.y += reg.rowH;
    reg.rowH = 0;
  }
  if (reg.y + h + PAD * 2 > SIZE) newAtlas(scene, reg);
  const ox = reg.x + PAD;
  const oy = reg.y + PAD;

  // place le dessin dans sa case : décalage, échelle, puis origine de la boîte
  const cmds = g.commandBuffer.slice();
  g.clear();
  g.translateCanvas(ox, oy);
  g.scaleCanvas(res, res);
  g.translateCanvas(-b[0], -b[1]);
  for (const c of cmds) g.commandBuffer.push(c);

  const cam = (Phaser.GameObjects.Graphics as unknown as { TargetCamera: TargetCam }).TargetCamera;
  cam.setScene(scene);
  cam.setViewport(0, 0, SIZE, SIZE);
  cam.scrollX = 0;
  cam.scrollY = 0;
  const render = (g as unknown as { renderCanvas: (...a: unknown[]) => void }).renderCanvas;
  render.call(g, scene.sys.game.renderer, g, cam, null, reg.ctx, false);
  g.clear();

  const tex = scene.textures.get(reg.key);
  tex.add(name, 0, ox, oy, w, h);
  reg.frames.set(name, reg.key);
  reg.x += w + PAD * 2;
  reg.rowH = Math.max(reg.rowH, h + PAD * 2);
  reg.dirty.add(reg.key);
  queueFlush(scene, reg);
  return { atlas: reg.key, frame: name };
}
