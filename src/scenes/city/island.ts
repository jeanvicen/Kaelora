import * as THREE from 'three';
import { C } from '../../render/colors.ts';
import { hash01 } from '../../render/models/buildings.ts';
import { Palette, VoxelGrid, buildVoxelGeometry } from '../../render/voxel.ts';
import { createVoxelObject } from '../../render/toon.ts';

/** Resolução da ilha: 2 voxels por casa da grade. */
const RES = 2;
const MARGIN = 7; // casas de praia/falésia em volta da grade
const TOP = 6; // voxel do topo da grama

export interface IslandInfo {
  group: THREE.Group;
  /** Retângulo da ilha no mundo, para a espuma do mar. */
  bounds: { x0: number; z0: number; x1: number; z1: number };
}

/**
 * Ilha voxel da cidade: a grade (grama em xadrez), uma calçada em volta,
 * praia irregular, falésias e a estrada que sai pela entrada (lado esquerdo).
 * A grade ocupa o mundo de (0,0) até (size,size) com o topo em y = 0.
 */
export function buildIsland(size: number): IslandInfo {
  const total = size + MARGIN * 2;
  const W = total * RES;
  const H = TOP + 1;
  const g = new VoxelGrid(W, H, W);
  const p = new Palette();
  const grass = p.add(C.grass);
  const grassAlt = p.add(C.grassAlt);
  const curb = p.add(C.concrete);
  const curbDark = p.add(C.concreteDark);
  const sand = p.add(C.sand);
  const sandDark = p.add(C.sandDark);
  const dirt = p.add(C.dirt);
  const dirtDark = p.add(C.dirtDark);
  const rock = p.add(C.rock);
  const rockDark = p.add(C.rockDark);
  const road = p.add(0x3a3f5c);
  const roadLine = p.add(C.neonCyan, { glow: 1 });
  const roadEdge = p.add(C.neonPink, { glow: 0.8 });
  const neonCurb = p.add(C.neonCyan, { night: 1 });

  const entranceZ = (MARGIN + size / 2) * RES;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      // distância (em casas) até a borda da grade
      const tx = x / RES - MARGIN;
      const tz = z / RES - MARGIN;
      const dx = Math.max(0, -tx, tx - size);
      const dz = Math.max(0, -tz, tz - size);
      const d = Math.hypot(dx, dz);
      const n = hash01(Math.floor(x / 3) * 7919 + Math.floor(z / 3) * 104729);
      const beach = MARGIN - 1.6 - n * 1.6;
      let top: number;
      let surface: number;
      if (d === 0) {
        top = TOP;
        const cell = Math.floor(tx) + Math.floor(tz);
        surface = cell % 2 === 0 ? grass : grassAlt;
      } else if (d <= 0.5) {
        top = TOP;
        surface = curb;
      } else if (d < 1.2) {
        top = TOP - 1;
        surface = curbDark;
      } else if (d < beach) {
        top = d < beach * 0.62 ? TOP - 1 : TOP - 2;
        surface = (x + z) % 7 === 0 ? sandDark : sand;
      } else {
        continue;
      }
      for (let y = 0; y < top; y++) {
        const depth = top - y;
        let c = rock;
        if (d === 0 || d <= 0.5) c = depth <= 1 ? dirt : depth <= 3 ? dirtDark : (y + x) % 5 === 0 ? rockDark : rock;
        else c = depth <= 1 ? sandDark : (y + z) % 4 === 0 ? rockDark : rock;
        g.set(x, y, z, c);
      }
      g.set(x, top, z, surface);
      // luzinhas na calçada que acendem à noite
      if (d > 0 && d <= 0.5 && (x + z) % 6 === 0) g.set(x, top, z, neonCurb);
    }
  }

  // Estrada da entrada: do meio da borda esquerda até a beira da ilha.
  const roadHalf = 1.4 * RES;
  for (let x = 0; x < MARGIN * RES; x++) {
    for (let z = Math.floor(entranceZ - roadHalf); z < Math.ceil(entranceZ + roadHalf); z++) {
      let topY = -1;
      for (let y = H - 1; y >= 0; y--)
        if (g.get(x, y, z)) {
          topY = y;
          break;
        }
      if (topY < 0) topY = TOP - 3;
      const yy = Math.max(topY, TOP - 1);
      for (let y = 0; y <= yy; y++) if (!g.get(x, y, z)) g.set(x, y, z, rock);
      for (let y = yy + 1; y < H; y++) g.set(x, y, z, 0);
      const edge = z === Math.floor(entranceZ - roadHalf) || z === Math.ceil(entranceZ + roadHalf) - 1;
      const mid = Math.abs(z + 0.5 - entranceZ) < 0.6 && x % 4 < 2;
      g.set(x, yy, z, edge ? roadEdge : mid ? roadLine : road);
    }
  }

  const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 1 / RES, pivot: 'bottom', ao: 0.7 });
  const island = createVoxelObject(geo);
  island.name = 'island';
  // origem do modelo é o centro da base; leva o topo da grama para y=0 e a grade para (0..size)
  island.position.set(size / 2, -(TOP + 1) / RES, size / 2);

  const group = new THREE.Group();
  group.add(island);
  group.add(buildBridge(size));
  const half = total / 2;
  return {
    group,
    bounds: { x0: size / 2 - half + 0.5, z0: size / 2 - half + 0.5, x1: size / 2 + half - 0.5, z1: size / 2 + half - 0.5 },
  };
}

/** Ponte suspensa que sai da entrada da cidade em direção ao horizonte. */
function buildBridge(size: number): THREE.Group {
  const p = new Palette();
  const len = 64; // voxels por segmento (8 casas)
  const g = new VoxelGrid(len, 14, 8);
  const deck = p.add(0x3a3f5c);
  const side = p.add(C.concrete);
  const rail = p.add(C.neonPink, { glow: 1 });
  const line = p.add(C.neonCyan, { glow: 1 });
  const pillar = p.add(C.concreteDark);
  const cable = p.add(C.steel);
  g.box(0, 9, 0, len, 10, 8, side);
  g.box(0, 10, 1, len, 11, 7, deck);
  g.box(0, 11, 0, len, 12, 1, rail);
  g.box(0, 11, 7, len, 12, 8, rail);
  for (let x = 2; x < len; x += 6) g.box(x, 10, 3.5, x + 3, 11, 4.5, line);
  for (const x of [8, 40]) {
    g.box(x, 0, 2, x + 4, 9, 6, pillar);
    g.box(x + 1, 12, 0, x + 3, 14, 1, cable);
    g.box(x + 1, 12, 7, x + 3, 14, 8, cable);
  }
  const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 1 / 8, pivot: 'bottom', ao: 0.6 });
  const group = new THREE.Group();
  group.name = 'bridge';
  const segLen = len / 8;
  for (let i = 0; i < 7; i++) {
    const seg = createVoxelObject(geo);
    seg.position.set(-MARGIN - segLen / 2 - i * segLen + 1.2, -1.85, size / 2);
    group.add(seg);
  }
  return group;
}

export const ISLAND_MARGIN = MARGIN;
