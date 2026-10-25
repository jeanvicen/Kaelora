import { raidSetupFor, type EventRules } from '../content/battleSetup.ts';
import { generateBotCity, suggestedBotLevel, type BotCity } from '../content/botCity.ts';
import { findCharacter } from '../content/catalog.ts';
import { ELEMENTS } from '../content/classes.ts';
import { squadPower } from '../content/squad.ts';
import { CLAIMS, CLIENT_ACTIONS, runAction, type ActionArgs, type ActionName, type ClaimKind } from '../meta/actions.ts';
import { battleSquad } from '../content/eventSquad.ts';
import { trainingTarget } from '../content/training.ts';
import { finishResearch } from '../meta/research.ts';
import { currentEvent, eventTarget, rollover } from '../meta/retention.ts';
import { BUILDINGS, canPlace, coreLevel, maxLevel } from '../meta/buildings.ts';
import { finishUpgrades } from '../meta/city.ts';
import { openChest } from '../meta/chests.ts';
import { applyRaidOnPlayer, canBeRaided, coinsAtRisk, processOfflineRaids, replayCommands } from '../meta/defense.ts';
import { ECONOMY } from '../meta/economy.ts';
import { STARTER_SQUAD, migrateSave, newGame, starterCity } from '../meta/newGame.ts';
import { applyBattleResult, MAX_CHESTS, refreshCost, type BattleContext } from '../meta/raids.ts';
import { metaRng } from '../meta/rng.ts';
import type { DefenseLogEntry, Element, PlacedBuilding, SaveData } from '../meta/types.ts';
import { runBattle } from '../sim/battle.ts';
import { encodeReplay } from '../sim/replay.ts';
import { hashString } from '../sim/rng.ts';
import type { Team, TimedCommand } from '../sim/types.ts';
import { duelProfileOf, duelSetupFrom, type DuelStart } from '../content/duelSetup.ts';
import { ConflictError, GameError, type ActiveBattle, type DuelRecord, type ServerDb, type StoredState, type TargetRef } from './types.ts';

const HOUR = 3_600_000;
const TARGETS_TTL = 6 * HOUR;
const BATTLE_MAX_AGE = 20 * 60_000;
const STATE_VERSION = 1;
const CLOCK_SKEW = 5000;
const CHEST_TYPES = new Set(['madeira', 'prata', 'ouro', 'magico', 'extremo']);

/** Cópia do save para o cliente: sem a semente secreta do RNG. */
export function toClient(save: SaveData): SaveData {
  const copy = structuredClone(save);
  copy.rng = { seed: 0, counter: save.rng.counter };
  return copy;
}

