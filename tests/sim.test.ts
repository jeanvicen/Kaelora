import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDuelSetup, buildRaidSetup } from '../src/content/battleSetup.ts';
import { generateBotCity } from '../src/content/botCity.ts';
import { buildSquad } from '../src/content/squad.ts';
import { newGame, STARTER_SQUAD } from '../src/meta/newGame.ts';
import { BattleSim, ENERGY_UNIT, hasAdvantage, runBattle } from '../src/sim/battle.ts';
import { decodeReplay, encodeReplay } from '../src/sim/replay.ts';
import type { BattleSetup, TimedCommand } from '../src/sim/types.ts';

const save = newGame('Teste', 1);
const squad = buildSquad(STARTER_SQUAD, save.collection, {}).specs;

function raid(seed: number, level = 1, bot: { skill: number } | null = null): BattleSetup {
  const b = generateBotCity(seed, level);
  return buildRaidSetup({
    seed,
    attacker: { name: 'A', element: 'mare', squad, bot },
    defender: { name: 'D', city: { buildings: b.buildings, element: b.element } },
  });
}

/** Jogadas "humanas" roteirizadas: soltar cartas e usar habilidades em momentos fixos. */
function scripted(): TimedCommand[] {
  const out: TimedCommand[] = [];
  for (let i = 0; i < 40; i++) {
    out.push({ tick: 10 + i * 130, team: 0, cmd: { t: 'deploy', slot: i % 5 } });
    out.push({ tick: 200 + i * 130, team: 0, cmd: { t: 'ability', slot: i % 5 } });
    out.push({ tick: 300 + i * 130, team: 0, cmd: { t: 'ultimate' } });
  }
  return out;
}

