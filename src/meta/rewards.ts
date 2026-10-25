import type { Reward } from './economy.ts';
import { grantChest } from './raids.ts';
import type { SaveData } from './types.ts';

export interface AppliedReward {
  coins: number;
  diamonds: number;
  chest: Reward['chest'] | null;
  /** Baú perdido porque o inventário estava cheio. */
  chestLost: boolean;
}

/** Credita uma recompensa (moedas, diamantes, baú) no save. */
export function applyReward(save: SaveData, reward: Reward, source: string, now: number): AppliedReward {
  const out: AppliedReward = { coins: reward.coins ?? 0, diamonds: reward.diamonds ?? 0, chest: reward.chest ?? null, chestLost: false };
  save.currencies.coins += out.coins;
  save.currencies.diamonds += out.diamonds;
  if (reward.chest) out.chestLost = !grantChest(save, reward.chest, source, now);
  return out;
}
