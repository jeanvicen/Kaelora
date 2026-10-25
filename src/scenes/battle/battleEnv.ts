import * as THREE from 'three';
import type { Element } from '../../meta/types.ts';
import { C, ELEMENT_COLORS } from '../../render/colors.ts';
import { createSky, createWater } from '../../render/environment.ts';
import { buildingModel, hash01 } from '../../render/models/buildings.ts';
import { cloudModel, cloudOutlineMaterial } from '../../render/models/props.ts';
import { createVoxelObject } from '../../render/toon.ts';
import { Palette, VoxelGrid, buildVoxelGeometry } from '../../render/voxel.ts';

/** Largura da estrada (z) e posição da água. */
export const ROAD_HALF = 1.6;
export const WATER_Y = -1.6;

/**
 * Cenário da batalha em vista lateral: céu, mar, a ponte-estrada que liga as
 * duas cidades, o portal do atacante e a ilha + skyline do defensor.
 */
export class BattleEnvironment {
  readonly group = new THREE.Group();
  private clouds: THREE.Object3D[] = [];
  private water: THREE.Mesh;
  private sky: THREE.Mesh;
  length = 56;

  constructor() {
    this.sky = createSky(420);
    this.group.add(this.sky);
    this.water = createWater(900, 160);
    this.water.position.y = WATER_Y;
    this.group.add(this.water);
  }

  /** Recria o cenário para uma estrada de `length` casas. */
  build(length: number, attackerElement: Element, defenderElement: Element, islandStart: number, seed: number): void {
    this.length = length;
    for (const c of [...this.group.children]) if (c !== this.water && c !== this.sky) this.group.remove(c);
    this.clouds = [];
    this.group.add(this.buildRoad(islandStart));
    this.group.add(this.buildIsland(islandStart, length, defenderElement, seed));
    this.group.add(this.buildPortal(attackerElement));
    this.group.add(this.buildFarIslands(length, seed));
    for (let i = 0; i < 9; i++) {
      const geo = buildVoxelGeometry(cloudModel(seed + i * 17), { scale: 1 / 1.6, pivot: 'center' });
      const cl = createVoxelObject(geo, { outline: cloudOutlineMaterial() });
      cl.position.set(-30 + i * ((length + 60) / 9) + hash01(seed + i) * 6, 11 + hash01(i * 3 + seed) * 7, -30 - hash01(i * 7) * 30);
      cl.userData.speed = 0.3 + hash01(i * 11) * 0.5;
      this.clouds.push(cl);
      this.group.add(cl);
    }
  }

