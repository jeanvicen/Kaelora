import type { BattleSim } from './battle.ts';
import type { Rng } from './rng.ts';
import type { Command, Team } from './types.ts';

/**
 * Bot determinístico: decide jogadas olhando só o estado da simulação e o
 * próprio RNG. `skill` (0–100) controla paciência, combos e reflexo.
 * Roda DENTRO da simulação, então o replay reproduz o bot sem gravar jogadas.
 */
export function botThink(sim: BattleSim, team: Team, skill: number, rng: Rng): Command[] {
  const out: Command[] = [];
  const reaction = Math.max(4, 22 - Math.floor(skill / 6));
  if (sim.tick % reaction !== team * 3 % reaction) return out;
  const ts = sim.teams[team];
  const energy = Math.floor(sim.energyOf(team));

  // Ultimate: quando há várias construções inimigas na janela de ataque.
  if (ts.ultReady) {
    const front = sim.frontX(team);
    let targets = 0;
    for (const s of sim.structures) if (s.alive && s.team !== team && s.revealed && Math.abs(s.x - front) < 9000) targets++;
    if (targets >= (skill > 60 ? 2 : 1) || sim.timeLeftTicks < 300) out.push({ t: 'ultimate' });
  }

  // Habilidades
  ts.cards.forEach((c, slot) => {
    if (c.state !== 'field' || !sim.canUseAbility(team, slot)) return;
    const u = sim.unit(c.unitId);
    if (!u) return;
    if (rng.int(100) > 30 + skill) return; // bots fracos demoram a reagir
    const k = u.spec.ability.kind;
    const hurt = u.hp * 100 < u.maxHp * 70;
    const engaged = u.targetId !== 0;
    let use = false;
    if (k === 'shieldTaunt') use = hurt || engaged;
    else if (k === 'healPulse') use = sim.units.some((o) => o.alive && o.team === team && o.hp * 100 < o.maxHp * 65);
    else if (k === 'warcry' || k === 'summon') use = engaged;
    else use = engaged || k === 'shadowStep' || k === 'dash';
    if (use) out.push({ t: 'ability', slot });
  });

  // Deploy: tanque primeiro quando o campo está vazio; bots bons juntam energia para combos.
  const hand = ts.cards.map((c, slot) => ({ c, slot })).filter(({ c }) => c.state === 'hand' && c.spec.cost <= energy);
  if (hand.length) {
    const onField = ts.cards.filter((c) => c.state === 'field').length;
    const waitForCombo = skill > 50 && onField === 0 && energy < 7 && sim.timeLeftTicks > 900;
    if (!waitForCombo || energy >= 9) {
      const tank = hand.find(({ c }) => c.spec.cls === 'tanque');
      const pick = onField === 0 && tank ? tank : hand[rng.int(hand.length)];
      out.push({ t: 'deploy', slot: pick.slot });
    }
  }
  return out;
}
