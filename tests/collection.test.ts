import { describe, expect, it } from 'vitest';
import { allCharacters, getCharacter } from '../src/content/catalog.ts';
import {
  MAX_STARS,
  albumClaimableCount,
  albumMilestones,
  albumProgress,
  canStarUp,
  claimAlbum,
  grantCharacter,
  isValidSquad,
  levelProgress,
  setSquadSlot,
  starUp,
  starUpCost,
} from '../src/meta/collection.ts';
import { ECONOMY } from '../src/meta/economy.ts';
import { evolvableCharacters, nextGoal } from '../src/meta/goals.ts';
import { newGame } from '../src/meta/newGame.ts';

const NOW = 1_700_000_000_000;

describe('coleção', () => {
  it('novo personagem entra na coleção; repetido vira fragmentos', () => {
    const s = newGame('Teste', NOW);
    const def = allCharacters().find((c) => c.rarity === 'epico' && !s.collection[c.id])!;
    const a = grantCharacter(s, def.id, NOW);
    expect(a.isNew).toBe(true);
    expect(s.collection[def.id]).toMatchObject({ level: 1, stars: 1, fragments: 0, copies: 1 });
    const b = grantCharacter(s, def.id, NOW);
    expect(b.isNew).toBe(false);
    expect(b.fragments).toBe(ECONOMY.characters.fragmentsPerDuplicate.epico);
    expect(s.collection[def.id].fragments).toBe(b.fragments);
    expect(s.collection[def.id].copies).toBe(2);
  });

  it('estrelas custam fragmentos + moedas e param em 5', () => {
    const s = newGame('Teste', NOW);
    const id = s.squad[0];
    expect(canStarUp(s, id).ok).toBe(false);
    s.currencies.coins = 1_000_000;
    s.collection[id].fragments = 10_000;
    let spentFrag = 0;
    let spentCoins = 0;
    while (starUpCost(s.collection[id])) {
      const cost = starUpCost(s.collection[id])!;
      spentFrag += cost.fragments;
      spentCoins += cost.coins;
      expect(starUp(s, id).ok).toBe(true);
    }
    expect(s.collection[id].stars).toBe(MAX_STARS);
    expect(s.collection[id].fragments).toBe(10_000 - spentFrag);
    expect(s.currencies.coins).toBe(1_000_000 - spentCoins);
    expect(starUp(s, id).ok).toBe(false);
  });

  it('sem moedas suficientes não evolui e não gasta nada', () => {
    const s = newGame('Teste', NOW);
    const id = s.squad[1];
    s.collection[id].fragments = 100;
    s.currencies.coins = 10;
    const r = starUp(s, id);
    expect(r.ok).toBe(false);
    expect(s.collection[id]).toMatchObject({ stars: 1, fragments: 100 });
    expect(s.currencies.coins).toBe(10);
  });

  it('trocar personagem no esquadrão: entra no lugar ou troca de vaga', () => {
    const s = newGame('Teste', NOW);
    const [a, b] = s.squad;
    const novo = allCharacters().find((c) => !s.collection[c.id])!.id;
    expect(setSquadSlot(s, 0, novo).ok).toBe(false); // não possui
    grantCharacter(s, novo, NOW);
    expect(setSquadSlot(s, 0, novo).ok).toBe(true);
    expect(s.squad[0]).toBe(novo);
    expect(s.squad).not.toContain(a);
    // já estava no esquadrão: troca de lugar, sem duplicar
    expect(setSquadSlot(s, 0, b).ok).toBe(true);
    expect(s.squad[0]).toBe(b);
    expect(s.squad[1]).toBe(novo);
    expect(isValidSquad(s)).toBe(true);
    expect(setSquadSlot(s, 7, b).ok).toBe(false);
  });

  it('nível trava no limite do Quartel', () => {
    const p = levelProgress({ level: 5, xp: 999 }, 5);
    expect(p.capped).toBe(true);
    expect(p.pct).toBe(1);
    const q = levelProgress({ level: 2, xp: 30 }, 10);
    expect(q.capped).toBe(false);
    expect(q.pct).toBeCloseTo(30 / ECONOMY.characters.levelXp[1]);
  });

  it('álbum: % por elemento, marcos e coleta única', () => {
    const s = newGame('Teste', NOW);
    const prog = albumProgress(s);
    expect(prog.total.count).toBe(1008);
    expect(prog.total.owned).toBe(5);
    for (const part of Object.values(prog.byElement)) expect(part.count).toBe(168);
    const solar = allCharacters().filter((c) => c.element === 'solar');
    const first = albumMilestones(s, 'solar')[0];
    expect(first.pct).toBe(10);
    expect(first.needed).toBe(17);
    expect(claimAlbum(s, 'solar', 10, NOW).ok).toBe(false);
    for (const c of solar.slice(0, 20)) if (!s.collection[c.id]) grantCharacter(s, c.id, NOW);
    expect(albumClaimableCount(s)).toBeGreaterThanOrEqual(1);
    const coins = s.currencies.coins;
    const r = claimAlbum(s, 'solar', 10, NOW);
    expect(r.ok).toBe(true);
    expect(s.currencies.coins).toBe(coins + (ECONOMY.album.rewards[0].coins ?? 0));
    expect(claimAlbum(s, 'solar', 10, NOW).ok).toBe(false);
  });

  it('próximo objetivo aponta evolução quando dá para subir estrela', () => {
    const s = newGame('Teste', NOW);
    s.stats.battles = 5;
    s.chests.inventory = [];
    const id = s.squad[2];
    s.collection[id].fragments = 50;
    s.currencies.coins = 5000;
    expect(evolvableCharacters(s)).toContain(id);
    const g = nextGoal(s, NOW);
    expect(g.action.kind).toBe('squad');
    expect(g.text).toContain(getCharacter(id).name);
  });
});
