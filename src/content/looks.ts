import type { ClassId, Element, Rarity } from '../meta/types.ts';
import type { Rng } from '../sim/rng.ts';
import type { CharacterLook } from './types.ts';

const ELEMENT_PALETTE: Record<Element, { main: number[]; dark: number[]; glow: number[] }> = {
  solar: { main: [0xffaa2e, 0xff7a2e, 0xffc23a, 0xff5a3d], dark: [0xd8581a, 0xb8401e, 0x8e2a1e], glow: [0xffd23f, 0xffe680, 0xff9f1a] },
  raiz: { main: [0x3fd46a, 0x5be37d, 0x2fae59, 0x8fd64a], dark: [0x1d8a46, 0x1c6e3a, 0x4e6e1e], glow: [0x7dff6a, 0xc4f04a, 0xb2ff8a] },
  mare: { main: [0x2fb8ff, 0x1cc8b4, 0x3b8bff, 0x22d4dc], dark: [0x1a5fc8, 0x0f6f86, 0x1a3f8a], glow: [0x3ff6ff, 0xa6f2ff, 0x2fe0c8] },
  volt: { main: [0xf2e23a, 0xffd23f, 0x5ad8ff, 0xc6ff3a], dark: [0x3a6cff, 0x2a3f9a, 0x6a4a1e], glow: [0xf9ff5a, 0xfffbb0, 0x5affff] },
  cristal: { main: [0xff7ae0, 0xd88aff, 0xff9cc8, 0xb8f4ff], dark: [0xb24ad8, 0x8a3ab8, 0xc2367a], glow: [0xff9cf0, 0xffd6f6, 0xb8f4ff] },
  sombra: { main: [0x7a4dff, 0x5a3ad8, 0x9a4dff, 0x3a2a7a], dark: [0x2e1a6e, 0x1e1240, 0x3a1a4e], glow: [0xa26bff, 0xff4f8b, 0xc4a8ff] },
};

const SKINS = [0xffe0c4, 0xffd0a8, 0xf2b98e, 0xd99566, 0xb3743f, 0x8a5430, 0x6b3e22];
const HAIRS = [0x2a1a10, 0x5a3418, 0x8a4a1e, 0xffd04a, 0xfff2c0, 0xff5aa8, 0x3fd4ff, 0x7dff6a, 0xb45bff, 0xff4f5e, 0xe8eaf6, 0x1d1b30];
const EYES = [0x1d1b30, 0x2a5fc8, 0x1d8a46, 0x8a4a1e, 0xb45bff];

type HatOpt = CharacterLook['hat'];
type AccOpt = CharacterLook['accessory'];

const CLASS_STYLE: Record<ClassId, { body: CharacterLook['body'][]; hats: HatOpt[]; acc: AccOpt[] }> = {
  tanque: { body: ['bulky'], hats: ['helmet', 'helmet', 'horns', 'visor'], acc: ['pads', 'pads', 'cape'] },
  lutador: { body: ['normal', 'bulky'], hats: ['headband', 'none', 'headband', 'mask'], acc: ['scarf', 'none', 'pads'] },
  atirador: { body: ['slim', 'normal'], hats: ['cap', 'visor', 'goggles', 'none'], acc: ['backpack', 'scarf', 'none'] },
  mago: { body: ['normal'], hats: ['wizard', 'wizard', 'crown', 'hood'], acc: ['cape', 'cape', 'aura'] },
  curandeiro: { body: ['normal', 'slim'], hats: ['halo', 'halo', 'hood', 'none'], acc: ['cape', 'wings', 'none'] },
  invocador: { body: ['slim', 'normal'], hats: ['hood', 'antenna', 'goggles', 'crown'], acc: ['drone', 'drone', 'cape'] },
  assassino: { body: ['slim'], hats: ['hood', 'mask', 'hood', 'headband'], acc: ['scarf', 'cape', 'scarf'] },
  construtor: { body: ['bulky', 'normal'], hats: ['hardhat', 'hardhat', 'goggles', 'cap'], acc: ['backpack', 'pads', 'none'] },
  sabotador: { body: ['slim', 'normal'], hats: ['goggles', 'mask', 'cap', 'antenna'], acc: ['backpack', 'backpack', 'scarf'] },
  controlador: { body: ['normal', 'slim'], hats: ['visor', 'antenna', 'visor', 'goggles'], acc: ['aura', 'drone', 'cape'] },
  bombardeiro: { body: ['bulky'], hats: ['helmet', 'goggles', 'cap', 'hardhat'], acc: ['backpack', 'backpack', 'pads'] },
  suporte: { body: ['normal', 'slim'], hats: ['cap', 'headband', 'none', 'crown'], acc: ['banner', 'banner', 'cape'] },
};

/** Gera a aparência de um personagem (determinística pelo RNG recebido). */
export function generateLook(cls: ClassId, element: Element, rarity: Rarity, variant: number, rng: Rng): CharacterLook {
  const style = CLASS_STYLE[cls];
  const pal = ELEMENT_PALETTE[element];
  let hat = style.hats[(variant + rng.int(2)) % style.hats.length];
  let accessory = style.acc[rng.int(style.acc.length)];
  if (rarity === 'lendario' && rng.int(100) < 45) hat = cls === 'curandeiro' ? 'halo' : 'crown';
  if (rarity === 'extremo') {
    accessory = rng.int(100) < 55 ? 'wings' : 'aura';
    if (rng.int(100) < 50) hat = 'crown';
  }
  if (rarity === 'epico' && accessory === 'none') accessory = 'cape';
  const neutral = [0xf6f2ea, 0x3a3f5c, 0xeadfc8, 0x2e3452, 0xb9c3de];
  const metal = rarity === 'lendario' || rarity === 'extremo' ? 0xffc93c : rng.pick([0xb9c3de, 0x8792b6, 0xd4cfe2]);
  return {
    body: rng.pick(style.body),
    head: rng.int(4),
    hair: rng.int(10),
    hat,
    weapon: variant % 3,
    accessory,
    skin: rng.pick(SKINS),
    hairColor: rng.int(100) < 30 ? rng.pick(pal.glow) : rng.pick(HAIRS),
    primary: rng.pick(pal.main),
    secondary: rng.int(100) < 50 ? rng.pick(pal.dark) : rng.pick(neutral),
    accent: rng.pick(pal.glow),
    eye: rng.pick(EYES),
    metal,
  };
}