  private buildRoad(islandStart: number): THREE.Group {
    const group = new THREE.Group();
    const p = new Palette();
    const seg = 32; // voxels por trecho (4 casas)
    const g = new VoxelGrid(seg, 12, 28);
    const deck = p.add(0x3a3f5c);
    const deckL = p.add(0x464c6e);
    const side = p.add(C.concrete);
    const sideD = p.add(C.concreteDark);
    const rail = p.add(C.neonPink, { glow: 1 });
    const line = p.add(C.neonCyan, { glow: 0.7 });
    const pillar = p.add(C.concreteDark);
    g.box(0, 7, 0, seg, 9, 28, side);
    g.box(0, 7, 0, seg, 8, 28, sideD);
    g.box(0, 9, 1, seg, 10, 27, deck);
    for (let x = 0; x < seg; x += 4) g.box(x, 9, 2, x + 2, 10, 26, deckL);
    g.box(0, 10, 0, seg, 11, 1, rail);
    g.box(0, 10, 27, seg, 11, 28, rail);
    for (let x = 2; x < seg; x += 8) g.box(x, 10, 13, x + 4, 10, 15, line);
    g.box(12, 0, 10, 20, 7, 18, pillar);
    const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 1 / 8, ao: 0.6 });
    const segLen = seg / 8;
    for (let x = -24; x < islandStart + 2; x += segLen) {
      const s = createVoxelObject(geo);
      s.position.set(x + segLen / 2, -10 / 8, 0);
      group.add(s);
    }
    return group;
  }

  /** Ilha do defensor: chão de grama, praia e prédios de fundo (skyline). */
  private buildIsland(start: number, length: number, element: Element, seed: number): THREE.Group {
    const group = new THREE.Group();
    const el = ELEMENT_COLORS[element];
    const W = Math.ceil(length - start + 16);
    const D = 26;
    const p = new Palette();
    const g = new VoxelGrid(W * 2, 8, D * 2);
    const grass = p.add(C.grass);
    const grassAlt = p.add(C.grassAlt);
    const dirt = p.add(C.dirt);
    const rock = p.add(C.rock);
    const sand = p.add(C.sand);
    const road = p.add(0x3a3f5c);
    const roadEdge = p.add(C.neonCyan, { glow: 0.8 });
    for (let x = 0; x < W * 2; x++)
      for (let z = 0; z < D * 2; z++) {
        const edge = x < 3 || z < 2 || z > D * 2 - 3;
        const top = edge ? 4 : 6;
        for (let y = 0; y < top; y++) g.set(x, y, z, y < top - 2 ? rock : dirt);
        const roadZ = Math.abs(z + 0.5 - D * 1.5) < ROAD_HALF * 2;
        const roadEdgeZ = Math.abs(Math.abs(z + 0.5 - D * 1.5) - ROAD_HALF * 2) < 0.6;
        g.set(x, top, z, edge ? sand : roadEdgeZ ? roadEdge : roadZ ? road : (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? grass : grassAlt);
      }
    const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 0.5, ao: 0.6 });
    const ground = createVoxelObject(geo);
    // topo da grama em y = 0; a estrada do mundo (z = 0) passa pelo voxel z = 1,5·D,
    // que fica 0,25·D casas à frente do centro do modelo
    ground.position.set(start - 1.5 + W / 2, -3.5, -D * 0.25);
    group.add(ground);

    // skyline: prédios futuristas atrás da estrada
    const rng = (n: number) => hash01(seed * 31 + n);
    for (let i = 0; i < Math.floor(W / 3.2); i++) {
      const bp = new Palette();
      const h = 14 + Math.floor(rng(i) * 26);
      const w = 10 + Math.floor(rng(i + 50) * 8);
      const bg = new VoxelGrid(w, h + 3, w);
      const body = bp.add(rng(i + 3) < 0.5 ? C.white : C.cream);
      const glass = bp.add(C.window, { night: 1 });
      const neon = bp.add(rng(i + 9) < 0.5 ? el.glow : C.neonPink, { glow: 1 });
      const roof = bp.add(C.metal);
      bg.box(0, 0, 0, w, h, w, body);
      for (let y = 2; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 2) {
        bg.set(x, y, w - 1, glass);
        bg.set(w - 1, y, x, glass);
      }
      bg.box(0, h - 2, 0, w, h - 1, w, neon);
      bg.box(1, h, 1, w - 1, h + 1, w - 1, roof);
      if (rng(i + 13) < 0.4) bg.box(Math.floor(w / 2), h + 1, Math.floor(w / 2), Math.floor(w / 2) + 1, h + 3, Math.floor(w / 2) + 1, neon);
      const bgeo = buildVoxelGeometry({ grid: bg, palette: bp }, { scale: 1 / 8 });
      const b = createVoxelObject(bgeo);
      b.position.set(start + 2 + i * 3.2 + rng(i + 20), 0, -7 - rng(i + 30) * 7);
      group.add(b);
    }
    // palmeiras só atrás da estrada (nunca entre a câmera e a ação)
    const palmGeo = buildVoxelGeometry(buildingModel('palm', 1, element, seed % 6).base, { scale: 1 / 8 });
    for (let i = 0; i < Math.floor(W / 3.5); i++) {
      const palm = createVoxelObject(palmGeo);
      palm.position.set(start + i * 3.5 + rng(i + 70) * 2, 0, -(ROAD_HALF + 4.4 + rng(i + 80) * 2.5));
      palm.rotation.y = rng(i + 90) * 6.28;
      palm.scale.setScalar(1.1 + rng(i + 99) * 0.4);
      group.add(palm);
    }
    return group;
  }

  /** Portal do atacante na ponta esquerda da estrada. */
  private buildPortal(element: Element): THREE.Group {
    const el = ELEMENT_COLORS[element];
    const p = new Palette();
    const g = new VoxelGrid(6, 34, 36);
    const stone = p.add(C.white);
    const metal = p.add(C.metal);
    const glow = p.add(el.glow, { glow: 1 });
    const field = p.add(el.main, { glow: 0.8 });
    for (const z0 of [0, 30]) {
      g.box(0, 0, z0, 6, 30, z0 + 6, stone);
      g.box(0, 6, z0, 6, 7, z0 + 6, glow);
      g.box(0, 16, z0, 6, 17, z0 + 6, glow);
    }
    g.box(0, 28, 0, 6, 34, 36, metal);
    g.box(1, 29, 2, 5, 33, 34, glow);
    g.box(2, 0, 6, 4, 28, 30, field);
    const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 1 / 8 });
    const group = new THREE.Group();
    const portal = createVoxelObject(geo, { outline: null });
    portal.position.set(-0.8, -0.1, 0);
    group.add(portal);
    return group;
  }

  /** Ilhas distantes no horizonte (dão profundidade e parallax). */
  private buildFarIslands(length: number, seed: number): THREE.Group {
    const group = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const p = new Palette();
      const w = 30 + Math.floor(hash01(seed + i) * 30);
      const g = new VoxelGrid(w, 12, 16);
      const rock = p.add(0x7f78b0);
      const grass = p.add(0x3fae7a);
      const bld = p.add(0xc9d4f0);
      const win = p.add(0xffe08a, { night: 1 });
      g.ellipsoid(w / 2, 0, 8, w / 2, 5, 7, rock);
      g.ellipsoid(w / 2, 1, 8, w / 2 - 2, 4, 6, grass);
      for (let k = 0; k < 4; k++) {
        const bx = 6 + Math.floor(hash01(seed + i * 9 + k) * (w - 12));
        const bh = 4 + Math.floor(hash01(seed + i * 5 + k) * 7);
        g.box(bx, 3, 6, bx + 3, 3 + bh, 9, bld);
        g.set(bx + 1, 3 + bh - 2, 9, win);
      }
      const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 0.7, pivot: 'bottom' });
      const isl = createVoxelObject(geo, { outline: null });
      isl.position.set(-40 + i * ((length + 80) / 6) + hash01(i * 13) * 10, WATER_Y - 0.5, -90 - hash01(i * 3) * 60);
      group.add(isl);
    }
    return group;
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.position.x += dt * (c.userData.speed as number);
      if (c.position.x > this.length + 40) c.position.x = -40;
    }
  }
}
