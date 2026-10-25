import type { ClassId, Element, Rarity } from '../meta/types.ts';
import { Rng, mixSeed } from '../sim/rng.ts';
import { CLASSES, CLASS_INFO, ELEMENTS, ELEMENT_INFO } from './classes.ts';
import { HEROES } from './heroes.ts';
import { generateLook } from './looks.ts';
import { generateName, normalizeName } from './names.ts';
import type { CharacterAbility, CharacterDef } from './types.ts';
import { VARIANTS } from './variants.ts';

/** Semente mestra da coleção. NUNCA mude: os ids dos saves dependem dela. */
export const COLLECTION_SEED = 0x6b61656c; // "kael"
export const VARIANTS_PER_COMBO = 14;
export const TOTAL_CHARACTERS = CLASSES.length * ELEMENTS.length * VARIANTS_PER_COMBO;

export const RARITY_TARGET: Record<Rarity, number> = { comum: 400, raro: 300, epico: 180, lendario: 96, extremo: 32 };

/** Raridade fixa das 12 primeiras variantes de cada combinação. */
const BASE_RARITY: (Rarity | null)[] = ['comum', 'comum', 'comum', 'comum', 'comum', 'raro', 'raro', 'raro', 'raro', 'epico', 'epico', 'lendario', null, null];

const ABILITY_RARITY: Record<Rarity, number> = { comum: 1, raro: 1.08, epico: 1.16, lendario: 1.26, extremo: 1.4 };
const COUNT_KINDS = new Set(['barrage', 'summon', 'bombard']);

export interface GeneratorConfig {
  rarityMultiplier: Record<Rarity, number>;
}

interface Slot {
  cls: ClassId;
  element: Element;
  variant: number;
  index: number;
  rarity: Rarity | null;
  hero: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function abilityDescription(a: CharacterAbility): string {
  const fx = ELEMENT_INFO_BY_FX[a.fx](a.fxPower);
  const n1 = (n: number) => String(round1(n)).replace('.', ',');
  const s = (n: number) => `${n1(n)} s`;
  switch (a.kind) {
    case 'shieldTaunt':
      return `Ganha um escudo de ${a.power}% da vida e atrai o fogo das torres por ${s(a.duration)}; ${fx}.`;
    case 'dash':
      return `Avança até ${n1(a.radius)} casas e golpeia com ${a.power}% do dano; ${fx}.`;
    case 'barrage':
      return `Dispara ${a.count} tiros rápidos de ${a.power}% do dano; ${fx}.`;
    case 'meteor':
      return `Invoca um meteoro de ${a.power}% do dano numa área de ${n1(a.radius)} casas; ${fx}.`;
    case 'healPulse':
      return `Cura ${a.power}% da vida dos aliados num raio de ${n1(a.radius)} casas; ${fx}.`;
    case 'summon':
      return `Chama ${a.count} drones (${a.power}% do dano) que lutam por ${s(a.duration)}; ${fx}.`;
    case 'shadowStep':
      return `Salta até a construção mais frágil a ${n1(a.radius)} casas e o próximo golpe causa +${a.power}%; ${fx}.`;
    case 'turret':
      return `Ergue uma torreta (${a.power}% do dano) que atira por ${s(a.duration)}; ${fx}.`;
    case 'sabotage':
      return `Desliga a torre mais próxima por ${s(a.duration)} e causa ${a.power}% do dano; ${fx}.`;
    case 'stasis':
      return `Deixa as torres em ${n1(a.radius)} casas 50% mais lentas por ${s(a.duration)} e apaga projéteis; ${fx}.`;
    case 'bombard':
      return `Lança ${a.count} bombas de ${a.power}% do dano numa área de ${n1(a.radius)} casas; ${fx}.`;
    case 'warcry':
      return `Aliados num raio de ${n1(a.radius)} casas causam +${a.power}% de dano por ${s(a.duration)}; ${fx}.`;
  }
}

const ELEMENT_INFO_BY_FX = Object.fromEntries(Object.values(ELEMENT_INFO).map((e) => [e.fx, e.fxText])) as Record<
  CharacterAbility['fx'],
  (p: number) => string
>;

/**
 * Gera os 1008 personagens. Determinístico: a mesma semente e o mesmo código
 * sempre produzem a mesma lista (salva em src/data/characters.json).
 */
export function generateCharacters(config: GeneratorConfig): CharacterDef[] {
  const rng = new Rng(COLLECTION_SEED);
  const slots: Slot[] = [];
  CLASSES.forEach((cls, ci) =>
    ELEMENTS.forEach((element, ei) => {
      for (let v = 0; v < VARIANTS_PER_COMBO; v++) slots.push({ cls, element, variant: v, index: (ci * ELEMENTS.length + ei) * VARIANTS_PER_COMBO + v, rarity: BASE_RARITY[v], hero: -1 });
    }),
  );
  const pool: Record<Rarity, number> = { ...RARITY_TARGET };
  for (const s of slots) if (s.rarity) pool[s.rarity]--;

  // 1) heróis feitos à mão reservam suas vagas
  HEROES.forEach((h, hi) => {
    const combo = slots.filter((s) => s.cls === h.cls && s.element === h.element);
    let slot = combo.find((s) => s.hero < 0 && s.rarity === h.rarity);
    if (!slot) {
      slot = combo.find((s) => s.hero < 0 && s.rarity === null);
      if (!slot) throw new Error(`Sem vaga para ${h.name}`);
      slot.rarity = h.rarity;
      pool[h.rarity]--;
    }
    slot.hero = hi;
  });

  // 2) vagas livres do "pool" recebem as raridades restantes, espalhadas por classe
  const free = rng.shuffle(slots.filter((s) => s.rarity === null));
  const assignSpread = (rarity: Rarity) => {
    let n = pool[rarity];
    const perClass = new Map<ClassId, number>();
    for (const s of slots) if (s.rarity === rarity) perClass.set(s.cls, (perClass.get(s.cls) ?? 0) + 1);
    while (n > 0) {
      let best: Slot | null = null;
      for (const s of free) {
        if (s.rarity !== null) continue;
        if (!best || (perClass.get(s.cls) ?? 0) < (perClass.get(best.cls) ?? 0)) best = s;
      }
      if (!best) throw new Error('Pool de raridade esgotado');
      best.rarity = rarity;
      perClass.set(best.cls, (perClass.get(best.cls) ?? 0) + 1);
      n--;
    }
    pool[rarity] = 0;
  };
  assignSpread('extremo');
  assignSpread('lendario');
  assignSpread('epico');
  assignSpread('raro');
  assignSpread('comum');

  // 3) ordem dos ids: heróis 1–60, depois por elemento → classe → variante
  const heroSlots = slots.filter((s) => s.hero >= 0).sort((a, b) => a.hero - b.hero);
  const rest = slots
    .filter((s) => s.hero < 0)
    .sort((a, b) => ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element) || CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls) || a.variant - b.variant);

  const taken = new Set(HEROES.map((h) => normalizeName(h.name)));
  const nameRng = new Rng(mixSeed(COLLECTION_SEED, 7));
  return [...heroSlots, ...rest].map((slot, i) => buildCharacter(slot, i + 1, config, nameRng, taken));
}

