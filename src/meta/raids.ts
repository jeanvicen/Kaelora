import { generateBotCity, suggestedBotLevel, type BotCity } from '../content/botCity.ts';
import { getCharacter } from '../content/catalog.ts';
import type { BattleResult } from '../sim/types.ts';
import { coreLevel } from './buildings.ts';
import { maxCharacterLevel } from './city.ts';
import { ECONOMY, addAccountXp } from './economy.ts';
import { metaRng } from './rng.ts';
import type { ChestType, SaveData } from './types.ts';

export const MAX_CHESTS = 8;
const HOUR = 3_600_000;

export type BattleContext = 'raid' | 'training' | 'revenge' | 'event' | 'duel';

export interface CharacterGain {
  id: number;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  capped: boolean;
}

export interface BattleRewards {
  won: boolean;
  stars: number;
  coins: number;
  loot: number;
  trophies: number;
  accountXp: number;
  levelsGained: number[];
  chest: ChestType | null;
  chestBlocked: boolean;
  characters: CharacterGain[];
  revengeRecovered: number;
  passXp: number;
}

/** Alvos de invasão disponíveis (gera/renova quando preciso). */
export function invasionTargets(save: SaveData, now: number, force = false): BotCity[] {
  if (force || save.targets.seeds.length < 3 || now - save.targets.refreshedAt > 6 * HOUR) {
    const rng = metaRng(save);
    save.targets.seeds = [0, 1, 2].map(() => rng.nextU32());
    save.targets.refreshedAt = now;
  }
  const rng = metaRng({ ...save, rng: { ...save.rng } });
  const core = coreLevel(save.city);
  return save.targets.seeds.map((seed, i) => {
    const lvl = save.stats.battles < 3 ? 1 : Math.max(1, Math.min(10, suggestedBotLevel(save.profile.trophies, core, rng) + (i - 1)));
    return generateBotCity(seed, lvl);
  });
}

export function refreshCost(save: SaveData): number {
  return 40 * coreLevel(save.city);
}

/** Troca um alvo depois de atacá-lo (o mapa sempre tem 3). */
export function consumeTarget(save: SaveData, seed: number): void {
  const i = save.targets.seeds.indexOf(seed);
  if (i >= 0) save.targets.seeds[i] = metaRng(save).nextU32();
}

/** Adiciona um baú respeitando o limite de espaços. */
export function grantChest(save: SaveData, type: ChestType, source: string, now: number): boolean {
  if (save.chests.inventory.length >= MAX_CHESTS) return false;
  save.chests.inventory.push({ uid: `c${now.toString(36)}${metaRng(save).nextU32().toString(36)}`, type, source, receivedAt: now });
  return true;
}

/** XP de batalha para um personagem, subindo de nível até o limite do Quartel. */
export function addCharacterXp(save: SaveData, id: number, xp: number): CharacterGain {
  const owned = save.collection[id];
  const gain: CharacterGain = { id, xp, levelBefore: owned?.level ?? 1, levelAfter: owned?.level ?? 1, capped: false };
  if (!owned) return gain;
  const cap = Math.min(ECONOMY.characters.maxLevel, maxCharacterLevel(save));
  owned.xp += xp;
  const table = ECONOMY.characters.levelXp;
  while (owned.level < cap && owned.xp >= table[Math.min(table.length - 1, owned.level - 1)]) {
    owned.xp -= table[Math.min(table.length - 1, owned.level - 1)];
    owned.level++;
  }
  if (owned.level >= cap) {
    gain.capped = true;
    owned.xp = Math.min(owned.xp, table[Math.min(table.length - 1, owned.level - 1)]);
  }
  gain.levelAfter = owned.level;
  return gain;
}

/**
 * Aplica o resultado de uma batalha ao save (moedas, troféus, XP, baú,
 * estatísticas e vingança). Lógica pura: o mesmo cálculo roda no servidor.
 */
