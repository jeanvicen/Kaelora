import eventsJson from '../data/events.json';
import type { EventRules } from '../content/battleSetup.ts';
import { generateBotCity, type BotCity } from '../content/botCity.ts';
import { charactersOfRarity } from '../content/catalog.ts';
import { hashString } from '../sim/rng.ts';
import { coreLevel } from './buildings.ts';
import { grantCharacter } from './collection.ts';
import { ECONOMY, addAccountXp, leagueFor, type Reward } from './economy.ts';
import { applyReward, type AppliedReward } from './rewards.ts';
import { grantChest, MAX_CHESTS } from './raids.ts';
import { metaRng } from './rng.ts';
import { DAY, HOUR, dayIndex, dayKey, seasonEndsAt, seasonOf, weekKey } from './time.ts';
import type { ChestType, SaveData } from './types.ts';

// Loops de retenção: missões diárias, baú grátis, sequência de login, ligas
// semanais, eventos semanais e passe de temporada. Lógica pura: o servidor
// roda exatamente isto (a virada de dia/semana/temporada acontece em toda ação).

export type RetentionResult<T = unknown> = ({ ok: true } & T) | { ok: false; reason: string };
const fail = (reason: string) => ({ ok: false as const, reason });

// ------------------------------------------------------------ virada de dia/semana/temporada

export interface Rollover {
  newDay: boolean;
  newWeek: boolean;
  newSeason: boolean;
  /** Liga da semana que acabou (recompensa a resgatar). */
  leagueReward: string | null;
}

