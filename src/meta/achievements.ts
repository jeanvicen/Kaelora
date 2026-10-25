import achievementsJson from '../data/achievements.json';
import type { SaveData } from './types.ts';

// Conquistas: metas permanentes em degraus; cada degrau dá diamantes
// ("Diamantes: raros. Vêm de conquistas, eventos, passe e loja.").

export interface AchievementDef {
  id: string;
  title: string;
  text: string;
  stat: string;
  tiers: number[];
  diamonds: number[];
}

export const ACHIEVEMENTS = (achievementsJson as unknown as { list: AchievementDef[] }).list;

export function achievementValue(save: SaveData, stat: string): number {
  if (stat === 'collection') return Object.keys(save.collection).length;
  if (stat === 'accountLevel') return save.profile.accountLevel;
  if (stat === 'bestTrophies') return save.profile.bestTrophies;
  return (save.stats as unknown as Record<string, number>)[stat] ?? 0;
}

export interface AchievementView extends AchievementDef {
  value: number;
  claimed: number;
  /** Próximo degrau (ou o último, se completo). */
  goal: number;
  ready: boolean;
  done: boolean;
}

export function achievementViews(save: SaveData): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const claimed = save.achievements?.[a.id] ?? 0;
    const value = achievementValue(save, a.stat);
    const done = claimed >= a.tiers.length;
    const goal = a.tiers[Math.min(claimed, a.tiers.length - 1)];
    return { ...a, value, claimed, goal, ready: !done && value >= goal, done };
  });
}

export function achievementsClaimable(save: SaveData): number {
  return achievementViews(save).filter((a) => a.ready).length;
}

export function claimAchievement(save: SaveData, id: string): { ok: true; diamonds: number; tier: number } | { ok: false; reason: string } {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return { ok: false, reason: 'Conquista desconhecida' };
  save.achievements ??= {};
  const claimed = save.achievements[id] ?? 0;
  if (claimed >= a.tiers.length) return { ok: false, reason: 'Conquista completa' };
  if (achievementValue(save, a.stat) < a.tiers[claimed]) return { ok: false, reason: 'Ainda não alcançada' };
  save.achievements[id] = claimed + 1;
  const diamonds = a.diamonds[claimed] ?? 0;
  save.currencies.diamonds += diamonds;
  return { ok: true, diamonds, tier: claimed + 1 };
}
