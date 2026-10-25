import { describe, expect, it } from 'vitest';
import { duelProfileOf, duelSetupFrom, type DuelStart } from '../src/content/duelSetup.ts';
import { newGame } from '../src/meta/newGame.ts';
import { ABANDON_AFTER_MS, Lockstep } from '../src/net/lockstep.ts';
import { memoryPair } from '../src/net/transports.ts';
import { BattleSim } from '../src/sim/battle.ts';
import { Rng } from '../src/sim/rng.ts';
import type { Team } from '../src/sim/types.ts';

function start(): DuelStart {
  const a = newGame('Ana', 1);
  const b = newGame('Beto', 1);
  return { matchId: 'm1', seed: 4242, host: duelProfileOf(a, 'a'), guest: duelProfileOf(b, 'b') };
}

interface Peer {
  sim: BattleSim;
  ls: Lockstep;
  rng: Rng;
  team: Team;
  desync: boolean;
  abandon: boolean;
}

/**
 * Roda um duelo entre dois "aparelhos" em tempo simulado. Cada um joga
 * cartas ao acaso; a rede tem latência, variação e (opcional) perda.
 */
function runDuel(opts: { latency?: number; jitter?: number; drop?: number; outage?: [number, number]; dieAt?: number; maxMs?: number }) {
  const s = start();
  const net = memoryPair({ latency: opts.latency ?? 60, jitter: opts.jitter ?? 40, drop: opts.drop ?? 0, seed: 7 });
  let now = 0;
  const clock = () => now;
  const mk = (team: Team, t: typeof net.a): Peer => {
    const p: Peer = { sim: new BattleSim(duelSetupFrom(s)), ls: null as unknown as Lockstep, rng: new Rng(team === 0 ? 1 : 2), team, desync: false, abandon: false };
    p.ls = new Lockstep(t, team, { onDesync: () => (p.desync = true), onAbandon: () => (p.abandon = true) }, clock);
    return p;
  };
  const peers = [mk(0, net.a), mk(1, net.b)];
  const maxMs = opts.maxMs ?? 260_000;
  for (now = 0; now < maxMs; now += 16) {
    if (opts.outage) net.setDown('b', now >= opts.outage[0] && now < opts.outage[1]);
    if (opts.dieAt !== undefined && now >= opts.dieAt) net.setDown('b', true);
    net.pump(now);
    for (const p of peers) {
      if (p.sim.over) continue;
      if (opts.dieAt !== undefined && p.team === 1 && now >= opts.dieAt) continue; // aparelho do B "morreu"
      // jogadas ao acaso (como um jogador apertando cartas)
      if (p.rng.int(1000) < 25) p.ls.send({ t: 'deploy', slot: p.rng.int(5) });
      if (p.rng.int(1000) < 6) p.ls.send({ t: 'ability', slot: p.rng.int(5) });
      const target = Math.floor(now / (1000 / 30));
      let guard = 0;
      while (p.sim.tick < target && !p.sim.over && guard++ < 10) {
        const cmds = p.ls.commandsFor(p.sim.tick);
        if (!cmds) break;
        p.sim.step(cmds);
        if (p.sim.tick % 30 === 0) p.ls.onHash(p.sim.tick, p.sim.hash());
      }
    }
    if (peers.every((p) => p.sim.over)) break;
  }
  return peers;
}

describe('duelo ao vivo (lockstep)', () => {
  it('dois aparelhos com latência e variação terminam IGUAIS', () => {
    const [a, b] = runDuel({});
    expect(a.sim.over && b.sim.over).toBe(true);
    expect(a.sim.result!.hash).toBe(b.sim.result!.hash);
    expect(a.desync || b.desync).toBe(false);
    expect(a.ls.log).toEqual(b.ls.log);
    // cada um vê o resultado do seu lado
    const ra = a.sim.resultFor(0)!;
    const rb = b.sim.resultFor(1)!;
    if (ra.winner === 0) expect(rb.winner).toBe(1);
    expect(ra.damageDealt).toEqual([rb.damageDealt[1], rb.damageDealt[0]]);
  });

  it('perda de 15% dos pacotes: reenvio recupera e continua igual', () => {
    const [a, b] = runDuel({ drop: 0.15, maxMs: 400_000 });
    expect(a.sim.over && b.sim.over).toBe(true);
    expect(a.sim.result!.hash).toBe(b.sim.result!.hash);
  });

  it('queda de conexão de 3 s: reconecta e termina igual', () => {
    const [a, b] = runDuel({ outage: [20_000, 23_000], maxMs: 400_000 });
    expect(a.sim.over && b.sim.over).toBe(true);
    expect(a.sim.result!.hash).toBe(b.sim.result!.hash);
  });

  it('oponente some de vez: quem ficou vence por W.O.', () => {
    const [a] = runDuel({ dieAt: 10_000, maxMs: 10_000 + ABANDON_AFTER_MS + 5_000 });
    expect(a.abandon).toBe(true);
    expect(a.sim.over).toBe(true);
    expect(a.sim.resultFor(0)!.winner).toBe(0);
  });
});
