import * as THREE from 'three';
import type { BuildingType, Element } from '../../meta/types.ts';
import { buildVoxelGeometry } from '../voxel.ts';
import { createToonMaterial, createVoxelObject, type ToonMaterial } from '../toon.ts';
import { BUILDING_VOXEL, barrierLinkModel, buildingModel, decorVariants, tierOf, type ModelPart } from './buildings.ts';

interface CachedModel {
  base: THREE.BufferGeometry;
  parts: { geo: THREE.BufferGeometry; part: ModelPart }[];
  height: number;
}

const cache = new Map<string, CachedModel>();
const linkCache = new Map<number, THREE.BufferGeometry>();

function variantOf(type: BuildingType, seed: number): number {
  const n = decorVariants(type);
  return n > 1 ? Math.abs(seed) % n : 0;
}

function getModel(type: BuildingType, level: number, element: Element, seed: number): CachedModel {
  const tier = tierOf(level);
  const variant = variantOf(type, seed);
  const elKey = type === 'core' || type === 'barracks' ? element : '-';
  const key = `${type}|${tier}|${elKey}|${variant}`;
  let m = cache.get(key);
  if (!m) {
    const repLevel = tier === 1 ? 1 : tier === 2 ? 4 : 7;
    const model = buildingModel(type, repLevel, element, variant * 101 + 7);
    m = {
      base: buildVoxelGeometry(model.base, { scale: BUILDING_VOXEL }),
      parts: model.parts.map((part) => ({
        part,
        geo: buildVoxelGeometry(part.model, { scale: BUILDING_VOXEL, pivot: part.pivot ?? 'bottom' }),
      })),
      height: model.height,
    };
    cache.set(key, m);
  }
  return m;
}

export interface PartView {
  obj: THREE.Object3D;
  motion: ModelPart['motion'];
  baseY: number;
  phase: number;
  /** Ângulo desejado (para 'aim'); null = varrer o horizonte. */
  aimTarget: number | null;
}

export interface BuildingView {
  root: THREE.Group;
  body: THREE.Group;
  parts: PartView[];
  height: number;
  material: ToonMaterial;
  type: BuildingType;
}

/**
 * Cria a visualização 3D de uma construção. Cada uma ganha um material próprio
 * (barato: mesmo programa de shader) para poder piscar, tingir e ficar fantasma.
 */
export function createBuildingView(type: BuildingType, level: number, element: Element, seed = 0): BuildingView {
  const m = getModel(type, level, element, seed);
  const material = createToonMaterial();
  const root = new THREE.Group();
  root.name = `building:${type}`;
  const body = createVoxelObject(m.base, { material });
  root.add(body);
  const parts: PartView[] = [];
  let i = 0;
  for (const { geo, part } of m.parts) {
    const obj = createVoxelObject(geo, { material, outline: part.outline === false ? null : undefined });
    obj.position.set(part.at[0] * BUILDING_VOXEL, part.at[1] * BUILDING_VOXEL, part.at[2] * BUILDING_VOXEL);
    root.add(obj);
    parts.push({ obj, motion: part.motion, baseY: obj.position.y, phase: (seed * 0.37 + i * 1.7) % 6.28, aimTarget: null });
    i++;
  }
  return { root, body, parts, height: m.height, material, type };
}

/** Anima as partes móveis (cristal, cabeças de torre, moeda holográfica). */
export function animateBuilding(view: BuildingView, time: number, dt: number): void {
  for (const p of view.parts) {
    const t = time + p.phase;
    switch (p.motion) {
      case 'spin':
        p.obj.rotation.y += dt * 0.8;
        break;
      case 'counterSpin':
        p.obj.rotation.y -= dt * 0.6;
        p.obj.rotation.x = Math.sin(t * 0.7) * 0.12;
        break;
      case 'bob':
        p.obj.position.y = p.baseY + Math.sin(t * 2.2) * 0.06;
        break;
      case 'spinBob':
        p.obj.rotation.y += dt * 1.1;
        p.obj.position.y = p.baseY + Math.sin(t * 1.6) * 0.12;
        break;
      case 'aim': {
        const target = p.aimTarget ?? Math.sin(t * 0.35) * 1.4 + 0.6;
        let d = target - p.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.obj.rotation.y += d * Math.min(1, dt * 6);
        break;
      }
    }
  }
}

/** Trecho de muralha entre duas barreiras. */
export function createBarrierLink(level: number): THREE.Group {
  const tier = tierOf(level);
  let geo = linkCache.get(tier);
  if (!geo) {
    geo = buildVoxelGeometry(barrierLinkModel(tier === 1 ? 1 : tier === 2 ? 4 : 7), { scale: BUILDING_VOXEL });
    linkCache.set(tier, geo);
  }
  return createVoxelObject(geo);
}

/** Libera o cache (troca de preset gráfico, por exemplo). */
export function clearModelCache(): void {
  for (const m of cache.values()) {
    m.base.dispose();
    for (const p of m.parts) p.geo.dispose();
  }
  cache.clear();
  for (const g of linkCache.values()) g.dispose();
  linkCache.clear();
}
