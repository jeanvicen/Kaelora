import type { BuildingType, Element } from '../../meta/types.ts';
import { C, ELEMENT_COLORS } from '../colors.ts';
import { Palette, VoxelGrid, type VoxelModel } from '../voxel.ts';

/** Um voxel = 1/8 de casa da grade. */
export const BUILDING_VOXEL = 1 / 8;

/** Parte móvel (cabeça de torre, cristal) com pivô em voxels relativo ao modelo base. */
export interface ModelPart {
  model: VoxelModel;
  /** Posição do pivô da parte, em voxels, no espaço do modelo base (origem = centro da base). */
  at: [number, number, number];
  /** Como a parte se mexe: 'aim' gira para mirar, 'spin' gira sem parar, 'bob' flutua. */
  motion: 'aim' | 'spin' | 'bob' | 'spinBob' | 'counterSpin';
  pivot?: 'bottom' | 'center';
  /** Peças emissivas ficam sem contorno (o hull vaza nos degraus diagonais). */
  outline?: boolean;
}

export interface BuildingModel {
  base: VoxelModel;
  parts: ModelPart[];
  /** Altura aproximada em casas (para barras de vida e câmera). */
  height: number;
}

export function tierOf(level: number): 1 | 2 | 3 {
  return level <= 3 ? 1 : level <= 6 ? 2 : 3;
}

/** Hash determinístico simples para detalhes "aleatórios" das decorações. */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function pad(g: VoxelGrid, p: Palette, w: number, d: number): void {
  const slab = p.add(C.slab);
  const rim = p.add(C.concreteDark);
  g.box(0, 0, 0, w, 1, d, rim);
  g.box(1, 0, 1, w - 1, 1, d - 1, slab);
}

/** Tubo ao longo de z (canos, canhões). */
function tubeZ(g: VoxelGrid, cx: number, cy: number, z0: number, z1: number, r: number, c: number): void {
  for (let z = z0; z < z1; z++)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) g.set(x, y, z, c);
      }
}

/** Octógono preenchido (cantos cortados) — base de muitas construções. */
function octagon(g: VoxelGrid, cx: number, cz: number, r: number, y0: number, y1: number, c: number): void {
  const cut = Math.round(r * 0.42);
  for (let y = y0; y < y1; y++)
    for (let z = Math.floor(cz - r); z < Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x < Math.ceil(cx + r); x++) {
        const dx = Math.abs(x + 0.5 - cx);
        const dz = Math.abs(z + 0.5 - cz);
        if (dx <= r && dz <= r && dx + dz <= 2 * r - cut) g.set(x, y, z, c);
      }
}

// ---------------------------------------------------------------- Núcleo

