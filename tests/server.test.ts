import { describe, expect, it } from 'vitest';
import { raidSetupFor } from '../src/content/battleSetup.ts';
import { allCharacters } from '../src/content/catalog.ts';
import { coinsAtRisk } from '../src/meta/defense.ts';
import { GameServer, MemoryDb, sanitizeImportedSave } from '../src/server/index.ts';
import { ConflictError } from '../src/server/types.ts';
import { newGame } from '../src/meta/newGame.ts';
import type { SaveData } from '../src/meta/types.ts';
import { runBattle } from '../src/sim/battle.ts';
import type { BotCity } from '../src/content/botCity.ts';
import type { TimedCommand } from '../src/sim/types.ts';

const T0 = 1_700_000_000_000;

function setup() {
  let now = T0;
  const db = new MemoryDb();
  const server = new GameServer(db, () => now);
  return { db, server, tick: (ms: number) => (now += ms), now: () => now };
}

/** Jogadas vencedoras: um bot forte joga pelo atacante e gravamos o que ele fez. */
function winningCommands(save: SaveData, target: BotCity, seed: number): { commands: TimedCommand[]; hash: number } {
  const s = raidSetupFor(save, target, seed);
  s.teams[0].bot = { skill: 95 };
  const { sim } = runBattle(s);
  const commands = sim.log.filter((c) => c.team === 0);
  const plain = raidSetupFor(save, target, seed);
  const { result } = runBattle(plain, commands);
  return { commands, hash: result.hash };
}

/** Deixa um jogador fortíssimo (para garantir a vitória nos testes). */
function makeStrong(save: SaveData) {
  const legends = allCharacters().filter((c) => c.rarity === 'extremo').slice(0, 5);
  save.squad = legends.map((c) => c.id);
  for (const c of legends) save.collection[c.id] = { level: 30, xp: 0, stars: 5, fragments: 0, obtainedAt: 0, copies: 1 };
}

