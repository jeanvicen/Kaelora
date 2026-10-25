import { describe, expect, it } from 'vitest';
import { eventSquad } from '../src/content/eventSquad.ts';
import { ECONOMY } from '../src/meta/economy.ts';
import { newGame } from '../src/meta/newGame.ts';
import { applyBattleResult } from '../src/meta/raids.ts';
import {
  buyPremiumPass,
  claimEventMilestone,
  claimFreeChest,
  claimLeague,
  claimLogin,
  claimMission,
  claimMissionBonus,
  claimPassTier,
  currentEvent,
  freeChestStatus,
  missionViews,
  passTier,
  rollover,
  seasonCharacter,
} from '../src/meta/retention.ts';
import { DAY, HOUR, dayKey, weekKey } from '../src/meta/time.ts';
import type { SaveData } from '../src/meta/types.ts';
import type { BattleResult } from '../src/sim/types.ts';
import { GameServer, MemoryDb } from '../src/server/index.ts';

// segunda-feira, 12:00 de Brasília
const MON = Date.UTC(2026, 9, 26, 15, 0, 0);

function fresh(now = MON): SaveData {
  const s = newGame('Ret', now);
  rollover(s, now);
  return s;
}

function win(over: Partial<BattleResult> = {}): BattleResult {
  return { winner: 0, stars: 3, destruction: 100, coreDestroyed: true, ticks: 3000, timeLeftTicks: 2500, destroyedRefIds: [], damageDealt: [50000, 0], abilitiesUsed: [10, 0], ultimatesUsed: [2, 0], structuresDestroyed: 20, surrendered: false, hash: 1, ...over };
}

describe('calendário', () => {
  it('dia e semana viram à meia-noite de Brasília', () => {
    expect(dayKey(Date.UTC(2026, 9, 26, 2, 59))).toBe('2026-10-25');
    expect(dayKey(Date.UTC(2026, 9, 26, 3, 1))).toBe('2026-10-26');
    expect(weekKey(Date.UTC(2026, 9, 26, 2, 59))).toBe('2026-W43');
    expect(weekKey(Date.UTC(2026, 9, 26, 3, 1))).toBe('2026-W44');
  });
});