function coreModel(level: number, element: Element): BuildingModel {
  const t = tierOf(level);
  const el = ELEMENT_COLORS[element];
  const p = new Palette();
  const g = new VoxelGrid(24, 26, 24);
  pad(g, p, 24, 24);
  const cream = p.add(C.cream);
  const white = p.add(C.white);
  const metal = p.add(C.metal);
  const metalDark = p.add(C.metalDark);
  const gold = p.add(C.gold);
  const glow = p.add(el.glow, { glow: 1 });
  const glowDark = p.add(el.main, { glow: 0.7 });
  const win = p.add(C.window, { night: 1 });

  octagon(g, 12, 12, 11, 1, 4, t === 3 ? p.add(C.creamDark) : cream);
  octagon(g, 12, 12, 11, 3, 4, glowDark);
  octagon(g, 12, 12, 10.5, 4, 5, cream);
  octagon(g, 12, 12, 8, 5, 8, white);
  // janelinhas na base
  for (let i = 3; i < 21; i += 3) {
    g.set(i, 6, 3, win);
    g.set(i, 6, 20, win);
    g.set(3, 6, i, win);
    g.set(20, 6, i, win);
  }
  octagon(g, 12, 12, 8, 7, 8, t >= 2 ? gold : metal);
  // pedestal do cristal
  g.cylinder(12, 12, 4.5, 8, 10, metalDark);
  g.ring(12, 12, 3.6, 4.6, 10, 11, glow);
  g.cylinder(12, 12, 3, 10, 11, metal);

  // pilares nos cantos
  const pylonH = t === 1 ? 15 : t === 2 ? 18 : 21;
  for (const [px, pz] of [
    [4, 4],
    [18, 4],
    [4, 18],
    [18, 18],
  ]) {
    g.box(px, 5, pz, px + 2, pylonH, pz + 2, metal);
    g.box(px, pylonH - 3, pz, px + 2, pylonH - 2, pz + 2, glow);
    g.box(px, pylonH, pz, px + 2, pylonH + 1, pz + 2, t === 3 ? gold : glowDark);
    if (t >= 2) g.box(px, 9, pz, px + 2, 10, pz + 2, glow);
  }
  // escadas na frente (+z) e na lateral (+x)
  g.box(9, 1, 21, 15, 2, 23, white);
  g.box(9, 2, 20, 15, 3, 22, white);
  g.box(21, 1, 9, 23, 2, 15, white);

  // Cristal flutuante (gira e flutua).
  const cp = new Palette();
  const size = t === 1 ? 7 : t === 2 ? 8 : 9;
  const cg = new VoxelGrid(size * 2 + 1, size * 3, size * 2 + 1);
  const hi = cp.add(el.glow, { glow: 0.9 });
  const mid = cp.add(el.main, { glow: 0.85 });
  const lo = cp.add(el.dark, { glow: 0.7 });
  const core = cp.add(0xffffff, { glow: 1 });
  const H = size * 3;
  const peak = Math.round(H * 0.38);
  for (let y = 0; y < H; y++) {
    const r = y < peak ? (y / peak) * size : ((H - 1 - y) / (H - 1 - peak)) * size;
    for (let z = 0; z < cg.sz; z++)
      for (let x = 0; x < cg.sx; x++) {
        const dx = x - size;
        const dz = z - size;
        if (Math.abs(dx) + Math.abs(dz) <= r) {
          const face = dx <= 0 && dz <= 0 ? hi : dx > 0 && dz > 0 ? lo : mid;
          cg.set(x, y, z, face);
        }
      }
  }
  cg.set(size - 1, peak + 2, size - 2, core);
  cg.set(size - 2, peak + 1, size - 1, core);

  // Anel holográfico (gira ao contrário).
  const rp = new Palette();
  const rg = new VoxelGrid(22, 1, 22);
  const ringC = rp.add(el.glow, { glow: 1 });
  const ringW = rp.add(0xffffff, { glow: 1 });
  rg.ring(11, 11, 9.4, 10.6, 0, 1, ringC);
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    rg.set(11 + Math.cos(ang) * 10, 0, 11 + Math.sin(ang) * 10, ringW);
  }

  return {
    base: { grid: g, palette: p },
    parts: [
      { model: { grid: cg, palette: cp }, at: [0, 13, 0], motion: 'spinBob', pivot: 'bottom', outline: false },
      { model: { grid: rg, palette: rp }, at: [0, 18, 0], motion: 'counterSpin', pivot: 'center', outline: false },
    ],
    height: 3.6,
  };
}

// ---------------------------------------------------------------- Barreira

function barrierModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const h = t === 1 ? 9 : t === 2 ? 10 : 11;
  const g = new VoxelGrid(8, h + 1, 8);
  const body = p.add(t === 1 ? C.concrete : C.steel);
  const dark = p.add(C.concreteDark);
  const neon = p.add(t === 3 ? C.gold : C.neonCyan, { glow: t === 3 ? 0.4 : 1 });
  const cap = p.add(t === 3 ? C.gold : C.metal);
  g.box(1, 0, 1, 7, 1, 7, dark);
  g.box(2, 1, 2, 6, h - 1, 6, body);
  g.box(2, Math.floor(h * 0.6), 2, 6, Math.floor(h * 0.6) + 1, 6, neon);
  g.box(1, h - 1, 1, 7, h, 7, cap);
  if (t >= 2) g.box(3, h, 3, 5, h + 1, 5, neon);
  return { base: { grid: g, palette: p }, parts: [], height: h / 8 };
}

/** Trecho de muralha que liga duas barreiras vizinhas (ao longo de +x). */
export function barrierLinkModel(level: number): VoxelModel {
  const t = tierOf(level);
  const p = new Palette();
  const h = t === 1 ? 7 : t === 2 ? 8 : 9;
  const g = new VoxelGrid(4, h, 4);
  const body = p.add(t === 1 ? C.concrete : C.steel);
  const field = p.add(t === 3 ? C.neonYellow : C.neonCyan, { glow: 1 });
  const top = p.add(t === 3 ? C.gold : C.metal);
  g.box(0, 0, 1, 4, h - 3, 3, body);
  g.box(0, h - 3, 1, 4, h - 2, 3, field);
  g.box(0, h - 2, 1, 4, h, 3, top);
  return { grid: g, palette: p };
}

// ---------------------------------------------------------------- Torres

