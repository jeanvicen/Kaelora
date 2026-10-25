import * as THREE from 'three';
import type { CharacterDef, CharacterLook } from '../../content/types.ts';
import type { ClassId } from '../../meta/types.ts';
import { C, shade } from '../colors.ts';
import { Palette, VoxelGrid, buildVoxelGeometry, type VoxelModel } from '../voxel.ts';

/** Um voxel de personagem = 1/12 de casa (personagem ≈ 1,35 casa de altura). */
export const CHAR_VOXEL = 1 / 12;

export interface PartModel {
  model: VoxelModel;
  /** Pivô em voxels (posição no pai). */
  at: [number, number, number];
  pivot: 'bottom' | 'center' | 'top';
}

export interface CharacterParts {
  legL: PartModel;
  legR: PartModel;
  body: PartModel;
  head: PartModel;
  armL: PartModel;
  armR: PartModel;
  weapon: PartModel | null;
  offhand: PartModel | null;
  back: PartModel | null;
  float: PartModel | null;
  height: number;
  /** Onde fica a "boca" da arma (para tiros), em voxels relativos ao braço direito. */
  muzzle: [number, number, number];
  aura: number | null;
}

interface Pal {
  p: Palette;
  skin: number;
  skinD: number;
  hair: number;
  hairD: number;
  pri: number;
  priD: number;
  sec: number;
  acc: number;
  accGlow: number;
  eye: number;
  white: number;
  metal: number;
  metalD: number;
  ink: number;
  blush: number;
}

function palette(look: CharacterLook): Pal {
  const p = new Palette();
  return {
    p,
    skin: p.add(look.skin),
    skinD: p.add(shade(look.skin, -0.18)),
    hair: p.add(look.hairColor),
    hairD: p.add(shade(look.hairColor, -0.25)),
    pri: p.add(look.primary),
    priD: p.add(shade(look.primary, -0.22)),
    sec: p.add(look.secondary),
    acc: p.add(look.accent),
    accGlow: p.add(look.accent, { glow: 1 }),
    eye: p.add(look.eye),
    white: p.add(0xffffff),
    metal: p.add(look.metal),
    metalD: p.add(shade(look.metal, -0.3)),
    ink: p.add(C.black),
    blush: p.add(shade(0xff8fa8, 0.1)),
  };
}

const BODY_DIM = { slim: { w: 5, h: 5, d: 3 }, normal: { w: 6, h: 5, d: 4 }, bulky: { w: 8, h: 6, d: 5 } } as const;

// ------------------------------------------------------------ cabeça

