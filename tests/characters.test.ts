import { describe, expect, it } from 'vitest';
import economy from '../src/data/economy.json';
import { allCharacters } from '../src/content/catalog.ts';
import { CLASSES, ELEMENTS } from '../src/content/classes.ts';
import { RARITY_TARGET, TOTAL_CHARACTERS, generateCharacters } from '../src/content/generator.ts';
import { isBlockedName, normalizeName } from '../src/content/names.ts';
import { activeSynergies } from '../src/content/squad.ts';
import { STARTER_SQUAD } from '../src/meta/newGame.ts';

const chars = allCharacters();

describe('gerador de personagens', () => {
  it('são 1008: 12 classes × 6 elementos × 14 variantes', () => {
    expect(TOTAL_CHARACTERS).toBe(1008);
    expect(chars).toHaveLength(1008);
    for (const cls of CLASSES)
      for (const el of ELEMENTS) {
        const combo = chars.filter((c) => c.cls === cls && c.element === el);
        expect(combo, `${cls}/${el}`).toHaveLength(14);
        expect(new Set(combo.map((c) => c.variant)).size).toBe(14);
      }
  });

  it('ids de 1 a 1008, sem buracos', () => {
    chars.forEach((c, i) => expect(c.id).toBe(i + 1));
  });

  it('distribuição de raridades exata: 400 / 300 / 180 / 96 / 32', () => {
    const count: Record<string, number> = {};
    for (const c of chars) count[c.rarity] = (count[c.rarity] ?? 0) + 1;
    expect(count).toEqual(RARITY_TARGET);
  });

  it('Extremos e Lendários espalhados por todas as classes', () => {
    for (const cls of CLASSES) {
      expect(chars.some((c) => c.cls === cls && c.rarity === 'extremo'), cls).toBe(true);
      expect(chars.filter((c) => c.cls === cls && c.rarity === 'lendario').length, cls).toBeGreaterThanOrEqual(6);
    }
  });

  it('todos os nomes são únicos', () => {
    const names = chars.map((c) => normalizeName(c.name));
    expect(new Set(names).size).toBe(1008);
  });

  it('nenhum nome de personagem de jogo existente', () => {
    for (const c of chars) expect(isBlockedName(c.name), c.name).toBe(false);
  });

  it('cada personagem tem um visual único', () => {
    const sigs = chars.map((c) => JSON.stringify(c.look));
    expect(new Set(sigs).size).toBe(1008);
  });

  it('é determinístico e o data/characters.json está atualizado', () => {
    const fresh = generateCharacters({ rarityMultiplier: economy.characters.rarityMultiplier as never });
    const again = generateCharacters({ rarityMultiplier: economy.characters.rarityMultiplier as never });
    expect(fresh).toEqual(again);
    expect(fresh).toEqual(chars);
  });

  it('os 60 primeiros são feitos à mão, com história e falas', () => {
    for (const c of chars.slice(0, 60)) {
      expect(c.handcrafted, c.name).toBe(true);
      expect(c.lore && c.lore.length > 20, c.name).toBe(true);
      expect(c.lines).toHaveLength(3);
    }
    for (const c of chars.slice(60)) expect(c.handcrafted).toBeUndefined();
  });

  it('o jogador começa com 5 Comuns fracos', () => {
    expect(STARTER_SQUAD).toHaveLength(5);
    for (const id of STARTER_SQUAD) {
      const c = chars[id - 1];
      expect(c.rarity).toBe('comum');
      expect(c.starter).toBe(true);
      const others = chars.filter((o) => o.cls === c.cls && o.rarity === 'comum' && !o.starter);
      const avgHp = others.reduce((s, o) => s + o.hp, 0) / others.length;
      expect(c.hp).toBeLessThan(avgHp);
    }
  });

  it('custos de energia entre 2 e 7 e atributos válidos', () => {
    for (const c of chars) {
      expect(c.cost).toBeGreaterThanOrEqual(2);
      expect(c.cost).toBeLessThanOrEqual(7);
      expect(c.hp).toBeGreaterThan(0);
      expect(c.dmg).toBeGreaterThan(0);
      expect(c.ability.description.length).toBeGreaterThan(20);
    }
  });

  it('sinergias: 3 do mesmo elemento e 2 da mesma classe', () => {
    const solares = chars.filter((c) => c.element === 'solar' && c.cls === 'tanque').slice(0, 2);
    const third = chars.find((c) => c.element === 'solar' && c.cls === 'mago')!;
    const syn = activeSynergies([...solares, third]);
    expect(syn.some((s) => s.kind === 'element' && s.key === 'solar')).toBe(true);
    expect(syn.some((s) => s.kind === 'class' && s.key === 'tanque')).toBe(true);
  });
});