function towerBase(p: Palette, g: VoxelGrid, t: number, neonColor: number, height = 6): void {
  pad(g, p, 16, 16);
  const body = p.add(t === 3 ? C.white : C.concrete);
  const dark = p.add(C.concreteDark);
  const neon = p.add(neonColor, { glow: 1 });
  const gold = p.add(C.gold);
  octagon(g, 8, 8, 7, 1, 2, dark);
  octagon(g, 8, 8, 6.5, 2, height, body);
  octagon(g, 8, 8, 6.8, height - 2, height - 1, neon);
  if (t >= 2) octagon(g, 8, 8, 6.8, 3, 4, t === 3 ? gold : dark);
}

function cannonModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(16, 8, 16);
  towerBase(p, g, t, C.neonOrange);
  const plate = p.add(C.metal);
  g.cylinder(8, 8, 5.5, 6, 7, plate);

  const hp = new Palette();
  const hg = new VoxelGrid(11, 8, 15);
  const shell = hp.add(t === 3 ? C.metalDark : C.metal);
  const dark = hp.add(C.metalDeep);
  const barrel = hp.add(C.metalDark);
  const muzzle = hp.add(C.neonOrange, { glow: 1 });
  const stripe = hp.add(t === 3 ? C.gold : C.orange);
  hg.box(1, 0, 1, 10, 5, 10, shell);
  hg.box(2, 5, 2, 9, 6, 9, shell);
  hg.box(1, 2, 1, 10, 3, 10, stripe);
  hg.box(3, 6, 4, 8, 7, 7, dark);
  tubeZ(hg, 5.5, 3, 8, 14, t === 1 ? 1.6 : 2, barrel);
  tubeZ(hg, 5.5, 3, 13, 15, t === 1 ? 2 : 2.4, muzzle);
  if (t >= 2) {
    tubeZ(hg, 2.5, 2, 9, 12, 0.8, barrel);
    tubeZ(hg, 8.5, 2, 9, 12, 0.8, barrel);
  }
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, 7, 0], motion: 'aim', pivot: 'bottom' }],
    height: 1.9,
  };
}

function laserModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const colH = t === 1 ? 17 : t === 2 ? 20 : 23;
  const g = new VoxelGrid(16, colH + 1, 16);
  towerBase(p, g, t, C.neonCyan, 5);
  const col = p.add(C.white);
  const neon = p.add(C.neonCyan, { glow: 1 });
  const fin = p.add(t === 3 ? C.gold : C.metal);
  const win = p.add(C.window, { night: 1 });
  g.cylinder(8, 8, 3, 5, colH, col);
  for (let y = 8; y < colH - 1; y += 4) g.ring(8, 8, 2.5, 3.4, y, y + 1, neon);
  for (let y = 6; y < colH - 2; y += 4) g.set(8, y, 10, win);
  // aletas
  g.box(7, 5, 2, 9, colH - 4, 3, fin);
  g.box(7, 5, 13, 9, colH - 4, 14, fin);
  g.box(2, 5, 7, 3, colH - 4, 9, fin);
  g.box(13, 5, 7, 14, colH - 4, 9, fin);
  g.cylinder(8, 8, 4, colH - 1, colH, fin);

  const hp = new Palette();
  const hg = new VoxelGrid(9, 7, 11);
  const shell = hp.add(C.metal);
  const lens = hp.add(C.neonCyan, { glow: 1 });
  const core = hp.add(0xffffff, { glow: 1 });
  const dark = hp.add(C.metalDark);
  hg.box(2, 0, 2, 7, 5, 8, shell);
  hg.box(3, 5, 3, 6, 6, 7, dark);
  hg.ellipsoid(4.5, 2.5, 9, 2.2, 2.2, 1.8, lens);
  hg.set(4, 2, 10, core);
  hg.box(1, 1, 3, 2, 4, 6, dark);
  hg.box(7, 1, 3, 8, 4, 6, dark);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, colH, 0], motion: 'aim', pivot: 'bottom' }],
    height: (colH + 6) / 8,
  };
}

function frostModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(16, 9, 16);
  towerBase(p, g, t, C.iceDeep, 7);
  const snow = p.add(C.snow);
  const ice = p.add(C.ice);
  g.cylinder(8, 8, 5.5, 7, 8, snow);
  g.cylinder(8, 8, 3.5, 8, 9, ice);

  const hp = new Palette();
  const hg = new VoxelGrid(13, 18, 13);
  const a = hp.add(C.ice, { glow: 0.55 });
  const b = hp.add(C.iceDeep, { glow: 0.75 });
  const c = hp.add(0xffffff, { glow: 1 });
  const spike = (cx: number, cz: number, h: number, r: number) => {
    for (let y = 0; y < h; y++) {
      const rr = r * (1 - y / h) + 0.3;
      for (let z = 0; z < 13; z++)
        for (let x = 0; x < 13; x++) {
          const dx = x + 0.5 - cx;
          const dz = z + 0.5 - cz;
          if (Math.abs(dx) + Math.abs(dz) <= rr) hg.set(x, y, z, dx < 0 ? a : b);
        }
    }
  };
  spike(6.5, 6.5, t === 1 ? 14 : t === 2 ? 16 : 18, 3.4);
  spike(3.5, 5, 8, 2);
  spike(9.5, 8, 9, 2.2);
  if (t >= 2) spike(5, 10, 7, 1.8);
  if (t === 3) spike(9, 3.5, 7, 1.6);
  hg.set(6, 10, 6, c);
  hg.set(5, 6, 5, c);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, 9, 0], motion: 'spin', pivot: 'bottom', outline: false }],
    height: 2.8,
  };
}

function teslaModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const H = t === 1 ? 20 : t === 2 ? 22 : 25;
  const g = new VoxelGrid(16, H, 16);
  towerBase(p, g, t, C.neonYellow, 5);
  const metal = p.add(C.metal);
  const copper = p.add(t === 3 ? C.gold : C.orange);
  const dark = p.add(C.metalDark);
  g.cylinder(8, 8, 2, 5, H - 5, dark);
  let r = 5;
  for (let y = 6; y < H - 6; y += 2) {
    g.ring(8, 8, r - 1.2, r, y, y + 1, copper);
    r = Math.max(2.6, r - 0.45);
  }
  g.cylinder(8, 8, 3, H - 6, H - 5, metal);
  // pontas
  for (const [x, z] of [
    [3, 8],
    [13, 8],
    [8, 3],
    [8, 13],
  ]) {
    g.box(x - 0.5, 5, z - 0.5, x + 0.5, 8, z + 0.5, metal);
  }
  const hp = new Palette();
  const hg = new VoxelGrid(7, 7, 7);
  const ball = hp.add(C.neonYellow, { glow: 1 });
  const core = hp.add(0xffffff, { glow: 1 });
  hg.sphere(3.5, 3.5, 3.5, 3.4, ball);
  hg.set(2, 4, 2, core);
  hg.set(3, 5, 3, core);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, H - 5, 0], motion: 'bob', pivot: 'bottom', outline: false }],
    height: (H + 4) / 8,
  };
}

function mortarModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(16, 8, 16);
  pad(g, p, 16, 16);
  const body = p.add(t === 3 ? C.metalDark : C.metal);
  const stripe = p.add(C.neonYellow, { glow: 1 });
  const hazard = p.add(C.black);
  for (let y = 1; y < 7; y++) {
    const inset = Math.max(0, y - 3);
    octagon(g, 8, 8, 7 - inset * 0.7, y, y + 1, body);
  }
  octagon(g, 8, 8, 6.7, 3, 4, stripe);
  for (let i = 0; i < 16; i += 2) g.set(i, 2, 1, hazard);

  const hp = new Palette();
  const hg = new VoxelGrid(10, 14, 12);
  const tube = hp.add(C.metalDark);
  const rim = hp.add(t === 3 ? C.gold : C.neonYellow, { glow: t === 3 ? 0.3 : 1 });
  const base = hp.add(C.metal);
  hg.cylinder(5, 6, 4, 0, 3, base);
  const r = t === 1 ? 2.2 : 2.6;
  for (let i = 0; i < 11; i++) {
    const y = 2 + i * 0.95;
    const z = 6 + i * 0.5;
    hg.ellipsoid(5, y, z, r, 0.8, r, tube);
  }
  hg.ring(5, 11, r - 1, r + 0.4, 12, 13, rim);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, 7, 0], motion: 'aim', pivot: 'bottom' }],
    height: 2.2,
  };
}

function trapModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(8, 2, 8);
  const plate = p.add(C.metalDark);
  const y1 = p.add(C.neonYellow);
  const b1 = p.add(C.black);
  const btn = p.add(t === 3 ? C.neonPurple : C.red, { glow: 1 });
  g.box(1, 0, 1, 7, 1, 7, plate);
  for (let i = 1; i < 7; i++) {
    g.set(i, 1, 1, (i % 2 ? y1 : b1));
    g.set(i, 1, 6, (i % 2 ? b1 : y1));
    g.set(1, 1, i, (i % 2 ? b1 : y1));
    g.set(6, 1, i, (i % 2 ? y1 : b1));
  }
  g.box(3, 1, 3, 5, 2, 5, btn);
  return { base: { grid: g, palette: p }, parts: [], height: 0.3 };
}

