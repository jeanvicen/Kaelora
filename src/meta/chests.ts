import chestsJson from '../data/chests.json';
import { charactersOfRarity } from '../content/catalog.ts';
import type { Rng } from '../sim/rng.ts';
import { grantCharacter } from './collection.ts';
import { ECONOMY, addAccountXp, isUnlocked } from './economy.ts';
import { grantChest } from './raids.ts';
import { trackMission } from './missions.ts';
import { metaRng } from './rng.ts';
import type { ChestType, Rarity, SaveData } from './types.ts';

// Baús: chances, garantia (pity) e abertura. Lógica pura e determinística
// pelo RNG do save: offline roda aqui; online, a Edge Function `open-chest`
// roda exatamente este código e devolve o resultado.

export interface ChestDef {
  name: string;
  cards: number;
  coins: [number, number];
  diamonds: [number, number];
  /** % por carta, na ordem de RARITIES. */
  odds: number[];
  shakeSec: number;
}

interface ChestsConfig {
  rarities: Rarity[];
  chests: Record<ChestType, ChestDef>;
  coinsPerAccountLevel: number;
  pity: { legendaryEvery: number; extremeEvery: number; countsFrom: ChestType[] };
  unlockFeature: Partial<Record<ChestType, string>>;
}

export const CHESTS = chestsJson as unknown as ChestsConfig;
export const RARITIES = CHESTS.rarities;
export const CHEST_TYPES = Object.keys(CHESTS.chests) as ChestType[];
const RANK: Record<Rarity, number> = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 };

export function chestDef(type: ChestType): ChestDef {
  return CHESTS.chests[type];
}

/** Chances por carta já como lista legível (para mostrar sempre antes de abrir). */
export function chestOdds(type: ChestType): { rarity: Rarity; pct: number }[] {
  return RARITIES.map((rarity, i) => ({ rarity, pct: CHESTS.chests[type].odds[i] })).filter((o) => o.pct > 0);
}

export function countsForPity(type: ChestType): boolean {
  return CHESTS.pity.countsFrom.includes(type);
}

/** Quantos baús de Ouro+ faltam para a garantia (1 = o próximo garante). */
export function pityRemaining(save: SaveData): { legendary: number; extreme: number } {
  return {
    legendary: Math.max(1, CHESTS.pity.legendaryEvery - save.chests.pity.sinceLegendary),
    extreme: Math.max(1, CHESTS.pity.extremeEvery - save.chests.pity.sinceExtreme),
  };
}

export interface RolledCard {
  id: number;
  rarity: Rarity;
  /** Veio da garantia. */
  pity?: 'lendario' | 'extremo';
}

export interface ChestRoll {
  type: ChestType;
  cards: RolledCard[];
  coins: number;
  diamonds: number;
  best: Rarity;
}

function drawRarity(rng: Rng, odds: number[]): Rarity {
  // basis points: 4,5% = 450 em 10000
  const total = odds.reduce((a, b) => a + Math.round(b * 100), 0);
  let r = rng.int(total);
  for (let i = 0; i < odds.length; i++) {
    r -= Math.round(odds[i] * 100);
    if (r < 0) return RARITIES[i];
  }
  return RARITIES[0];
}

function drawCharacter(rng: Rng, rarity: Rarity): number {
  return rng.pick(charactersOfRarity(rarity)).id;
}

/**
 * Sorteia o conteúdo de um baú sem mexer no save (a não ser pelo RNG).
 * `pity` diz quantos baús de Ouro+ seguidos vieram sem Lendário/Extremo.
 */
