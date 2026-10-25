import { ELEMENTS } from '../content/classes.ts';
import type { BotCity } from '../content/botCity.ts';
import type { BattleResult } from '../sim/types.ts';
import { buyChest, openChest } from './chests.ts';
import {
  buyBuilding,
  collect,
  finishUpgrades,
  moveBuilding,
  placeFromStorage,
  repair,
  speedUp,
  startUpgrade,
  storeBuilding,
} from './city.ts';
import { claimAlbum, setSquadSlot, starUp } from './collection.ts';
import { chooseRetake, markDefenseSeen, processOfflineRaids, rebuildCity } from './defense.ts';
import { applyBattleResult, consumeTarget, invasionTargets, refreshCost, type BattleContext } from './raids.ts';
import { metaRng } from './rng.ts';
import type { BuildingType, ChestType, Element, SaveData, Settings } from './types.ts';

/**
 * Todas as ações que mudam o save, num registro só. O cliente offline e o
 * servidor (Edge Functions) executam EXATAMENTE estas funções; online, o
 * cliente aplica as determinísticas na hora (otimista) e o servidor confirma.
 */
export interface ActionCtx {
  now: number;
}

const bad = (reason: string) => ({ ok: false as const, reason });

export const ACTIONS = {
  // ---------------- cidade
  build: (s: SaveData, a: { type: BuildingType; x: number; z: number; rot: number }, c: ActionCtx) => buyBuilding(s, a.type, a.x, a.z, a.rot, c.now),
  place: (s: SaveData, a: { storageId: string; x: number; z: number; rot: number }, c: ActionCtx) => placeFromStorage(s, a.storageId, a.x, a.z, a.rot, c.now),
  move: (s: SaveData, a: { id: string; x: number; z: number; rot: number }) => moveBuilding(s, a.id, a.x, a.z, a.rot),
  store: (s: SaveData, a: { id: string }) => storeBuilding(s, a.id),
  upgrade: (s: SaveData, a: { id: string }, c: ActionCtx) => startUpgrade(s, a.id, c.now),
  finishUpgrades: (s: SaveData, _a: Record<string, never>, c: ActionCtx) => finishUpgrades(s, c.now).map((b) => b.id),
  speedup: (s: SaveData, a: { id: string }, c: ActionCtx) => speedUp(s, a.id, c.now),
  collect: (s: SaveData, a: { id: string }, c: ActionCtx) => collect(s, a.id, c.now),
  repair: (s: SaveData, a: { id: string }) => repair(s, a.id),
  element: (s: SaveData, a: { element: Element }) => {
    if (!ELEMENTS.includes(a.element)) return bad('Elemento inválido');
    s.city.element = a.element;
    return { ok: true as const };
  },
  // ---------------- coleção
  starUp: (s: SaveData, a: { id: number }) => starUp(s, a.id),
  squadSlot: (s: SaveData, a: { slot: number; id: number }) => setSquadSlot(s, a.slot, a.id),
  albumClaim: (s: SaveData, a: { element: Element; pct: number }, c: ActionCtx) => claimAlbum(s, a.element, a.pct, c.now),
  // ---------------- baús (sorteio: só o servidor decide quando online)
  buyChest: (s: SaveData, a: { type: ChestType }, c: ActionCtx) => buyChest(s, a.type, c.now),
  openChest: (s: SaveData, a: { uid: string }, c: ActionCtx) => openChest(s, a.uid, c.now),
  chestSeen: (s: SaveData, a: { type: ChestType }) => {
    s.progression.seenChestIntro[a.type] = true;
    return true;
  },
  // ---------------- preferências (só do jogador; o servidor só guarda)
  settings: (s: SaveData, a: { patch: Partial<Settings> }) => {
    // só chaves conhecidas e do mesmo tipo
    const cur = s.settings as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(a.patch ?? {})) if (k in cur && typeof v === typeof cur[k]) cur[k] = v;
    return true;
  },
  // ---------------- invasões (offline: rivais-bot; online: matchmaking no servidor)
  targets: (s: SaveData, a: { force?: boolean }, c: ActionCtx) => invasionTargets(s, c.now, !!a.force),
  refreshTargets: (s: SaveData, _a: Record<string, never>, c: ActionCtx) => {
    const cost = refreshCost(s);
    if (s.currencies.coins < cost) return bad('Moedas insuficientes');
    s.currencies.coins -= cost;
    invasionTargets(s, c.now, true);
    return { ok: true as const };
  },
  battleSeed: (s: SaveData, _a: Record<string, never>) => metaRng(s).nextU32(),
  battleEnd: (
    s: SaveData,
    a: { kind: BattleContext; target: Pick<BotCity, 'loot' | 'coreLevel' | 'trophies' | 'seed'> | null; result: BattleResult; squad: number[]; revengeId?: string },
    c: ActionCtx,
  ) => {
    const rw = applyBattleResult(s, { kind: a.kind, target: a.target, result: a.result, squad: a.squad, now: c.now, revengeId: a.revengeId });
    if (a.target && a.kind === 'raid') consumeTarget(s, a.target.seed);
    if (s.progression.tutorialStep < 3) s.progression.tutorialStep++;
    return rw;
  },
  // ---------------- defesa
  offlineRaids: (s: SaveData, _a: Record<string, never>, c: ActionCtx) => processOfflineRaids(s, c.now),
  defenseSeen: (s: SaveData, _a: Record<string, never>) => {
    markDefenseSeen(s);
    return true;
  },
  raidChoice: (s: SaveData, a: { choice: 'rebuild' | 'retake' }, c: ActionCtx) => (a.choice === 'rebuild' ? rebuildCity(s, c.now) : chooseRetake(s)),
};

export type ActionName = keyof typeof ACTIONS;
export type ActionArgs<K extends ActionName> = Parameters<(typeof ACTIONS)[K]>[1];
export type ActionResult<K extends ActionName> = ReturnType<(typeof ACTIONS)[K]>;

export function runAction<K extends ActionName>(save: SaveData, name: K, args: ActionArgs<K>, ctx: ActionCtx): ActionResult<K> {
  const fn = ACTIONS[name] as unknown as (s: SaveData, a: ActionArgs<K>, c: ActionCtx) => ActionResult<K>;
  return fn(save, args, ctx);
}

/**
 * Ações sem sorte: online o cliente aplica na hora e o servidor repete e
 * confirma. As outras (baús, alvos, batalhas) esperam a resposta do servidor.
 */
export const OPTIMISTIC: ReadonlySet<ActionName> = new Set<ActionName>([
  'build',
  'place',
  'move',
  'store',
  'upgrade',
  'speedup',
  'collect',
  'repair',
  'element',
  'starUp',
  'squadSlot',
  'albumClaim',
  'chestSeen',
  'settings',
  'defenseSeen',
]);
// `finishUpgrades` não vai ao servidor: lá as melhorias terminam sozinhas a cada ação.

/** Ações que o servidor aceita pela função genérica `game-action`. */
export const CLIENT_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>([...OPTIMISTIC, 'buyChest', 'raidChoice']);
