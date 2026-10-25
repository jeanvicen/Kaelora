import type { Element, OwnedCharacter, SaveData } from '../meta/types.ts';
import { charactersBy, findCharacter } from './catalog.ts';
import { characterPower } from './squad.ts';

export interface EventSquad {
  ids: number[];
  collection: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>>;
  /** Emprestados pelo evento (não ganham XP). */
  loaners: number[];
}

/**
 * Esquadrão de uma semana de elemento ("só personagens Volt"): os 5 mais
 * fortes do jogador daquele elemento; quem faltar, o evento empresta
 * (Comuns do elemento no nível médio do esquadrão). Determinístico.
 */
export function eventSquad(save: Pick<SaveData, 'squad' | 'collection'>, element: Element): EventSquad {
  const owned = Object.keys(save.collection)
    .map(Number)
    .map((id) => findCharacter(id))
    .filter((c): c is NonNullable<typeof c> => !!c && c.element === element)
    .sort((a, b) => characterPower(b, save.collection[b.id]) - characterPower(a, save.collection[a.id]) || a.id - b.id)
    .slice(0, 5);
  const ids = owned.map((c) => c.id);
  const collection: EventSquad['collection'] = {};
  for (const id of ids) collection[id] = { level: save.collection[id].level, stars: save.collection[id].stars };
  const lv = save.squad.map((id) => save.collection[id]?.level ?? 1);
  const avg = Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length)));
  const loaners: number[] = [];
  for (const c of charactersBy({ element, rarity: 'comum' })) {
    if (ids.length >= 5) break;
    if (ids.includes(c.id)) continue;
    ids.push(c.id);
    loaners.push(c.id);
    collection[c.id] = { level: avg, stars: 1 };
  }
  return { ids, collection, loaners };
}

/** Quem vai para a batalha (e ganha XP) — o esquadrão normal ou o do evento. */
export function battleSquad(save: Pick<SaveData, 'squad' | 'collection'>, element?: Element): EventSquad {
  if (element) return eventSquad(save, element);
  const collection: EventSquad['collection'] = {};
  for (const id of save.squad) collection[id] = save.collection[id] ?? { level: 1, stars: 1 };
  return { ids: [...save.squad], collection, loaners: [] };
}
