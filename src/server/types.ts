import type { EventRules } from '../content/battleSetup.ts';
import type { BotCity } from '../content/botCity.ts';
import type { BattleContext } from '../meta/raids.ts';
import type { SaveData } from '../meta/types.ts';
import type { BattleResult, BattleSetup, TimedCommand } from '../sim/types.ts';

/** Estado guardado no servidor para cada jogador. */
export interface StoredState {
  /** Save canônico. `save.rng.seed` é SECRETO (nunca vai para o cliente). */
  save: SaveData;
  /** Incrementa a cada gravação (controle de concorrência otimista). */
  version: number;
  /** Alvos do último matchmaking (fotografias das cidades). */
  targets: TargetRef[];
  activeBattle: ActiveBattle | null;
  importedAt?: number;
}

export interface TargetRef {
  key: string;
  /** Dono real (online) ou null para rival-bot. */
  ownerId: string | null;
  city: BotCity;
}

export interface ActiveBattle {
  seed: number;
  kind: BattleContext;
  target: BotCity;
  targetKey?: string;
  ownerId: string | null;
  revengeId?: string;
  event?: EventRules;
  startedAt: number;
}

export interface BattleRecord {
  id: string;
  attackerId: string;
  defenderId: string | null;
  kind: BattleContext;
  seed: number;
  setup: BattleSetup;
  commands: TimedCommand[];
  result: BattleResult;
  clientHash: number;
  at: number;
}

export class ConflictError extends Error {
  constructor() {
    super('conflito de versão');
  }
}

/** O que o servidor precisa do banco (Supabase em produção, memória nos testes). */
export interface ServerDb {
  load(userId: string): Promise<StoredState | null>;
  /** Grava se a versão no banco ainda for `expectedVersion` (senão ConflictError). */
  store(userId: string, st: StoredState, expectedVersion: number | null): Promise<void>;
  /** Jogadores com troféus parecidos, para o matchmaking (sem o próprio). */
  candidates(userId: string, q: { trophies: number; now: number; limit: number }): Promise<{ userId: string; state: StoredState }[]>;
  recordBattle(rec: BattleRecord): Promise<void>;
  /** Semente aleatória de verdade (crypto). */
  randomSeed(): number;
}

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