describe('retenção', () => {
  it('3 missões por dia, diferentes, renovadas na virada', () => {
    const s = fresh();
    expect(s.missions.list).toHaveLength(3);
    expect(new Set(s.missions.list.map((m) => m.id)).size).toBe(3);
    const before = JSON.stringify(s.missions.list);
    expect(rollover(s, MON + HOUR).newDay).toBe(false);
    expect(JSON.stringify(s.missions.list)).toBe(before);
    expect(rollover(s, MON + DAY).newDay).toBe(true);
    expect(s.missions.day).toBe(dayKey(MON + DAY));
  });

  it('batalhas contam nas missões; resgate e bônus das 3', () => {
    const s = fresh();
    s.missions.list = [
      { id: 'win_battles', progress: 0, goal: 2, claimed: false },
      { id: 'earn_stars', progress: 0, goal: 4, claimed: false },
      { id: 'use_ultimate', progress: 0, goal: 1, claimed: false },
    ];
    expect(claimMission(s, 'win_battles', MON).ok).toBe(false);
    for (let i = 0; i < 2; i++) applyBattleResult(s, { kind: 'raid', target: null, result: win(), squad: s.squad, now: MON });
    expect(missionViews(s).map((m) => m.progress)).toEqual([2, 4, 1]);
    const r = claimMission(s, 'win_battles', MON);
    expect(r.ok && r.reward.coins).toBe(400);
    expect(claimMissionBonus(s, MON).ok).toBe(false);
    claimMission(s, 'earn_stars', MON);
    claimMission(s, 'use_ultimate', MON);
    expect(claimMissionBonus(s, MON).ok).toBe(true);
    expect(claimMissionBonus(s, MON).ok).toBe(false);
    // treino não conta
    const t = fresh();
    t.missions.list = [{ id: 'win_battles', progress: 0, goal: 2, claimed: false }];
    applyBattleResult(t, { kind: 'training', target: null, result: win(), squad: t.squad, now: MON });
    expect(t.missions.list[0].progress).toBe(0);
  });

  it('sequência de login: dias seguidos sobem, falhar um dia recomeça, depois do 7 volta ao 1', () => {
    const s = fresh();
    expect(s.login.streak).toBe(1);
    const r1 = claimLogin(s, MON);
    expect(r1.ok && r1.day).toBe(1);
    expect(claimLogin(s, MON + HOUR).ok).toBe(false);
    for (let d = 1; d < 7; d++) rollover(s, MON + d * DAY);
    expect(s.login.streak).toBe(7);
    rollover(s, MON + 7 * DAY);
    expect(s.login.streak).toBe(1);
    rollover(s, MON + 9 * DAY); // pulou um dia
    expect(s.login.streak).toBe(1);
    rollover(s, MON + 10 * DAY);
    expect(s.login.streak).toBe(2);
  });

  it('baú grátis: 1 a cada 4 h, no máximo 2 guardados', () => {
    const s = fresh();
    s.chests.inventory = [];
    s.chests.free.lastClaimAt = MON;
    expect(freeChestStatus(s, MON + HOUR).ready).toBe(0);
    expect(claimFreeChest(s, MON + HOUR).ok).toBe(false);
    expect(freeChestStatus(s, MON + 4 * HOUR).ready).toBe(1);
    expect(freeChestStatus(s, MON + 30 * HOUR).ready).toBe(2);
    expect(claimFreeChest(s, MON + 30 * HOUR).ok).toBe(true);
    expect(freeChestStatus(s, MON + 30 * HOUR).ready).toBe(1);
    expect(claimFreeChest(s, MON + 30 * HOUR).ok).toBe(true);
    expect(freeChestStatus(s, MON + 30 * HOUR).ready).toBe(0);
    expect(s.chests.inventory).toHaveLength(2);
  });

  it('liga: na virada da semana, prêmio da liga e reset suave dos troféus', () => {
    const s = fresh();
    s.profile.trophies = 1000; // Ouro
    const r = rollover(s, MON + 7 * DAY);
    expect(r.newWeek).toBe(true);
    expect(r.leagueReward).toBe('ouro');
    expect(s.profile.trophies).toBe(300 + Math.floor(700 * 0.75));
    const coins = s.currencies.coins;
    expect(claimLeague(s, MON + 7 * DAY).ok).toBe(true);
    expect(s.currencies.coins).toBe(coins + (ECONOMY.leagues.find((l) => l.id === 'ouro')!.reward.coins ?? 0));
    expect(claimLeague(s, MON + 7 * DAY).ok).toBe(false);
  });

  it('evento semanal: mesmo para todos, vitórias contam e prêmios por marco', () => {
    expect(currentEvent(MON).id).toBe(currentEvent(MON + 3 * DAY).id);
    const s = fresh();
    expect(claimEventMilestone(s, 1, MON).ok).toBe(false);
    applyBattleResult(s, { kind: 'event', target: null, result: win(), squad: s.squad, now: MON });
    applyBattleResult(s, { kind: 'event', target: null, result: win({ winner: 1, coreDestroyed: false, stars: 1 }), squad: s.squad, now: MON });
    expect(s.events.wins).toBe(1);
    expect(claimEventMilestone(s, 1, MON).ok).toBe(true);
    expect(claimEventMilestone(s, 1, MON).ok).toBe(false);
    rollover(s, MON + 7 * DAY);
    expect(s.events.wins).toBe(0);
  });

  it('semana de elemento: esquadrão só daquele elemento, o evento empresta o resto', () => {
    const s = fresh();
    const sq = eventSquad(s, 'volt');
    expect(sq.ids).toHaveLength(5);
    expect(new Set(sq.ids).size).toBe(5);
    expect(sq.loaners.length).toBeGreaterThan(0);
    for (const id of sq.loaners) expect(s.collection[id]).toBeUndefined();
  });

  it('passe: níveis por XP, premium com diamantes e o Extremo da temporada no fim', () => {
    const s = fresh();
    s.pass.xp = ECONOMY.pass.xpPerTier * 3 + 10;
    expect(passTier(s)).toBe(3);
    expect(claimPassTier(s, 4, 'free', MON).ok).toBe(false);
    expect(claimPassTier(s, 3, 'free', MON).ok).toBe(true);
    expect(claimPassTier(s, 3, 'free', MON).ok).toBe(false);
    expect(claimPassTier(s, 1, 'premium', MON).ok).toBe(false);
    s.currencies.diamonds = 1000;
    expect(buyPremiumPass(s).ok).toBe(true);
    expect(s.currencies.diamonds).toBe(1000 - ECONOMY.pass.premiumCostDiamonds);
    expect(claimPassTier(s, 1, 'premium', MON).ok).toBe(true);
    s.pass.xp = ECONOMY.pass.xpPerTier * 30;
    const r = claimPassTier(s, 30, 'premium', MON);
    expect(r.ok).toBe(true);
    const ext = seasonCharacter(s.pass.season);
    expect(s.collection[ext]).toBeDefined();
    // temporada nova zera o passe
    rollover(s, MON + 40 * DAY);
    expect(s.pass.xp).toBe(0);
    expect(s.pass.premium).toBe(false);
  });

  it('servidor: resgates pelo claim-reward e batalha de evento com as regras da semana', async () => {
    let now = MON;
    const server = new GameServer(new MemoryDb(), () => now);
    await server.bootstrap('a', { name: 'Ana' });
    const r = await server.claimReward('a', { kind: 'login' });
    expect((r.result as { ok: boolean }).ok).toBe(true);
    await expect(server.claimReward('a', { kind: 'hackear' })).rejects.toThrow(/desconhecida/);
    const st = await server.startBattle('a', { kind: 'event' });
    expect(st.kind).toBe('event');
    expect(st.event).toEqual(currentEvent(now).rules);
    now += 60_000;
    const v = await server.validateBattle('a', { commands: [], hash: 0 });
    expect(v.result.ticks).toBeGreaterThan(0);
  });
});
