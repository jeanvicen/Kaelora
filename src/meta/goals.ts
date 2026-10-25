import { BUILDINGS, coreLevel, countOf, levelStats, maxCountFor } from './buildings.ts';
import { generatorAmount, upgradeBlockReason } from './city.ts';
import { getCharacter } from '../content/catalog.ts';
import { albumClaimableCount, canStarUp } from './collection.ts';
import type { BuildingType, SaveData } from './types.ts';

export type GoalAction =
  | { kind: 'battle' }
  | { kind: 'focus'; buildingId: string }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'upgrade'; buildingId: string }
  | { kind: 'chests' }
  | { kind: 'squad' }
  | { kind: 'album' }
  | { kind: 'missions' }
  | { kind: 'repair' }
  | { kind: 'raided' };

export interface Goal {
  id: string;
  text: string;
  icon: 'swords' | 'coin' | 'build' | 'up' | 'chest' | 'squad' | 'mission' | 'wrench' | 'flame' | 'target';
  action: GoalAction;
  progress?: [number, number];
}

/** Ordem em que vale a pena construir cada tipo (defesa primeiro). */
const BUILD_PRIORITY: BuildingType[] = ['cannon', 'generator', 'laser', 'vault', 'barrier', 'frost', 'trap', 'tesla', 'lab', 'mortar'];

/**
 * O "próximo objetivo" sempre visível na cidade. Olha o estado e devolve
 * a coisa mais útil a fazer agora, com a ação que leva até ela.
 */
export function nextGoal(save: SaveData, now: number): Goal {
  const city = save.city;
  if (save.raids.pendingChoice) {
    return { id: 'raided', text: 'Sua cidade foi saqueada! Escolha: retomar ou reconstruir', icon: 'flame', action: { kind: 'raided' } };
  }
  if (save.stats.battles === 0) {
    return { id: 'first-battle', text: 'Faça sua primeira invasão!', icon: 'swords', action: { kind: 'battle' } };
  }
  const ruined = city.buildings.filter((b) => b.ruined);
  if (ruined.length) {
    return { id: 'repair', text: `Repare ${ruined.length} construç${ruined.length > 1 ? 'ões destruídas' : 'ão destruída'}`, icon: 'wrench', action: { kind: 'focus', buildingId: ruined[0].id } };
  }
  if (save.chests.inventory.length) {
    return { id: 'open-chest', text: `Abra ${save.chests.inventory.length > 1 ? `seus ${save.chests.inventory.length} baús` : 'seu baú'}`, icon: 'chest', action: { kind: 'chests' } };
  }
  const evolvable = evolvableCharacters(save);
  if (evolvable.length) {
    const c = getCharacter(evolvable[0]);
    return { id: `star-${c.id}`, text: `Evolua ${c.name} para ${save.collection[c.id].stars + 1} estrelas`, icon: 'up', action: { kind: 'squad' } };
  }
  if (albumClaimableCount(save)) {
    return { id: 'album', text: 'Resgate o prêmio do Álbum', icon: 'squad', action: { kind: 'album' } };
  }
  const gens = city.buildings.filter((b) => b.type === 'generator');
  for (const g of gens) {
    const amount = generatorAmount(g, now);
    const cap = levelStats('generator', g.level).capacity ?? 1;
    if (amount >= cap * 0.6) {
      return { id: 'collect', text: `Colete ${amount} moedas do Gerador`, icon: 'coin', action: { kind: 'focus', buildingId: g.id }, progress: [amount, cap] };
    }
  }
  if (save.stats.battles < 3) {
    return { id: 'tutorial-battles', text: `Vença invasões de treino (${save.stats.battles}/3)`, icon: 'swords', action: { kind: 'battle' }, progress: [save.stats.battles, 3] };
  }
  // Construir algo novo que o Núcleo já libera.
  for (const type of BUILD_PRIORITY) {
    if (countOf(city, type) < maxCountFor(city, type)) {
      const cost = levelStats(type, 1).cost;
      const name = BUILDINGS[type].name;
      if (save.currencies.coins >= cost) return { id: `build-${type}`, text: `Construa: ${name}`, icon: 'build', action: { kind: 'build', type } };
      return { id: `save-${type}`, text: `Junte moedas para: ${name}`, icon: 'coin', action: { kind: 'battle' }, progress: [save.currencies.coins, cost] };
    }
  }
  // Melhorar defesas mais fracas.
  const core = city.buildings.find((b) => b.type === 'core');
  const candidates = city.buildings
    .filter((b) => BUILDINGS[b.type].category !== 'decor' && b.type !== 'core' && b.type !== 'barrier')
    .filter((b) => b.level < coreLevel(city))
    .sort((a, b) => a.level - b.level);
  for (const b of candidates) {
    if (!upgradeBlockReason(save, b)) return { id: `upgrade-${b.id}`, text: `Melhore: ${BUILDINGS[b.type].name} (nv ${b.level + 1})`, icon: 'up', action: { kind: 'upgrade', buildingId: b.id } };
  }
  if (core) {
    const next = core.level + 1;
    if (next <= BUILDINGS.core.levels.length) {
      const cost = levelStats('core', next).cost;
      if (save.currencies.coins >= cost && !core.upgradeEndsAt) {
        return { id: 'upgrade-core', text: `Melhore o Núcleo para o nível ${next}`, icon: 'up', action: { kind: 'upgrade', buildingId: core.id } };
      }
      if (!core.upgradeEndsAt) {
        return { id: 'save-core', text: `Junte moedas para o Núcleo nv ${next}`, icon: 'coin', action: { kind: 'battle' }, progress: [save.currencies.coins, cost] };
      }
    }
  }
  return { id: 'raid', text: 'Invada cidades rivais para ganhar baús', icon: 'swords', action: { kind: 'battle' } };
}

/** Personagens que já podem subir de estrela (esquadrão primeiro). */
export function evolvableCharacters(save: SaveData): number[] {
  const ids = Object.keys(save.collection).map(Number);
  const out = ids.filter((id) => canStarUp(save, id).ok);
  return out.sort((a, b) => Number(save.squad.includes(b)) - Number(save.squad.includes(a)));
}