/** Argumentos vindos da rede: só números finitos e textos curtos. */
function checkArgs(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new GameError('Argumentos inválidos');
  const walk = (v: unknown, depth: number): void => {
    if (depth > 3) throw new GameError('Argumentos inválidos');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new GameError('Número inválido');
    if (typeof v === 'string' && v.length > 64) throw new GameError('Texto longo demais');
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(args, 0);
  for (const k of ['x', 'z', 'rot', 'slot', 'id', 'pct'])
    if (k in (args as Record<string, unknown>) && typeof (args as Record<string, unknown>)[k] === 'number' && !Number.isInteger((args as Record<string, unknown>)[k])) throw new GameError('Número inválido');
  return args as Record<string, unknown>;
}

/**
 * Servidor autoritativo do Kaelora. Toda moeda, diamante, baú e resultado é
 * decidido aqui (as Edge Functions só repassam a requisição). Usa as MESMAS
 * funções puras do cliente (src/meta, src/sim), então cliente e servidor
 * concordam em tudo que é determinístico.
 */
export class GameServer {
  constructor(
    private db: ServerDb,
    private clock: () => number = () => Date.now(),
  ) {}

  /** Carrega, altera e grava com controle de versão (tenta de novo em conflito). */
  private async withState<T>(userId: string, fn: (st: StoredState, now: number) => T): Promise<{ st: StoredState; out: T }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = await this.db.load(userId);
      if (!st) throw new GameError('Jogador não encontrado', 404);
      const prev = st.version;
      const now = this.clock();
      // melhorias que já acabaram terminam aqui (tolerância de relógio do aparelho)
      finishUpgrades(st.save, now + CLOCK_SKEW);
      finishResearch(st.save, now + CLOCK_SKEW);
      // virada de dia/semana/temporada (missões, login, liga, evento, passe)
      rollover(st.save, now);
      const out = fn(st, now);
      st.version = prev + 1;
      try {
        await this.db.store(userId, st, prev);
        return { st, out };
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
      }
    }
    throw new GameError('Servidor ocupado, tente de novo', 409);
  }

  // ---------------------------------------------------------------- conta

  /**
   * Entrada do jogador: cria o estado na primeira vez (ou importa o progresso
   * do aparelho, com limites), processa invasões pendentes e devolve o save.
   */
  async bootstrap(userId: string, p: { name?: string; element?: Element; localSave?: SaveData } = {}) {
    const existing = await this.db.load(userId);
    if (!existing) {
      const now = this.clock();
      let save: SaveData;
      let imported = false;
      if (p.localSave) {
        save = sanitizeImportedSave(p.localSave, now);
        imported = true;
      } else {
        save = newGame((p.name ?? 'Jogador').slice(0, 16), now);
        if (p.element && ELEMENTS.includes(p.element)) save.city.element = p.element;
      }
      save.profile.id = userId;
      save.rng = { seed: this.db.randomSeed(), counter: 0 };
      const st: StoredState = { save, version: STATE_VERSION, targets: [], activeBattle: null, importedAt: imported ? now : undefined };
      await this.db.store(userId, st, null);
      return { save: toClient(save), created: true, imported, defenses: [] as DefenseLogEntry[] };
    }
    const { st, out } = await this.withState(userId, (s, now) => processOfflineRaids(s.save, now));
    return { save: toClient(st.save), created: false, imported: false, defenses: out };
  }

  /** Estado atual + invasões que aconteceram enquanto o jogador estava fora. */
  async sync(userId: string) {
    const { st, out } = await this.withState(userId, (s, now) => processOfflineRaids(s.save, now));
    return { save: toClient(st.save), defenses: out };
  }

  // ---------------------------------------------------------------- ações

  /** Ações genéricas (cidade, coleção, preferências) — `game-action`. */
  async action<K extends ActionName>(userId: string, name: K, rawArgs: unknown) {
    if (!CLIENT_ACTIONS.has(name)) throw new GameError(`Ação não permitida: ${String(name)}`, 403);
    const args = checkArgs(rawArgs) as ActionArgs<K>;
    const { st, out } = await this.withState(userId, (s, now) => runAction(s.save, name, args, { now }));
    return { result: out, save: toClient(st.save) };
  }

  /** Abre um baú (`open-chest`): o sorteio usa a semente secreta do servidor. */
  async openChest(userId: string, rawArgs: unknown) {
    const { uid } = checkArgs(rawArgs) as { uid?: string };
    if (typeof uid !== 'string') throw new GameError('Baú inválido');
    const { st, out } = await this.withState(userId, (s, now) => openChest(s.save, uid, now));
    return { result: out, save: toClient(st.save) };
  }

  /** Recompensas (`claim-reward`): álbum, missões, login, baú grátis, liga, passe, evento. */
  async claimReward(userId: string, rawArgs: unknown) {
    const { kind, ...args } = checkArgs(rawArgs) as { kind?: string } & Record<string, unknown>;
    const action = CLAIMS[kind as ClaimKind];
    if (!action) throw new GameError('Recompensa desconhecida');
    const { st, out } = await this.withState(userId, (s, now) => runAction(s.save, action, args as never, { now }));
    return { result: out, save: toClient(st.save) };
  }

  // ---------------------------------------------------------------- invasões

  /**
   * Matchmaking (`matchmaking`): cidades de jogadores reais com troféus
   * parecidos (que não estão protegidos), completadas com rivais-bot.
   */
  async matchmaking(userId: string, rawArgs: unknown) {
    const { force } = checkArgs(rawArgs) as { force?: boolean };
    const me = await this.db.load(userId);
    if (!me) throw new GameError('Jogador não encontrado', 404);
    const now = this.clock();
    const fresh = !force && me.targets.length >= 3 && now - me.save.targets.refreshedAt < TARGETS_TTL;
    if (fresh) return { targets: me.targets.map(publicTarget), save: toClient(me.save) };
    const others = await this.db.candidates(userId, { trophies: me.save.profile.trophies, now, limit: 8 });
    const { st } = await this.withState(userId, (s, t) => {
      if (force) {
        const cost = refreshCost(s.save);
        if (s.save.currencies.coins < cost) throw new GameError('Moedas insuficientes');
        s.save.currencies.coins -= cost;
      }
      const targets: TargetRef[] = [];
      const rng = metaRng(s.save);
      for (const o of rng.shuffle(others)) {
        if (targets.length >= 2) break;
        if (!canBeRaided(o.state.save, t)) continue;
        targets.push({ key: `p:${o.userId}`, ownerId: o.userId, city: playerCity(o.userId, o.state.save) });
      }
      const core = coreLevel(s.save.city);
      while (targets.length < 3) {
        const seed = rng.nextU32();
        const lvl = s.save.stats.battles < 3 ? 1 : Math.max(1, Math.min(10, suggestedBotLevel(s.save.profile.trophies, core, rng) + (targets.length - 1)));
        targets.push({ key: `b:${seed}`, ownerId: null, city: generateBotCity(seed, lvl) });
      }
      s.targets = targets;
      s.save.targets = { seeds: targets.map((x) => x.city.seed), refreshedAt: t };
      return targets;
    });
    return { targets: st.targets.map(publicTarget), save: toClient(st.save) };
  }

  /** Começa uma batalha: o servidor sorteia a semente e guarda a fotografia do alvo. */
  async startBattle(userId: string, rawArgs: unknown) {
    const a = checkArgs(rawArgs) as { kind?: BattleContext; targetKey?: string; revengeId?: string; difficulty?: string };
    const kind: BattleContext = a.kind === 'revenge' ? 'revenge' : a.kind === 'event' ? 'event' : a.kind === 'training' ? 'training' : 'raid';
    // vingança contra jogador real: carrega a cidade atual dele
    let revengeCity: { city: BotCity; ownerId: string | null } | null = null;
    if (kind === 'revenge') {
      const me = await this.db.load(userId);
      const e = me?.save.raids.revenge.find((x) => x.id === a.revengeId);
      if (!me || !e || e.done || e.expiresAt <= this.clock()) throw new GameError('Vingança indisponível');
      if (e.raiderId) {
        const other = await this.db.load(e.raiderId);
        if (other) revengeCity = { city: playerCity(e.raiderId, other.save), ownerId: e.raiderId };
      }
      if (!revengeCity) revengeCity = { city: { ...generateBotCity(e.raiderSeed, e.raiderLevel ?? coreLevel(me.save.city)), ownerName: e.raiderName }, ownerId: null };
    }
    const { st } = await this.withState(userId, (s, now) => {
      let target: BotCity;
      let ownerId: string | null = null;
      let event: EventRules | undefined;
      if (kind === 'event') {
        target = eventTarget(s.save, now);
        event = currentEvent(now).rules;
      } else if (kind === 'training') {
        target = trainingTarget(s.save, String(a.difficulty ?? 'normal'), metaRng(s.save).nextU32());
      } else if (kind === 'revenge') {
        target = revengeCity!.city;
        ownerId = revengeCity!.ownerId;
      } else {
        const t = s.targets.find((x) => x.key === a.targetKey);
        if (!t) throw new GameError('Alvo não encontrado — procure de novo');
        target = t.city;
        ownerId = t.ownerId;
      }
      const ab: ActiveBattle = { seed: metaRng(s.save).nextU32(), kind, target, targetKey: a.targetKey, ownerId, revengeId: a.revengeId, event, startedAt: now };
      s.activeBattle = ab;
      return ab;
    });
    const ab = st.activeBattle!;
    return { seed: ab.seed, target: ab.target, kind: ab.kind, event: ab.event ?? null, save: toClient(st.save) };
  }

  /**
   * Valida a batalha (`validate-battle`): re-simula com a semente e as
   * jogadas do cliente. O resultado do SERVIDOR é o que vale.
   */
  async validateBattle(userId: string, rawArgs: unknown) {
    const body = rawArgs as { commands?: unknown; hash?: unknown };
    const commands = sanitizeCommands(body?.commands);
    const clientHash = typeof body?.hash === 'number' ? body.hash : 0;
    let defenderRaid: { ownerId: string; entry: Parameters<typeof applyRaidOnPlayer>[1] } | null = null;
    let record: Parameters<ServerDb['recordBattle']>[0] | null = null;
    const { st, out } = await this.withState(userId, (s, now) => {
      const ab = s.activeBattle;
      if (!ab) throw new GameError('Nenhuma batalha em andamento');
      if (now - ab.startedAt > BATTLE_MAX_AGE) {
        s.activeBattle = null;
        throw new GameError('Batalha expirada');
      }
      const setup = raidSetupFor(s.save, ab.target, ab.seed, ab.event);
      const { sim, result } = runBattle(setup, commands);
      const squad = battleSquad(s.save, ab.event?.element).ids;
      const rewards = applyBattleResult(s.save, { kind: ab.kind, target: ab.target, result, squad, now, revengeId: ab.revengeId });
      if (ab.kind === 'raid' && ab.targetKey) s.targets = s.targets.filter((x) => x.key !== ab.targetKey);
      if (s.save.progression.tutorialStep < 3) s.save.progression.tutorialStep++;
      s.activeBattle = null;
      const cmds = replayCommands(setup, sim.log);
      record = { id: `${userId}:${now}`, attackerId: userId, defenderId: ab.ownerId, kind: ab.kind, seed: ab.seed, setup, commands: cmds, result, clientHash, at: now };
      if (ab.ownerId) {
        const replay = encodeReplay({ setup, commands: cmds, hash: result.hash, meta: { attacker: s.save.profile.name, defender: ab.target.ownerName, at: now } });
        defenderRaid = {
          ownerId: ab.ownerId,
          entry: { attackerName: s.save.profile.name, attackerSeed: hashString(userId), attackerPower: squadPower(s.save.squad, s.save.collection), attackerLevel: coreLevel(s.save.city), attackerId: userId, result, replay, at: now },
        };
      }
      return { result, rewards, desync: result.hash !== clientHash };
    });
    if (record) await this.db.recordBattle(record);
    // o saque cai na cidade do defensor (com o que ele tem AGORA)
    const dr = defenderRaid as { ownerId: string; entry: Parameters<typeof applyRaidOnPlayer>[1] } | null;
    if (dr) await this.withState(dr.ownerId, (s) => applyRaidOnPlayer(s.save, dr.entry)).catch(() => undefined);
    return { ...out, save: toClient(st.save) };
  }

  /**
   * Duelo ao vivo (`duel-submit`): cada jogador manda o combinado e as jogadas
   * dos dois lados. Quando os dois enviaram e as jogadas batem, o servidor
   * re-simula e aplica o resultado de cada um. Se não baterem, ninguém ganha.
   */
  async submitDuel(userId: string, raw: unknown) {
    const body = raw as { start?: DuelStart; commands?: unknown; hash?: unknown };
    const start = body?.start;
    if (!start || typeof start.matchId !== 'string' || start.matchId.length > 80 || !start.host || !start.guest) throw new GameError('Duelo inválido');
    const team: Team | null = start.host.id === userId ? 0 : start.guest.id === userId ? 1 : null;
    if (team === null) throw new GameError('Você não está neste duelo', 403);
    if (start.host.id === start.guest.id) throw new GameError('Duelo inválido');
    // o esquadrão declarado tem que ser o mesmo que o servidor conhece
    const me = await this.db.load(userId);
    if (!me) throw new GameError('Jogador não encontrado', 404);
    const mine = team === 0 ? start.host : start.guest;
    const real = duelProfileOf(me.save, userId);
    const same = JSON.stringify(real.squad) === JSON.stringify(mine.squad) && real.squad.every((id) => real.levels[id].level === mine.levels?.[id]?.level && real.levels[id].stars === mine.levels?.[id]?.stars);
    if (!same) throw new GameError('Seu esquadrão não confere com o servidor');
    const commands = sanitizeCommands(body.commands, true);
    const hash = typeof body.hash === 'number' ? body.hash : 0;
    const now = this.clock();
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await this.db.loadDuel(start.matchId);
      if (cur?.resolved) return { status: 'resolved' as const, outcome: cur.outcome?.[userId] ?? null };
      const rec: DuelRecord = cur ?? { matchId: start.matchId, start, submissions: {}, resolved: false, version: 0 };
      if (JSON.stringify(rec.start) !== JSON.stringify(start)) throw new GameError('Combinado do duelo diferente do adversário');
      rec.submissions[userId] = { commands, hash, at: now };
      const ids = [start.host.id, start.guest.id];
      const both = ids.every((id) => rec.submissions[id]);
      const prev = cur ? cur.version : null;
      rec.resolved = both;
      rec.version = (prev ?? 0) + 1;
      try {
        // grava ANTES de pagar: um envio concorrente nunca resolve duas vezes
        await this.db.storeDuel(rec, prev);
      } catch (e) {
        if (e instanceof ConflictError) continue;
        throw e;
      }
      if (!both) return { status: 'waiting' as const, outcome: null };
      const outcome = await this.resolveDuel(rec);
      // guarda o resultado de cada um (para quem perguntar depois)
      for (let k = 0; k < 4; k++) {
        const latest = await this.db.loadDuel(start.matchId);
        if (!latest) break;
        latest.outcome = outcome;
        const v = latest.version;
        latest.version = v + 1;
        try {
          await this.db.storeDuel(latest, v);
          break;
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
        }
      }
      return { status: 'resolved' as const, outcome: outcome[userId] ?? null };
    }
    throw new GameError('Servidor ocupado, tente de novo', 409);
  }

  private async resolveDuel(rec: DuelRecord): Promise<NonNullable<DuelRecord['outcome']>> {
    const start = rec.start;
    const ids = [start.host.id, start.guest.id];
    const outcome: NonNullable<DuelRecord['outcome']> = {};
    const [ha, hb] = ids.map((id) => rec.submissions[id]);
    if (JSON.stringify(ha.commands) !== JSON.stringify(hb.commands)) {
      for (const id of ids) outcome[id] = { error: 'As jogadas dos dois aparelhos não batem' };
      return outcome;
    }
    const { sim } = runBattle(duelSetupFrom(start), ha.commands);
    for (const [t, id] of [[0, start.host.id] as const, [1, start.guest.id] as const]) {
      const result = sim.resultFor(t)!;
      const o = t === 0 ? start.guest : start.host;
      const { out } = await this.withState(id, (s, n) => applyBattleResult(s.save, { kind: 'duel', target: { loot: 0, coreLevel: o.coreLevel, trophies: o.trophies }, result, squad: [...s.save.squad], now: n }));
      outcome[id] = { rewards: out, won: result.winner === 0 };
    }
    return outcome;
  }

  /** Invasões pendentes e a escolha da cidade saqueada (`apply-raid`). */
  async applyRaid(userId: string, rawArgs: unknown) {
    const a = checkArgs(rawArgs) as { choice?: 'rebuild' | 'retake' };
    const { st, out } = await this.withState(userId, (s, now) => {
      const defenses = processOfflineRaids(s.save, now);
      const choice = a.choice === 'rebuild' || a.choice === 'retake' ? runAction(s.save, 'raidChoice', { choice: a.choice }, { now }) : null;
      return { defenses, choice };
    });
    return { ...out, save: toClient(st.save) };
  }
}

