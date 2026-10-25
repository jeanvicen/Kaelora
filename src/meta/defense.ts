import { buildRaidSetup } from '../content/battleSetup.ts';
import { botOwnerName, generateBotCity, generateBotSquad, type BotCity } from '../content/botCity.ts';
import { ELEMENTS } from '../content/classes.ts';
import { buildSquad, squadPower } from '../content/squad.ts';
import { runBattle } from '../sim/battle.ts';
import { encodeReplay } from '../sim/replay.ts';
import { Rng } from '../sim/rng.ts';
import type { BattleResult, BattleSetup, TimedCommand } from '../sim/types.ts';
import { coreLevel } from './buildings.ts';
import { protectedCoins } from './city.ts';
import { ECONOMY } from './economy.ts';
import { starterCity } from './newGame.ts';
import { grantChest } from './raids.ts';
import { metaRng } from './rng.ts';
import type { DefenseLogEntry, SaveData } from './types.ts';

// Defesa da cidade: saque, escudo, proteção de iniciante, vingança (48 h)
// e invasões de rivais enquanto o jogador está fora. Lógica pura: roda no
// cliente offline e no servidor (Edge Function `apply-raid`).

const HOUR = 3_600_000;
export const MAX_DEFENSE_LOG = 20;
export const MAX_RUINED = 8;
const TROPHIES_RAIDED = -12;
const TROPHIES_DEFENDED = 6;

export interface Protection {
  kind: 'beginner' | 'shield' | null;
  until: number;
}

/** Quem pode invadir o jogador agora? (iniciante: 72 h OU até o nível 5, o que vier antes). */
export function protection(save: SaveData, now: number): Protection {
  const R = save.raids;
  if (now < R.beginnerUntil && save.profile.accountLevel < ECONOMY.raid.beginnerLevel) return { kind: 'beginner', until: R.beginnerUntil };
  if (now < R.shieldUntil) return { kind: 'shield', until: R.shieldUntil };
  return { kind: null, until: 0 };
}

export function canBeRaided(save: SaveData, now: number): boolean {
  return !protection(save, now).kind && !save.raids.pendingChoice;
}

/** Moedas que um saque levaria agora (o que o Cofre não protege). */
export function coinsAtRisk(save: SaveData): number {
  return Math.max(0, save.currencies.coins - protectedCoins(save));
}

export interface IncomingRaid {
  attackerName: string;
  attackerSeed: number;
  attackerPower: number;
  attackerLevel?: number;
  attackerId?: string;
  result: BattleResult;
  replay: string;
  at: number;
}

/**
 * Aplica na cidade do defensor o resultado de uma invasão contra ela.
 * Núcleo derrubado = cidade SAQUEADA: perde as moedas fora do Cofre,
 * construções derrubadas ficam em ruína, escudo de 12 h e 48 h para retomar.
 * A coleção de personagens nunca é perdida.
 */
export function applyRaidOnPlayer(save: SaveData, raid: IncomingRaid): DefenseLogEntry {
  const R = save.raids;
  const raided = raid.result.coreDestroyed;
  let coinsLost = 0;
  let ruined: string[] = [];
  let trophies = 0;
  if (raided) {
    coinsLost = coinsAtRisk(save);
    save.currencies.coins -= coinsLost;
    const ids = new Set(raid.result.destroyedRefIds);
    ruined = save.city.buildings
      .filter((b) => ids.has(b.id) && b.type !== 'core')
      .slice(0, MAX_RUINED)
      .map((b) => b.id);
    for (const b of save.city.buildings) if (ruined.includes(b.id)) {
      b.ruined = true;
      b.upgradeEndsAt = undefined;
    }
    R.shieldUntil = Math.max(R.shieldUntil, raid.at + ECONOMY.raid.shieldHours * HOUR);
    const revengeId = `v${raid.at.toString(36)}${(raid.attackerSeed >>> 0).toString(36)}`;
    R.revenge.unshift({
      id: revengeId,
      raiderName: raid.attackerName,
      raiderSeed: raid.attackerSeed,
      raiderPower: raid.attackerPower,
      raiderLevel: raid.attackerLevel,
      raiderId: raid.attackerId,
      coinsLost,
      ruined,
      expiresAt: raid.at + ECONOMY.raid.retakeHours * HOUR,
      done: false,
    });
    R.revenge = R.revenge.slice(0, 10);
    R.pendingChoice = { revengeId, at: raid.at };
    trophies = TROPHIES_RAIDED;
  } else {
    save.stats.raidsDefended++;
    trophies = TROPHIES_DEFENDED;
  }
  save.profile.trophies = Math.max(0, save.profile.trophies + trophies);
  const entry: DefenseLogEntry = {
    id: `d${raid.at.toString(36)}${(raid.attackerSeed >>> 0).toString(36)}`,
    at: raid.at,
    attackerName: raid.attackerName,
    attackerSeed: raid.attackerSeed,
    attackerLevel: raid.attackerLevel,
    attackerId: raid.attackerId,
    won: !raided,
    stars: raid.result.stars,
    coinsLost,
    ruined,
    replay: raid.replay,
    seen: false,
    trophies,
  };
  R.log.unshift(entry);
  R.log = R.log.slice(0, MAX_DEFENSE_LOG);
  return entry;
}

