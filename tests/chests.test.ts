import { describe, expect, it } from 'vitest';
import { CHESTS, CHEST_TYPES, buyChest, chestOdds, openChest, rollChest } from '../src/meta/chests.ts';
import { grantChest } from '../src/meta/raids.ts';
import { newGame } from '../src/meta/newGame.ts';
import type { Rarity } from '../src/meta/types.ts';
import { Rng } from '../src/sim/rng.ts';

const NOW = 1_700_000_000_000;
const NO_PITY = { sinceLegendary: 0, sinceExtreme: 0 };

describe('baús', () => {
  it('as chances da tabela do jogo somam 100% e batem com a especificação', () => {
    const spec: Record<string, number[]> = {
      madeira: [85, 14, 1, 0, 0],
      prata: [60, 32, 7, 1, 0],
      ouro: [35, 40, 20, 4.5, 0.5],
      magico: [0, 45, 40, 13, 2],
      extremo: [0, 0, 50, 40, 10],
    };
    for (const t of CHEST_TYPES) {
      expect(CHESTS.chests[t].odds).toEqual(spec[t]);
      expect(CHESTS.chests[t].odds.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
      expect(chestOdds(t).every((o) => o.pct > 0)).toBe(true);
    }
  });

  it('mesma semente = mesmo baú (decidido pelo "servidor", reproduzível)', () => {
    const a = rollChest('magico', new Rng(1234), NO_PITY, 5);
    const b = rollChest('magico', new Rng(1234), NO_PITY, 5);
    expect(a).toEqual(b);
    expect(a.cards).toHaveLength(CHESTS.chests.magico.cards);
  });

  it('a distribuição sorteada segue as chances (Ouro, 60 mil cartas)', () => {
    const rng = new Rng(99);
    const count: Record<Rarity, number> = { comum: 0, raro: 0, epico: 0, lendario: 0, extremo: 0 };
    let n = 0;
    for (let i = 0; i < 10_000; i++)
      for (const c of rollChest('ouro', rng, NO_PITY).cards) {
        count[c.rarity]++;
        n++;
      }
    const odds = CHESTS.chests.ouro.odds;
    CHESTS.rarities.forEach((r, i) => expect((count[r] / n) * 100).toBeCloseTo(odds[i], 0));
  });

  it('a melhor carta vem por último', () => {
    const rank = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 };
    const r = rollChest('extremo', new Rng(7), NO_PITY);
    for (let i = 1; i < r.cards.length; i++) expect(rank[r.cards[i].rarity]).toBeGreaterThanOrEqual(rank[r.cards[i - 1].rarity]);
    expect(r.cards[r.cards.length - 1].rarity).toBe(r.best);
  });

  it('garantia: Lendário no 40º baú de Ouro+ sem Lendário; Extremo no 150º', () => {
    const lend = rollChest('ouro', new Rng(5), { sinceLegendary: 39, sinceExtreme: 0 });
    expect(lend.cards.some((c) => c.rarity === 'lendario' || c.rarity === 'extremo')).toBe(true);
    const ext = rollChest('ouro', new Rng(5), { sinceLegendary: 0, sinceExtreme: 149 });
    expect(ext.cards.some((c) => c.rarity === 'extremo')).toBe(true);
    // Madeira/Prata não usam a garantia
    const wood = rollChest('madeira', new Rng(5), { sinceLegendary: 39, sinceExtreme: 149 });
    expect(wood.cards.every((c) => !c.pity)).toBe(true);
  });

  it('a garantia nunca passa de 40 baús de Ouro seguidos sem Lendário', () => {
    const s = newGame('Teste', NOW);
    let worst = 0;
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      grantChest(s, 'ouro', 'teste', NOW);
      const r = openChest(s, s.chests.inventory[s.chests.inventory.length - 1].uid, NOW);
      if (!r.ok) throw new Error(r.reason);
      const got = r.opening.cards.some((c) => c.rarity === 'lendario' || c.rarity === 'extremo');
      streak = got ? 0 : streak + 1;
      worst = Math.max(worst, streak);
    }
    expect(worst).toBeLessThan(CHESTS.pity.legendaryEvery);
  });

  it('abrir tira do inventário, entrega personagens, moedas e conta estatísticas', () => {
    const s = newGame('Teste', NOW);
    const before = Object.keys(s.collection).length;
    const coins = s.currencies.coins;
    const uid = s.chests.inventory[0].uid;
    const r = openChest(s, uid, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(s.chests.inventory.find((c) => c.uid === uid)).toBeUndefined();
    expect(s.currencies.coins).toBeGreaterThanOrEqual(coins + r.opening.coins);
    expect(s.stats.chestsOpened).toBe(1);
    const news = r.opening.cards.filter((c) => c.isNew).length;
    expect(Object.keys(s.collection).length).toBe(before + new Set(r.opening.cards.filter((c) => c.isNew).map((c) => c.id)).size);
    expect(news).toBeGreaterThanOrEqual(0);
    expect(openChest(s, uid, NOW).ok).toBe(false);
  });

  it('comprar baú: gasta diamantes, respeita nível de conta e inventário cheio', () => {
    const s = newGame('Teste', NOW);
    s.currencies.diamonds = 10_000;
    expect(buyChest(s, 'magico', NOW).ok).toBe(false); // nível 8
    const d = s.currencies.diamonds;
    expect(buyChest(s, 'prata', NOW).ok).toBe(true);
    expect(s.currencies.diamonds).toBe(d - 40);
    while (s.chests.inventory.length < 8) grantChest(s, 'madeira', 't', NOW);
    const d2 = s.currencies.diamonds;
    expect(buyChest(s, 'prata', NOW).ok).toBe(false);
    expect(s.currencies.diamonds).toBe(d2);
  });
});
