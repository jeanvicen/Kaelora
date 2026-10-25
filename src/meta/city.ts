import {
  BUILDINGS,
  canPlace,
  coreLevel,
  countOf,
  gridSizeForCore,
  levelCap,
  levelStats,
  maxCountFor,
  newBuildingId,
} from './buildings.ts';
import { ECONOMY, addAccountXp, speedupCost } from './economy.ts';
import type { BuildingType, PlacedBuilding, SaveData } from './types.ts';

export const MAX_BUILDERS = 2;

export type CityResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): CityResult => ({ ok: false, reason });
const OK: CityResult = { ok: true };

export function buildCost(type: BuildingType): number {
  return levelStats(type, 1).cost;
}

/** Por que não dá para construir mais deste tipo (ou null se dá). */
export function buildBlockReason(save: SaveData, type: BuildingType): string | null {
  const def = BUILDINGS[type];
  if (coreLevel(save.city) < def.unlockCore) return `Libera com o Núcleo nível ${def.unlockCore}`;
  if (countOf(save.city, type) >= maxCountFor(save.city, type)) return 'Limite atingido para o nível do Núcleo';
  if (save.currencies.coins < buildCost(type)) return 'Moedas insuficientes';
  return null;
}

export function buyBuilding(
  save: SaveData,
  type: BuildingType,
  x: number,
  z: number,
  rot: number,
  now: number,
): CityResult & { building?: PlacedBuilding } {
  const block = buildBlockReason(save, type);
  if (block) return fail(block);
  if (!canPlace(save.city, type, x, z, rot)) return fail('Posição inválida');
  save.currencies.coins -= buildCost(type);
  const b: PlacedBuilding = { id: newBuildingId(type, now), type, level: 1, x, z, rot };
  if (type === 'generator') b.lastCollectAt = now;
  save.city.buildings.push(b);
  addAccountXp(save, ECONOMY.account.xp.build);
  return { ok: true, building: b };
}

export function moveBuilding(save: SaveData, id: string, x: number, z: number, rot: number): CityResult {
  const b = save.city.buildings.find((v) => v.id === id);
  if (!b) return fail('Construção não encontrada');
  if (!canPlace(save.city, b.type, x, z, rot, id)) return fail('Posição inválida');
  b.x = x;
  b.z = z;
  b.rot = ((rot % 4) + 4) % 4;
  return OK;
}

/** Guarda no estoque (o Núcleo nunca sai da cidade). */
export function storeBuilding(save: SaveData, id: string): CityResult {
  const i = save.city.buildings.findIndex((v) => v.id === id);
  if (i < 0) return fail('Construção não encontrada');
  const b = save.city.buildings[i];
  if (b.type === 'core') return fail('O Núcleo não pode ser guardado');
  if (b.upgradeEndsAt) return fail('Espere a melhoria terminar');
  save.city.buildings.splice(i, 1);
  save.city.storage.push({ id: b.id, type: b.type, level: b.level });
  return OK;
}

export function placeFromStorage(save: SaveData, id: string, x: number, z: number, rot: number, now: number): CityResult {
  const i = save.city.storage.findIndex((v) => v.id === id);
  if (i < 0) return fail('Item não está no estoque');
  const s = save.city.storage[i];
  if (!canPlace(save.city, s.type, x, z, rot)) return fail('Posição inválida');
  save.city.storage.splice(i, 1);
  const b: PlacedBuilding = { id: s.id, type: s.type, level: s.level, x, z, rot };
  if (s.type === 'generator') b.lastCollectAt = now;
  save.city.buildings.push(b);
  return OK;
}

export function activeUpgrades(save: SaveData): PlacedBuilding[] {
  return save.city.buildings.filter((b) => b.upgradeEndsAt);
}

export function upgradeBlockReason(save: SaveData, b: PlacedBuilding): string | null {
  if (b.ruined) return 'Repare antes de melhorar';
  if (b.upgradeEndsAt) return 'Melhoria em andamento';
  if (BUILDINGS[b.type].category === 'decor') return 'Decorações não têm nível';
  if (b.level >= levelCap(save.city, b.type)) {
    return b.level >= BUILDINGS[b.type].levels.length ? 'Nível máximo' : 'Melhore o Núcleo primeiro';
  }
  if (activeUpgrades(save).length >= MAX_BUILDERS) return 'Os 2 construtores estão ocupados';
  if (save.currencies.coins < levelStats(b.type, b.level + 1).cost) return 'Moedas insuficientes';
  return null;
}