/** Comandos que entram no replay: os do bot ele refaz sozinho (determinístico). */
export function replayCommands(setup: BattleSetup, log: TimedCommand[]): TimedCommand[] {
  return log.filter((c) => !setup.teams[c.team].bot);
}

/** Nível do rival que ataca o jogador: o mesmo do Núcleo dele. */
function raiderLevel(save: SaveData): number {
  return Math.max(1, Math.min(10, coreLevel(save.city)));
}

/**
 * Ajuste de força (vida e dano, em %) dos rivais-bot por nível, calibrado
 * com simulações para ~50% de chance de saque contra uma cidade típica.
 */
export function raiderModifier(level: number): number {
  const t = ECONOMY.raid.raiderStrengthByCore;
  return t[Math.max(0, Math.min(t.length - 1, level - 1))];
}

/** Um rival (bot) invade a cidade do jogador: simulação completa, igual a uma batalha real. */
export function simulateBotRaid(save: SaveData, seed: number, at: number, opts: { level?: number; skill?: number; mod?: number } = {}): DefenseLogEntry {
  const rng = new Rng(seed);
  const level = opts.level ?? raiderLevel(save);
  const bot = generateBotSquad(seed ^ 0x5eed, level);
  const name = botOwnerName(rng);
  const mod = opts.mod ?? raiderModifier(level) + rng.range(-8, 8);
  const { specs } = buildSquad(bot.squad, bot.levels, undefined, { hpPct: mod, dmgPct: mod });
  const setup = buildRaidSetup({
    seed,
    attacker: { name, element: ELEMENTS[rng.int(ELEMENTS.length)], squad: specs, bot: { skill: opts.skill ?? ECONOMY.raid.raiderSkill } },
    defender: { name: save.profile.name, city: { buildings: save.city.buildings, element: save.city.element }, research: save.city.research },
  });
  const { sim, result } = runBattle(setup);
  const replay = encodeReplay({ setup, commands: replayCommands(setup, sim.log), hash: result.hash, meta: { attacker: name, defender: save.profile.name, at } });
  return applyRaidOnPlayer(save, { attackerName: name, attackerSeed: seed, attackerPower: squadPower(bot.squad, bot.levels), attackerLevel: level, result, replay, at });
}

/**
 * Invasões de rivais enquanto o jogador esteve fora: a cada janela de
 * `checkEveryHours` há uma chance de ataque (respeitando proteção e escudo).
 */
export function processOfflineRaids(save: SaveData, now: number, maxWindows = 4): DefenseLogEntry[] {
  const R = save.raids;
  const step = ECONOMY.raid.checkEveryHours * HOUR;
  if (!R.lastCheckAt) {
    R.lastCheckAt = now;
    return [];
  }
  const out: DefenseLogEntry[] = [];
  let windows = Math.floor((now - R.lastCheckAt) / step);
  if (windows <= 0) return out;
  // muito tempo fora: só as últimas janelas contam
  if (windows > maxWindows) {
    R.lastCheckAt += (windows - maxWindows) * step;
    windows = maxWindows;
  }
  for (let i = 0; i < windows; i++) {
    R.lastCheckAt += step;
    const at = R.lastCheckAt;
    if (!canBeRaided(save, at)) continue;
    const rng = metaRng(save);
    if (rng.int(1000) >= ECONOMY.raid.raidChance * 1000) continue;
    out.push(simulateBotRaid(save, rng.nextU32(), at));
  }
  return out;
}

/** Cidade de quem saqueou (para revidar). */
export function revengeTarget(save: SaveData, revengeId: string): BotCity | null {
  const e = save.raids.revenge.find((x) => x.id === revengeId);
  if (!e) return null;
  const city = generateBotCity(e.raiderSeed, e.raiderLevel ?? Math.max(1, coreLevel(save.city)));
  return { ...city, ownerName: e.raiderName };
}

export type DefenseResult = { ok: true } | { ok: false; reason: string };

/** Escolha "Retomar": a cidade continua como está e a vingança fica no mural por 48 h. */
export function chooseRetake(save: SaveData): DefenseResult {
  if (!save.raids.pendingChoice) return { ok: false, reason: 'Nada para escolher' };
  save.raids.pendingChoice = null;
  return { ok: true };
}

/**
 * Escolha "Reconstruir do zero": cidade nova + Pacote de Recomeço
 * (moedas + baú de Prata). Personagens, diamantes e conta continuam.
 */
export function rebuildCity(save: SaveData, now: number): DefenseResult {
  const pc = save.raids.pendingChoice;
  if (!pc) return { ok: false, reason: 'Nada para escolher' };
  const entry = save.raids.revenge.find((e) => e.id === pc.revengeId);
  if (entry) entry.done = true;
  save.raids.pendingChoice = null;
  save.city.buildings = starterCity(now);
  save.city.storage = [];
  save.city.researchQueue = null;
  const pack = ECONOMY.raid.restartPack;
  save.currencies.coins += pack.coins;
  grantChest(save, pack.chest, 'Pacote de Recomeço', now);
  return { ok: true };
}

export function markDefenseSeen(save: SaveData): void {
  for (const e of save.raids.log) e.seen = true;
}

export function unseenDefenses(save: SaveData): DefenseLogEntry[] {
  return save.raids.log.filter((e) => !e.seen);
}

/** Vinganças ainda abertas (dentro das 48 h). */
export function activeRevenges(save: SaveData, now: number) {
  return save.raids.revenge.filter((e) => !e.done && e.expiresAt > now);
}
