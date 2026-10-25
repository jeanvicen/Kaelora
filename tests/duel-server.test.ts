import { describe, expect, it } from 'vitest';
import { duelProfileOf, duelSetupFrom, type DuelStart } from '../src/content/duelSetup.ts';
import { GameServer, MemoryDb } from '../src/server/index.ts';
import { runBattle } from '../src/sim/battle.ts';
import type { TimedCommand } from '../src/sim/types.ts';

const T0 = 1_700_000_000_000;

async function setup() {
  const db = new MemoryDb();
  const server = new GameServer(db, () => T0);
  await server.bootstrap('a', { name: 'Ana' });
  await server.bootstrap('b', { name: 'Beto' });
  const start: DuelStart = {
    matchId: 'duelo-1',
    seed: 99,
    host: duelProfileOf((await db.load('a'))!.save, 'a'),
    guest: duelProfileOf((await db.load('b'))!.save, 'b'),
  };
  // jogadas de um duelo de verdade: bots jogando pelos dois lados
  const s = duelSetupFrom(start);
  s.teams[0].bot = { skill: 80 };
  s.teams[1].bot = { skill: 40 };
  const { sim, result } = runBattle(s);
  const commands: TimedCommand[] = sim.log;
  return { db, server, start, commands, hash: result.hash };
}

describe('duelo ao vivo no servidor', () => {
  it('só resolve quando os dois mandam as mesmas jogadas, e paga cada lado uma vez', async () => {
    const { db, server, start, commands, hash } = await setup();
    const first = await server.submitDuel('a', { start, commands, hash });
    expect(first.status).toBe('waiting');
    const second = await server.submitDuel('b', { start, commands, hash });
    expect(second.status).toBe('resolved');
    const a = (await db.load('a'))!.save;
    const b = (await db.load('b'))!.save;
    expect(a.stats.battles + b.stats.battles).toBe(2);
    expect(a.stats.duelsWon + b.stats.duelsWon).toBeLessThanOrEqual(1);
    // perguntar de novo devolve o mesmo resultado, sem pagar outra vez
    const again = await server.submitDuel('a', { start, commands, hash });
    expect(again.status).toBe('resolved');
    expect((await db.load('a'))!.save.stats.battles).toBe(a.stats.battles);
  });

  it('jogadas diferentes nos dois aparelhos: ninguém ganha nada', async () => {
    const { db, server, start, commands, hash } = await setup();
    await server.submitDuel('a', { start, commands, hash });
    const r = await server.submitDuel('b', { start, commands: commands.slice(0, 3), hash });
    expect(r.status).toBe('resolved');
    expect(r.outcome && 'error' in r.outcome).toBe(true);
    expect((await db.load('a'))!.save.stats.battles).toBe(0);
  });

  it('não dá para mentir o esquadrão nem entrar em duelo dos outros', async () => {
    const { server, start, commands, hash } = await setup();
    const fake = structuredClone(start);
    fake.host.levels[fake.host.squad[0]].level = 30;
    await expect(server.submitDuel('a', { start: fake, commands, hash })).rejects.toThrow(/não confere/);
    await server.bootstrap('c', { name: 'Caio' });
    await expect(server.submitDuel('c', { start, commands, hash })).rejects.toThrow(/não está neste duelo/);
  });
});
