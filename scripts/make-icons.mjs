// Génère les icônes PNG de la PWA sans dépendance (zlib de Node seulement).
// Usage : npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 3; // sur-échantillonnage pour l'anticrénelage
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NAVY = [27, 42, 107], WHITE = [255, 255, 255], RED = [214, 40, 40], BLACK = [17, 17, 17], GOLD = [242, 196, 70];

function icon(maskable) {
  return (u, v) => {
    const pad = maskable ? 0 : 0.04;
    const rad = 0.2;
    // fond carré arrondi
    const qx = Math.max(Math.abs(u - 0.5) - (0.5 - pad - rad), 0);
    const qy = Math.max(Math.abs(v - 0.5) - (0.5 - pad - rad), 0);
    const inBg = maskable || Math.hypot(qx, qy) <= rad;
    if (!inBg) return [0, 0, 0, 0];
    const s = maskable ? 0.8 : 1; // zone sûre pour l'icône « maskable »
    const x = (u - 0.5) / s, y = (v - 0.5) / s;
    const d = Math.hypot(x, y);
    const R = 0.33;
    if (d <= R + 0.025 && d > R) return [...BLACK, 1];
    if (d <= R) {
      // coutures rouges : deux arcs
      for (const side of [-1, 1]) {
        const cx = side * 0.47;
        const dd = Math.abs(Math.hypot(x - cx, y) - 0.3);
        if (dd < 0.018) return [...RED, 1];
        if (dd < 0.055 && Math.abs(((Math.atan2(y, x - cx) * 12) % 1)) < 0.25 && dd > 0.03) return [...RED, 1];
      }
      return [...WHITE, 1];
    }
    // bande dorée en bas
    if (y > 0.36 && y < 0.42) return [...GOLD, 1];
    return [...NAVY, 1];
  };
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, icon(false)));
writeFileSync('public/icons/icon-512.png', png(512, icon(false)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, icon(true)));
console.log('Icônes écrites dans public/icons/');