export function rollChest(type: ChestType, rng: Rng, pity: { sinceLegendary: number; sinceExtreme: number }, accountLevel = 1): ChestRoll {
  const def = CHESTS.chests[type];
  const cards: RolledCard[] = [];
  for (let i = 0; i < def.cards; i++) {
    const rarity = drawRarity(rng, def.odds);
    cards.push({ id: drawCharacter(rng, rarity), rarity });
  }
  if (countsForPity(type)) {
    const lowest = () => cards.reduce((lo, c, i) => (RANK[c.rarity] < RANK[cards[lo].rarity] ? i : lo), 0);
    if (pity.sinceExtreme + 1 >= CHESTS.pity.extremeEvery && !cards.some((c) => c.rarity === 'extremo')) {
      cards[lowest()] = { id: drawCharacter(rng, 'extremo'), rarity: 'extremo', pity: 'extremo' };
    }
    if (pity.sinceLegendary + 1 >= CHESTS.pity.legendaryEvery && !cards.some((c) => RANK[c.rarity] >= RANK.lendario)) {
      cards[lowest()] = { id: drawCharacter(rng, 'lendario'), rarity: 'lendario', pity: 'lendario' };
    }
  }
  // da mais fraca para a mais forte: a melhor carta fica para o fim (suspense)
  cards.sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  const coinMul = 1 + CHESTS.coinsPerAccountLevel * (Math.max(1, accountLevel) - 1);
  return {
    type,
    cards,
    coins: Math.round(rng.range(def.coins[0], def.coins[1]) * coinMul),
    diamonds: rng.range(def.diamonds[0], def.diamonds[1]),
    best: cards.reduce<Rarity>((b, c) => (RANK[c.rarity] > RANK[b] ? c.rarity : b), 'comum'),
  };
}

export interface OpenedCard extends RolledCard {
  isNew: boolean;
  fragments: number;
}

export interface ChestOpening {
  uid: string;
  type: ChestType;
  cards: OpenedCard[];
  coins: number;
  diamonds: number;
  best: Rarity;
  levelsGained: number[];
}

export type ChestResult = { ok: true; opening: ChestOpening } | { ok: false; reason: string };

/** Abre um baú do inventário: sorteia, entrega e atualiza a garantia. */
export function openChest(save: SaveData, uid: string, now: number): ChestResult {
  const idx = save.chests.inventory.findIndex((c) => c.uid === uid);
  if (idx < 0) return { ok: false, reason: 'Baú não encontrado' };
  const item = save.chests.inventory[idx];
  save.chests.inventory.splice(idx, 1);
  const roll = rollChest(item.type, metaRng(save), save.chests.pity, save.profile.accountLevel);
  const cards: OpenedCard[] = roll.cards.map((c) => ({ ...c, ...grantCharacter(save, c.id, now) }));
  save.currencies.coins += roll.coins;
  save.currencies.diamonds += roll.diamonds;
  if (countsForPity(item.type)) {
    const p = save.chests.pity;
    const gotLegend = cards.some((c) => RANK[c.rarity] >= RANK.lendario);
    const gotExtreme = cards.some((c) => c.rarity === 'extremo');
    p.sinceLegendary = gotLegend ? 0 : p.sinceLegendary + 1;
    p.sinceExtreme = gotExtreme ? 0 : p.sinceExtreme + 1;
  }
  save.chests.openedTotal++;
  save.stats.chestsOpened++;
  trackMission(save, 'open_chests', 1);
  save.pass.xp += ECONOMY.pass.xp.chest;
  const levelsGained = addAccountXp(save, ECONOMY.account.xp.chestOpen);
  return { ok: true, opening: { uid, type: item.type, cards, coins: roll.coins, diamonds: roll.diamonds, best: roll.best, levelsGained } };
}

/** Preço em diamantes de um baú na loja (null se não está à venda). */
export function chestPrice(type: ChestType): number | null {
  return ECONOMY.shop.chests.find((c) => c.type === type)?.diamonds ?? null;
}

/** Nível de conta exigido para comprar (null = liberado). */
export function chestLockReason(save: SaveData, type: ChestType): string | null {
  const feat = CHESTS.unlockFeature[type];
  if (feat && !isUnlocked(save, feat)) return feat;
  return null;
}

export function buyChest(save: SaveData, type: ChestType, now: number): { ok: true; uid: string } | { ok: false; reason: string } {
  const price = chestPrice(type);
  if (price === null) return { ok: false, reason: 'Este baú não está à venda' };
  if (chestLockReason(save, type)) return { ok: false, reason: 'Baú ainda bloqueado' };
  if (save.currencies.diamonds < price) return { ok: false, reason: `Faltam ${price - save.currencies.diamonds} diamantes` };
  if (!grantChest(save, type, 'Loja', now)) return { ok: false, reason: 'Inventário de baús cheio (máximo 8)' };
  save.currencies.diamonds -= price;
  return { ok: true, uid: save.chests.inventory[save.chests.inventory.length - 1].uid };
}