describe('simulação determinística', () => {
  it('mesma semente + mesmas jogadas = mesmo resultado (bit a bit)', () => {
    const a = runBattle(raid(42, 2), scripted());
    const b = runBattle(raid(42, 2), scripted());
    expect(a.result.hash).toBe(b.result.hash);
    expect(a.result).toEqual(b.result);
    expect(a.sim.rng.calls).toBe(b.sim.rng.calls);
  });

  it('bots internos também são determinísticos', () => {
    const a = runBattle(raid(7, 3, { skill: 60 }));
    const b = runBattle(raid(7, 3, { skill: 60 }));
    expect(a.result.hash).toBe(b.result.hash);
  });

  it('semente diferente muda a partida', () => {
    const hashes = new Set([1, 2, 3, 4, 5].map((s) => runBattle(raid(s, 2), scripted()).result.hash));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('replay codificado reproduz a partida exata', () => {
    const setup = raid(99, 2);
    const live = new BattleSim(setup);
    const cmds = scripted();
    let i = 0;
    while (!live.over) {
      const now = cmds.filter((c) => c.tick === live.tick).map((c) => ({ team: c.team, cmd: c.cmd }));
      i += now.length;
      live.step(now);
    }
    const text = encodeReplay({ setup, commands: live.log, hash: live.result!.hash });
    const decoded = decodeReplay(text)!;
    expect(decoded).not.toBeNull();
    const again = runBattle(decoded.setup, decoded.commands);
    expect(again.result.hash).toBe(live.result!.hash);
    expect(i).toBeGreaterThan(0);
  });

  it('o código da simulação não usa Math.random nem Date.now', () => {
    const dir = join(__dirname, '../src/sim');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    }
  });
});

describe('regras da batalha', () => {
  it('energia: começa em 5, recarrega 1 a cada 1,5 s e para em 10', () => {
    const sim = new BattleSim(raid(1));
    expect(sim.energyOf(0)).toBe(5);
    for (let t = 0; t < 45; t++) sim.step();
    expect(sim.energyOf(0)).toBeCloseTo(6, 5);
    for (let t = 0; t < 45 * 10; t++) sim.step();
    expect(sim.energyOf(0)).toBe(10);
  });

  it('Frenesi: nos últimos 30 s a energia recarrega 2x', () => {
    const setup = raid(1);
    const sim = new BattleSim(setup);
    while (sim.tick < setup.rules.durationTicks - setup.rules.frenzyTicks) sim.step();
    sim.teams[0].energy = 0;
    for (let t = 0; t < 45; t++) sim.step();
    expect(sim.energyOf(0)).toBeCloseTo(2, 5);
  });

  it('carta: sem energia não entra; com energia vai para o campo e volta depois de cair', () => {
    const sim = new BattleSim(raid(3));
    sim.teams[0].energy = 0;
    sim.step([{ team: 0, cmd: { t: 'deploy', slot: 0 } }]);
    expect(sim.teams[0].cards[0].state).toBe('hand');
    sim.teams[0].energy = 10 * ENERGY_UNIT;
    sim.step([{ team: 0, cmd: { t: 'deploy', slot: 0 } }]);
    expect(sim.teams[0].cards[0].state).toBe('field');
    const u = sim.unit(sim.teams[0].cards[0].unitId)!;
    u.hp = 0;
    u.alive = false;
    sim.step();
    expect(sim.teams[0].cards[0].state).toBe('cooldown');
    for (let t = 0; t < squad[0].redeploy + 2; t++) sim.step();
    expect(sim.teams[0].cards[0].state).toBe('hand');
  });

  it('vantagem de elemento nos dois ciclos', () => {
    expect(hasAdvantage('solar', 'raiz')).toBe(true);
    expect(hasAdvantage('raiz', 'mare')).toBe(true);
    expect(hasAdvantage('mare', 'solar')).toBe(true);
    expect(hasAdvantage('volt', 'cristal')).toBe(true);
    expect(hasAdvantage('cristal', 'sombra')).toBe(true);
    expect(hasAdvantage('sombra', 'volt')).toBe(true);
    expect(hasAdvantage('raiz', 'solar')).toBe(false);
    expect(hasAdvantage('solar', 'volt')).toBe(false);
  });

  it('estrelas: Núcleo + 50% + sobrar 60 s = 3 estrelas', () => {
    // cidade inicial do jogador contra bot forte: deve cair rápido
    const setup = buildRaidSetup({
      seed: 5,
      attacker: { name: 'A', element: 'mare', squad, bot: { skill: 90 } },
      defender: { name: 'D', city: { buildings: save.city.buildings, element: save.city.element } },
    });
    const { result } = runBattle(setup);
    expect(result.coreDestroyed).toBe(true);
    expect(result.winner).toBe(0);
    expect(result.destruction).toBeGreaterThanOrEqual(50);
    expect(result.timeLeftTicks).toBeGreaterThanOrEqual(1800);
    expect(result.stars).toBe(3);
  });

  it('sem atacar ninguém o defensor vence no fim do tempo, com 0 estrelas', () => {
    const { result } = runBattle(raid(8));
    expect(result.winner).toBe(1);
    expect(result.stars).toBe(0);
    expect(result.ticks).toBe(180 * 30);
  });

  it('render-se encerra na hora', () => {
    const { result } = runBattle(raid(8), [{ tick: 30, team: 0, cmd: { t: 'surrender' } }]);
    expect(result.surrendered).toBe(true);
    expect(result.winner).toBe(1);
    expect(result.ticks).toBe(31);
  });

  it('armadilha fica escondida até alguém pisar', () => {
    const setup = raid(11, 3);
    const sim = new BattleSim(setup);
    const traps = sim.structures.filter((s) => s.spec.kind === 'trap');
    expect(traps.length).toBeGreaterThan(0);
    for (const t of traps) expect(t.revealed).toBe(false);
  });

  it('duelo ao vivo termina quando um Núcleo cai', () => {
    const setup = buildDuelSetup({
      seed: 3,
      level: 1,
      a: { name: 'A', element: 'mare', squad, bot: { skill: 80 } },
      b: { name: 'B', element: 'solar', squad: squad.map((s) => ({ ...s, hp: Math.round(s.hp * 0.5) })), bot: { skill: 20 } },
    });
    const { result } = runBattle(setup);
    expect(result.winner).toBe(0);
  });

  it('a defesa entra na estrada ordenada pela distância até a entrada', () => {
    const setup = raid(21, 4);
    const xs = setup.teams[1].structures.map((s) => s.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(setup.teams[1].structures[setup.teams[1].structures.length - 1].kind).toBe('core');
  });
});
