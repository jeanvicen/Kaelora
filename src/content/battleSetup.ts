import economyJson from '../data/economy.json';
import { BUILDINGS, distanceToEntrance, gridSizeForCore, levelStats } from '../meta/buildings.ts';
import type { Element, PlacedBuilding, SaveData } from '../meta/types.ts';
import { TICK_RATE, TILE, type BattleSetup, type StructureKind, type StructureSpec, type TeamSetup, type UnitSpec } from '../sim/types.ts';
import type { BotCity } from './botCity.ts';
import { buildSquad, researchValue } from './squad.ts';

const BATTLE = (economyJson as unknown as {
  battle: { durationSec: number; frenzySec: number; energyMax: number; energyStart: number; energyRegenSec: number; ultimateChargeFactor: number };
}).battle;

export const SETUP_VERSION = 1;

/** Regras especiais de evento (ex.: Núcleo com o dobro de vida). */
export interface EventRules {
  coreHpPct?: number;
  towerDmgPct?: number;
  energyRegenPct?: number;
  durationSec?: number;
  attackerHpPct?: number;
}

export interface CityLayout {
  buildings: PlacedBuilding[];
  element: Element;
}

const RADIUS: Partial<Record<StructureKind, number>> = { core: 1400, barrier: 500, trap: 400, barracks: 1300, lab: 1300 };
const radiusOf = (k: StructureKind) => RADIUS[k] ?? (k === 'generator' || k === 'vault' ? 1000 : 900);

function structureFor(b: PlacedBuilding, research: Record<string, number> | undefined, ev: EventRules): StructureSpec {
  const def = BUILDINGS[b.type];
  const st = levelStats(b.type, b.level);
  const kind = b.type as StructureKind;
  let hp = st.hp;
  let dmg = st.dmg ?? 0;
  if (kind === 'core') hp = Math.round((hp * (100 + researchValue(research, 'vida_nucleo') + (ev.coreHpPct ?? 0))) / 100);
  if (def.battle.role === 'tower' || kind === 'core') dmg = Math.round((dmg * (100 + researchValue(research, 'dano_torres') + (ev.towerDmgPct ?? 0))) / 100);
  const tower = def.battle.role === 'tower' || kind === 'core';
  return {
    kind,
    x: 0,
    hp: Math.max(1, hp),
    dmg,
    atkInterval: tower ? Math.max(6, Math.round((st.interval ?? 1) * TICK_RATE)) : 0,
    range: Math.round((st.range ?? 0) * TILE),
    minRange: Math.round((def.battle.minRange ?? 0) * TILE),
    splash: Math.round((def.battle.splash ?? 0) * TILE),
    slow: st.slow ?? 0,
    slowTicks: Math.round((def.battle.slowDuration ?? 0) * TICK_RATE),
    chain: st.chain ?? 0,
    chainFalloff: def.battle.chainFalloff ?? 0,
    stunTicks: Math.round((def.battle.stun ?? 0) * TICK_RATE),
    level: b.level,
    refIds: [b.id],
    weight: 1,
  };
}

/**
 * O layout salvo é a defesa: cada construção vai para a estrada na ordem da
 * distância até a entrada da cidade, mantendo os agrupamentos. Barreiras
 * vizinhas viram uma muralha só. O Núcleo fica sempre no fim.
 */