export function applyBattleResult(
  save: SaveData,
  ctx: { kind: BattleContext; target: Pick<BotCity, 'loot' | 'coreLevel' | 'trophies'> | null; result: BattleResult; squad: number[]; now: number; revengeId?: string },
): BattleRewards {
  const B = ECONOMY.battle;
  const r = ctx.result;
  const won = r.winner === 0;
  const stars = r.stars;
  const training = ctx.kind === 'training';
  const rewards: BattleRewards = {
    won,
    stars,
    coins: 0,
    loot: 0,
    trophies: 0,
    accountXp: 0,
    levelsGained: [],
    chest: null,
    chestBlocked: false,
    characters: [],
    revengeRecovered: 0,
    passXp: 0,
  };
  // moedas: base por estrela + saque proporcional à destruição
  const core = coreLevel(save.city);
  if (!training) {
    rewards.coins = B.coinsPerStar[stars];
    if (ctx.target) {
      const cap = B.lootCapByCore[Math.min(B.lootCapByCore.length, core) - 1];
      rewards.loot = Math.min(cap, Math.round((ctx.target.loot * B.lootShare * r.destruction) / 100));
    }
  } else rewards.coins = Math.round(B.coinsPerStar[stars] / 3);

  // troféus
  if (ctx.kind === 'raid' || ctx.kind === 'revenge' || ctx.kind === 'duel') {
    if (won) {
      const diff = ctx.target ? Math.round((ctx.target.trophies - save.profile.trophies) / 40) : 0;
      rewards.trophies = Math.max(5, B.trophies.winByStars[stars] + Math.max(-6, Math.min(8, diff)));
    } else rewards.trophies = stars === 0 ? B.trophies.zeroStarLoss : B.trophies.loss;
  }

  // vingança: recupera o que perdeu + bônus
  if (ctx.kind === 'revenge' && won && ctx.revengeId) {
    const entry = save.raids.revenge.find((e) => e.id === ctx.revengeId);
    if (entry && !entry.done && entry.expiresAt > ctx.now) {
      rewards.revengeRecovered = Math.round(entry.coinsLost * (1 + ECONOMY.raid.retakeBonus));
      entry.done = true;
      for (const b of save.city.buildings) if (entry.ruined.includes(b.id)) b.ruined = false;
      if (save.raids.pendingChoice?.revengeId === entry.id) save.raids.pendingChoice = null;
    }
  }

  // baú
  if (won && !training) {
    let chest = B.chestByStars[stars];
    if (chest && metaRng(save).int(1000) < B.goldChestChance * 1000) chest = 'ouro';
    if (chest) {
      if (grantChest(save, chest, 'Vitória em batalha', ctx.now)) rewards.chest = chest;
      else rewards.chestBlocked = true;
    }
  }

  // XP da conta e do esquadrão
  const X = ECONOMY.account.xp;
  const xpFactor = training ? ECONOMY.training.xpFactor : 1;
  rewards.accountXp = Math.round(((won ? X.battleWin : X.battleLoss) + X.perStar * stars) * xpFactor);
  rewards.levelsGained = addAccountXp(save, rewards.accountXp);
  const squadXp = Math.round(B.squadXpByStars[stars] * (won ? 1 : 0.6) * xpFactor);
  for (const id of ctx.squad) if (getCharacter(id)) rewards.characters.push(addCharacterXp(save, id, squadXp));
  rewards.passXp = training ? 0 : won ? ECONOMY.pass.xp.battleWin : ECONOMY.pass.xp.battleLoss;
  save.pass.xp += rewards.passXp;

  save.currencies.coins += rewards.coins + rewards.loot + rewards.revengeRecovered;
  save.profile.trophies = Math.max(0, save.profile.trophies + rewards.trophies);
  save.profile.bestTrophies = Math.max(save.profile.bestTrophies, save.profile.trophies);

  const st = save.stats;
  st.battles++;
  if (won) st.wins++;
  if (training && won) st.trainingWins++;
  if (ctx.kind === 'duel' && won) st.duelsWon++;
  st.stars += stars;
  if (r.coreDestroyed) st.coresDestroyed++;
  st.buildingsDestroyed += r.structuresDestroyed;
  st.damageDealt += r.damageDealt[0];
  return rewards;
}
