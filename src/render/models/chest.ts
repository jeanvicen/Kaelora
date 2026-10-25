import * as THREE from 'three';
import type { ChestType } from '../../meta/types.ts';
import { createVoxelObject } from '../toon.ts';
import { Palette, VoxelGrid, buildVoxelGeometry, type VoxelModel } from '../voxel.ts';

/** Tamanho de um voxel do baú em unidades do mundo. */
export const CHEST_VOXEL = 0.075;
export const CHEST_W = 14;
export const CHEST_D = 10;
export const CHEST_BASE_H = 7;
export const CHEST_LID_H = 5;

interface ChestLook {
  body: number;
  dark: number;
  band: number;
  bandGlow: number;
  gem: number;
  gemGlow: number;
  lock: number;
  planks: boolean;
}

const LOOKS: Record<ChestType, ChestLook> = {
  madeira: { body: 0xc4864a, dark: 0x8a5a2e, band: 0x8792b6, bandGlow: 0, gem: 0xffc93c, gemGlow: 0, lock: 0xffc93c, planks: true },
  prata: { body: 0xd6deef, dark: 0x9aa5c4, band: 0x56608a, bandGlow: 0, gem: 0x3ff6ff, gemGlow: 0.8, lock: 0x3ff6ff, planks: false },
  ouro: { body: 0xffc93c, dark: 0xd8961a, band: 0x9a4a1a, bandGlow: 0, gem: 0xff3f5e, gemGlow: 0.8, lock: 0xfff3b0, planks: false },
  magico: { body: 0x7a4dff, dark: 0x3e2196, band: 0x3ff6ff, bandGlow: 1, gem: 0xff3fb4, gemGlow: 1, lock: 0xffe14f, planks: false },
  extremo: { body: 0x2a2440, dark: 0x16122a, band: 0xff2a4a, bandGlow: 1, gem: 0xff8a1a, gemGlow: 1, lock: 0xff2ad4, planks: false },
};

/** Cor de destaque (brilho, partículas) de cada baú. */
export const CHEST_ACCENT: Record<ChestType, number> = {
  madeira: 0xffc93c,
  prata: 0x3ff6ff,
  ouro: 0xffd23f,
  magico: 0xb45bff,
  extremo: 0xff2a4a,
};

function isBand(x: number): boolean {
  return x === 2 || x === 3 || x === CHEST_W - 4 || x === CHEST_W - 3;
}

/** Corpo do baú (sem tampa). */
export function chestBaseModel(type: ChestType): VoxelModel {
  const L = LOOKS[type];
  const p = new Palette();
  const g = new VoxelGrid(CHEST_W, CHEST_BASE_H, CHEST_D + 1);
  const body = p.add(L.body);
  const dark = p.add(L.dark);
  const band = p.add(L.band, L.bandGlow ? { glow: L.bandGlow } : {});
  const gem = p.add(L.gem, L.gemGlow ? { glow: L.gemGlow } : {});
  const lock = p.add(L.lock, type === 'madeira' ? {} : { glow: 0.4 });
  const inside = p.add(0x14122b);
  for (let x = 0; x < CHEST_W; x++)
    for (let y = 0; y < CHEST_BASE_H; y++)
      for (let z = 0; z < CHEST_D; z++) {
        const edge = x === 0 || x === CHEST_W - 1 || z === 0 || z === CHEST_D - 1;
        if (!edge && y > 1) {
          if (y === CHEST_BASE_H - 1) g.set(x, y, z, inside);
          continue;
        }
        let c = body;
        if (y === 0) c = dark;
        else if (isBand(x)) c = band;
        else if (L.planks && y % 2 === 0) c = dark;
        else if ((x === 0 || x === CHEST_W - 1) && (z === 0 || z === CHEST_D - 1)) c = dark;
        g.set(x, y, z, c);
      }
  // fechadura e pedras na frente (+z)
  g.box(6, 2, CHEST_D, 8, 6, CHEST_D + 1, lock);
  g.set(6, 3, CHEST_D, dark);
  g.set(7, 3, CHEST_D, dark);
  g.set(1, 3, CHEST_D - 1, gem);
  g.set(CHEST_W - 2, 3, CHEST_D - 1, gem);
  return { grid: g, palette: p };
}

/** Tampa arredondada (o pivô fica na dobradiça de trás). */
export function chestLidModel(type: ChestType): VoxelModel {
  const L = LOOKS[type];
  const p = new Palette();
  const g = new VoxelGrid(CHEST_W, CHEST_LID_H, CHEST_D + 1);
  const body = p.add(L.body);
  const dark = p.add(L.dark);
  const band = p.add(L.band, L.bandGlow ? { glow: L.bandGlow } : {});
  const gem = p.add(L.gem, L.gemGlow ? { glow: L.gemGlow } : {});
  const lock = p.add(L.lock, type === 'madeira' ? {} : { glow: 0.4 });
  for (let y = 0; y < CHEST_LID_H; y++) {
    const inset = y < 2 ? 0 : y - 1;
    for (let x = 0; x < CHEST_W; x++)
      for (let z = inset; z < CHEST_D - inset; z++) {
        let c = body;
        if (y === 0) c = dark;
        else if (isBand(x)) c = band;
        else if (L.planks && (y + z) % 3 === 0) c = dark;
        g.set(x, y, z, c);
      }
  }
  g.box(6, 0, CHEST_D, 8, 2, CHEST_D + 1, lock);
  // pedra grande no topo
  g.box(6, CHEST_LID_H - 1, 4, 8, CHEST_LID_H, 6, gem);
  if (type === 'magico' || type === 'extremo') {
    // runas brilhando nas laterais da tampa
    for (const x of [5, 8]) g.set(x, 2, CHEST_D - 2, gem);
  }
  return { grid: g, palette: p };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => VoxelModel, offset: [number, number, number]): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = buildVoxelGeometry(make(), { scale: CHEST_VOXEL, pivot: 'bottom', offset, ao: 0.7 });
    geoCache.set(key, g);
  }
  return g;
}

export interface ChestView {
  root: THREE.Group;
  base: THREE.Group;
  /** Grupo da tampa: gira em x na dobradiça de trás. */
  lid: THREE.Group;
}

/** Monta o baú 3D: base + tampa articulada. Centro da base na origem. */
export function createChestView(type: ChestType): ChestView {
  const root = new THREE.Group();
  // a origem fica no centro do corpo (z = D/2); a tampa gira na borda de trás (z = 0)
  const base = createVoxelObject(geo(`base:${type}`, () => chestBaseModel(type), [0, 0, -0.5]));
  const lidObj = createVoxelObject(geo(`lid:${type}`, () => chestLidModel(type), [0, 0, -(CHEST_D + 1) / 2]));
  const lid = new THREE.Group();
  // dobradiça: topo da base, borda de trás
  lid.position.set(0, CHEST_BASE_H * CHEST_VOXEL, (-CHEST_D / 2) * CHEST_VOXEL);
  lid.add(lidObj);
  root.add(base, lid);
  return { root, base, lid };
}