export function cityToRoad(city: CityLayout, research?: Record<string, number>, ev: EventRules = {}): { structures: StructureSpec[]; roadLength: number } {
  const coreB = city.buildings.find((b) => b.type === 'core');
  const size = gridSizeForCore(coreB?.level ?? 1);
  const items: { d: number; spec: StructureSpec }[] = [];
  const barriers: { d: number; b: PlacedBuilding }[] = [];
  for (const b of city.buildings) {
    if (b.ruined || BUILDINGS[b.type].battle.role === 'none') continue;
    const d = distanceToEntrance(b, size);
    if (b.type === 'barrier') barriers.push({ d, b });
    else if (b.type !== 'core') items.push({ d, spec: structureFor(b, research, ev) });
  }
  // muralhas: barreiras com distâncias parecidas formam um trecho só
  barriers.sort((a, b) => a.d - b.d);
  const wallBoost = 100 + researchValue(research, 'vida_barreiras');
  let cluster: { d: number; b: PlacedBuilding }[] = [];
  const flush = () => {
    if (!cluster.length) return;
    const hp = cluster.reduce((s, c) => s + levelStats('barrier', c.b.level).hp, 0);
    const lvl = Math.max(...cluster.map((c) => c.b.level));
    const spec = structureFor(cluster[0].b, research, ev);
    spec.hp = Math.max(1, Math.round((hp * 0.6 * wallBoost) / 100));
    spec.level = lvl;
    spec.refIds = cluster.map((c) => c.b.id);
    spec.weight = 0;
    items.push({ d: cluster.reduce((s, c) => s + c.d, 0) / cluster.length, spec });
    cluster = [];
  };
  for (const c of barriers) {
    if (cluster.length && c.d - cluster[cluster.length - 1].d > 1.6) flush();
    cluster.push(c);
  }
  flush();

  items.sort((a, b) => a.d - b.d || a.spec.refIds[0].localeCompare(b.spec.refIds[0]));
  const START = 14000;
  const n = items.length;
  let roadLength = Math.max(56000, START + 9000 + n * 2700);
  const dmin = n ? items[0].d : 0;
  const dmax = n ? items[n - 1].d : 1;
  const span = roadLength - START - 9000;
  let prev: StructureSpec | null = null;
  for (const it of items) {
    const t = dmax > dmin ? (it.d - dmin) / (dmax - dmin) : 0;
    let x = Math.round(START + t * span);
    if (prev) x = Math.max(x, prev.x + radiusOf(prev.kind) + radiusOf(it.spec.kind) + 500);
    it.spec.x = x;
    prev = it.spec;
  }
  const structures = items.map((i) => i.spec);
  if (coreB) {
    const core = structureFor(coreB, research, ev);
    core.x = Math.max(roadLength - 3500, (prev ? prev.x + radiusOf(prev.kind) : START) + 1400 + 2500);
    roadLength = Math.max(roadLength, core.x + 3500);
    structures.push(core);
  }
  return { structures, roadLength };
}

function rules(ev: EventRules) {
  return {
    durationTicks: Math.round((ev.durationSec ?? BATTLE.durationSec) * TICK_RATE),
    frenzyTicks: Math.round(BATTLE.frenzySec * TICK_RATE),
    energyMax: BATTLE.energyMax,
    energyRegenTicks: Math.round(BATTLE.energyRegenSec * TICK_RATE),
  };
}

function ultimateFor(squad: UnitSpec[], enemies: StructureSpec[], research?: Record<string, number>) {
  const total = enemies.reduce((s, e) => s + (e.kind === 'trap' ? 0 : e.hp), 0);
  const counted = enemies.filter((e) => e.kind !== 'trap').length || 1;
  const charge = Math.max(500, Math.round(total * BATTLE.ultimateChargeFactor * (1 - researchValue(research, 'carga_ultimate') / 100)));
  const dmgSum = squad.reduce((s, u) => s + u.dmg, 0);
  const damage = Math.round(dmgSum * 1.8 + (total / counted) * 0.12);
  return { charge, damage };
}

export interface RaidSides {
  seed: number;
  attacker: { name: string; element: Element; squad: UnitSpec[]; research?: Record<string, number>; bot?: { skill: number } | null };
  defender: { name: string; city: CityLayout; research?: Record<string, number> };
  event?: EventRules;
}

