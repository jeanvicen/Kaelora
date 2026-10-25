import { BUILDINGS, levelStats } from '../meta/buildings.ts';
import type { PlacedBuilding } from '../meta/types.ts';
import { researchValue } from './squad.ts';

/** "Poder" de defesa de uma cidade (para matchmaking e para mostrar ao jogador). */
export function cityPower(buildings: PlacedBuilding[], research?: Record<string, number>): number {
  let p = 0;
  const dmgBoost = 1 + researchValue(research, 'dano_torres') / 100;
  for (const b of buildings) {
    if (b.ruined) continue;
    const def = BUILDINGS[b.type];
    if (def.battle.role === 'none') continue;
    const st = levelStats(b.type, b.level);
    const dps = st.dmg && st.interval ? (st.dmg / st.interval) * dmgBoost : 0;
    const area = def.battle.splash ? 1.6 : def.battle.role === 'trap' ? 0.5 : 1;
    p += (b.type === 'barrier' ? st.hp * 0.6 : st.hp) / 14 + dps * 2.4 * area;
  }
  return Math.round(p);
}
