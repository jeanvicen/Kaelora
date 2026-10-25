import { coreLevel } from '../meta/buildings.ts';
import type { Element, OwnedCharacter, SaveData } from '../meta/types.ts';
import type { BattleSetup } from '../sim/types.ts';
import { buildDuelSetup } from './battleSetup.ts';
import { buildSquad } from './squad.ts';

/** O que cada jogador manda no começo do duelo (o suficiente para montar a batalha). */
export interface DuelProfile {
  id: string;
  name: string;
  element: Element;
  squad: number[];
  levels: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>>;
  research: Record<string, number>;
  coreLevel: number;
  trophies: number;
}

/** Combinado do duelo: anfitrião (time 0, esquerda) e convidado (time 1). */
export interface DuelStart {
  matchId: string;
  seed: number;
  host: DuelProfile;
  guest: DuelProfile;
}

export function duelProfileOf(save: SaveData, id: string): DuelProfile {
  const levels: DuelProfile['levels'] = {};
  for (const cid of save.squad) levels[cid] = { level: save.collection[cid]?.level ?? 1, stars: save.collection[cid]?.stars ?? 1 };
  return {
    id,
    name: save.profile.name,
    element: save.city.element,
    squad: [...save.squad],
    levels,
    research: { ...save.city.research },
    coreLevel: coreLevel(save.city),
    trophies: save.profile.trophies,
  };
}

/** Nível das bases do duelo: a média dos dois Núcleos. */
export function duelLevel(s: DuelStart): number {
  return Math.max(1, Math.min(10, Math.round((s.host.coreLevel + s.guest.coreLevel) / 2)));
}

/** Mesma batalha nos dois aparelhos (e no servidor), a partir do combinado. */
export function duelSetupFrom(s: DuelStart): BattleSetup {
  const side = (p: DuelProfile) => ({ name: p.name, element: p.element, squad: buildSquad(p.squad, p.levels, p.research).specs, research: p.research });
  return buildDuelSetup({ seed: s.seed, level: duelLevel(s), a: side(s.host), b: side(s.guest) });
}