/** Monta uma Invasão: atacante (esquerda) contra a cidade do defensor (direita). */
export function buildRaidSetup(p: RaidSides): BattleSetup {
  const ev = p.event ?? {};
  const road = cityToRoad(p.defender.city, p.defender.research, ev);
  const attacker: TeamSetup = {
    name: p.attacker.name,
    element: p.attacker.element,
    squad: p.attacker.squad,
    structures: [],
    energyStart: BATTLE.energyStart + researchValue(p.attacker.research, 'energia_inicial'),
    energyRegen: 100 + researchValue(p.attacker.research, 'recarga_energia') + (ev.energyRegenPct ?? 0),
    ultimate: ultimateFor(p.attacker.squad, road.structures, p.attacker.research),
    bot: p.attacker.bot ?? null,
  };
  const defender: TeamSetup = {
    name: p.defender.name,
    element: p.defender.city.element,
    squad: [],
    structures: road.structures,
    energyStart: 0,
    energyRegen: 100,
    ultimate: { charge: 1, damage: 0 },
    bot: null,
  };
  return { version: SETUP_VERSION, seed: p.seed >>> 0, mode: 'raid', roadLength: road.roadLength, rules: rules(ev), teams: [attacker, defender] };
}

/**
 * Arena simétrica do duelo ao vivo: cada lado tem Núcleo, duas torres e uma
 * muralha do mesmo nível (justo para os dois), e ataca o Núcleo do outro.
 */
export function buildDuelSetup(p: {
  seed: number;
  level: number;
  a: { name: string; element: Element; squad: UnitSpec[]; research?: Record<string, number>; bot?: { skill: number } | null };
  b: { name: string; element: Element; squad: UnitSpec[]; research?: Record<string, number>; bot?: { skill: number } | null };
}): BattleSetup {
  const L = 52000;
  const lvl = Math.max(1, Math.min(10, p.level));
  const mk = (type: PlacedBuilding['type'], x: number): StructureSpec => {
    const s = structureFor({ id: `duel-${type}-${x}`, type, level: lvl, x: 0, z: 0, rot: 0 }, undefined, {});
    s.x = x;
    return s;
  };
  const side = (team: 0 | 1): StructureSpec[] => {
    const m = (x: number) => (team === 0 ? x : L - x);
    const wall = mk('barrier', m(13500));
    wall.hp = Math.round(levelStats('barrier', lvl).hp * 2.2);
    wall.weight = 0;
    return [mk('core', m(2600)), mk('cannon', m(8500)), mk('laser', m(11000)), wall];
  };
  const sa = side(0);
  const sb = side(1);
  const team = (x: typeof p.a, own: StructureSpec[], enemy: StructureSpec[], spawnX: number): TeamSetup => ({
    name: x.name,
    element: x.element,
    squad: x.squad,
    structures: own,
    energyStart: BATTLE.energyStart + researchValue(x.research, 'energia_inicial'),
    energyRegen: 100 + researchValue(x.research, 'recarga_energia'),
    ultimate: ultimateFor(x.squad, enemy, x.research),
    bot: x.bot ?? null,
    spawnX,
  });
  return {
    version: SETUP_VERSION,
    seed: p.seed >>> 0,
    mode: 'duel',
    roadLength: L,
    rules: rules({}),
    teams: [team(p.a, sa, sb, 4800), team(p.b, sb, sa, L - 4800)],
  };
}

/**
 * Batalha de invasão a partir do save do atacante e da cidade-alvo. Cliente
 * e servidor montam EXATAMENTE a mesma configuração com esta função — é o
 * que permite o servidor re-simular a partida e validar o resultado.
 */
export function raidSetupFor(
  save: Pick<SaveData, 'profile' | 'city' | 'squad' | 'collection'>,
  target: Pick<BotCity, 'ownerName' | 'buildings' | 'element' | 'research'>,
  seed: number,
  event?: EventRules,
): BattleSetup {
  const { specs } = buildSquad(save.squad, save.collection, save.city.research, { eventHpPct: event?.attackerHpPct });
  return buildRaidSetup({
    seed,
    attacker: { name: save.profile.name, element: save.city.element, squad: specs, research: save.city.research },
    defender: { name: target.ownerName, city: { buildings: target.buildings, element: target.element }, research: target.research },
    event,
  });
}
