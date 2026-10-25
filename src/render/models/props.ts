import * as THREE from 'three';
import { C } from '../colors.ts';
import { Palette, VoxelGrid, buildVoxelGeometry, type VoxelModel } from '../voxel.ts';
import { createOutlineMaterial, sharedOutlineMaterial, sharedToonMaterial, type OutlineMaterial } from '../toon.ts';
import { hash01 } from './buildings.ts';

/** Morador voxel em miniatura (variação de roupa, cabelo e pele). */
export function citizenModel(variant: number): VoxelModel {
  const p = new Palette();
  const g = new VoxelGrid(6, 11, 4);
  const shirts = [C.neonPink, C.teal, C.orange, C.blue, C.neonPurple, C.neonYellow];
  const hairs = [0x2a1a10, 0x6b3a1a, 0xffd04a, 0xff5aa8, 0x2a2a3a, 0x3fd4ff];
  const skin = p.add(C.skin[Math.floor(hash01(variant * 3 + 1) * C.skin.length)]);
  const shirt = p.add(shirts[variant % shirts.length]);
  const pants = p.add(variant % 2 ? 0x3a3f5c : C.creamDark);
  const hair = p.add(hairs[Math.floor(hash01(variant * 7 + 2) * hairs.length)]);
  const eye = p.add(C.black);
  g.box(1, 0, 1, 3, 3, 3, pants);
  g.box(3, 0, 1, 5, 3, 3, pants);
  g.box(1, 3, 1, 5, 6, 3, shirt);
  g.box(0, 3, 1, 1, 5, 3, skin);
  g.box(5, 3, 1, 6, 5, 3, skin);
  g.box(1, 6, 0, 5, 10, 4, skin);
  g.box(1, 9, 0, 5, 11, 4, hair);
  g.box(1, 8, 0, 2, 10, 4, hair);
  g.set(2, 7, 3, eye);
  g.set(4, 7, 3, eye);
  return { grid: g, palette: p };
}

export function hoverCarModel(variant: number): VoxelModel {
  const p = new Palette();
  const g = new VoxelGrid(12, 5, 7);
  const bodies = [C.neonPink, C.teal, C.gold, C.white, C.blue, C.red];
  const body = p.add(bodies[variant % bodies.length]);
  const glass = p.add(C.glass);
  const dark = p.add(C.metalDark);
  const glow = p.add(variant % 2 ? C.neonCyan : C.neonPink, { glow: 1 });
  const light = p.add(0xfff3b0, { glow: 1 });
  g.box(0, 1, 1, 12, 3, 6, body);
  g.box(1, 0, 1, 11, 1, 6, glow);
  g.box(3, 3, 1, 9, 5, 6, glass);
  g.box(3, 4, 2, 9, 5, 5, body);
  g.box(11, 1, 1, 12, 2, 2, light);
  g.box(11, 1, 5, 12, 2, 6, light);
  g.box(0, 2, 2, 1, 3, 5, dark);
  return { grid: g, palette: p };
}

export function birdModel(): VoxelModel {
  const p = new Palette();
  const g = new VoxelGrid(9, 2, 5);
  const w = p.add(C.white);
  const tip = p.add(0xbcd6ff);
  const beak = p.add(C.orange);
  g.box(3, 0, 1, 6, 2, 4, w);
  g.box(0, 1, 2, 3, 2, 3, w);
  g.box(6, 1, 2, 9, 2, 3, w);
  g.set(0, 1, 2, tip);
  g.set(8, 1, 2, tip);
  g.set(4, 1, 4, beak);
  return { grid: g, palette: p };
}

export function boatModel(variant: number): VoxelModel {
  const p = new Palette();
  const g = new VoxelGrid(16, 7, 8);
  const hull = p.add(C.white);
  const stripe = p.add(variant % 2 ? C.neonPink : C.teal);
  const glass = p.add(C.glass);
  const glow = p.add(C.neonCyan, { glow: 1 });
  const deck = p.add(C.trunk);
  for (let y = 0; y < 3; y++) g.box(1 + (2 - y), y, 1 + (y === 0 ? 1 : 0), 15 - (2 - y) * 0.5, y + 1, 7 - (y === 0 ? 1 : 0), hull);
  g.box(2, 2, 1, 15, 3, 7, stripe);
  g.box(3, 3, 2, 14, 4, 6, deck);
  g.box(6, 4, 2, 11, 6, 6, glass);
  g.box(6, 6, 2, 11, 7, 6, hull);
  g.box(0, 1, 3, 1, 2, 5, glow);
  return { grid: g, palette: p };
}

/** Nuvem voxel fofinha (forma sorteada pela semente). */
export function cloudModel(seed: number): VoxelModel {
  const p = new Palette();
  const g = new VoxelGrid(24, 8, 14);
  const white = p.add(0xffffff);
  const shade = p.add(0xdfe9ff);
  const blobs = 4 + Math.floor(hash01(seed) * 3);
  for (let i = 0; i < blobs; i++) {
    const x = 5 + hash01(seed + i * 3) * 14;
    const z = 4 + hash01(seed + i * 5) * 6;
    const r = 2.6 + hash01(seed + i * 7) * 2.2;
    g.ellipsoid(x, 2.5 + r * 0.4, z, r * 1.2, r * 0.75, r, white);
  }
  g.paint((_x, y, _z, c) => (y <= 1 ? shade : c));
  return { grid: g, palette: p };
}

/**
 * Malha voxel instanciada com contorno: o corpo e a casca compartilham
 * a mesma matriz por instância, então mexer em um mexe no outro.
 */
export class InstancedVoxel {
  readonly group = new THREE.Group();
  readonly body: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh | null;
  readonly count: number;

  constructor(geo: THREE.BufferGeometry, count: number, outline: boolean | OutlineMaterial = true) {
    this.count = count;
    this.body = new THREE.InstancedMesh(geo, sharedToonMaterial(), count);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.frustumCulled = false;
    this.group.add(this.body);
    if (outline) {
      const mat = outline === true ? sharedOutlineMaterial() : outline;
      this.outline = new THREE.InstancedMesh(geo, mat, count);
      this.outline.instanceMatrix = this.body.instanceMatrix;
      this.outline.frustumCulled = false;
      this.outline.renderOrder = -1;
      this.group.add(this.outline);
    } else {
      this.outline = null;
    }
  }

  setMatrixAt(i: number, m: THREE.Matrix4): void {
    this.body.setMatrixAt(i, m);
  }

  commit(): void {
    this.body.instanceMatrix.needsUpdate = true;
  }
}

const geoCache = new Map<string, THREE.BufferGeometry>();
export function propGeometry(key: string, make: () => VoxelModel, scale: number): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = buildVoxelGeometry(make(), { scale, pivot: 'bottom' });
    geoCache.set(key, g);
  }
  return g;
}

let cloudOutline: OutlineMaterial | null = null;
export function cloudOutlineMaterial(): OutlineMaterial {
  return (cloudOutline ??= createOutlineMaterial(0x6a78b8, 0.7));
}
