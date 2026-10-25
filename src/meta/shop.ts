import { hashString } from '../sim/rng.ts';
import { ECONOMY } from './economy.ts';
import { grantChest } from './raids.ts';
import { dayKey } from './time.ts';
import type { ChestType, SaveData } from './types.ts';

// Loja: oferta do dia (a mesma para todo mundo), moedas por diamantes e
// baús (a compra de baús fica em chests.ts). Nada de vitória comprada.

export interface Deal {
  id: string;
  title: string;
  chest?: ChestType;
  coins?: number;
  full: number;
  price: number;
}

const DEALS: Omit<Deal, 'price' | 'full' | 'id'>[] = [
  ...ECONOMY.shop.chests.filter((c) => c.type !== 'extremo').map((c) => ({ title: 'Baú em promoção', chest: c.type })),
  ...ECONOMY.shop.coins.map((c) => ({ title: 'Saco de moedas turbinado', coins: Math.round(c.coins * 1.2) })),
];

/** Oferta do dia (40% de desconto), igual para todos os jogadores. */
export function dailyDeal(now: number): Deal {
  const day = dayKey(now);
  const i = hashString(`deal:${day}`) % DEALS.length;
  const d = DEALS[i];
  const full = d.chest ? ECONOMY.shop.chests.find((c) => c.type === d.chest)!.diamonds : ECONOMY.shop.coins.find((c) => Math.round(c.coins * 1.2) === d.coins)!.diamonds;
  return { ...d, id: `${day}:${i}`, full, price: Math.max(1, Math.round(full * (1 - ECONOMY.shop.dailyDealDiscount))) };
}

export function dealBought(save: SaveData, now: number): boolean {
  return save.shop?.dealDay === dayKey(now);
}

export function buyDeal(save: SaveData, now: number): { ok: true; chest?: ChestType; coins?: number } | { ok: false; reason: string } {
  if (dealBought(save, now)) return { ok: false, reason: 'Você já levou a oferta de hoje' };
  const d = dailyDeal(now);
  if (save.currencies.diamonds < d.price) return { ok: false, reason: `Faltam ${d.price - save.currencies.diamonds} diamantes` };
  if (d.chest && !grantChest(save, d.chest, 'Oferta do dia', now)) return { ok: false, reason: 'Inventário de baús cheio (máximo 8)' };
  save.currencies.diamonds -= d.price;
  if (d.coins) save.currencies.coins += d.coins;
  save.shop = { dealDay: dayKey(now) };
  return { ok: true, chest: d.chest, coins: d.coins };
}

export function buyCoins(save: SaveData, index: number): { ok: true; coins: number } | { ok: false; reason: string } {
  const p = ECONOMY.shop.coins[index];
  if (!p) return { ok: false, reason: 'Pacote inválido' };
  if (save.currencies.diamonds < p.diamonds) return { ok: false, reason: `Faltam ${p.diamonds - save.currencies.diamonds} diamantes` };
  save.currencies.diamonds -= p.diamonds;
  save.currencies.coins += p.coins;
  return { ok: true, coins: p.coins };
}
