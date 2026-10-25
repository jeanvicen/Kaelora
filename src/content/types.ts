import type { ClassId, Element, Rarity } from '../meta/types.ts';
import type { AbilityKind, ElementFx } from '../sim/types.ts';

/** Aparência voxel de um personagem (gerada por código). */
export interface CharacterLook {
  body: 'slim' | 'normal' | 'bulky';
  /** Formato da cabeça (0..3). */
  head: number;
  /** Estilo de cabelo (0..9). */
  hair: number;
  hat: 'none' | 'helmet' | 'hood' | 'crown' | 'visor' | 'cap' | 'wizard' | 'halo' | 'horns' | 'headband' | 'hardhat' | 'goggles' | 'antenna' | 'mask';
  /** Variação da arma da classe (0..2). */
  weapon: number;
  accessory: 'none' | 'cape' | 'backpack' | 'wings' | 'scarf' | 'pads' | 'banner' | 'drone' | 'tail' | 'aura';
  skin: number;
  hairColor: number;
  primary: number;
  secondary: number;
  accent: number;
  eye: number;
  metal: number;
}

export interface CharacterAbility {
  kind: AbilityKind;
  name: string;
  description: string;
  power: number;
  /** Segundos. */
  duration: number;
  /** Casas. */
  radius: number;
  /** Segundos. */
  cooldown: number;
  count: number;
  fx: ElementFx;
  fxPower: number;
}

/** Definição fixa de um personagem (salva em data/characters.json). */
export interface CharacterDef {
  id: number;
  name: string;
  title: string;
  cls: ClassId;
  element: Element;
  variant: number;
  rarity: Rarity;
  /** Atributos base (nível 1, 1 estrela) já com raridade e variante. */
  hp: number;
  dmg: number;
  atkSpeed: number;
  speed: number;
  range: number;
  splash: number;
  crit: number;
  cost: number;
  vsBuildings: number;
  ability: CharacterAbility;
  look: CharacterLook;
  /** Só os 60 feitos à mão. */
  lore?: string;
  lines?: [string, string, string];
  handcrafted?: boolean;
  starter?: boolean;
}
