import economyJson from '../data/economy.json';
import { coreLevel } from '../meta/buildings.ts';
import type { SaveData } from '../meta/types.ts';
import { generateBotCity, generateBotSquad, type BotCity } from './botCity.ts';

const T = (economyJson as unknown as { training: { difficulties: { id: string; name: string; power: number }[] } }).training;
export const TRAINING_DIFFICULTIES = T.difficulties;

/** Nível da cidade-teste para uma dificuldade (relativo ao Núcleo do jogador). */
export function trainingLevel(save: Pick<SaveData, 'city'>, difficulty: string): number {
  const d = TRAINING_DIFFICULTIES.find((x) => x.id === difficulty) ?? TRAINING_DIFFICULTIES[1];
  const core = coreLevel(save.city);
  return Math.max(1, Math.min(10, Math.round(core * d.power + (d.power - 1) * 1.5)));
}

/** Cidade-teste do Treinamento (nada se perde). */
export function trainingTarget(save: Pick<SaveData, 'city'>, difficulty: string, seed: number): BotCity {
  const d = TRAINING_DIFFICULTIES.find((x) => x.id === difficulty) ?? TRAINING_DIFFICULTIES[1];
  const city = generateBotCity(seed, trainingLevel(save, difficulty));
  return { ...city, ownerName: `Cidade-teste ${d.name}`, name: 'Campo de Treino' };
}

/** Esquadrão e habilidade do bot no duelo de treino. */
export function trainingBot(save: Pick<SaveData, 'city'>, difficulty: string, seed: number) {
  const idx = Math.max(0, TRAINING_DIFFICULTIES.findIndex((x) => x.id === difficulty));
  return { ...generateBotSquad(seed, trainingLevel(save, difficulty)), skill: [25, 50, 72, 92][idx] ?? 50 };
}