function buildHead(look: CharacterLook, P: Pal, cls: ClassId): VoxelModel {
  const g = new VoxelGrid(12, 16, 12);
  const ox = 2;
  const oz = 2;
  const W = 8;
  // formato da cabeça
  g.box(ox, 0, oz, ox + W, 8, oz + W, P.skin);
  if (look.head === 1) {
    // cantos arredondados
    for (const [x, z] of [[ox, oz], [ox + W - 1, oz], [ox, oz + W - 1], [ox + W - 1, oz + W - 1]]) for (let y = 0; y < 8; y += 7) g.set(x, y, z, 0);
  } else if (look.head === 2) {
    g.box(ox, 0, oz, ox + W, 1, oz + 1, 0);
    g.box(ox, 0, oz + W - 1, ox + W, 1, oz + W, 0);
  } else if (look.head === 3) {
    g.box(ox - 1, 2, oz + 2, ox, 6, oz + 6, P.skin);
    g.box(ox + W, 2, oz + 2, ox + W + 1, 6, oz + 6, P.skin);
  }
  // rosto (frente = +z)
  const fz = oz + W - 1;
  g.box(ox + 1, 3, fz, ox + 3, 6, fz + 1, P.eye);
  g.box(ox + 5, 3, fz, ox + 7, 6, fz + 1, P.eye);
  g.set(ox + 1, 5, fz, P.white);
  g.set(ox + 5, 5, fz, P.white);
  g.set(ox + 3, 1, fz, P.skinD);
  g.set(ox + 4, 1, fz, P.skinD);
  g.set(ox, 2, fz, P.blush);
  g.set(ox + 7, 2, fz, P.blush);

  // cabelo
  const hairTop = (h: number) => g.box(ox, 8, oz, ox + W, 8 + h, oz + W, P.hair);
  switch (look.hair) {
    case 0:
      hairTop(1);
      g.box(ox, 6, oz, ox + W, 8, oz + 1, P.hair);
      break;
    case 1: // espetado
      hairTop(1);
      for (let i = 0; i < 4; i++) g.box(ox + i * 2, 9, oz + 1 + (i % 2) * 3, ox + i * 2 + 2, 11 + (i % 2), oz + 4 + (i % 2) * 3, P.hair);
      break;
    case 2: // comprido atrás
      hairTop(1);
      g.box(ox, 1, oz - 1, ox + W, 9, oz + 1, P.hair);
      g.box(ox - 1, 3, oz, ox, 8, oz + 5, P.hair);
      g.box(ox + W, 3, oz, ox + W + 1, 8, oz + 5, P.hair);
      break;
    case 3: // rabo de cavalo
      hairTop(1);
      g.box(ox + 3, 4, oz - 3, ox + 5, 9, oz - 1, P.hairD);
      g.box(ox + 3, 7, oz - 1, ox + 5, 9, oz, P.hair);
      break;
    case 4: // moicano
      g.box(ox + 3, 8, oz, ox + 5, 12, oz + W, P.hair);
      break;
    case 5: // coque
      hairTop(1);
      g.box(ox + 2, 9, oz + 2, ox + 6, 12, oz + 6, P.hair);
      break;
    case 6: // franja de lado
      hairTop(2);
      g.box(ox, 5, oz + W - 1, ox + 4, 8, oz + W, P.hair);
      g.box(ox - 1, 4, oz, ox, 9, oz + W, P.hair);
      break;
    case 7: // careca brilhante
      g.set(ox + 2, 7, fz - 1, P.white);
      break;
    case 8: // cacheado
      hairTop(1);
      for (let x = ox - 1; x <= ox + W; x += 2) for (let z = oz - 1; z <= oz + W - 2; z += 2) g.box(x, 8, z, x + 2, 10, z + 2, P.hair);
      break;
    case 9: // maria-chiquinha
      hairTop(1);
      g.box(ox - 2, 4, oz + 2, ox, 9, oz + 4, P.hair);
      g.box(ox + W, 4, oz + 2, ox + W + 2, 9, oz + 4, P.hair);
      break;
  }

  // chapéus
  switch (look.hat) {
    case 'helmet':
      g.box(ox - 1, 5, oz - 1, ox + W + 1, 10, oz + W + 1, P.metal);
      g.box(ox, 10, oz, ox + W, 11, oz + W, P.metalD);
      g.box(ox - 1, 6, fz + 1, ox + W + 1, 7, fz + 2, P.accGlow);
      g.box(ox + 3, 11, oz + 1, ox + 5, 13, oz + W - 1, P.pri);
      // abre o rosto
      g.box(ox, 3, fz + 1, ox + W, 6, fz + 2, 0);
      break;
    case 'hood':
      // capuz por trás e dos lados, com uma moldura em volta do rosto
      g.box(ox - 1, 1, oz - 1, ox + W + 1, 10, fz, P.pri);
      g.box(ox, 10, oz, ox + W, 11, fz, P.priD);
      g.box(ox - 1, 1, fz, ox, 10, fz + 1, P.pri);
      g.box(ox + W, 1, fz, ox + W + 1, 10, fz + 1, P.pri);
      g.box(ox - 1, 7, fz, ox + W + 1, 10, fz + 1, P.priD);
      g.box(ox + 3, 2, oz - 2, ox + 5, 6, oz - 1, P.priD);
      break;
    case 'crown':
      g.box(ox, 8, oz, ox + W, 10, oz + W, P.metal);
      for (let i = 0; i < 4; i++) {
        g.box(ox + i * 2, 10, oz, ox + i * 2 + 1, 12, oz + 1, P.metal);
        g.box(ox + i * 2 + 1, 10, oz + W - 1, ox + i * 2 + 2, 12, oz + W, P.metal);
      }
      g.set(ox + 3, 9, oz + W, P.accGlow);
      g.set(ox + 4, 9, oz + W, P.accGlow);
      break;
    case 'visor':
      g.box(ox - 1, 3, fz, ox + W + 1, 6, fz + 2, P.accGlow);
      g.box(ox - 1, 6, oz, ox + W + 1, 7, oz + W, P.metalD);
      break;
    case 'cap':
      g.box(ox, 8, oz, ox + W, 10, oz + W, P.pri);
      g.box(ox, 8, oz + W, ox + W, 9, oz + W + 3, P.priD);
      g.set(ox + 4, 9, oz + W - 1, P.acc);
      break;
    case 'wizard': {
      g.box(ox - 2, 8, oz - 2, ox + W + 2, 9, oz + W + 2, P.pri);
      for (let y = 9; y < 16; y++) {
        const r = Math.max(1, 4 - Math.floor((y - 9) / 2));
        const sh = Math.floor((y - 9) / 3);
        g.box(ox + 4 - r + sh, y, oz + 4 - r, ox + 4 + r + sh, y + 1, oz + 4 + r, y === 10 ? P.accGlow : P.pri);
      }
      break;
    }
    case 'halo':
      g.ring(6, 6, 2.6, 3.6, 13, 14, P.accGlow);
      break;
    case 'horns':
      g.box(ox - 2, 7, oz + 3, ox, 9, oz + 5, P.white);
      g.box(ox - 3, 9, oz + 3, ox - 1, 12, oz + 5, P.white);
      g.box(ox + W, 7, oz + 3, ox + W + 2, 9, oz + 5, P.white);
      g.box(ox + W + 1, 9, oz + 3, ox + W + 3, 12, oz + 5, P.white);
      break;
    case 'headband':
      g.box(ox - 1, 6, oz - 1, ox + W + 1, 7, oz + W + 1, P.acc);
      g.box(ox + 2, 4, oz - 3, ox + 3, 7, oz - 1, P.acc);
      g.box(ox + 5, 3, oz - 3, ox + 6, 6, oz - 1, P.acc);
      break;
    case 'hardhat':
      g.box(ox - 1, 8, oz - 1, ox + W + 1, 11, oz + W + 1, 0);
      g.box(ox - 1, 8, oz - 1, ox + W + 1, 10, oz + W + 1, P.p.add(0xffd23f));
      g.box(ox - 2, 8, oz - 2, ox + W + 2, 9, oz + W + 2, P.p.add(0xffb21a));
      g.box(ox + 3, 10, oz, ox + 5, 11, oz + W, P.p.add(0xffb21a));
      break;
    case 'goggles':
      g.box(ox - 1, 7, oz - 1, ox + W + 1, 8, oz + W + 1, P.ink);
      g.box(ox + 1, 7, fz + 1, ox + 3, 9, fz + 2, P.accGlow);
      g.box(ox + 5, 7, fz + 1, ox + 7, 9, fz + 2, P.accGlow);
      break;
    case 'antenna':
      g.box(ox + 1, 8, oz + 3, ox + 2, 13, oz + 4, P.metal);
      g.box(ox + 6, 8, oz + 3, ox + 7, 12, oz + 4, P.metal);
      g.set(ox + 1, 13, oz + 3, P.accGlow);
      g.set(ox + 6, 12, oz + 3, P.accGlow);
      break;
    case 'mask':
      g.box(ox - 1, 0, fz, ox + W + 1, 3, fz + 2, cls === 'assassino' ? P.ink : P.sec);
      break;
    case 'none':
      break;
  }
  return { grid: g, palette: P.p };
}

