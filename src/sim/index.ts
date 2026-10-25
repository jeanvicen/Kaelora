// Simulação de batalha determinística: sem Three.js, sem DOM, sem Math.random/Date.now.
export * from './types.ts';
export { BattleSim, runBattle, hasAdvantage, ADVANTAGE_PCT, ENERGY_UNIT } from './battle.ts';
export type { UnitState, StructState, CardState, TeamState } from './battle.ts';
export { Rng, hashString, mixSeed } from './rng.ts';
export { encodeReplay, decodeReplay, type Replay } from './replay.ts';