// ---------------------------------------------------------------- Economia e exército

function generatorModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(16, 18, 16);
  pad(g, p, 16, 16);
  const cream = p.add(C.cream);
  const glass = p.add(C.glass, { glow: 0.25 });
  const metal = p.add(C.metal);
  const panel = p.add(C.blueDark);
  const panelHi = p.add(C.blue);
  const gold = p.add(C.gold, { glow: 0.5 });
  const neon = p.add(C.neonYellow, { glow: 1 });
  g.box(1, 1, 1, 15, 4, 15, cream);
  g.box(1, 3, 1, 15, 4, 15, t >= 2 ? gold : metal);
  const tankH = t === 1 ? 13 : t === 2 ? 15 : 17;
  g.cylinder(8, 8, 4, 4, tankH, glass);
  g.ring(8, 8, 3.4, 4.4, 4, 5, metal);
  g.ring(8, 8, 3.4, 4.4, tankH - 1, tankH, metal);
  g.cylinder(8, 8, 2.2, tankH - 1, tankH, neon);
  // painéis solares inclinados
  for (let i = 0; i < (t === 1 ? 1 : 2); i++) {
    const z0 = i === 0 ? 1 : 11;
    for (let k = 0; k < 4; k++) g.box(1, 4 + k, z0 + k, 4, 5 + k, z0 + k + 1, k % 2 ? panel : panelHi);
  }
  // chaminé
  g.cylinder(13, 3, 1.4, 4, 12, metal);
  g.ring(13, 3, 0.9, 1.5, 11, 12, neon);

  const cp = new Palette();
  const cg = new VoxelGrid(7, 7, 2);
  const coin = cp.add(C.gold, { glow: 0.85 });
  const coinDark = cp.add(C.goldDark, { glow: 0.6 });
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const d = Math.hypot(x - 3, y - 3);
      if (d <= 3.3) {
        cg.set(x, y, 0, d > 2.4 ? coinDark : coin);
        cg.set(x, y, 1, d > 2.4 ? coinDark : coin);
      }
    }
  cg.set(3, 2, 1, coinDark);
  cg.set(3, 3, 1, coinDark);
  cg.set(3, 4, 1, coinDark);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: cg, palette: cp }, at: [0, 7, 0], motion: 'spinBob', pivot: 'bottom', outline: false }],
    height: 2.2,
  };
}

function vaultModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(16, 13, 16);
  pad(g, p, 16, 16);
  const body = p.add(t === 3 ? C.gold : C.steel);
  const dark = p.add(C.metalDark);
  const door = p.add(t === 3 ? C.white : C.gold);
  const doorIn = p.add(C.metal);
  const light = p.add(C.neonGreen, { glow: 1 });
  const red = p.add(C.red, { glow: 1 });
  g.box(2, 1, 2, 14, 11, 14, body);
  g.box(2, 1, 2, 14, 2, 14, dark);
  g.box(3, 11, 3, 13, 12, 13, dark);
  // porta redonda na frente (+z) e na lateral (+x)
  for (let y = 2; y < 11; y++)
    for (let x = 3; x < 13; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 6.5);
      if (d <= 4.4) g.set(x, y, 14, d > 3.4 ? door : doorIn);
    }
  g.box(6, 6, 15, 10, 7, 16, door);
  g.box(7, 4, 15, 9, 9, 16, door);
  g.set(12, 11, 3, light);
  g.set(12, 11, 12, red);
  g.set(3, 11, 12, light);
  for (let z = 4; z < 12; z += 3) g.box(14, 4, z, 15, 9, z + 1, dark);
  return { base: { grid: g, palette: p }, parts: [], height: 1.6 };
}