// ------------------------------------------------------------ corpo, braços, pernas

function buildBody(look: CharacterLook, P: Pal, cls: ClassId): VoxelModel {
  const d = BODY_DIM[look.body];
  const g = new VoxelGrid(d.w, d.h, d.d);
  g.box(0, 0, 0, d.w, d.h, d.d, P.pri);
  g.box(0, 0, 0, d.w, 1, d.d, P.sec);
  g.box(Math.floor(d.w / 2) - 1, 1, d.d - 1, Math.floor(d.w / 2) + 1, d.h - 1, d.d, P.priD);
  g.set(Math.floor(d.w / 2), d.h - 2, d.d - 1, P.accGlow);
  if (cls === 'mago' || cls === 'curandeiro') {
    // túnica: cinto e detalhe dourado
    g.box(0, 1, 0, d.w, 2, d.d, P.metal);
  }
  if (cls === 'construtor' || cls === 'sabotador') {
    g.box(0, 1, 0, d.w, 2, d.d, P.p.add(0x8e5a2e));
    g.set(1, 1, d.d - 1, P.metal);
    g.set(d.w - 2, 1, d.d - 1, P.metal);
  }
  if (look.body === 'bulky') g.box(0, d.h - 2, 0, d.w, d.h, d.d, P.sec);
  return { grid: g, palette: P.p };
}

