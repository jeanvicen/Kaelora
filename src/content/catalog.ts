import charactersJson from '../data/characters.json';
import type { ClassId, Element, Rarity } from '../meta/types.ts';
import type { CharacterDef } from './types.ts';

const ALL = (charactersJson as unknown as { characters: CharacterDef[] }).characters;
const BY_ID = new Map<number, CharacterDef>(ALL.map((c) => [c.id, c]));

export function allCharacters(): readonly CharacterDef[] {
  return ALL;
}

export function getCharacter(id: number): CharacterDef {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Personagem ${id} não existe`);
  return c;
}

export function findCharacter(id: number): CharacterDef | undefined {
  return BY_ID.get(id);
}

export function charactersBy(filter: { element?: Element; cls?: ClassId; rarity?: Rarity }): CharacterDef[] {
  return ALL.filter((c) => (!filter.element || c.element === filter.element) && (!filter.cls || c.cls === filter.cls) && (!filter.rarity || c.rarity === filter.rarity));
}

const BY_RARITY = new Map<Rarity, CharacterDef[]>();
for (const c of ALL) {
  let list = BY_RARITY.get(c.rarity);
  if (!list) BY_RARITY.set(c.rarity, (list = []));
  list.push(c);
}

export function charactersOfRarity(r: Rarity): readonly CharacterDef[] {
  return BY_RARITY.get(r) ?? [];
}

export const CHARACTER_COUNT = ALL.length;