function buildCharacter(slot: Slot, id: number, config: GeneratorConfig, nameRng: Rng, taken: Set<string>): CharacterDef {
  const r = new Rng(mixSeed(COLLECTION_SEED, slot.index + 1000));
  const hero = slot.hero >= 0 ? HEROES[slot.hero] : null;
  const rarity = slot.rarity!;
  const ci = CLASS_INFO[slot.cls];
  const v = VARIANTS[slot.variant];
  const el = ELEMENT_INFO[slot.element];
  const rm = config.rarityMultiplier[rarity];
  const jitter = () => 0.97 + r.int(61) / 1000;
  const heroBonus = hero ? (hero.starter ? 0.88 : 1.05) : 1;

  const hp = Math.round((ci.hp * rm * (1 + v.hp / 100) * heroBonus * jitter()) / 5) * 5;
  const dmg = Math.max(1, Math.round(ci.dmg * rm * (1 + v.dmg / 100) * heroBonus * jitter()));
  const cost = Math.max(2, Math.min(7, ci.cost + v.cost + (rarity === 'extremo' ? 1 : 0)));
  const ar = ABILITY_RARITY[rarity] * (hero && !hero.starter ? 1.12 : 1);
  const usesCount = COUNT_KINDS.has(ci.ability.kind);
  const ability: CharacterAbility = {
    kind: ci.ability.kind,
    name: hero ? hero.ability : `${ci.ability.name} ${el.adjective}`,
    description: '',
    power: Math.round(ci.ability.power * (1 + (v.power + (usesCount ? 0 : v.count * 10)) / 100) * ar),
    duration: round1(ci.ability.duration * (1 + v.duration / 100)),
    radius: round1(ci.ability.radius * (1 + v.radius / 100)),
    cooldown: round1(ci.ability.cooldown * (1 + v.cooldown / 100) * (rarity === 'extremo' ? 0.9 : 1)),
    count: ci.ability.count + (usesCount ? v.count + (rarity === 'extremo' || rarity === 'lendario' ? 1 : 0) : 0),
    fx: el.fx,
    fxPower: Math.round(el.fxPower * (1 + v.fxPower / 100) * (1 + (ABILITY_RARITY[rarity] - 1) / 2)),
  };
  ability.description = abilityDescription(ability);

  const look = { ...generateLook(slot.cls, slot.element, rarity, slot.variant, r), ...(hero?.look ?? {}) };
  const name = hero ? hero.name : generateName(slot.element, nameRng, taken);

  const def: CharacterDef = {
    id,
    name,
    title: hero ? hero.title : `${ci.name} ${v.title}`,
    cls: slot.cls,
    element: slot.element,
    variant: slot.variant,
    rarity,
    hp,
    dmg,
    atkSpeed: ci.atkSpeed,
    speed: round2(ci.speed * (1 + v.speed / 100)),
    range: round2(ci.range * (1 + v.range / 100)),
    splash: ci.splash,
    crit: ci.crit + v.crit,
    cost,
    vsBuildings: ci.vsBuildings,
    ability,
    look,
  };
  if (hero) {
    def.handcrafted = true;
    def.lore = hero.lore;
    def.lines = hero.lines;
    if (hero.starter) def.starter = true;
  }
  return def;
}