function buildArm(look: CharacterLook, P: Pal, cls: ClassId, left: boolean): VoxelModel {
  const t = look.body === 'bulky' ? 3 : 2;
  const g = new VoxelGrid(t, 5, t);
  g.box(0, 2, 0, t, 5, t, P.pri);
  g.box(0, 0, 0, t, 2, t, P.skin);
  if (cls === 'lutador') {
    // luvas grandes
    const gl = new VoxelGrid(t + 2, 6, t + 2);
    gl.box(1, 2, 1, t + 1, 6, t + 1, P.pri);
    gl.box(0, 0, 0, t + 2, 3, t + 2, look.weapon === 1 ? P.accGlow : P.metal);
    gl.box(0, 2, 0, t + 2, 3, t + 2, P.metalD);
    if (look.weapon === 0) for (let i = 0; i < t + 2; i += 2) gl.set(i, 1, t + 2 - 1, P.white);
    return { grid: gl, palette: P.p };
  }
  if (look.accessory === 'pads' && !left) g.box(0, 3, 0, t, 5, t, P.metal);
  if (look.accessory === 'pads' && left) g.box(0, 3, 0, t, 5, t, P.metal);
  return { grid: g, palette: P.p };
}

function buildLeg(look: CharacterLook, P: Pal): VoxelModel {
  const t = look.body === 'bulky' ? 3 : 2;
  const g = new VoxelGrid(t, 3, t + 1);
  g.box(0, 1, 0, t, 3, t, P.sec);
  g.box(0, 0, 0, t, 1, t + 1, P.ink);
  return { grid: g, palette: P.p };
}

// ------------------------------------------------------------ armas por classe

