import type { SaveData } from './types.ts';

/** Tipos de progresso que as missões diárias contam. */
export type MissionKind =
  | 'win_battles'
  | 'earn_stars'
  | 'destroy_buildings'
  | 'use_abilities'
  | 'open_chests'
  | 'collect_coins'
  | 'upgrade_any'
  | 'use_ultimate'
  | 'deal_damage'
  | 'destroy_cores';

/** Soma progresso nas missões do dia (sem passar da meta). */
export function trackMission(save: SaveData, kind: MissionKind, amount: number): void {
  if (amount <= 0 || !save.missions?.list) return;
  for (const m of save.missions.list) if (m.id === kind && !m.claimed) m.progress = Math.min(m.goal, m.progress + amount);
}
