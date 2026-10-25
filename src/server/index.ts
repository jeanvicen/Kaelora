// Ponto de entrada do servidor do Kaelora. É empacotado (scripts/build-server.mjs)
// em supabase/functions/_shared/kaelora-server.js para as Edge Functions.
export { GameServer, playerCity, sanitizeImportedSave, toClient } from './server.ts';
export { MemoryDb } from './memoryDb.ts';
export { ConflictError, GameError } from './types.ts';
export type { ActiveBattle, BattleRecord, ServerDb, StoredState, TargetRef } from './types.ts';
export { CLIENT_ACTIONS } from '../meta/actions.ts';
export { coreLevel } from '../meta/buildings.ts';
export { canBeRaided, protection } from '../meta/defense.ts';
export { squadPower } from '../content/squad.ts';
export { cityPower } from '../content/power.ts';