function barracksModel(level: number, element: Element): BuildingModel {
  const t = tierOf(level);
  const el = ELEMENT_COLORS[element];
  const p = new Palette();
  const H = t === 1 ? 12 : t === 2 ? 15 : 18;
  const g = new VoxelGrid(24, H + 9, 24);
  pad(g, p, 24, 24);
  const wall = p.add(C.cream);
  const wallDark = p.add(C.creamDark);
  const roof = p.add(C.teal);
  const roofDark = p.add(C.concrete);
  const win = p.add(C.window, { night: 1 });
  const door = p.add(C.metalDeep);
  const neon = p.add(el.glow, { glow: 1 });
  const flag = p.add(el.main, { sway: 0.6 });
  const flagLight = p.add(el.light, { sway: 0.6 });
  const pole = p.add(C.steel);
  const gold = p.add(C.gold);
  g.box(2, 1, 3, 22, H, 19, wall);
  g.box(2, 1, 3, 22, 2, 19, wallDark);
  g.box(1, H, 2, 23, H + 1, 20, roof);
  g.box(3, H + 1, 4, 21, H + 2, 18, roofDark);
  g.box(2, H - 1, 19, 22, H, 20, neon);
  // janelas em andares
  for (let y = 4; y < H - 2; y += 4) {
    for (let x = 4; x < 21; x += 3) g.box(x, y, 19, x + 2, y + 2, 20, win);
    for (let z = 5; z < 18; z += 3) g.box(22, y, z, 23, y + 2, z + 2, win);
  }
  // porta
  g.box(10, 1, 19, 14, 6, 20, door);
  g.box(9, 6, 19, 15, 7, 20, neon);
  // pátio de treino
  g.box(3, 1, 20, 21, 2, 23, p.add(C.sandDark));
  for (const x of [5, 18]) {
    g.box(x, 2, 21, x + 1, 6, 22, p.add(C.trunk));
    g.box(x - 1, 4, 21, x + 2, 5, 22, p.add(C.trunkDark));
    g.box(x, 6, 21, x + 1, 7, 22, p.add(C.red));
  }
  // mastro e bandeira do elemento
  g.box(4, H + 1, 6, 5, H + 9, 7, pole);
  g.box(5, H + 5, 6, 10, H + 8, 7, flag);
  g.box(5, H + 6, 6, 10, H + 7, 7, flagLight);
  if (t === 3) g.box(4, H + 8, 6, 5, H + 9, 7, gold);
  return { base: { grid: g, palette: p }, parts: [], height: (H + 2) / 8 };
}

function labModel(level: number): BuildingModel {
  const t = tierOf(level);
  const p = new Palette();
  const g = new VoxelGrid(24, 22, 24);
  pad(g, p, 24, 24);
  const white = p.add(C.white);
  const trim = p.add(t === 3 ? C.gold : C.teal);
  const glass = p.add(C.glass, { glow: 0.2 });
  const liquid = p.add(C.neonGreen, { glow: 1 });
  const liquid2 = p.add(C.neonPink, { glow: 1 });
  const metal = p.add(C.metal);
  const dish = p.add(C.steel);
  const coreGlow = p.add(C.neonCyan, { glow: 1 });
  octagon(g, 12, 12, 11, 1, 6, white);
  octagon(g, 12, 12, 11.2, 5, 6, trim);
  // cúpula de vidro
  for (let y = 6; y < 16; y++)
    for (let z = 0; z < 24; z++)
      for (let x = 0; x < 24; x++) {
        const d = Math.hypot((x + 0.5 - 12) / 8, (y - 6) / 9, (z + 0.5 - 12) / 8);
        if (d <= 1 && d > 0.8) g.set(x, y, z, glass);
      }
  g.sphere(12, 9, 12, 2.4, coreGlow);
  g.cylinder(12, 12, 1, 6, 8, metal);
  // tubos
  for (const [x, z, c] of [
    [3, 3, liquid],
    [20, 3, liquid2],
    [3, 20, liquid2],
    [20, 20, liquid],
  ] as const) {
    g.cylinder(x + 0.5, z + 0.5, 1.4, 6, t === 1 ? 11 : 13, glass);
    g.cylinder(x + 0.5, z + 0.5, 0.9, 6, t === 1 ? 10 : 12, c);
  }
  // antena parabólica
  g.box(12, 15, 12, 13, 19, 13, metal);
  for (let z = 9; z < 17; z++)
    for (let x = 9; x < 17; x++) {
      const d = Math.hypot(x + 0.5 - 12.5, z + 0.5 - 12.5);
      if (d <= 3.6) g.set(x, 19 + Math.floor(d / 2), z, dish);
    }
  g.set(12, 21, 12, coreGlow);
  return { base: { grid: g, palette: p }, parts: [], height: 2.4 };
}

// ---------------------------------------------------------------- Decorações