/** Vira o dia (missões, login), a semana (liga, evento) e a temporada (passe). */
export function rollover(save: SaveData, now: number): Rollover {
  const out: Rollover = { newDay: false, newWeek: false, newSeason: false, leagueReward: null };
  const today = dayKey(now);
  if (save.missions.day !== today) {
    out.newDay = true;
    refreshMissions(save, now);
    // sequência de login: ontem = continua; senão recomeça
    const last = save.login.lastDay ? dayIndex(Date.parse(`${save.login.lastDay}T12:00:00Z`) + 3 * HOUR) : -99;
    const cont = save.login.lastDay && dayIndex(now) - last === 1;
    save.login.streak = cont ? (save.login.streak % 7) + 1 : 1;
    save.login.lastDay = today;
    save.login.claimedToday = false;
  }
  const week = weekKey(now);
  if (save.league.week !== week) {
    out.newWeek = true;
    if (save.league.week) {
      // fim da semana da liga: prêmio da liga alcançada e reset suave dos troféus
      const lg = leagueFor(save.profile.trophies);
      save.league.pending = { week: save.league.week, leagueId: lg.id };
      out.leagueReward = lg.id;
      if (save.profile.trophies > 300) save.profile.trophies = Math.floor(300 + (save.profile.trophies - 300) * 0.75);
    }
    save.league.week = week;
    save.league.startTrophies = save.profile.trophies;
  }
  if (save.events.week !== week) {
    save.events = { week, wins: 0, claimed: [] };
  }
  const season = seasonOf(now, ECONOMY.pass.seasonDays);
  if (save.pass.season !== season) {
    out.newSeason = save.pass.season !== 0;
    save.pass = { season, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
  }
  return out;
}

// ------------------------------------------------------------ missões diárias

export interface MissionView {
  id: string;
  text: string;
  progress: number;
  goal: number;
  claimed: boolean;
  reward: Reward;
}

function goalTier(save: SaveData): number {
  const lv = save.profile.accountLevel;
  return lv < 5 ? 0 : lv < 12 ? 1 : 2;
}

/** Três missões novas por dia (sorteadas pelo RNG do save/servidor). */
export function refreshMissions(save: SaveData, now: number): void {
  const rng = metaRng(save);
  const pool = rng.shuffle(ECONOMY.missions.pool).slice(0, ECONOMY.missions.perDay);
  const tier = goalTier(save);
  save.missions = {
    day: dayKey(now),
    list: pool.map((m) => ({ id: m.id, progress: 0, goal: m.goals[Math.min(m.goals.length - 1, tier)], claimed: false })),
    bonusClaimed: false,
  };
}

const SINGULAR: [RegExp, string][] = [
  [/ vezes\b/, ' vez'],
  [/invasões/, 'invasão'],
  [/estrelas/, 'estrela'],
  [/construções/, 'construção'],
  [/habilidades/, 'habilidade'],
  [/baús/, 'baú'],
  [/Núcleos/, 'Núcleo'],
  [/moedas/, 'moeda'],
  [/batalhas/, 'batalha'],
  [/ataques/, 'ataque'],
  [/treinos/, 'treino'],
  [/duelos/, 'duelo'],
  [/personagens/, 'personagem'],
  [/troféus/, 'troféu'],
];

/** "Derrube {n} Núcleos" → "Derrube 1 Núcleo" quando a meta é 1. */
export function missionText(text: string, n: number): string {
  let t = text.replace('{n}', n.toLocaleString('pt-BR'));
  if (n === 1) for (const [re, s] of SINGULAR) t = t.replace(re, s);
  return t;
}

export function missionViews(save: SaveData): MissionView[] {
  return save.missions.list.map((m) => {
    const def = ECONOMY.missions.pool.find((p) => p.id === m.id)!;
    return { id: m.id, text: missionText(def.text, m.goal), progress: m.progress, goal: m.goal, claimed: m.claimed, reward: def.reward };
  });
}

export function claimMission(save: SaveData, id: string, now: number): RetentionResult<{ reward: AppliedReward; levels: number[] }> {
  const m = save.missions.list.find((x) => x.id === id);
  if (!m) return fail('Missão não encontrada');
  if (m.claimed) return fail('Já resgatada');
  if (m.progress < m.goal) return fail('Missão ainda não concluída');
  const def = ECONOMY.missions.pool.find((p) => p.id === id)!;
  m.claimed = true;
  const reward = applyReward(save, def.reward, 'Missão diária', now);
  save.pass.xp += ECONOMY.pass.xp.mission;
  const levels = addAccountXp(save, ECONOMY.account.xp.mission);
  return { ok: true, reward, levels };
}

/** Bônus por completar as 3 missões do dia. */
export function claimMissionBonus(save: SaveData, now: number): RetentionResult<{ reward: AppliedReward }> {
  if (save.missions.bonusClaimed) return fail('Bônus já resgatado');
  if (!save.missions.list.length || save.missions.list.some((m) => !m.claimed)) return fail('Resgate as 3 missões primeiro');
  save.missions.bonusClaimed = true;
  return { ok: true, reward: applyReward(save, ECONOMY.missions.allDoneReward, 'Missões do dia', now) };
}

export function missionsClaimable(save: SaveData): number {
  const n = save.missions.list.filter((m) => !m.claimed && m.progress >= m.goal).length;
  const bonus = save.missions.list.length > 0 && !save.missions.bonusClaimed && save.missions.list.every((m) => m.claimed) ? 1 : 0;
  return n + bonus;
}

// ------------------------------------------------------------ baú grátis (a cada 4 h, até 2 guardados)

export function freeChestStatus(save: SaveData, now: number): { ready: number; max: number; nextAt: number } {
  const F = ECONOMY.freeChest;
  const I = F.intervalHours * HOUR;
  const t = save.chests.free.lastClaimAt;
  const ready = Math.max(0, Math.min(F.maxStored, Math.floor((now - t) / I)));
  return { ready, max: F.maxStored, nextAt: ready >= F.maxStored ? now : t + (ready + 1) * I };
}

export function claimFreeChest(save: SaveData, now: number): RetentionResult<{ type: ChestType; uid: string }> {
  const F = ECONOMY.freeChest;
  const I = F.intervalHours * HOUR;
  const st = freeChestStatus(save, now);
  if (st.ready <= 0) return fail('O próximo baú grátis ainda não chegou');
  if (save.chests.inventory.length >= MAX_CHESTS) return fail('Inventário de baús cheio (máximo 8)');
  // de vez em quando ele vem melhor
  const roll = metaRng(save).int(1000);
  let type: ChestType = F.type;
  if (roll < (F.upgradeChance.ouro ?? 0) * 1000) type = 'ouro';
  else if (roll < ((F.upgradeChance.ouro ?? 0) + (F.upgradeChance.prata ?? 0)) * 1000) type = 'prata';
  grantChest(save, type, 'Baú grátis', now);
  save.chests.free.lastClaimAt = st.ready >= F.maxStored ? now - (F.maxStored - 1) * I : save.chests.free.lastClaimAt + I;
  return { ok: true, type, uid: save.chests.inventory[save.chests.inventory.length - 1].uid };
}

// ------------------------------------------------------------ sequência de login (7 dias)

export function claimLogin(save: SaveData, now: number): RetentionResult<{ day: number; reward: AppliedReward }> {
  if (save.login.lastDay !== dayKey(now)) rollover(save, now);
  if (save.login.claimedToday) return fail('Volte amanhã!');
  const day = Math.max(1, Math.min(7, save.login.streak));
  save.login.claimedToday = true;
  return { ok: true, day, reward: applyReward(save, ECONOMY.login[day - 1], `Login dia ${day}`, now) };
}

// ------------------------------------------------------------ ligas (reset semanal)

export function claimLeague(save: SaveData, now: number): RetentionResult<{ leagueId: string; reward: AppliedReward }> {
  const p = save.league.pending;
  if (!p) return fail('Nenhuma recompensa de liga');
  const lg = ECONOMY.leagues.find((l) => l.id === p.leagueId) ?? ECONOMY.leagues[0];
  save.league.pending = null;
  save.league.rewardsClaimed = [...save.league.rewardsClaimed.slice(-11), p.week];
  return { ok: true, leagueId: lg.id, reward: applyReward(save, lg.reward, `Liga ${lg.name}`, now) };
}

// ------------------------------------------------------------ eventos semanais

export interface WeeklyEvent {
  id: string;
  week: string;
  title: string;
  text: string;
  icon: string;
  rules: EventRules;
}

const EVENTS = eventsJson as unknown as { milestones: { wins: number; reward: Reward }[]; templates: Omit<WeeklyEvent, 'week'>[] };
export const EVENT_MILESTONES = EVENTS.milestones;

/** O evento da semana (o mesmo para todo mundo). */
export function currentEvent(now: number): WeeklyEvent {
  const week = weekKey(now);
  const t = EVENTS.templates[hashString(`kaelora:${week}`) % EVENTS.templates.length];
  return { ...t, week, rules: { ...t.rules } };
}

/** Cidade-rival da próxima batalha do evento (muda a cada vitória). */
export function eventTarget(save: SaveData, now: number): BotCity {
  const ev = currentEvent(now);
  const seed = (hashString(`${ev.week}:${ev.id}`) ^ Math.imul(save.events.wins + 1, 0x9e3779b1)) >>> 0;
  const city = generateBotCity(seed, Math.max(1, Math.min(10, coreLevel(save.city))));
  return { ...city, ownerName: `Desafio: ${ev.title}` };
}

export function claimEventMilestone(save: SaveData, wins: number, now: number): RetentionResult<{ reward: AppliedReward }> {
  const m = EVENT_MILESTONES.find((x) => x.wins === wins);
  if (!m) return fail('Marco inválido');
  if (save.events.claimed.includes(wins)) return fail('Já resgatado');
  if (save.events.wins < wins) return fail(`Vença ${wins} batalhas do evento`);
  save.events.claimed.push(wins);
  return { ok: true, reward: applyReward(save, m.reward, 'Evento semanal', now) };
}

// ------------------------------------------------------------ passe de temporada (30 dias)

export function passTier(save: SaveData): number {
  return Math.min(ECONOMY.pass.tiers, Math.floor(save.pass.xp / ECONOMY.pass.xpPerTier));
}

export function seasonInfo(save: SaveData, now: number) {
  const season = save.pass.season || seasonOf(now, ECONOMY.pass.seasonDays);
  return { season, endsAt: seasonEndsAt(season, ECONOMY.pass.seasonDays), daysLeft: Math.ceil((seasonEndsAt(season, ECONOMY.pass.seasonDays) - now) / DAY) };
}

/** O Extremo da temporada (prêmio final da trilha premium). */
export function seasonCharacter(season: number): number {
  const ext = charactersOfRarity('extremo');
  return ext[(Math.imul(season, 7) + 3) % ext.length].id;
}

export function claimPassTier(save: SaveData, tier: number, track: 'free' | 'premium', now: number): RetentionResult<{ reward: AppliedReward; character?: { id: number; isNew: boolean; fragments: number } }> {
  if (!Number.isInteger(tier) || tier < 1 || tier > ECONOMY.pass.tiers) return fail('Nível do passe inválido');
  if (passTier(save) < tier) return fail('Ganhe mais XP do passe');
  if (track === 'premium' && !save.pass.premium) return fail('Só com o Passe Premium');
  const claimed = track === 'free' ? save.pass.claimedFree : save.pass.claimedPremium;
  if (claimed.includes(tier)) return fail('Já resgatado');
  const reward = (track === 'free' ? ECONOMY.pass.free : ECONOMY.pass.premium)[tier - 1];
  claimed.push(tier);
  const applied = applyReward(save, reward, `Passe nível ${tier}`, now);
  if (reward.character === 'season') {
    const g = grantCharacter(save, seasonCharacter(save.pass.season), now);
    return { ok: true, reward: applied, character: g };
  }
  return { ok: true, reward: applied };
}

export function buyPremiumPass(save: SaveData): RetentionResult {
  if (save.pass.premium) return fail('Você já tem o Passe Premium');
  const cost = ECONOMY.pass.premiumCostDiamonds;
  if (save.currencies.diamonds < cost) return fail(`Faltam ${cost - save.currencies.diamonds} diamantes`);
  save.currencies.diamonds -= cost;
  save.pass.premium = true;
  return { ok: true };
}

export function passClaimable(save: SaveData): number {
  const t = passTier(save);
  let n = 0;
  for (let i = 1; i <= t; i++) {
    if (!save.pass.claimedFree.includes(i)) n++;
    if (save.pass.premium && !save.pass.claimedPremium.includes(i)) n++;
  }
  return n;
}