function buildWeapon(look: CharacterLook, P: Pal, cls: ClassId): { weapon: VoxelModel | null; offhand: VoxelModel | null; muzzle: [number, number, number] } {
  const v = look.weapon;
  const wood = P.p.add(0x9a6a3a);
  switch (cls) {
    case 'tanque': {
      const s = new VoxelGrid(2, 9, 7);
      s.box(0, 0, 0, 2, 9, 7, P.metal);
      s.box(1, 1, 1, 2, 8, 6, v === 1 ? P.pri : P.sec);
      s.box(1, 3, 3, 2, 6, 4, P.accGlow);
      s.box(1, 4, 2, 2, 5, 5, P.accGlow);
      const w = new VoxelGrid(3, 7, 3);
      w.box(1, 0, 1, 2, 5, 2, wood);
      if (v === 2) w.box(0, 4, 0, 3, 7, 3, P.metalD);
      else w.box(0, 4, 0, 3, 7, 3, P.metal), w.set(1, 6, 1, P.accGlow);
      return { weapon: { grid: w, palette: P.p }, offhand: { grid: s, palette: P.p }, muzzle: [0, 6, 0] };
    }
    case 'lutador':
      return { weapon: null, offhand: null, muzzle: [0, 0, 0] };
    case 'atirador': {
      const g = new VoxelGrid(3, 3, 11);
      g.box(1, 1, 0, 2, 3, 3, P.ink);
      g.box(0, 1, 2, 3, 3, 8, v === 2 ? wood : P.metalD);
      g.box(1, 2, 8, 2, 3, 11, P.metal);
      g.set(1, 2, 10, P.accGlow);
      g.box(1, 0, 3, 2, 1, 5, P.ink);
      if (v === 1) g.box(1, 3, 4, 2, 4, 7, P.accGlow);
      return { weapon: { grid: g, palette: P.p }, offhand: null, muzzle: [0, 2, 10] };
    }
    case 'mago':
    case 'curandeiro': {
      const g = new VoxelGrid(5, 16, 5);
      g.box(2, 0, 2, 3, 13, 3, cls === 'curandeiro' ? P.white : wood);
      if (cls === 'curandeiro') {
        g.box(0, 12, 2, 5, 13, 3, P.metal);
        g.box(2, 11, 2, 3, 16, 3, P.metal);
        g.sphere(2.5, 14, 2.5, 1.5, P.accGlow);
      } else if (v === 0) g.sphere(2.5, 14, 2.5, 2.2, P.accGlow);
      else if (v === 1) {
        g.box(1, 12, 1, 4, 16, 4, P.accGlow);
        g.box(2, 16, 2, 3, 16, 3, P.white);
      } else g.ring(2.5, 2.5, 1.2, 2.4, 13, 14, P.accGlow), g.sphere(2.5, 14.5, 2.5, 1, P.white);
      return { weapon: { grid: g, palette: P.p }, offhand: null, muzzle: [0, 14, 0] };
    }
    case 'invocador': {
      const o = new VoxelGrid(5, 5, 5);
      o.sphere(2.5, 2.5, 2.5, 2.3, P.accGlow);
      o.set(2, 3, 4, P.white);
      const book = new VoxelGrid(2, 4, 4);
      book.box(0, 0, 0, 2, 4, 4, P.pri);
      book.box(1, 0, 0, 2, 4, 1, P.metal);
      return { weapon: { grid: o, palette: P.p }, offhand: v === 1 ? { grid: book, palette: P.p } : null, muzzle: [0, 2, 2] };
    }
    case 'assassino': {
      const mk = () => {
        const g = new VoxelGrid(1, 2, 7);
        g.box(0, 0, 0, 1, 2, 2, P.ink);
        g.box(0, 0, 2, 1, 1, 7, v === 2 ? P.accGlow : P.metal);
        g.box(0, 1, 2, 1, 2, v === 1 ? 6 : 5, v === 2 ? P.accGlow : P.white);
        return { grid: g, palette: P.p };
      };
      return { weapon: mk(), offhand: mk(), muzzle: [0, 0, 6] };
    }
    case 'construtor': {
      const g = new VoxelGrid(5, 10, 3);
      g.box(2, 0, 1, 3, 7, 2, wood);
      if (v === 1) {
        g.box(1, 7, 0, 4, 10, 3, P.metal);
        g.box(0, 8, 1, 1, 10, 2, P.metal);
      } else g.box(0, 7, 0, 5, 10, 3, P.metal), g.box(0, 8, 0, 5, 9, 3, P.accGlow);
      return { weapon: { grid: g, palette: P.p }, offhand: null, muzzle: [0, 8, 0] };
    }
    case 'sabotador': {
      const w = new VoxelGrid(3, 7, 2);
      w.box(1, 0, 0, 2, 5, 2, P.metal);
      w.box(0, 5, 0, 3, 7, 2, P.metal);
      w.box(1, 6, 0, 2, 7, 2, 0);
      const b = new VoxelGrid(4, 4, 4);
      b.sphere(2, 2, 2, 1.9, P.ink);
      b.set(2, 3, 2, P.accGlow);
      return { weapon: { grid: w, palette: P.p }, offhand: { grid: b, palette: P.p }, muzzle: [0, 6, 0] };
    }
    case 'controlador': {
      const d = new VoxelGrid(4, 2, 3);
      d.box(0, 0, 0, 4, 2, 3, P.metalD);
      d.box(1, 1, 2, 3, 2, 3, P.accGlow);
      return { weapon: { grid: d, palette: P.p }, offhand: null, muzzle: [0, 1, 2] };
    }
    case 'bombardeiro': {
      const g = new VoxelGrid(5, 5, 14);
      g.box(0, 0, 0, 5, 5, 14, P.metal);
      g.box(1, 1, 0, 4, 4, 14, P.metalD);
      g.box(0, 0, 12, 5, 5, 14, P.accGlow);
      g.box(1, 1, 12, 4, 4, 14, P.ink);
      g.box(2, -1, 4, 3, 0, 6, P.ink);
      g.box(0, 5, 3, 5, 6, 4, P.pri);
      return { weapon: { grid: g, palette: P.p }, offhand: null, muzzle: [0, 2, 13] };
    }
    case 'suporte': {
      const g = new VoxelGrid(4, 4, 6);
      g.box(1, 1, 0, 3, 3, 3, P.metal);
      g.box(0, 0, 3, 4, 4, 6, P.metal);
      g.box(1, 1, 5, 3, 3, 6, P.accGlow);
      return { weapon: { grid: g, palette: P.p }, offhand: null, muzzle: [0, 2, 5] };
    }
  }
}

