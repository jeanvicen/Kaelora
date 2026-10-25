import { RESEARCH, type ResearchDef } from '../content/squad.ts';
import { levelStats } from './buildings.ts';
import { ECONOMY, addAccountXp, speedupCost } from './economy.ts';
import type { SaveData } from './types.ts';

// Laboratório: pesquisas permanentes, uma por vez, com o nível máximo de
// cada pesquisa limitado pelo nível do Laboratório.

export type ResearchResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): ResearchResult => ({ ok: false, reason });

export function researchDef(id: string): ResearchDef | undefined {
  return RESEARCH.find((r) => r.id === id);
}

/** Nível máximo de pesquisa liberado pelo melhor Laboratório (0 = sem laboratório). */
export function researchCap(save: SaveData): number {
  let cap = 0;
  for (const b of save.city.buildings) if (b.type === 'lab' && !b.ruined && !b.upgradeEndsAt) cap = Math.max(cap, levelStats('lab', b.level).maxResearch ?? 0);
  return cap;
}

export function researchLevel(save: SaveData, id: string): number {
  return save.city.research[id] ?? 0;
}

export function researchBlockReason(save: SaveData, id: string): string | null {
  const def = researchDef(id);
  if (!def) return 'Pesquisa desconhecida';
  const cap = researchCap(save);
  if (cap === 0) return 'Construa um Laboratório';
  if (save.city.researchQueue) return 'O Laboratório já está pesquisando';
  const lvl = researchLevel(save, id);
  if (lvl >= def.maxLevel) return 'Pesquisa no máximo';
  if (lvl >= cap) return 'Melhore o Laboratório para continuar';
  if (save.currencies.coins < def.costs[lvl]) return `Faltam ${def.costs[lvl] - save.currencies.coins} moedas`;
  return null;
}

export function startResearch(save: SaveData, id: string, now: number): ResearchResult {
  const block = researchBlockReason(save, id);
  if (block) return fail(block);
  const def = researchDef(id)!;
  const lvl = researchLevel(save, id);
  save.currencies.coins -= def.costs[lvl];
  const time = def.times[lvl] ?? 0;
  save.city.researchQueue = { id, endsAt: now + time * 1000 };
  if (time <= 0) finishResearch(save, now);
  return { ok: true };
}

/** Conclui a pesquisa em andamento se o tempo acabou. Retorna o id concluído. */
export function finishResearch(save: SaveData, now: number): string | null {
  const q = save.city.researchQueue;
  if (!q || q.endsAt > now) return null;
  save.city.research[q.id] = (save.city.research[q.id] ?? 0) + 1;
  save.city.researchQueue = null;
  addAccountXp(save, ECONOMY.account.xp.upgrade);
  return q.id;
}

export function researchSpeedupCost(save: SaveData, now: number): number {
  const q = save.city.researchQueue;
  return q ? speedupCost(Math.max(0, (q.endsAt - now) / 1000)) : 0;
}

export function speedUpResearch(save: SaveData, now: number): ResearchResult {
  const q = save.city.researchQueue;
  if (!q) return fail('Nada para acelerar');
  const cost = researchSpeedupCost(save, now);
  if (save.currencies.diamonds < cost) return fail('Diamantes insuficientes');
  save.currencies.diamonds -= cost;
  q.endsAt = now;
  finishResearch(save, now);
  return { ok: true };
}
