import { allCharacters, findCharacter, getCharacter } from '../content/catalog.ts';
import { ELEMENTS } from '../content/classes.ts';
import { ECONOMY, type Reward } from './economy.ts';
import { applyReward, type AppliedReward } from './rewards.ts';
import type { Element, OwnedCharacter, SaveData } from './types.ts';

// Coleção: ganhar personagens, duplicatas em fragmentos, estrelas, esquadrão
// e álbum. Lógica pura (roda igual no cliente offline e no servidor).

export type CollectionResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): CollectionResult => ({ ok: false, reason });
const OK: CollectionResult = { ok: true };

export const MAX_STARS = 5;
export const SQUAD_SIZE = 5;

export interface GrantResult {
  id: number;
  isNew: boolean;
  /** Fragmentos recebidos (duplicata). */
  fragments: number;
}

/** Entrega um personagem: novo entra na coleção, repetido vira fragmentos. */
export function grantCharacter(save: SaveData, id: number, now: number): GrantResult {
  const def = getCharacter(id);
  const owned = save.collection[id];
  if (!owned) {
    save.collection[id] = { level: ECONOMY.characters.startLevel, xp: 0, stars: 1, fragments: 0, obtainedAt: now, copies: 1 };
    return { id, isNew: true, fragments: 0 };
  }
  const fragments = ECONOMY.characters.fragmentsPerDuplicate[def.rarity];
  owned.fragments += fragments;
  owned.copies++;
  return { id, isNew: false, fragments };
}

/** Custo para subir de estrela (null se já está no máximo). */
export function starUpCost(owned: Pick<OwnedCharacter, 'stars'>): { fragments: number; coins: number } | null {
  if (owned.stars >= MAX_STARS) return null;
  return ECONOMY.characters.starCosts[owned.stars - 1] ?? null;
}

export function canStarUp(save: SaveData, id: number): CollectionResult {
  const owned = save.collection[id];
  if (!owned) return fail('Você ainda não tem este personagem');
  const cost = starUpCost(owned);
  if (!cost) return fail('Já está com 5 estrelas!');
  if (owned.fragments < cost.fragments) return fail(`Faltam ${cost.fragments - owned.fragments} fragmentos`);
  if (save.currencies.coins < cost.coins) return fail(`Faltam ${cost.coins - save.currencies.coins} moedas`);
  return OK;
}

/** Sobe uma estrela gastando fragmentos + moedas. */
export function starUp(save: SaveData, id: number): CollectionResult {
  const check = canStarUp(save, id);
  if (!check.ok) return check;
  const owned = save.collection[id];
  const cost = starUpCost(owned)!;
  owned.fragments -= cost.fragments;
  save.currencies.coins -= cost.coins;
  owned.stars++;
  return OK;
}

/** Progresso de XP do nível atual (0..1) e se travou no limite do Quartel. */
export function levelProgress(owned: Pick<OwnedCharacter, 'level' | 'xp'>, cap: number): { need: number; pct: number; capped: boolean } {
  const table = ECONOMY.characters.levelXp;
  const need = table[Math.min(table.length - 1, owned.level - 1)];
  const capped = owned.level >= Math.min(cap, ECONOMY.characters.maxLevel);
  return { need, pct: capped ? 1 : Math.min(1, owned.xp / need), capped };
}

/**
 * Coloca um personagem numa vaga do esquadrão. Se ele já estava em outra
 * vaga, os dois trocam de lugar.
 */
export function setSquadSlot(save: SaveData, slot: number, id: number): CollectionResult {
  if (slot < 0 || slot >= SQUAD_SIZE) return fail('Vaga inválida');
  if (!save.collection[id]) return fail('Você ainda não tem este personagem');
  const squad = save.squad;
  const from = squad.indexOf(id);
  if (from === slot) return OK;
  if (from >= 0) {
    squad[from] = squad[slot];
    squad[slot] = id;
  } else squad[slot] = id;
  return OK;
}

/** Esquadrão válido: 5 personagens diferentes e possuídos. */
export function isValidSquad(save: SaveData): boolean {
  const s = save.squad;
  return s.length === SQUAD_SIZE && new Set(s).size === SQUAD_SIZE && s.every((id) => !!save.collection[id] && !!findCharacter(id));
}

// ------------------------------------------------------------ álbum

export interface AlbumPart {
  owned: number;
  count: number;
  pct: number;
}

export function albumProgress(save: SaveData): { total: AlbumPart; byElement: Record<Element, AlbumPart> } {
  const byElement = {} as Record<Element, AlbumPart>;
  for (const el of ELEMENTS) byElement[el] = { owned: 0, count: 0, pct: 0 };
  let owned = 0;
  for (const c of allCharacters()) {
    const part = byElement[c.element];
    part.count++;
    if (save.collection[c.id]) {
      part.owned++;
      owned++;
    }
  }
  for (const el of ELEMENTS) byElement[el].pct = (byElement[el].owned / byElement[el].count) * 100;
  const count = allCharacters().length;
  return { total: { owned, count, pct: (owned / count) * 100 }, byElement };
}

export interface AlbumMilestone {
  key: string;
  element: Element;
  pct: number;
  /** Quantos personagens do elemento precisa ter. */
  needed: number;
  reward: Reward;
  reached: boolean;
  claimed: boolean;
}

export function albumKey(element: Element, pct: number): string {
  return `${element}:${pct}`;
}

/** Marcos (10/25/50/75/100%) de cada elemento, com estado de coleta. */
export function albumMilestones(save: SaveData, element: Element): AlbumMilestone[] {
  const part = albumProgress(save).byElement[element];
  const A = ECONOMY.album;
  return A.milestones.map((pct, i) => {
    const needed = Math.ceil((part.count * pct) / 100);
    const key = albumKey(element, pct);
    return { key, element, pct, needed, reward: A.rewards[i], reached: part.owned >= needed, claimed: save.album.claimed.includes(key) };
  });
}

export function albumClaimableCount(save: SaveData): number {
  let n = 0;
  for (const el of ELEMENTS) for (const m of albumMilestones(save, el)) if (m.reached && !m.claimed) n++;
  return n;
}

export function claimAlbum(save: SaveData, element: Element, pct: number, now: number): CollectionResult & { reward?: AppliedReward } {
  const m = albumMilestones(save, element).find((x) => x.pct === pct);
  if (!m) return fail('Marco inválido');
  if (m.claimed) return fail('Recompensa já coletada');
  if (!m.reached) return fail(`Junte ${m.needed} personagens deste elemento`);
  save.album.claimed.push(m.key);
  return { ok: true, reward: applyReward(save, m.reward, 'album', now) };
}
