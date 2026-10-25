import { describe, expect, it } from 'vitest';
import { generateBotCity } from '../src/content/botCity.ts';
import { activeRevenges, applyRaidOnPlayer, canBeRaided, coinsAtRisk, processOfflineRaids, protection, rebuildCity, simulateBotRaid } from '../src/meta/defense.ts';
import { ECONOMY } from '../src/meta/economy.ts';
import { newGame } from '../src/meta/newGame.ts';
import type { SaveData } from '../src/meta/types.ts';
import { runBattle } from '../src/sim/battle.ts';
import { decodeReplay } from '../src/sim/replay.ts';
import type { BattleResult } from '../src/sim/types.ts';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function result(over: Partial<BattleResult>): BattleResult {
  return {
    winner: 0,
    stars: 3,
    destruction: 100,
    coreDestroyed: true,
    ticks: 3000,
    timeLeftTicks: 2400,
    destroyedRefIds: [],
    damageDealt: [1000, 0],
    abilitiesUsed: [0, 0],
    ultimatesUsed: [0, 0],
    structuresDestroyed: 5,
    surrendered: false,
    hash: 1,
    ...over,
  };
}

function veteran(): SaveData {
  const s = newGame('Def', T0);
  s.raids.beginnerUntil = 0;
  return s;
}

describe('defesa e saque', () => {
  it('proteção de iniciante: 72 h OU até o nível 5 (o que vier antes)', () => {
    const s = newGame('Novato', T0);
    expect(protection(s, T0 + HOUR).kind).toBe('beginner');
    expect(protection(s, T0 + 73 * HOUR).kind).toBeNull();
    s.profile.accountLevel = ECONOMY.raid.beginnerLevel;
    expect(protection(s, T0 + HOUR).kind).toBeNull();
  });

  it('Núcleo derrubado: perde só o que o Cofre não protege, ruínas, escudo e 48 h de vingança', () => {
    const s = veteran();
    s.currencies.coins = 4000;
    s.city.buildings.push({ id: 'v1', type: 'vault', level: 1, x: 1, z: 1, rot: 0 });
    const risk = coinsAtRisk(s);
    expect(risk).toBeLessThan(4000);
    const cannon = s.city.buildings.find((b) => b.type === 'cannon')!;
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    const entry = applyRaidOnPlayer(s, { attackerName: 'Zé', attackerSeed: 9, attackerPower: 100, result: result({ destroyedRefIds: [cannon.id, core.id] }), replay: '', at: T0 });
    expect(entry.won).toBe(false);
    expect(s.currencies.coins).toBe(4000 - risk);
    expect(cannon.ruined).toBe(true);
    expect(core.ruined).toBeFalsy();
    expect(s.raids.shieldUntil).toBe(T0 + 12 * HOUR);
    expect(canBeRaided(s, T0 + HOUR)).toBe(false);
    expect(activeRevenges(s, T0 + 47 * HOUR)).toHaveLength(1);
    expect(activeRevenges(s, T0 + 49 * HOUR)).toHaveLength(0);
    expect(s.raids.pendingChoice?.revengeId).toBe(s.raids.revenge[0].id);
    // a coleção nunca é perdida
    expect(Object.keys(s.collection)).toHaveLength(5);
  });

  it('defesa segurou: nada perdido e conta nas estatísticas', () => {
    const s = veteran();
    const coins = s.currencies.coins;
    applyRaidOnPlayer(s, { attackerName: 'Zé', attackerSeed: 1, attackerPower: 1, result: result({ winner: 1, coreDestroyed: false, stars: 1 }), replay: '', at: T0 });
    expect(s.currencies.coins).toBe(coins);
    expect(s.stats.raidsDefended).toBe(1);
    expect(s.raids.pendingChoice).toBeNull();
  });

  it('reconstruir do zero: cidade nova + Pacote de Recomeço, personagens ficam', () => {
    const s = veteran();
    s.collection[42] = { level: 7, xp: 0, stars: 2, fragments: 0, obtainedAt: 0, copies: 1 };
    applyRaidOnPlayer(s, { attackerName: 'Zé', attackerSeed: 1, attackerPower: 1, result: result({}), replay: '', at: T0 });
    const coins = s.currencies.coins;
    const chests = s.chests.inventory.length;
    expect(rebuildCity(s, T0).ok).toBe(true);
    expect(s.currencies.coins).toBe(coins + ECONOMY.raid.restartPack.coins);
    expect(s.chests.inventory.length).toBe(chests + 1);
    expect(s.collection[42].level).toBe(7);
    expect(s.raids.pendingChoice).toBeNull();
    expect(s.city.buildings.every((b) => !b.ruined)).toBe(true);
  });

  it('invasão de rival-bot gera replay que reproduz a mesma batalha', () => {
    const s = veteran();
    const city = generateBotCity(77, 4);
    s.city.buildings = city.buildings;
    const e = simulateBotRaid(s, 12345, T0);
    const rep = decodeReplay(e.replay)!;
    const again = runBattle(rep.setup, rep.commands);
    expect(again.result.hash).toBe(rep.hash);
    expect(again.result.coreDestroyed).toBe(!e.won);
  });

  it('ataques enquanto o jogador está fora respeitam escudo e proteção', () => {
    const fresh = newGame('Novato', T0);
    processOfflineRaids(fresh, T0);
    expect(processOfflineRaids(fresh, T0 + 48 * HOUR)).toHaveLength(0); // ainda iniciante

    const s = veteran();
    processOfflineRaids(s, T0);
    const s2 = structuredClone(s);
    const entries = processOfflineRaids(s, T0 + 10 * 24 * HOUR);
    expect(entries.length).toBeLessThanOrEqual(4);
    // no máximo um saque por vez (depois vem escudo / escolha pendente)
    expect(entries.filter((e) => !e.won).length).toBeLessThanOrEqual(1);
    // determinístico pela semente do save
    const again = processOfflineRaids(s2, T0 + 10 * 24 * HOUR);
    expect(again.map((e) => e.id)).toEqual(entries.map((e) => e.id));
  });
});
