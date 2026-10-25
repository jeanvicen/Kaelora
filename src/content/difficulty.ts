import { runBattle } from '../sim/battle.ts';
import { mixSeed } from '../sim/rng.ts';
import type { BattleSetup } from '../sim/types.ts';

export interface DifficultyEstimate {
  winRate: number;
  stars: number;
  label: string;
  cls: 'easy' | 'mid' | 'hard' | 'insane';
}

const cache = new Map<string, DifficultyEstimate>();

/**
 * Estima a dificuldade simulando a batalha de verdade (sem gráficos) com um
 * bot de habilidade média jogando com o esquadrão do jogador.
 */
export function estimateDifficulty(key: string, makeSetup: (seed: number) => BattleSetup, runs = 3): DifficultyEstimate {
  const hit = cache.get(key);
  if (hit) return hit;
  let wins = 0;
  let stars = 0;
  for (let i = 0; i < runs; i++) {
    const setup = makeSetup(mixSeed(0xd1ff, i));
    setup.teams[0].bot = { skill: 55 };
    const { result } = runBattle(setup);
    if (result.winner === 0) wins++;
    stars += result.stars;
  }
  const winRate = wins / runs;
  const avg = stars / runs;
  const est: DifficultyEstimate =
    winRate >= 1 && avg >= 2.5
      ? { winRate, stars: avg, label: 'Fácil', cls: 'easy' }
      : winRate >= 0.6
        ? { winRate, stars: avg, label: 'Equilibrado', cls: 'mid' }
        : winRate > 0 || avg >= 1
          ? { winRate, stars: avg, label: 'Difícil', cls: 'hard' }
          : { winRate, stars: avg, label: 'Muito difícil', cls: 'insane' };
  cache.set(key, est);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return est;
}