describe('servidor autoritativo', () => {
  it('cria o jogador e nunca envia a semente secreta para o cliente', async () => {
    const { server, db } = setup();
    const r = await server.bootstrap('a', { name: 'Ana', element: 'volt' });
    expect(r.created).toBe(true);
    expect(r.save.rng.seed).toBe(0);
    expect(r.save.city.element).toBe('volt');
    const st = await db.load('a');
    expect(st!.save.rng.seed).not.toBe(0);
  });

  it('ações genéricas: aplica, bloqueia as proibidas e argumentos estranhos', async () => {
    const { server } = setup();
    await server.bootstrap('a', { name: 'Ana' });
    const st = (await server.action('a', 'element', { element: 'sombra' })).save;
    expect(st.city.element).toBe('sombra');
    await expect(server.action('a', 'battleEnd' as never, {})).rejects.toThrow(/não permitida/);
    await expect(server.action('a', 'move', { id: 'x', x: Number.NaN, z: 1, rot: 0 })).rejects.toThrow();
    await expect(server.action('a', 'move', { id: 'x', x: 1.5, z: 1, rot: 0 })).rejects.toThrow();
  });

  it('baú: abre no servidor e some do inventário', async () => {
    const { server } = setup();
    const boot = await server.bootstrap('a', { name: 'Ana' });
    const uid = boot.save.chests.inventory[0].uid;
    const r = await server.openChest('a', { uid });
    expect(r.result.ok).toBe(true);
    expect(r.save.chests.inventory.find((c) => c.uid === uid)).toBeUndefined();
    expect((await server.openChest('a', { uid })).result.ok).toBe(false);
  });

  it('matchmaking mistura jogadores reais (sem proteção) e rivais-bot', async () => {
    const { server, db } = setup();
    await server.bootstrap('a', { name: 'Ana' });
    await server.bootstrap('b', { name: 'Beto' });
    // Beto ainda é iniciante: protegido
    let r = await server.matchmaking('a', {});
    expect(r.targets).toHaveLength(3);
    expect(r.targets.some((t) => t.isPlayer)).toBe(false);
    const b = (await db.load('b'))!;
    b.save.raids.beginnerUntil = 0;
    await db.store('b', b, b.version);
    const a = (await db.load('a'))!;
    a.save.currencies.coins = 10_000;
    await db.store('a', a, a.version);
    r = await server.matchmaking('a', { force: true });
    expect(r.targets.filter((t) => t.isPlayer).map((t) => t.city.ownerName)).toEqual(['Beto']);
  });

  it('PvP assíncrono: valida pela re-simulação e o saque cai no defensor', async () => {
    const { server, db } = setup();
    await server.bootstrap('a', { name: 'Ana' });
    await server.bootstrap('b', { name: 'Beto' });
    const b = (await db.load('b'))!;
    b.save.raids.beginnerUntil = 0;
    b.save.currencies.coins = 5000;
    await db.store('b', b, b.version);
    const a = (await db.load('a'))!;
    makeStrong(a.save);
    await db.store('a', a, a.version);
    const mm = await server.matchmaking('a', {});
    const target = mm.targets.find((t) => t.isPlayer)!;
    const start = await server.startBattle('a', { kind: 'raid', targetKey: target.key });
    const meNow = (await db.load('a'))!.save;
    const { commands, hash } = winningCommands(meNow, start.target, start.seed);
    const atRisk = coinsAtRisk((await db.load('b'))!.save);
    const res = await server.validateBattle('a', { commands, hash });
    expect(res.desync).toBe(false);
    expect(res.result.coreDestroyed).toBe(true);
    expect(res.rewards.won).toBe(true);
    expect(db.battles).toHaveLength(1);
    // defensor saqueado
    const def = (await db.load('b'))!.save;
    expect(def.currencies.coins).toBe(5000 - atRisk);
    expect(def.raids.pendingChoice).not.toBeNull();
    expect(def.raids.shieldUntil).toBeGreaterThan(T0);
    expect(def.raids.revenge[0].raiderId).toBe('a');
    expect(def.raids.log[0].won).toBe(false);
    // a mesma batalha não vale duas vezes
    await expect(server.validateBattle('a', { commands, hash })).rejects.toThrow(/Nenhuma batalha/);
    // vingança: Beto ataca a cidade REAL da Ana
    const rv = await server.startBattle('b', { kind: 'revenge', revengeId: def.raids.revenge[0].id });
    expect(rv.target.ownerName).toBe('Ana');
  });

  it('o resultado do servidor manda: hash falso não vira vitória', async () => {
    const { server } = setup();
    await server.bootstrap('a', { name: 'Ana' });
    const mm = await server.matchmaking('a', {});
    await server.startBattle('a', { kind: 'raid', targetKey: mm.targets[0].key });
    const res = await server.validateBattle('a', { commands: [], hash: 12345 });
    expect(res.desync).toBe(true);
    expect(res.rewards.won).toBe(false);
  });

  it('progresso importado do aparelho é limitado ao plausível', () => {
    const raw = newGame('Trapaça', T0);
    raw.currencies.coins = 99_999_999;
    raw.currencies.diamonds = 1_000_000;
    raw.collection[999_999] = { level: 99, xp: 0, stars: 9, fragments: 0, obtainedAt: 0, copies: 1 };
    raw.collection[1].level = 500;
    raw.city.buildings.push({ id: 'x', type: 'cannon', level: 1, x: raw.city.buildings[0].x, z: raw.city.buildings[0].z, rot: 0 });
    const s = sanitizeImportedSave(raw, T0);
    expect(s.currencies.coins).toBeLessThanOrEqual(23_000);
    expect(s.currencies.diamonds).toBeLessThanOrEqual(85);
    expect(s.collection[999_999]).toBeUndefined();
    expect(s.collection[1].level).toBeLessThanOrEqual(30);
    // cidade com construções sobrepostas volta para a inicial
    expect(s.city.buildings.some((b) => b.id === 'x')).toBe(false);
  });

  it('controle de versão: gravação concorrente é recusada', async () => {
    const db = new MemoryDb();
    const st = { save: newGame('A', T0), version: 1, targets: [], activeBattle: null };
    await db.store('a', st, null);
    await expect(db.store('a', st, null)).rejects.toBeInstanceOf(ConflictError);
    await expect(db.store('a', { ...st, version: 2 }, 7)).rejects.toBeInstanceOf(ConflictError);
  });
});
