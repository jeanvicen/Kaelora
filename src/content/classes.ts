import type { ClassId, Element } from '../meta/types.ts';
import type { AbilityKind, ElementFx } from '../sim/types.ts';

export const CLASSES: ClassId[] = [
  'tanque',
  'lutador',
  'atirador',
  'mago',
  'curandeiro',
  'invocador',
  'assassino',
  'construtor',
  'sabotador',
  'controlador',
  'bombardeiro',
  'suporte',
];

export const ELEMENTS: Element[] = ['solar', 'raiz', 'mare', 'volt', 'cristal', 'sombra'];

export interface ClassInfo {
  name: string;
  role: string;
  /** Atributos de um Comum nível 1, 1 estrela. Tempos em segundos, distâncias em casas. */
  hp: number;
  dmg: number;
  atkSpeed: number;
  speed: number;
  range: number;
  splash: number;
  crit: number;
  cost: number;
  vsBuildings: number;
  ability: {
    kind: AbilityKind;
    name: string;
    power: number;
    duration: number;
    radius: number;
    cooldown: number;
    count: number;
  };
}

export const CLASS_INFO: Record<ClassId, ClassInfo> = {
  tanque: {
    name: 'Tanque',
    role: 'Aguenta o tranco na linha de frente e atrai o fogo das torres.',
    hp: 1500, dmg: 42, atkSpeed: 1.2, speed: 0.85, range: 0.8, splash: 0, crit: 5, cost: 5, vsBuildings: 100,
    ability: { kind: 'shieldTaunt', name: 'Muralha Viva', power: 35, duration: 4, radius: 0, cooldown: 14, count: 1 },
  },
  lutador: {
    name: 'Lutador',
    role: 'Corpo a corpo equilibrado, com investidas devastadoras.',
    hp: 950, dmg: 68, atkSpeed: 0.9, speed: 1.1, range: 0.8, splash: 0, crit: 8, cost: 4, vsBuildings: 100,
    ability: { kind: 'dash', name: 'Investida', power: 280, duration: 0, radius: 4, cooldown: 9, count: 1 },
  },
  atirador: {
    name: 'Atirador',
    role: 'Dano à distância constante, por trás da linha de frente.',
    hp: 560, dmg: 52, atkSpeed: 0.75, speed: 1.0, range: 5.5, splash: 0, crit: 8, cost: 4, vsBuildings: 100,
    ability: { kind: 'barrage', name: 'Rajada', power: 75, duration: 0, radius: 0, cooldown: 11, count: 6 },
  },
  mago: {
    name: 'Mago',
    role: 'Magia em área que castiga grupos de construções.',
    hp: 600, dmg: 80, atkSpeed: 1.4, speed: 0.95, range: 4.5, splash: 1.0, crit: 5, cost: 5, vsBuildings: 100,
    ability: { kind: 'meteor', name: 'Meteoro', power: 320, duration: 0, radius: 2.2, cooldown: 13, count: 1 },
  },
  curandeiro: {
    name: 'Curandeiro',
    role: 'Mantém o esquadrão de pé curando quem está ferido.',
    hp: 680, dmg: 32, atkSpeed: 1.1, speed: 1.0, range: 4.0, splash: 0, crit: 5, cost: 4, vsBuildings: 100,
    ability: { kind: 'healPulse', name: 'Pulso Vital', power: 18, duration: 0, radius: 5, cooldown: 14, count: 1 },
  },
  invocador: {
    name: 'Invocador',
    role: 'Chama drones aliados que lutam por um tempo.',
    hp: 650, dmg: 42, atkSpeed: 1.2, speed: 0.95, range: 4.0, splash: 0, crit: 5, cost: 5, vsBuildings: 100,
    ability: { kind: 'summon', name: 'Chamado de Drones', power: 60, duration: 9, radius: 0, cooldown: 15, count: 2 },
  },
  assassino: {
    name: 'Assassino',
    role: 'Rápido e letal: salta direto nas torres mais frágeis.',
    hp: 700, dmg: 90, atkSpeed: 0.85, speed: 1.4, range: 0.8, splash: 0, crit: 25, cost: 4, vsBuildings: 100,
    ability: { kind: 'shadowStep', name: 'Passo Sombrio', power: 220, duration: 0, radius: 9, cooldown: 12, count: 1 },
  },
  construtor: {
    name: 'Construtor',
    role: 'Derruba muralhas com facilidade e ergue torretas aliadas.',
    hp: 1000, dmg: 50, atkSpeed: 1.1, speed: 1.0, range: 0.9, splash: 0, crit: 5, cost: 4, vsBuildings: 160,
    ability: { kind: 'turret', name: 'Torreta Relâmpago', power: 70, duration: 10, radius: 0, cooldown: 15, count: 1 },
  },
  sabotador: {
    name: 'Sabotador',
    role: 'Desarma armadilhas escondidas e desliga torres.',
    hp: 640, dmg: 44, atkSpeed: 1.0, speed: 1.25, range: 1.2, splash: 0, crit: 8, cost: 3, vsBuildings: 120,
    ability: { kind: 'sabotage', name: 'Pane Total', power: 150, duration: 3.5, radius: 6, cooldown: 12, count: 1 },
  },
  controlador: {
    name: 'Controlador',
    role: 'Deixa as torres lentas e apaga os projéteis inimigos.',
    hp: 720, dmg: 38, atkSpeed: 1.1, speed: 1.0, range: 4.5, splash: 0, crit: 5, cost: 4, vsBuildings: 100,
    ability: { kind: 'stasis', name: 'Campo de Estase', power: 60, duration: 4, radius: 4, cooldown: 14, count: 1 },
  },
  bombardeiro: {
    name: 'Bombardeiro',
    role: 'Artilharia pesada: explosões enormes em construções.',
    hp: 850, dmg: 135, atkSpeed: 2.3, speed: 0.85, range: 3.5, splash: 1.6, crit: 5, cost: 6, vsBuildings: 150,
    ability: { kind: 'bombard', name: 'Chuva de Bombas', power: 160, duration: 0, radius: 4, cooldown: 15, count: 5 },
  },
  suporte: {
    name: 'Suporte',
    role: 'Aumenta o dano dos aliados por perto e inspira o time.',
    hp: 760, dmg: 34, atkSpeed: 1.0, speed: 1.0, range: 3.5, splash: 0, crit: 5, cost: 3, vsBuildings: 100,
    ability: { kind: 'warcry', name: 'Grito de Guerra', power: 35, duration: 5, radius: 6, cooldown: 14, count: 1 },
  },
};

