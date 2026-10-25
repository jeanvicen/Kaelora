// Gera os ícones do PWA (PNG) sem nenhuma dependência: um rasterizador 2D
// minúsculo com supersampling, desenhando o Núcleo voxel do Kaelora em estilo toon.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- PNG ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
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
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- geometria ----------
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function distPoly(px, py, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distSeg(px, py, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

const C = {
  bgTop: hex('#3a1f8f'),
  bgBottom: hex('#0a1030'),
  ringA: hex('#ff3cac'),
  ringB: hex('#ffb13c'),
  grass: hex('#5be37d'),
  grassDark: hex('#2fae59'),
  dirtL: hex('#d9873f'),
  dirtR: hex('#8e4f26'),
  neon: hex('#ff4fd8'),
  gem1: hex('#e9fdff'),
  gem2: hex('#7df9ff'),
  gem3: hex('#2fc6e6'),
  gem4: hex('#1876b5'),
  ink: hex('#0b0b16'),
  glow: hex('#7df9ff'),
};

// Cena no espaço [0,1]; `s` escala o conteúdo em torno do centro (ícone maskable).
function scene(u, v, s, rounded) {
  // conteúdo encolhido em torno do centro
  const x = (u - 0.5) / s + 0.5;
  const y = (v - 0.5) / s + 0.5;
  const r = 0.22;
  if (rounded) {
    const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
    const qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    if (Math.hypot(qx, qy) > r) return null;
  }
  // fundo: gradiente vertical + brilho radial
  let col = mix(C.bgTop, C.bgBottom, Math.min(1, Math.max(0, v)));
  const g = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.42) / 0.55);
  col = mix(col, hex('#6b2fd1'), g * 0.55);

  // anel neon (pôr do sol tropical)
  const dRing = Math.abs(Math.hypot(x - 0.5, y - 0.44) - 0.31);
  if (dRing < 0.034) {
    const t = Math.min(1, Math.max(0, (y - 0.13) / 0.62));
    col = dRing < 0.022 ? mix(C.ringA, C.ringB, t) : C.ink;
  } else if (dRing < 0.07) {
    col = mix(col, mix(C.ringA, C.ringB, 0.5), (1 - (dRing - 0.034) / 0.036) * 0.35);
  }

  // brilho do cristal
  const dg = Math.hypot(x - 0.5, y - 0.36);
  if (dg < 0.26) col = mix(col, C.glow, (1 - dg / 0.26) ** 2 * 0.55);

  // base voxel isométrica
  const top = [[0.5, 0.56], [0.72, 0.665], [0.5, 0.77], [0.28, 0.665]];
  const left = [[0.28, 0.665], [0.5, 0.77], [0.5, 0.9], [0.28, 0.795]];
  const right = [[0.5, 0.77], [0.72, 0.665], [0.72, 0.795], [0.5, 0.9]];
  const base = [[0.5, 0.56], [0.72, 0.665], [0.72, 0.795], [0.5, 0.9], [0.28, 0.795], [0.28, 0.665]];
  const ow = 0.016;
  if (inPoly(x, y, base) || distPoly(x, y, base) < ow) {
    col = C.ink;
    if (inPoly(x, y, top) && distPoly(x, y, top) > ow * 0.35) {
      // grama em dois tons, xadrez voxel
      const a = (x - 0.5) / 0.22 + (y - 0.665) / 0.105;
      const b = -(x - 0.5) / 0.22 + (y - 0.665) / 0.105;
      const checker = (Math.floor((a + 2) * 1.5) + Math.floor((b + 2) * 1.5)) % 2;
      col = checker ? C.grass : mix(C.grass, C.grassDark, 0.35);
    } else if (inPoly(x, y, left) && distPoly(x, y, left) > ow * 0.35) {
      col = C.dirtL;
      const ny = (y - 0.665 - (x - 0.28) * (0.105 / 0.22)) / 0.13;
      if (Math.abs(ny - 0.42) < 0.08) col = C.neon;
    } else if (inPoly(x, y, right) && distPoly(x, y, right) > ow * 0.35) {
      col = C.dirtR;
      const ny = (y - 0.77 + (x - 0.5) * (0.105 / 0.22)) / 0.13;
      if (Math.abs(ny - 0.42) < 0.08) col = mix(C.neon, C.ink, 0.25);
    }
  }

  // cristal (Núcleo) com 3 tons toon
  const T = [0.5, 0.12];
  const L = [0.37, 0.33];
  const R = [0.63, 0.33];
  const M = [0.5, 0.36];
  const B = [0.5, 0.505];
  const gem = [T, R, B, L];
  if (inPoly(x, y, gem) || distPoly(x, y, gem) < ow) {
    col = C.ink;
    const inset = ow * 0.3;
    const faces = [
      [[T, L, M], C.gem1],
      [[T, M, R], C.gem2],
      [[L, B, M], C.gem3],
      [[M, B, R], C.gem4],
    ];
    for (const [poly, c] of faces) if (inPoly(x, y, poly) && distPoly(x, y, gem) > inset) col = c;
    // brilho especular
    if (Math.hypot(x - 0.45, y - 0.24) < 0.022) col = [255, 255, 255];
  }

  // faíscas
  for (const [sx, sy, sr] of [[0.2, 0.25, 0.035], [0.82, 0.3, 0.028], [0.76, 0.56, 0.02]]) {
    const dx = Math.abs(x - sx);
    const dy = Math.abs(y - sy);
    if ((dx < sr && dy < sr * 0.18) || (dy < sr && dx < sr * 0.18)) col = [255, 247, 210];
  }
  return col;
}

function render(size, { scale = 1, rounded = false } = {}) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = scene((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, scale, rounded);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      const n = ss * ss;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

const jobs = [
  ['icon-192.png', 192, { rounded: true, scale: 0.94 }],
  ['icon-512.png', 512, { rounded: true, scale: 0.94 }],
  ['maskable-192.png', 192, { scale: 0.74 }],
  ['maskable-512.png', 512, { scale: 0.74 }],
  ['apple-touch-icon.png', 180, { scale: 0.86 }],
  ['favicon-64.png', 64, { rounded: true, scale: 1 }],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(outDir, name), render(size, opts));
  console.log('ícone gerado:', name);
}
