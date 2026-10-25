/**
 * As 14 variantes de cada combinação classe × elemento. Cada uma ajusta
 * atributos e um aspecto da habilidade (o "modificador da variante").
 */
export interface VariantMod {
  title: string;
  hp: number;
  dmg: number;
  speed: number;
  range: number;
  crit: number;
  cost: number;
  power: number;
  cooldown: number;
  duration: number;
  radius: number;
  count: number;
  fxPower: number;
  /** Frase curta para a descrição. */
  note: string;
}

const base: VariantMod = { title: '', hp: 0, dmg: 0, speed: 0, range: 0, crit: 0, cost: 0, power: 0, cooldown: 0, duration: 0, radius: 0, count: 0, fxPower: 0, note: '' };
const v = (o: Partial<VariantMod>): VariantMod => ({ ...base, ...o });

export const VARIANTS: VariantMod[] = [
  v({ title: 'Recruta', note: '' }),
  v({ title: 'Potente', power: 15, note: 'Habilidade 15% mais forte.' }),
  v({ title: 'Ágil', cooldown: -15, speed: 5, note: 'Recarga 15% menor.' }),
  v({ title: 'Persistente', duration: 25, hp: 4, note: 'Efeitos duram 25% a mais.' }),
  v({ title: 'Amplo', radius: 30, note: 'Área 30% maior.' }),
  v({ title: 'Múltiplo', count: 1, power: 5, note: 'Um alvo/tiro/invocação a mais.' }),
  v({ title: 'Elemental', fxPower: 40, note: 'Efeito do elemento 40% mais forte.' }),
  v({ title: 'Blindado', hp: 14, speed: -6, note: 'Mais vida, um pouco mais lento.' }),
  v({ title: 'Feroz', dmg: 12, hp: -4, note: 'Mais dano, um pouco menos de vida.' }),
  v({ title: 'Veloz', speed: 14, dmg: 3, note: 'Bem mais rápido no campo.' }),
  v({ title: 'Certeiro', range: 15, crit: 8, note: 'Alcance e crítico maiores.' }),
  v({ title: 'Econômico', cost: -1, hp: -8, dmg: -8, note: 'Custa 1 de energia a menos.' }),
  v({ title: 'Colosso', cost: 1, hp: 16, dmg: 14, note: 'Custa mais, mas é bem mais forte.' }),
  v({ title: 'Supremo', power: 20, fxPower: 20, hp: 5, dmg: 5, note: 'Habilidade e elemento reforçados.' }),
];
