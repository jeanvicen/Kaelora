import buildingsJson from '../data/buildings.json';
import type { BuildingType, CityState, PlacedBuilding } from './types.ts';

export interface BuildingLevel {
  hp: number;
  cost: number;
  time: number;
  dmg?: number;
  interval?: number;
  range?: number;
  slow?: number;
  chain?: number;
  rate?: number;
  capacity?: number;
  protect?: number;
  protectCap?: number;
  maxCharLevel?: number;
  maxResearch?: number;
}

export interface BuildingDef {
  name: string;
  description: string;
  category: 'core' | 'defense' | 'economy' | 'army' | 'decor';
  size: [number, number];
  unlockCore: number;
  maxCount: number[];
  element?: boolean;
  battle: {
    role: 'core' | 'barrier' | 'tower' | 'trap' | 'building' | 'none';
    blocks?: boolean;
    projectile?: 'cannonball' | 'beam' | 'frost' | 'lightning' | 'shell';
    splash?: number;
    minRange?: number;
    slowDuration?: number;
    chainFalloff?: number;
    hidden?: boolean;
    stun?: number;
  };
  levels: BuildingLevel[];
}

export const BUILDINGS = (buildingsJson as unknown as { buildings: Record<BuildingType, BuildingDef> }).buildings;
export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];

export function buildingDef(type: BuildingType): BuildingDef {
  return BUILDINGS[type];
}

export function levelStats(type: BuildingType, level: number): BuildingLevel {
  const def = BUILDINGS[type];
  return def.levels[Math.max(0, Math.min(def.levels.length - 1, level - 1))];
}

export function maxLevel(type: BuildingType): number {
  return BUILDINGS[type].levels.length;
}

export const MAX_GRID = 40;
export function gridSizeForCore(coreLevel: number): number {
  return Math.min(MAX_GRID, 24 + 2 * (coreLevel - 1));
}

export function coreLevel(city: CityState): number {
  return city.buildings.find((b) => b.type === 'core')?.level ?? 1;
}

export function gridSize(city: CityState): number {
  return gridSizeForCore(coreLevel(city));
}

/** Tamanho ocupado (largura x, profundidade z) considerando a rotação. */
export function footprint(type: BuildingType, rot: number): [number, number] {
  const [w, d] = BUILDINGS[type].size;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/** Entrada da cidade: meio da borda esquerda (x = -1). */
export function entranceCell(size: number): { x: number; z: number } {
  return { x: -1, z: size / 2 };
}

export function buildingCenter(b: Pick<PlacedBuilding, 'type' | 'x' | 'z' | 'rot'>): { x: number; z: number } {
  const [w, d] = footprint(b.type, b.rot);
  return { x: b.x + w / 2, z: b.z + d / 2 };
}

export function distanceToEntrance(b: Pick<PlacedBuilding, 'type' | 'x' | 'z' | 'rot'>, size: number): number {
  const c = buildingCenter(b);
  const e = entranceCell(size);
  return Math.hypot(c.x - e.x, c.z - e.z);
}

/** Verifica se a construção cabe na grade sem sobrepor outras (ignora `ignoreId`). */
export function canPlace(
  city: CityState,
  type: BuildingType,
  x: number,
  z: number,
  rot: number,
  ignoreId?: string,
): boolean {
  const size = gridSize(city);
  const [w, d] = footprint(type, rot);
  if (x < 0 || z < 0 || x + w > size || z + d > size) return false;
  for (const b of city.buildings) {
    if (b.id === ignoreId) continue;
    const [bw, bd] = footprint(b.type, b.rot);
    if (x < b.x + bw && x + w > b.x && z < b.z + bd && z + d > b.z) return false;
  }
  return true;
}

/** Procura a vaga livre mais próxima de (x, z) em espiral. */
export function findFreeSpot(
  city: CityState,
  type: BuildingType,
  nearX: number,
  nearZ: number,
  rot = 0,
): { x: number; z: number } | null {
  const size = gridSize(city);
  for (let r = 0; r < size; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = Math.round(nearX) + dx;
        const z = Math.round(nearZ) + dz;
        if (canPlace(city, type, x, z, rot)) return { x, z };
      }
    }
  }
  return null;
}

export function countOf(city: CityState, type: BuildingType): number {
  return city.buildings.filter((b) => b.type === type).length + city.storage.filter((b) => b.type === type).length;
}

export function maxCountFor(city: CityState, type: BuildingType): number {
  const def = BUILDINGS[type];
  if (coreLevel(city) < def.unlockCore) return 0;
  return def.maxCount[Math.min(def.maxCount.length, coreLevel(city)) - 1] ?? 0;
}

/** Nível máximo permitido para uma construção: nunca acima do Núcleo. */
export function levelCap(city: CityState, type: BuildingType): number {
  if (type === 'core') return maxLevel('core');
  return Math.min(maxLevel(type), coreLevel(city));
}

export function isDecor(type: BuildingType): boolean {
  return BUILDINGS[type].category === 'decor';
}

export function isDefense(type: BuildingType): boolean {
  const r = BUILDINGS[type].battle.role;
  return r === 'tower' || r === 'barrier' || r === 'trap' || r === 'core';
}

export function upgradeCost(type: BuildingType, toLevel: number): number {
  return levelStats(type, toLevel).cost;
}

export function upgradeTime(type: BuildingType, toLevel: number): number {
  return levelStats(type, toLevel).time;
}

let uidCounter = 0;
export function newBuildingId(prefix: string, now: number): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}-${now.toString(36)}-${uidCounter.toString(36)}`;
}