function buildBack(look: CharacterLook, P: Pal, bodyH: number, bodyW: number): VoxelModel | null {
  switch (look.accessory) {
    case 'cape': {
      const g = new VoxelGrid(bodyW + 2, bodyH + 3, 1);
      g.box(0, 0, 0, bodyW + 2, bodyH + 3, 1, P.acc);
      g.box(0, 0, 0, bodyW + 2, 1, 1, P.priD);
      g.box(1, bodyH + 2, 0, bodyW + 1, bodyH + 3, 1, P.metal);
      return { grid: g, palette: P.p };
    }
    case 'backpack': {
      const g = new VoxelGrid(bodyW - 1, bodyH, 3);
      g.box(0, 0, 0, bodyW - 1, bodyH, 3, P.sec);
      g.box(0, bodyH - 2, 0, bodyW - 1, bodyH - 1, 3, P.metal);
      g.box(Math.floor(bodyW / 2) - 1, bodyH, 1, Math.floor(bodyW / 2), bodyH + 3, 2, P.metal);
      g.set(Math.floor(bodyW / 2) - 1, bodyH + 3, 1, P.accGlow);
      return { grid: g, palette: P.p };
    }
    case 'wings': {
      const g = new VoxelGrid(16, 10, 2);
      for (let i = 0; i < 7; i++) {
        g.box(7 - i - 1, 3 + Math.floor(i / 2), 0, 7 - i, 9 - Math.floor(i / 3), 1, i % 2 ? P.white : P.accGlow);
        g.box(9 + i, 3 + Math.floor(i / 2), 0, 10 + i, 9 - Math.floor(i / 3), 1, i % 2 ? P.white : P.accGlow);
      }
      g.box(7, 4, 0, 9, 8, 2, P.metal);
      return { grid: g, palette: P.p };
    }
    case 'scarf': {
      const g = new VoxelGrid(bodyW + 1, 4, 3);
      g.box(0, 3, 0, bodyW + 1, 4, 3, P.acc);
      g.box(1, 0, 0, 3, 3, 1, P.acc);
      return { grid: g, palette: P.p };
    }
    case 'banner': {
      const g = new VoxelGrid(7, 18, 1);
      g.box(0, 0, 0, 1, 18, 1, P.metal);
      g.box(1, 9, 0, 7, 17, 1, P.acc);
      g.box(2, 11, 0, 6, 15, 1, P.pri);
      g.set(3, 13, 0, P.accGlow);
      g.set(4, 13, 0, P.accGlow);
      return { grid: g, palette: P.p };
    }
    case 'tail': {
      const g = new VoxelGrid(2, 5, 6);
      for (let i = 0; i < 6; i++) g.box(0, Math.floor(i / 2), i, 2, Math.floor(i / 2) + 2, i + 1, i > 3 ? P.hair : P.pri);
      return { grid: g, palette: P.p };
    }
    default:
      return null;
  }
}

function buildFloat(look: CharacterLook, P: Pal): VoxelModel | null {
  if (look.accessory !== 'drone') return null;
  const g = new VoxelGrid(6, 3, 6);
  g.box(1, 0, 1, 5, 2, 5, P.metal);
  g.box(0, 2, 0, 6, 3, 1, P.metalD);
  g.box(0, 2, 5, 6, 3, 6, P.metalD);
  g.box(2, 0, 5, 4, 1, 6, P.accGlow);
  return { grid: g, palette: P.p };
}

