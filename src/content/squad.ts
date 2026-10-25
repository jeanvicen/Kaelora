import economyJson from '../data/economy.json';
import researchJson from '../data/research.json';
import type { ClassId, Element, OwnedCharacter } from '../meta/types.ts';
import { TICK_RATE, TILE, type AbilitySpec, type UnitSpec } from '../sim/types.ts';
import { getCharacter } from './catalog.ts';
import { CLASS_INFO, ELEMENT_INFO } from './classes.ts';
import type { CharacterDef } from './types.ts';

const CHAR_ECON = (economyJson as unknown as { characters: { statPerLevel: number; statPerStar: number } }).characters;

export interface ResearchDef {
  id: string;
  name: string;
  description: string;
  perLevel: number;
  unit: string;
  maxLevel: number;
  costs: number[];
  times: number[];
}
export const RESEARCH = (researchJson as unknown as { research: ResearchDef[] }).research;

/** Efeito total de uma pesquisa (nível × por nível). */
export function researchValue(research: Record<string, number> | undefined, id: string): number {
  const lvl = research?.[id] ?? 0;
  const def = RESEARCH.find((r) => r.id === id);
  return def ? lvl * def.perLevel : 0;
}

// ------------------------------------------------------------ sinergias

export interface ClassSynergy {
  text: string;
  hp?: number;
  dmg?: number;
  range?: number;
  crit?: number;
  power?: number;
  duration?: number;
  splash?: number;
}

export const CLASS_SYNERGY: Record<ClassId, ClassSynergy> = {
  tanque: { text: 'Tanques: +10% de vida', hp: 10 },
  lutador: { text: 'Lutadores: +8% de dano', dmg: 8 },
  atirador: { text: 'Atiradores: +10% de alcance', range: 10 },
  mago: { text: 'Magos: +10% de poder de habilidade', power: 10 },
  curandeiro: { text: 'Curandeiros: +15% de cura', power: 15 },
  invocador: { text: 'Invocadores: drones duram +20%', duration: 20 },
  assassino: { text: 'Assassinos: +8% de crítico', crit: 8 },
  construtor: { text: 'Construtores: torretas duram +20%', duration: 20 },
  sabotador: { text: 'Sabotadores: pane dura +25%', duration: 25 },
  controlador: { text: 'Controladores: estase dura +20%', duration: 20 },
  bombardeiro: { text: 'Bombardeiros: +15% de área', splash: 15 },
  suporte: { text: 'Suportes: grito dura +20%', duration: 20 },
};

export interface Synergy {
  kind: 'element' | 'class';
  key: string;
  text: string;
  count: number;
}

export const ELEMENT_SYNERGY_HP = 15;

/** Sinergias ativas de um esquadrão (para mostrar na montagem e aplicar na batalha). */
export function activeSynergies(defs: CharacterDef[]): Synergy[] {
  const out: Synergy[] = [];
  const byEl = new Map<Element, number>();
  const byCls = new Map<ClassId, number>();
  for (const d of defs) {
    byEl.set(d.element, (byEl.get(d.element) ?? 0) + 1);
    byCls.set(d.cls, (byCls.get(d.cls) ?? 0) + 1);
  }
  for (const [el, n] of byEl) if (n >= 3) out.push({ kind: 'element', key: el, count: n, text: `${n}× ${ELEMENT_INFO[el].name}: +${ELEMENT_SYNERGY_HP}% de vida para o esquadrão` });
  for (const [cls, n] of byCls) if (n >= 2) out.push({ kind: 'class', key: cls, count: n, text: CLASS_SYNERGY[cls].text });
  return out;
}

// ------------------------------------------------------------ atributos

export interface SquadModifiers {
  hpPct: number;
  dmgPct: number;
  redeployPct: number;
  /** Regras de evento (ex.: só personagens de um elemento). */
  eventHpPct?: number;
}

export function levelMultiplier(level: number): number {
  return 1 + CHAR_ECON.statPerLevel * (level - 1);
}

export function starMultiplier(stars: number): number {
  return 1 + CHAR_ECON.statPerStar * (stars - 1);
}