function palmModel(seed: number): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(16, 22, 16);
  const trunkA = p.add(C.trunk);
  const trunkB = p.add(C.trunkDark);
  const leaf = p.add(C.leaf, { sway: 1 });
  const leafL = p.add(C.leafLight, { sway: 1 });
  const leafD = p.add(C.leafDark, { sway: 1 });
  const coco = p.add(0x7a4a22, { sway: 0.4 });
  const neon = p.add(hash01(seed) > 0.5 ? C.neonPink : C.neonCyan, { night: 1, glow: 0.35 });
  const grass = p.add(C.grassDark);
  const lean = hash01(seed + 1) * 2 - 1;
  const H = 15 + Math.floor(hash01(seed + 2) * 4);
  g.box(6, 0, 6, 10, 1, 10, grass);
  let x = 8;
  let z = 8;
  for (let y = 1; y < H; y++) {
    const k = y / H;
    x = 7.5 + lean * k * k * 3;
    z = 7.5 + k * k * 1.5;
    g.box(Math.round(x) - 1, y, Math.round(z) - 1, Math.round(x) + 1, y + 1, Math.round(z) + 1, y % 3 === 0 ? trunkB : trunkA);
  }
  g.box(6, 2, 6, 10, 3, 10, neon);
  const tx = Math.round(x);
  const tz = Math.round(z);
  // folhas em leque
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + hash01(seed + 3) * 0.6;
    const len = 6 + (f % 2);
    for (let i = 0; i <= len; i++) {
      const fx = tx + Math.cos(a) * i;
      const fz = tz + Math.sin(a) * i;
      const fy = H + 1 - (i * i) / (len * 1.6);
      const c = i < 2 ? leafD : i % 2 ? leaf : leafL;
      g.set(fx, fy, fz, c);
      g.set(fx, fy - 1, fz, leafD);
      if (i > 1 && i < len) {
        g.set(fx + Math.sin(a), fy, fz - Math.cos(a), c);
        g.set(fx - Math.sin(a), fy, fz + Math.cos(a), c);
      }
    }
  }
  g.box(tx - 1, H, tz - 1, tx + 1, H + 1, tz + 1, coco);
  g.set(tx, H + 1, tz, leafL);
  return { base: { grid: g, palette: p }, parts: [], height: 2.6 };
}

function lampModel(): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(8, 16, 8);
  const metal = p.add(C.metalDark);
  const light = p.add(0xfff1c2, { night: 1, glow: 0.15 });
  const neon = p.add(C.neonCyan, { glow: 0.8 });
  g.box(3, 0, 3, 5, 1, 5, metal);
  g.box(3.5, 1, 3.5, 4.5, 13, 4.5, metal);
  g.box(4, 12, 3, 7, 13, 5, metal);
  g.box(5, 11, 3, 8, 12, 5, light);
  g.box(3, 6, 3, 5, 7, 5, neon);
  return { base: { grid: g, palette: p }, parts: [], height: 1.8 };
}

function neonSignModel(seed: number): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(8, 15, 8);
  const metal = p.add(C.metalDark);
  const panel = p.add(C.metalDeep);
  const colors = [C.neonPink, C.neonCyan, C.neonYellow, C.neonGreen, C.neonPurple, C.neonOrange];
  const a = p.add(colors[Math.floor(hash01(seed) * colors.length)], { glow: 1 });
  const b = p.add(colors[Math.floor(hash01(seed + 7) * colors.length)], { glow: 1 });
  g.box(3, 0, 3, 5, 1, 5, metal);
  g.box(3.5, 1, 3.5, 4.5, 7, 4.5, metal);
  g.box(0, 7, 3, 8, 14, 5, panel);
  for (let x = 0; x < 8; x++) {
    g.set(x, 7, 5, a);
    g.set(x, 13, 5, a);
  }
  for (let y = 7; y < 14; y++) {
    g.set(0, y, 5, a);
    g.set(7, y, 5, a);
  }
  // símbolo: estrela/raio em pixel art
  const shape = Math.floor(hash01(seed + 3) * 3);
  const pix =
    shape === 0
      ? [
          [3, 9], [4, 9], [3, 10], [4, 10], [2, 10], [5, 10], [3, 11], [4, 11], [3, 12],
        ]
      : shape === 1
        ? [
            [4, 12], [3, 11], [4, 11], [3, 10], [2, 9], [3, 9], [4, 9], [4, 8],
          ]
        : [
            [2, 9], [5, 9], [2, 10], [3, 10], [4, 10], [5, 10], [3, 11], [4, 11], [3, 12], [4, 12],
          ];
  for (const [x, y] of pix) g.set(x + 1, y, 5, b);
  return { base: { grid: g, palette: p }, parts: [], height: 1.8 };
}

