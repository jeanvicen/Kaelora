import { Rng, mixSeed } from '../sim/rng.ts';
import type { SaveData } from './types.ts';

/**
 * RNG do "servidor offline": derivado da semente do save + contador.
 * Toda sorte do metajogo (baús, saques, alvos) passa por aqui, então o
 * resultado só depende do estado do save — e no online quem sorteia é o servidor.
 */
export function metaRng(save: SaveData): Rng {
  save.rng.counter = (save.rng.counter + 1) >>> 0;
  return new Rng(mixSeed(save.rng.seed, save.rng.counter));
}