/** O que o cliente vê de um alvo (sem dados internos de outros jogadores). */
function publicTarget(t: TargetRef) {
  return { key: t.key, isPlayer: !!t.ownerId, city: t.city };
}

/** Fotografia da cidade de um jogador real para ser invadida. */
export function playerCity(userId: string, save: SaveData): BotCity {
  return {
    seed: hashString(userId),
    name: save.city.name,
    ownerName: save.profile.name,
    element: save.city.element,
    coreLevel: coreLevel(save.city),
    trophies: save.profile.trophies,
    buildings: save.city.buildings.filter((b) => !b.ruined).map((b) => ({ ...b, upgradeEndsAt: undefined })),
    research: { ...save.city.research },
    squad: [...save.squad],
    squadLevels: Object.fromEntries(save.squad.map((id) => [id, { level: save.collection[id]?.level ?? 1, stars: save.collection[id]?.stars ?? 1 }])),
    loot: coinsAtRisk(save),
  };
}

function sanitizeCommands(raw: unknown, bothTeams = false): TimedCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: TimedCommand[] = [];
  for (const c of raw.slice(0, 2000)) {
    if (!c || typeof c !== 'object') continue;
    const tick = Number((c as TimedCommand).tick);
    const cmd = (c as TimedCommand).cmd as { t?: string; slot?: number };
    if (!Number.isInteger(tick) || tick < 0 || tick > 30 * 60 * 10 || !cmd || typeof cmd.t !== 'string') continue;
    // invasão: o cliente só joga pelo time 0 (atacante); duelo: os dois times
    const team: Team = bothTeams && (c as TimedCommand).team === 1 ? 1 : 0;
    if (cmd.t === 'deploy' || cmd.t === 'ability') {
      if (!Number.isInteger(cmd.slot) || cmd.slot! < 0 || cmd.slot! > 4) continue;
      out.push({ tick, team, cmd: { t: cmd.t, slot: cmd.slot! } as TimedCommand['cmd'] });
    } else if (cmd.t === 'ultimate' || cmd.t === 'surrender') out.push({ tick, team, cmd: { t: cmd.t } as TimedCommand['cmd'] });
  }
  // ordem estável: tick, depois time 0 antes do 1 (igual ao lockstep)
  return out.map((c, i) => ({ c, i })).sort((a, b) => a.c.tick - b.c.tick || a.c.team - b.c.team || a.i - b.i).map((x) => x.c);
}