export interface ElementInfo {
  name: string;
  adjective: string;
  beats: Element;
  fx: ElementFx;
  fxPower: number;
  fxName: string;
  fxText: (p: number) => string;
}

export const ELEMENT_INFO: Record<Element, ElementInfo> = {
  solar: { name: 'Solar', adjective: 'Solar', beats: 'raiz', fx: 'burn', fxPower: 60, fxName: 'Queimadura', fxText: (p) => `queima os alvos (${p}% do dano por segundo, 3 s)` },
  raiz: { name: 'Raiz', adjective: 'Verdejante', beats: 'mare', fx: 'regen', fxPower: 24, fxName: 'Regeneração', fxText: (p) => `regenera ${p}% da vida dos aliados em 4 s` },
  mare: { name: 'Maré', adjective: 'das Marés', beats: 'solar', fx: 'slow', fxPower: 35, fxName: 'Correnteza', fxText: (p) => `deixa os alvos ${p}% mais lentos por 3 s` },
  volt: { name: 'Volt', adjective: 'Elétrica', beats: 'cristal', fx: 'chain', fxPower: 60, fxName: 'Ricochete', fxText: (p) => `ricocheteia em mais 2 alvos (${p}% do dano)` },
  cristal: { name: 'Cristal', adjective: 'Cristalina', beats: 'sombra', fx: 'shield', fxPower: 20, fxName: 'Escudo', fxText: (p) => `ganha escudo de ${p}% da vida` },
  sombra: { name: 'Sombra', adjective: 'Sombria', beats: 'volt', fx: 'drain', fxPower: 40, fxName: 'Dreno', fxText: (p) => `rouba ${p}% do dano causado como vida` },
};

export const RARITY_NAMES = {
  comum: 'Comum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
  extremo: 'Extremo',
} as const;

export const RARITY_ORDER = ['comum', 'raro', 'epico', 'lendario', 'extremo'] as const;
