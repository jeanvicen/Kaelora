import type { Element, Rarity } from '../meta/types.ts';

/** Cores base do mundo "futurista-tropical". */
export const C = {
  ink: 0x14122b,
  white: 0xf6f2ea,
  cream: 0xeadfc8,
  creamDark: 0xcdbfa6,
  concrete: 0xd4cfe2,
  concreteDark: 0x9a93b6,
  slab: 0xb7b0cc,
  metal: 0x8792b6,
  metalDark: 0x4c5578,
  metalDeep: 0x2e3452,
  steel: 0xb9c3de,
  glass: 0x67dcf2,
  glassDark: 0x2c74a4,
  window: 0x35507e,
  teal: 0x1cc8b4,
  tealDark: 0x0f8f86,
  neonPink: 0xff3fb4,
  neonCyan: 0x3ff6ff,
  neonOrange: 0xffa13f,
  neonYellow: 0xffe14f,
  neonGreen: 0x5bff8a,
  neonPurple: 0xb45bff,
  gold: 0xffc93c,
  goldDark: 0xd8961a,
  grass: 0x63e07f,
  grassAlt: 0x52d272,
  grassDark: 0x37b95c,
  leaf: 0x2fd46b,
  leafLight: 0x7ff08a,
  leafDark: 0x1c9a52,
  trunk: 0xa8743f,
  trunkDark: 0x76502b,
  sand: 0xf6dca0,
  sandDark: 0xe2bd78,
  rock: 0x9286ab,
  rockDark: 0x675d82,
  dirt: 0xc98a4c,
  dirtDark: 0x8e5a2e,
  red: 0xff4f5e,
  redDark: 0xc22a44,
  orange: 0xff8a3d,
  blue: 0x3b8bff,
  blueDark: 0x2453b8,
  purple: 0xa64dff,
  pink: 0xff8fcf,
  ice: 0xc8f6ff,
  iceDeep: 0x7fd8ff,
  snow: 0xf4fdff,
  black: 0x1d1b30,
  skin: [0xffd9b8, 0xf2b98e, 0xd99566, 0xb3743f, 0x8a5430, 0x613a20],
} as const;

export interface ElementColors {
  main: number;
  light: number;
  dark: number;
  glow: number;
  accent: number;
  css: string;
}

export const ELEMENT_COLORS: Record<Element, ElementColors> = {
  solar: { main: 0xffaa2e, light: 0xffe680, dark: 0xd8581a, glow: 0xffd23f, accent: 0xff5a3d, css: '#FFAA2E' },
  raiz: { main: 0x3fd46a, light: 0xb2ff8a, dark: 0x1d8a46, glow: 0x7dff6a, accent: 0xc4f04a, css: '#3FD46A' },
  mare: { main: 0x2fb8ff, light: 0xa6f2ff, dark: 0x1a5fc8, glow: 0x3ff6ff, accent: 0x2fe0c8, css: '#2FB8FF' },
  volt: { main: 0xf2e23a, light: 0xfffbb0, dark: 0x3a6cff, glow: 0xf9ff5a, accent: 0x5ad8ff, css: '#F2E23A' },
  cristal: { main: 0xff7ae0, light: 0xffd6f6, dark: 0xb24ad8, glow: 0xff9cf0, accent: 0xb8f4ff, css: '#FF7AE0' },
  sombra: { main: 0x7a4dff, light: 0xc4a8ff, dark: 0x2e1a6e, glow: 0xa26bff, accent: 0xff4f8b, css: '#7A4DFF' },
};

export const RARITY_COLORS: Record<Rarity, { hex: number; css: string }> = {
  comum: { hex: 0x9aa3ad, css: '#9AA3AD' },
  raro: { hex: 0x3b8bff, css: '#3B8BFF' },
  epico: { hex: 0xa64dff, css: '#A64DFF' },
  lendario: { hex: 0xffc93c, css: '#FFC93C' },
  extremo: { hex: 0xff2a4a, css: '#FF2A4A' },
};

/** Mistura duas cores hex (t entre 0 e 1). */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Clareia (t>0) ou escurece (t<0) uma cor. */
export function shade(c: number, t: number): number {
  return t >= 0 ? mixHex(c, 0xffffff, t) : mixHex(c, 0x000000, -t);
}