function flowersModel(seed: number): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(8, 6, 8);
  const box = p.add(C.cream);
  const soil = p.add(C.dirtDark);
  const stem = p.add(C.leafDark, { sway: 0.5 });
  const petals = [C.neonPink, C.neonYellow, C.orange, C.neonPurple, C.red, 0xffffff].map((c) => p.add(c, { sway: 0.6 }));
  g.box(1, 0, 1, 7, 2, 7, box);
  g.box(2, 2, 2, 6, 2, 6, soil);
  g.box(2, 1, 2, 6, 2, 6, soil);
  for (let i = 0; i < 9; i++) {
    const x = 2 + Math.floor(hash01(seed * 31 + i) * 4);
    const z = 2 + Math.floor(hash01(seed * 17 + i * 3) * 4);
    const h = 2 + Math.floor(hash01(seed + i * 5) * 3);
    for (let y = 2; y < h + 1; y++) g.set(x, y, z, stem);
    g.set(x, h + 1, z, petals[Math.floor(hash01(seed + i * 11) * petals.length)]);
  }
  return { base: { grid: g, palette: p }, parts: [], height: 0.7 };
}

function statueModel(): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(16, 8, 16);
  pad(g, p, 16, 16);
  const ped = p.add(C.white);
  const neon = p.add(C.neonCyan, { glow: 1 });
  octagon(g, 8, 8, 5, 1, 5, ped);
  octagon(g, 8, 8, 5.2, 4, 5, neon);
  const hp = new Palette();
  const hg = new VoxelGrid(10, 16, 6);
  const holo = hp.add(C.neonCyan, { glow: 0.9 });
  const holo2 = hp.add(0x9ffcff, { glow: 1 });
  // figura chibi heroica
  hg.box(2, 9, 1, 8, 15, 5, holo);
  hg.box(3, 11, 5, 4, 12, 6, holo2);
  hg.box(6, 11, 5, 7, 12, 6, holo2);
  hg.box(3, 4, 1, 7, 9, 5, holo);
  hg.box(1, 5, 2, 3, 8, 4, holo2);
  hg.box(7, 5, 2, 9, 8, 4, holo2);
  hg.box(9, 7, 2, 10, 15, 3, holo2);
  hg.box(3, 0, 2, 5, 4, 4, holo);
  hg.box(5, 0, 2, 7, 4, 4, holo2);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, 5, 0], motion: 'spin', pivot: 'bottom', outline: false }],
    height: 2.6,
  };
}

function fountainModel(): BuildingModel {
  const p = new Palette();
  const g = new VoxelGrid(16, 6, 16);
  pad(g, p, 16, 16);
  const rim = p.add(C.white);
  const water = p.add(C.glass, { glow: 0.35 });
  const deep = p.add(C.neonCyan, { glow: 0.6 });
  g.cylinder(8, 8, 7, 1, 3, rim);
  g.cylinder(8, 8, 6, 2, 3, water);
  g.cylinder(8, 8, 2, 2, 5, rim);
  g.ring(8, 8, 3, 4, 2, 3, deep);
  const hp = new Palette();
  const hg = new VoxelGrid(5, 12, 5);
  const jet = hp.add(C.neonCyan, { glow: 1 });
  const jetW = hp.add(0xe8ffff, { glow: 1 });
  hg.cylinder(2.5, 2.5, 1, 0, 9, jet);
  hg.sphere(2.5, 9.5, 2.5, 2.2, jetW);
  return {
    base: { grid: g, palette: p },
    parts: [{ model: { grid: hg, palette: hp }, at: [0, 5, 0], motion: 'bob', pivot: 'bottom', outline: false }],
    height: 1.8,
  };
}

/** Modelo voxel de uma construção. `seed` varia detalhes das decorações. */
export function buildingModel(type: BuildingType, level: number, element: Element, seed = 0): BuildingModel {
  switch (type) {
    case 'core':
      return coreModel(level, element);
    case 'barrier':
      return barrierModel(level);
    case 'cannon':
      return cannonModel(level);
    case 'laser':
      return laserModel(level);
    case 'frost':
      return frostModel(level);
    case 'tesla':
      return teslaModel(level);
    case 'mortar':
      return mortarModel(level);
    case 'trap':
      return trapModel(level);
    case 'generator':
      return generatorModel(level);
    case 'vault':
      return vaultModel(level);
    case 'barracks':
      return barracksModel(level, element);
    case 'lab':
      return labModel(level);
    case 'palm':
      return palmModel(seed);
    case 'lamp':
      return lampModel();
    case 'neon':
      return neonSignModel(seed);
    case 'flowers':
      return flowersModel(seed);
    case 'statue':
      return statueModel();
    case 'fountain':
      return fountainModel();
  }
}

/** Quantas variações visuais uma decoração tem (para cache). */
export function decorVariants(type: BuildingType): number {
  return type === 'palm' || type === 'neon' || type === 'flowers' ? 6 : 1;
}
