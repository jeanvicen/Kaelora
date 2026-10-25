import economyJson from '../data/economy.json';
import type { ChestType, Rarity, SaveData } from './types.ts';

export interface Reward {
  coins?: number;
  diamonds?: number;
  chest?: ChestType;
  character?: string;
}

export interface EconomyConfig {
  start: { coins: number; diamonds: number; element: string; chests: ChestType[] };
  account: {
    maxLevel: number;
    xpToNext: number[];
    xp: Record<string, number>;
    levelUpReward: Reward;
    unlocks: Record<string, string[]>;
  };
  battle: {
    durationSec: number;
    frenzySec: number;
    energyMax: number;
    energyStart: number;
    energyRegenSec: number;
    ultimateChargeFactor: number;
    coinsPerStar: number[];
    lootShare: number;
    lootCapByCore: number[];
    trophies: { winByStars: number[]; loss: number; zeroStarLoss: number };
    squadXpByStars: number[];
    chestByStars: (ChestType | null)[];
    goldChestChance: number;
    winStreakBonusCoins: number;
  };
  training: { difficulties: { id: string; name: string; power: number }[]; xpFactor: number };
  raid: {
    shieldHours: number;
    retakeHours: number;
    beginnerHours: number;
    beginnerLevel: number;
    retakeBonus: number;
    restartPack: { coins: number; chest: ChestType };
    checkEveryHours: number;
    raidChance: number;
    ruinedRepairCostPerLevel: number;
    ruinedRepairSecondsPerLevel: number;
  };
  speedup: { diamondsPerMinute: number; minDiamonds: number; freeUnderSeconds: number };
  characters: {
    maxLevel: number;
    startLevel: number;
    levelXp: number[];
    statPerLevel: number;
    statPerStar: number;
    fragmentsPerDuplicate: Record<Rarity, number>;
    starCosts: { fragments: number; coins: number }[];
    rarityMultiplier: Record<Rarity, number>;
  };
  leagues: { id: string; name: string; min: number; reward: Reward }[];
  freeChest: { intervalHours: number; maxStored: number; type: ChestType; upgradeChance: Record<string, number> };
  login: Reward[];
  missions: {
    perDay: number;
    pool: { id: string; text: string; goals: number[]; reward: Reward }[];
    allDoneReward: Reward;
  };
  pass: {
    seasonDays: number;
    xpPerTier: number;
    premiumCostDiamonds: number;
    xp: Record<string, number>;
    tiers: number;
    free: Reward[];
    premium: Reward[];
  };
  shop: {
    chests: { type: ChestType; diamonds: number }[];
    coins: { coins: number; diamonds: number }[];
    dailyDealDiscount: number;
  };
  album: { milestones: number[]; rewards: Reward[] };
  repairAll: { diamondsPerBuilding: number };
}

export const ECONOMY = economyJson as unknown as EconomyConfig;

export function xpToNext(level: number): number {
  const arr = ECONOMY.account.xpToNext;
  return arr[Math.min(arr.length - 1, Math.max(0, level - 1))];
}

/** Adiciona XP de conta e sobe de nível quantas vezes precisar. Retorna níveis ganhos. */
export function addAccountXp(save: SaveData, amount: number): number[] {
  const gained: number[] = [];
  const p = save.profile;
  p.accountXp += Math.max(0, Math.round(amount));
  while (p.accountLevel < ECONOMY.account.maxLevel && p.accountXp >= xpToNext(p.accountLevel)) {
    p.accountXp -= xpToNext(p.accountLevel);
    p.accountLevel++;
    gained.push(p.accountLevel);
    const r = ECONOMY.account.levelUpReward;
    save.currencies.coins += (r.coins ?? 0) * p.accountLevel;
    save.currencies.diamonds += r.diamonds ?? 0;
  }
  return gained;
}

/** Recursos liberados pelo nível de conta. */
export function unlockedFeatures(level: number): Set<string> {
  const out = new Set<string>();
  for (const [lv, feats] of Object.entries(ECONOMY.account.unlocks)) if (level >= Number(lv)) for (const f of feats) out.add(f);
  return out;
}

export function isUnlocked(save: SaveData, feature: string): boolean {
  return unlockedFeatures(save.profile.accountLevel).has(feature);
}

/** Nível de conta que libera um recurso (para mostrar "Libera no nível X"). */
export function unlockLevel(feature: string): number {
  for (const [lv, feats] of Object.entries(ECONOMY.account.unlocks)) if (feats.includes(feature)) return Number(lv);
  return 1;
}

/** Diamantes para acelerar `seconds` restantes. */
export function speedupCost(seconds: number): number {
  const s = ECONOMY.speedup;
  if (seconds <= s.freeUnderSeconds) return 0;
  return Math.max(s.minDiamonds, Math.ceil((seconds / 60) * s.diamondsPerMinute));
}

export function leagueFor(trophies: number): EconomyConfig['leagues'][number] {
  let cur = ECONOMY.leagues[0];
  for (const l of ECONOMY.leagues) if (trophies >= l.min) cur = l;
  return cur;
}

export function canAfford(save: SaveData, cost: { coins?: number; diamonds?: number }): boolean {
  return save.currencies.coins >= (cost.coins ?? 0) && save.currencies.diamonds >= (cost.diamonds ?? 0);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.', ',')}k`;
  return n.toLocaleString('pt-BR');
}

export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}
