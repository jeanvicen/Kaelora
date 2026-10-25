import { describe, expect, it } from 'vitest';
import { canPlace, coreLevel, footprint, gridSize, levelStats } from '../src/meta/buildings.ts';
import {
  buyBuilding,
  collect,
  finishUpgrades,
  generatorAmount,
  moveBuilding,
  placeFromStorage,
  protectedCoins,
  startUpgrade,
  storeBuilding,
  upgradeBlockReason,
} from '../src/meta/city.ts';
import { nextGoal } from '../src/meta/goals.ts';
import { newGame } from '../src/meta/newGame.ts';

const NOW = 1_700_000_000_000;

describe('cidade', () => {
  it('layout inicial é válido: nada sobreposto e tudo dentro da grade', () => {
    const s = newGame('Teste', NOW);
    const size = gridSize(s.city);
    expect(size).toBe(24);
    const occ = new Set<string>();
    for (const b of s.city.buildings) {
      const [w, d] = footprint(b.type, b.rot);
      for (let x = b.x; x < b.x + w; x++)
        for (let z = b.z; z < b.z + d; z++) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(z).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(size);
          expect(z).toBeLessThan(size);
          const k = `${x},${z}`;
          expect(occ.has(k)).toBe(false);
          occ.add(k);
        }
    }
    expect(s.city.buildings.filter((b) => b.type === 'core')).toHaveLength(1);
  });

  it('não deixa construir sobreposto nem fora da grade', () => {
    const s = newGame('Teste', NOW);
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    expect(canPlace(s.city, 'cannon', core.x, core.z, 0)).toBe(false);
    expect(canPlace(s.city, 'cannon', -1, 0, 0)).toBe(false);
    expect(canPlace(s.city, 'cannon', 23, 0, 0)).toBe(false);
    expect(canPlace(s.city, 'cannon', 0, 0, 0)).toBe(true);
  });

  it('comprar desconta moedas e respeita o limite do Núcleo', () => {
    const s = newGame('Teste', NOW);
    s.currencies.coins = 10_000;
    // canhão: limite 1 no Núcleo nível 1 e já existe um
    const r = buyBuilding(s, 'cannon', 0, 0, 0, NOW);
    expect(r.ok).toBe(false);
    const before = s.currencies.coins;
    const ok = buyBuilding(s, 'barrier', 0, 0, 0, NOW);
    expect(ok.ok).toBe(true);
    expect(s.currencies.coins).toBe(before - levelStats('barrier', 1).cost);
  });

  it('construção não passa do nível do Núcleo', () => {
    const s = newGame('Teste', NOW);
    s.currencies.coins = 100_000;
    const cannon = s.city.buildings.find((b) => b.type === 'cannon')!;
    expect(upgradeBlockReason(s, cannon)).toBe('Melhore o Núcleo primeiro');
    expect(startUpgrade(s, cannon.id, NOW).ok).toBe(false);
  });

  it('melhorar o Núcleo faz a grade crescer e mantém a cidade centralizada', () => {
    const s = newGame('Teste', NOW);
    s.currencies.coins = 100_000;
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    const x0 = core.x;
    expect(startUpgrade(s, core.id, NOW).ok).toBe(true);
    expect(core.upgradeEndsAt).toBeGreaterThan(NOW);
    finishUpgrades(s, core.upgradeEndsAt!);
    expect(coreLevel(s.city)).toBe(2);
    expect(gridSize(s.city)).toBe(26);
    expect(core.x).toBe(x0 + 1);
  });

  it('dois construtores no máximo', () => {
    const s = newGame('Teste', NOW);
    s.currencies.coins = 1_000_000;
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    startUpgrade(s, core.id, NOW);
    finishUpgrades(s, NOW + 10_000_000);
    const cannon = s.city.buildings.find((b) => b.type === 'cannon')!;
    const gen = s.city.buildings.find((b) => b.type === 'generator')!;
    const barracks = s.city.buildings.find((b) => b.type === 'barracks')!;
    expect(startUpgrade(s, cannon.id, NOW).ok).toBe(true);
    expect(startUpgrade(s, gen.id, NOW).ok).toBe(true);
    const third = startUpgrade(s, barracks.id, NOW);
    expect(third.ok).toBe(false);
  });

  it('gerador acumula até a capacidade e a coleta zera', () => {
    const s = newGame('Teste', NOW);
    const gen = s.city.buildings.find((b) => b.type === 'generator')!;
    gen.lastCollectAt = NOW;
    const st = levelStats('generator', 1);
    expect(generatorAmount(gen, NOW + 3_600_000)).toBe(st.rate);
    expect(generatorAmount(gen, NOW + 100 * 3_600_000)).toBe(st.capacity);
    const coins = s.currencies.coins;
    const got = collect(s, gen.id, NOW + 3_600_000);
    expect(got).toBe(st.rate);
    expect(s.currencies.coins).toBe(coins + got);
    expect(generatorAmount(gen, NOW + 3_600_000)).toBe(0);
  });

  it('estoque: guarda e recoloca; Núcleo não pode ser guardado', () => {
    const s = newGame('Teste', NOW);
    const cannon = s.city.buildings.find((b) => b.type === 'cannon')!;
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    expect(storeBuilding(s, core.id).ok).toBe(false);
    expect(storeBuilding(s, cannon.id).ok).toBe(true);
    expect(s.city.storage).toHaveLength(1);
    expect(placeFromStorage(s, cannon.id, 0, 0, 1, NOW).ok).toBe(true);
    expect(s.city.storage).toHaveLength(0);
    expect(s.city.buildings.find((b) => b.id === cannon.id)?.rot).toBe(1);
  });

  it('mover respeita colisão', () => {
    const s = newGame('Teste', NOW);
    const cannon = s.city.buildings.find((b) => b.type === 'cannon')!;
    const core = s.city.buildings.find((b) => b.type === 'core')!;
    expect(moveBuilding(s, cannon.id, core.x, core.z, 0).ok).toBe(false);
    expect(moveBuilding(s, cannon.id, 0, 0, 0).ok).toBe(true);
  });

  it('cofre protege parte das moedas', () => {
    const s = newGame('Teste', NOW);
    s.currencies.coins = 10_000;
    expect(protectedCoins(s)).toBe(0);
    s.city.buildings.push({ id: 'v', type: 'vault', level: 1, x: 0, z: 0, rot: 0 });
    const st = levelStats('vault', 1);
    expect(protectedCoins(s)).toBe(Math.min(st.protectCap!, (10_000 * st.protect!) / 100));
  });

  it('primeiro objetivo é a primeira invasão', () => {
    const s = newGame('Teste', NOW);
    expect(nextGoal(s, NOW).id).toBe('first-battle');
  });
});
