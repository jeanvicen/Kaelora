import { ConflictError, type BattleRecord, type ServerDb, type StoredState } from './types.ts';

/** Banco em memória (testes e desenvolvimento). Mesmo contrato do Supabase. */
export class MemoryDb implements ServerDb {
  readonly states = new Map<string, StoredState>();
  readonly battles: BattleRecord[] = [];
  private seedCounter = 0x1234;

  async load(userId: string): Promise<StoredState | null> {
    const st = this.states.get(userId);
    return st ? structuredClone(st) : null;
  }

  async store(userId: string, st: StoredState, expectedVersion: number | null): Promise<void> {
    const cur = this.states.get(userId);
    if (expectedVersion === null ? !!cur : cur?.version !== expectedVersion) throw new ConflictError();
    this.states.set(userId, structuredClone(st));
  }

  async candidates(userId: string, q: { trophies: number; now: number; limit: number }) {
    return [...this.states.entries()]
      .filter(([id, st]) => id !== userId && Math.abs(st.save.profile.trophies - q.trophies) <= 400)
      .slice(0, q.limit)
      .map(([id, st]) => ({ userId: id, state: structuredClone(st) }));
  }

  async recordBattle(rec: BattleRecord): Promise<void> {
    this.battles.push(rec);
  }

  randomSeed(): number {
    this.seedCounter = (Math.imul(this.seedCounter, 1103515245) + 12345) >>> 0;
    return this.seedCounter;
  }
}