/** Atributos exibidos na UI (já com nível e estrelas). */
export function displayStats(def: CharacterDef, owned?: Pick<OwnedCharacter, 'level' | 'stars'>) {
  const m = levelMultiplier(owned?.level ?? 1) * starMultiplier(owned?.stars ?? 1);
  return {
    hp: Math.round(def.hp * m),
    dmg: Math.round(def.dmg * m),
    dps: Math.round((def.dmg * m) / def.atkSpeed),
    range: def.range,
    speed: def.speed,
    cost: def.cost,
  };
}

/** Converte um personagem possuído em atributos inteiros da simulação. */
export function unitSpecFor(def: CharacterDef, owned: Pick<OwnedCharacter, 'level' | 'stars'>, mods: SquadModifiers, syn: Synergy[]): UnitSpec {
  const cls = syn.find((s) => s.kind === 'class' && s.key === def.cls) ? CLASS_SYNERGY[def.cls] : null;
  const elHp = syn.some((s) => s.kind === 'element') ? ELEMENT_SYNERGY_HP : 0;
  const m = levelMultiplier(owned.level) * starMultiplier(owned.stars);
  const hpPct = 100 + mods.hpPct + elHp + (cls?.hp ?? 0) + (mods.eventHpPct ?? 0);
  const dmgPct = 100 + mods.dmgPct + (cls?.dmg ?? 0);
  const a = def.ability;
  const durPct = 100 + (cls?.duration ?? 0);
  const ability: AbilitySpec = {
    kind: a.kind,
    power: Math.round((a.power * (100 + (cls?.power ?? 0))) / 100),
    duration: Math.round((a.duration * TICK_RATE * durPct) / 100),
    radius: Math.round(a.radius * TILE),
    cooldown: Math.max(60, Math.round(a.cooldown * TICK_RATE)),
    count: a.count,
    fx: a.fx,
    fxPower: a.fxPower,
  };
  return {
    charId: def.id,
    cls: def.cls,
    element: def.element,
    hp: Math.max(1, Math.round((def.hp * m * hpPct) / 100)),
    dmg: Math.max(1, Math.round((def.dmg * m * dmgPct) / 100)),
    atkInterval: Math.max(6, Math.round(def.atkSpeed * TICK_RATE)),
    speed: Math.round((def.speed * TILE) / TICK_RATE),
    range: Math.round(def.range * TILE * (1 + (cls?.range ?? 0) / 100)),
    splash: Math.round(def.splash * TILE * (1 + (cls?.splash ?? 0) / 100)),
    crit: (def.crit + (cls?.crit ?? 0)) * 10,
    cost: def.cost,
    vsBuildings: def.vsBuildings,
    ability,
    redeploy: Math.round((5 + def.cost * 0.9) * TICK_RATE * (1 - mods.redeployPct / 100)),
  };
}

/** Esquadrão pronto para a batalha a partir dos ids e da coleção do jogador. */
export function buildSquad(
  ids: number[],
  collection: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>>,
  research: Record<string, number> | undefined,
  extra: Partial<SquadModifiers> = {},
): { specs: UnitSpec[]; synergies: Synergy[] } {
  const defs = ids.map((id) => getCharacter(id));
  const syn = activeSynergies(defs);
  const mods: SquadModifiers = {
    hpPct: researchValue(research, 'vida_esquadrao') + (extra.hpPct ?? 0),
    dmgPct: researchValue(research, 'dano_esquadrao') + (extra.dmgPct ?? 0),
    redeployPct: researchValue(research, 'recarga_cartas'),
    eventHpPct: extra.eventHpPct,
  };
  return {
    specs: defs.map((d) => unitSpecFor(d, collection[d.id] ?? { level: 1, stars: 1 }, mods, syn)),
    synergies: syn,
  };
}

/** "Poder" de um personagem (para matchmaking e para o jogador comparar). */
export function characterPower(def: CharacterDef, owned?: Pick<OwnedCharacter, 'level' | 'stars'>): number {
  const s = displayStats(def, owned);
  return Math.round(s.hp / 8 + s.dps * 2.2 + def.ability.power / 4);
}

export function squadPower(ids: number[], collection: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>>): number {
  let p = 0;
  for (const id of ids) p += characterPower(getCharacter(id), collection[id]);
  return p;
}

export { CLASS_INFO };