/**
 * Progresso trazido do aparelho na primeira entrada online. Como o save local
 * pode ter sido editado, tudo é conferido e limitado ao que é plausível.
 */
export function sanitizeImportedSave(raw: SaveData, now: number): SaveData {
  const base = newGame(String(raw?.profile?.name ?? 'Jogador').slice(0, 16), now);
  let s: SaveData;
  try {
    s = migrateSave(structuredClone(raw));
  } catch {
    return base;
  }
  const lvl = clampInt(s.profile?.accountLevel, 1, ECONOMY.account.maxLevel, 1);
  const out = base;
  out.profile.accountLevel = lvl;
  out.profile.accountXp = clampInt(s.profile?.accountXp, 0, 20_000, 0);
  out.profile.trophies = clampInt(s.profile?.trophies, 0, 300 + lvl * 120, 0);
  out.profile.bestTrophies = Math.max(out.profile.trophies, clampInt(s.profile?.bestTrophies, 0, 300 + lvl * 120, 0));
  out.currencies.coins = clampInt(s.currencies?.coins, 0, 20_000 + lvl * 3_000, base.currencies.coins);
  out.currencies.diamonds = clampInt(s.currencies?.diamonds, 0, 60 + lvl * 25, base.currencies.diamonds);
  // coleção: só personagens que existem, com nível/estrelas dentro dos limites
  const col: SaveData['collection'] = {};
  for (const [k, v] of Object.entries(s.collection ?? {})) {
    const id = Number(k);
    if (!findCharacter(id) || !v) continue;
    col[id] = {
      level: clampInt(v.level, 1, ECONOMY.characters.maxLevel, 1),
      xp: clampInt(v.xp, 0, 5000, 0),
      stars: clampInt(v.stars, 1, 5, 1),
      fragments: clampInt(v.fragments, 0, 2000, 0),
      obtainedAt: now,
      copies: clampInt(v.copies, 1, 500, 1),
    };
  }
  for (const id of STARTER_SQUAD) col[id] ??= base.collection[id];
  out.collection = col;
  const squad = Array.isArray(s.squad) ? s.squad.map(Number) : [];
  out.squad = squad.length === 5 && new Set(squad).size === 5 && squad.every((id) => col[id]) ? squad : [...STARTER_SQUAD];
  // cidade: tipos e níveis válidos, sem sobreposição; senão, cidade inicial
  const city = s.city;
  if (city && Array.isArray(city.buildings) && validCity(city.buildings)) {
    out.city.buildings = city.buildings.map((b) => ({ id: String(b.id).slice(0, 40), type: b.type, level: b.level, x: b.x, z: b.z, rot: b.rot, lastCollectAt: now }));
    out.city.element = ELEMENTS.includes(city.element) ? city.element : out.city.element;
    out.city.name = String(city.name ?? out.city.name).slice(0, 24);
  } else out.city.buildings = starterCity(now);
  out.chests.inventory = (s.chests?.inventory ?? []).filter((c) => CHEST_TYPES.has(c?.type)).slice(0, MAX_CHESTS).map((c, i) => ({ uid: `imp${i}`, type: c.type, source: 'Trazido do aparelho', receivedAt: now }));
  out.settings = { ...out.settings, ...(s.settings ?? {}) };
  out.progression.tutorialStep = clampInt(s.progression?.tutorialStep, 0, 3, 0);
  out.stats = { ...out.stats, ...(s.stats ?? {}) };
  return out;
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function validCity(list: PlacedBuilding[]): boolean {
  if (list.length > 200) return false;
  const placed: PlacedBuilding[] = [];
  let cores = 0;
  for (const b of list) {
    if (!b || !(b.type in BUILDINGS)) return false;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.z) || !Number.isInteger(b.rot) || !Number.isInteger(b.level)) return false;
    if (b.level < 1 || b.level > maxLevel(b.type)) return false;
    if (b.type === 'core') cores++;
    placed.push(b);
  }
  if (cores !== 1) return false;
  const core = placed.find((b) => b.type === 'core')!;
  const city = { element: 'mare' as Element, buildings: [] as PlacedBuilding[], storage: [], research: {}, name: '' };
  city.buildings.push(core);
  for (const b of placed) {
    if (b === core) continue;
    if (!canPlace(city, b.type, b.x, b.z, b.rot)) return false;
    city.buildings.push(b);
  }
  return true;
}