export function startUpgrade(save: SaveData, id: string, now: number): CityResult {
  const b = save.city.buildings.find((v) => v.id === id);
  if (!b) return fail('Construção não encontrada');
  const block = upgradeBlockReason(save, b);
  if (block) return fail(block);
  const next = levelStats(b.type, b.level + 1);
  save.currencies.coins -= next.cost;
  if (next.time <= 0) {
    completeUpgrade(save, b, now);
  } else {
    b.upgradeEndsAt = now + next.time * 1000;
  }
  return OK;
}

function completeUpgrade(save: SaveData, b: PlacedBuilding, now: number): void {
  if (b.type === 'generator') {
    // coleta automática antes de mudar a taxa, para não perder moedas
    save.currencies.coins += generatorAmount(b, now);
    b.lastCollectAt = now;
  }
  const before = gridSizeForCore(coreLevel(save.city));
  b.level++;
  b.upgradeEndsAt = undefined;
  addAccountXp(save, ECONOMY.account.xp.upgrade);
  if (b.type === 'core') {
    const after = gridSizeForCore(b.level);
    const shift = Math.floor((after - before) / 2);
    if (shift > 0) {
      for (const o of save.city.buildings) {
        o.x += shift;
        o.z += shift;
      }
    }
  }
}

/** Conclui melhorias cujo tempo acabou. Retorna as que terminaram. */
export function finishUpgrades(save: SaveData, now: number): PlacedBuilding[] {
  const done: PlacedBuilding[] = [];
  for (const b of save.city.buildings) {
    if (b.upgradeEndsAt && b.upgradeEndsAt <= now) {
      completeUpgrade(save, b, now);
      done.push(b);
    }
  }
  return done;
}

export function speedUpCostFor(b: PlacedBuilding, now: number): number {
  if (!b.upgradeEndsAt) return 0;
  return speedupCost((b.upgradeEndsAt - now) / 1000);
}

export function speedUp(save: SaveData, id: string, now: number): CityResult {
  const b = save.city.buildings.find((v) => v.id === id);
  if (!b || !b.upgradeEndsAt) return fail('Nada para acelerar');
  const cost = speedUpCostFor(b, now);
  if (save.currencies.diamonds < cost) return fail('Diamantes insuficientes');
  save.currencies.diamonds -= cost;
  b.upgradeEndsAt = now;
  finishUpgrades(save, now);
  return OK;
}

/** Moedas acumuladas num gerador (limitadas pela capacidade). */
export function generatorAmount(b: PlacedBuilding, now: number): number {
  if (b.type !== 'generator' || b.ruined) return 0;
  const st = levelStats('generator', b.level);
  const hours = Math.max(0, now - (b.lastCollectAt ?? now)) / 3_600_000;
  return Math.min(st.capacity ?? 0, Math.floor(hours * (st.rate ?? 0)));
}

export function generatorFill(b: PlacedBuilding, now: number): number {
  const cap = levelStats('generator', b.level).capacity ?? 1;
  return generatorAmount(b, now) / cap;
}

export function collect(save: SaveData, id: string, now: number): number {
  const b = save.city.buildings.find((v) => v.id === id);
  if (!b) return 0;
  const amount = generatorAmount(b, now);
  if (amount <= 0) return 0;
  save.currencies.coins += amount;
  b.lastCollectAt = now;
  return amount;
}

export function collectAll(save: SaveData, now: number): number {
  let total = 0;
  for (const b of save.city.buildings) if (b.type === 'generator') total += collect(save, b.id, now);
  return total;
}

/** Moedas protegidas pelos Cofres em caso de saque. */
export function protectedCoins(save: SaveData): number {
  let total = 0;
  for (const b of save.city.buildings) {
    if (b.type !== 'vault' || b.ruined) continue;
    const st = levelStats('vault', b.level);
    total += Math.min(st.protectCap ?? 0, Math.floor((save.currencies.coins * (st.protect ?? 0)) / 100));
  }
  return Math.min(save.currencies.coins, total);
}

export function repairCost(b: PlacedBuilding): number {
  return b.level * ECONOMY.raid.ruinedRepairCostPerLevel;
}

export function repair(save: SaveData, id: string): CityResult {
  const b = save.city.buildings.find((v) => v.id === id);
  if (!b || !b.ruined) return fail('Nada para reparar');
  const cost = repairCost(b);
  if (save.currencies.coins < cost) return fail('Moedas insuficientes');
  save.currencies.coins -= cost;
  b.ruined = false;
  return OK;
}

/** Nível máximo dos personagens, definido pelo Quartel. */
export function maxCharacterLevel(save: SaveData): number {
  const barracks = save.city.buildings.filter((b) => b.type === 'barracks' && !b.ruined);
  if (barracks.length === 0) return 5;
  return Math.max(...barracks.map((b) => levelStats('barracks', b.level).maxCharLevel ?? 5));
}