/** Monta as partes voxel de um personagem a partir da definição. */
export function characterParts(def: Pick<CharacterDef, 'look' | 'cls'>): CharacterParts {
  const look = def.look;
  const P = palette(look);
  const d = BODY_DIM[look.body];
  const legH = 3;
  const legT = look.body === 'bulky' ? 3 : 2;
  const armT = look.body === 'bulky' ? 3 : 2;
  const { weapon, offhand, muzzle } = buildWeapon(look, P, def.cls);
  const back = buildBack(look, P, d.h, d.w);
  const hipX = legT / 2 + 0.2;
  const parts: CharacterParts = {
    legL: { model: buildLeg(look, P), at: [-hipX, legH, 0], pivot: 'top' },
    legR: { model: buildLeg(look, P), at: [hipX, legH, 0], pivot: 'top' },
    body: { model: buildBody(look, P, def.cls), at: [0, legH, 0], pivot: 'bottom' },
    head: { model: buildHead(look, P, def.cls), at: [0, legH + d.h, 0], pivot: 'bottom' },
    armL: { model: buildArm(look, P, def.cls, true), at: [-(d.w / 2 + armT / 2), legH + d.h - 0.5, 0], pivot: 'top' },
    armR: { model: buildArm(look, P, def.cls, false), at: [d.w / 2 + armT / 2, legH + d.h - 0.5, 0], pivot: 'top' },
    weapon: weapon ? { model: weapon, at: [0, -4, armT / 2], pivot: def.cls === 'mago' || def.cls === 'curandeiro' ? 'center' : 'center' } : null,
    offhand: offhand ? { model: offhand, at: [0, -4, armT / 2], pivot: 'center' } : null,
    back: back ? { model: back, at: [0, look.accessory === 'banner' ? -2 : 0, -d.d / 2 - 0.5], pivot: 'bottom' } : null,
    float: null,
    height: (legH + d.h + 9) * CHAR_VOXEL,
    muzzle,
    aura: look.accessory === 'aura' ? look.accent : null,
  };
  const floatModel = buildFloat(look, P);
  if (floatModel) parts.float = { model: floatModel, at: [d.w / 2 + 6, legH + d.h + 6, -2], pivot: 'center' };
  // a bazuca fica no ombro, o resto na mão
  if (def.cls === 'bombardeiro' && parts.weapon) parts.weapon.at = [0, 0, 0];
  return parts;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Chaves de geometria por personagem, em ordem de uso (LRU). */
const ownerKeys = new Map<string, string[]>();
/** Quantas CharacterView vivas usam cada personagem. */
const ownerRefs = new Map<string, number>();
const MAX_CACHED_OWNERS = 48;

/** Geometria de uma parte (cacheada por personagem e parte). */
export function partGeometry(key: string, part: PartModel): THREE.BufferGeometry {
  const owner = key.slice(0, key.indexOf(':'));
  const keys = ownerKeys.get(owner) ?? [];
  ownerKeys.delete(owner);
  ownerKeys.set(owner, keys);
  let g = geoCache.get(key);
  if (!g) {
    const pivot = part.pivot === 'top' ? 'bottom' : part.pivot;
    const off: [number, number, number] = part.pivot === 'top' ? [0, part.model.grid.sy, 0] : [0, 0, 0];
    g = buildVoxelGeometry(part.model, { scale: CHAR_VOXEL, pivot, offset: off, ao: 0.6 });
    geoCache.set(key, g);
    keys.push(key);
  }
  return g;
}

export function retainCharacterGeometry(owner: string): void {
  ownerRefs.set(owner, (ownerRefs.get(owner) ?? 0) + 1);
}

/** Solta as geometrias de um personagem; as menos usadas saem do cache. */
export function releaseCharacterGeometry(owner: string): void {
  ownerRefs.set(owner, Math.max(0, (ownerRefs.get(owner) ?? 0) - 1));
  if (ownerKeys.size <= MAX_CACHED_OWNERS) return;
  for (const [o, keys] of ownerKeys) {
    if (ownerKeys.size <= MAX_CACHED_OWNERS) break;
    if ((ownerRefs.get(o) ?? 0) > 0) continue;
    for (const k of keys) {
      geoCache.get(k)?.dispose();
      geoCache.delete(k);
    }
    ownerKeys.delete(o);
    ownerRefs.delete(o);
  }
}

export function clearCharacterCache(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  ownerKeys.clear();
}
