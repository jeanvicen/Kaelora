import { describe, expect, it } from 'vitest';
import { TRAINING_DIFFICULTIES, trainingLevel, trainingTarget } from '../src/content/training.ts';
import { claimAchievement, achievementViews } from '../src/meta/achievements.ts';
import { ECONOMY } from '../src/meta/economy.ts';
import { newGame } from '../src/meta/newGame.ts';
import { finishResearch, researchCap, speedUpResearch, startResearch } from '../src/meta/research.ts';
import { buyCoins, buyDeal, dailyDeal } from '../src/meta/shop.ts';
import { applyBattleResult } from '../src/meta/raids.ts';
import { runAction } from '../src/meta/actions.ts';
import type { SaveData } from '../src/meta/types.ts';

const T0 = Date.UTC(2026, 9, 26, 15, 0, 0);

function withLab(level = 2): SaveData {
  const s = newGame('Lab', T0);
  s.city.buildings.push({ id: 'lab1', type: 'lab', level, x: 2, z: 2, rot: 0 });
  s.currencies.coins = 100_000;
  return s;
}

describe('laboratório', () => {
  it('sem laboratório não pesquisa; o nível do laboratório limita a pesquisa', () => {
    const s = newGame('Sem', T0);
    s.currencies.coins = 100_000;
    expect(startResearch(s, 'vida_esquadrao', T0).ok).toBe(false);
    const l = withLab(1);
    expect(researchCap(l)).toBe(1);
    expect(startResearch(l, 'vida_esquadrao', T0).ok).toBe(true);
    expect(startResearch(l, 'dano_esquadrao', T0).ok).toBe(false); // uma por vez
    expect(finishResearch(l, T0 + 1000)).toBeNull();
    expect(finishResearch(l, T0 + 10 * 60_000)).toBe('vida_esquadrao');
    expect(l.city.research.vida_esquadrao).toBe(1);
    expect(startResearch(l, 'vida_esquadrao', T0 + 11 * 60_000).ok).toBe(false); // limite do lab nível 1
  });

  it('acelerar com diamantes conclui na hora', () => {
    const s = withLab(3);
    s.currencies.diamonds = 100;
    expect(startResearch(s, 'carga_ultimate', T0).ok).toBe(true);
    expect(speedUpResearch(s, T0).ok).toBe(true);
    expect(s.city.research.carga_ultimate).toBe(1);
    expect(s.currencies.diamonds).toBeLessThan(100);
  });
});

describe('loja', () => {
  it('oferta do dia: igual para todos, com desconto, uma por dia', () => {
    expect(dailyDeal(T0)).toEqual(dailyDeal(T0 + 3_600_000));
    const d = dailyDeal(T0);
    expect(d.price).toBe(Math.round(d.full * (1 - ECONOMY.shop.dailyDealDiscount)));
    const s = newGame('Loja', T0);
    s.chests.inventory = [];
    s.currencies.diamonds = 1000;
    expect(buyDeal(s, T0).ok).toBe(true);
    expect(buyDeal(s, T0).ok).toBe(false);
    expect(s.currencies.diamonds).toBe(1000 - d.price);
  });

  it('moedas por diamantes', () => {
    const s = newGame('Loja', T0);
    s.currencies.diamonds = 30;
    const coins = s.currencies.coins;
    expect(buyCoins(s, 0).ok).toBe(true);
    expect(s.currencies.coins).toBe(coins + ECONOMY.shop.coins[0].coins);
    expect(buyCoins(s, 0).ok).toBe(false);
  });
});

describe('conquistas e perfil', () => {
  it('degraus de conquista dão diamantes, um por vez', () => {
    const s = newGame('Conq', T0);
    expect(claimAchievement(s, 'vitorias').ok).toBe(false);
    applyBattleResult(s, { kind: 'raid', target: null, result: { winner: 0, stars: 3, destruction: 100, coreDestroyed: true, ticks: 10, timeLeftTicks: 0, destroyedRefIds: [], damageDealt: [1, 0], abilitiesUsed: [0, 0], ultimatesUsed: [0, 0], structuresDestroyed: 1, surrendered: false, hash: 0 }, squad: s.squad, now: T0 });
    const d = s.currencies.diamonds;
    const r = claimAchievement(s, 'vitorias');
    expect(r.ok && r.diamonds).toBe(5);
    expect(s.currencies.diamonds).toBe(d + 5);
    expect(claimAchievement(s, 'vitorias').ok).toBe(false); // próximo degrau: 10 vitórias
    expect(achievementViews(s).find((a) => a.id === 'vitorias')!.goal).toBe(10);
  });

  it('nome e avatar validados', () => {
    const s = newGame('Nome', T0);
    expect(runAction(s, 'rename', { name: ' X ' }, { now: T0 }).ok).toBe(false);
    expect(runAction(s, 'rename', { name: 'Comandante Neon Turbo Extra' }, { now: T0 }).ok).toBe(true);
    expect(s.profile.name.length).toBeLessThanOrEqual(16);
    expect(runAction(s, 'avatar', { id: 999 }, { now: T0 }).ok).toBe(false);
    expect(runAction(s, 'avatar', { id: s.squad[2] }, { now: T0 }).ok).toBe(true);
  });
});

describe('treinamento', () => {
  it('dificuldades sobem o nível da cidade-teste', () => {
    const s = newGame('Treino', T0);
    s.city.buildings.find((b) => b.type === 'core')!.level = 5;
    const levels = TRAINING_DIFFICULTIES.map((d) => trainingLevel(s, d.id));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(trainingTarget(s, 'normal', 7).coreLevel).toBe(trainingLevel(s, 'normal'));
  });
});
