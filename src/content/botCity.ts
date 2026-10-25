import { canPlace, gridSizeForCore, maxCountFor, maxLevel } from '../meta/buildings.ts';
import type { BuildingType, CityState, Element, OwnedCharacter, PlacedBuilding, Rarity } from '../meta/types.ts';
import { Rng, mixSeed } from '../sim/rng.ts';
import { charactersOfRarity } from './catalog.ts';
import { ELEMENTS } from './classes.ts';

export interface BotCity {
  seed: number;
  name: string;
  ownerName: string;
  element: Element;
  coreLevel: number;
  trophies: number;
  buildings: PlacedBuilding[];
  research: Record<string, number>;
  squad: number[];
  squadLevels: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>>;
  /** Moedas disponíveis para saque. */
  loot: number;
}

const TAG_A = ['Capitão', 'Mestre', 'Dona', 'Rei', 'Rainha', 'Barão', 'Lorde', 'Doutor', 'Guru', 'Chefe', 'Tio', 'Vovó', 'Dj', 'Sr.', 'Madame'];
const TAG_B = ['Coco', 'Neon', 'Maré', 'Brisa', 'Trovão', 'Lava', 'Raio', 'Areia', 'Onda', 'Cristal', 'Sombra', 'Selva', 'Pixel', 'Turbo', 'Tufão', 'Manga', 'Caju', 'Polvo', 'Tucano', 'Jacaré'];
const NICK_A = ['Zé', 'Lu', 'Kai', 'Bia', 'Duda', 'Rafa', 'Gabi', 'Teo', 'Nanda', 'Juca', 'Mel', 'Davi', 'Iza', 'Pedro', 'Lara'];
const NICK_B = ['Gamer', 'Pro', 'Rei', 'Top', 'Mito', 'Brabo', 'Craque', 'Zika', 'Lenda', 'Bolado', 'Ninja', 'Turbo'];
const CITY_A = ['Ilha', 'Baía', 'Recife', 'Porto', 'Atol', 'Enseada', 'Praia', 'Cidade', 'Vila', 'Lagoa'];

/** Apelido de jogador rival (offline, gerado). */
export function botOwnerName(rng: Rng): string {
  const kind = rng.int(3);
  if (kind === 0) return `${rng.pick(TAG_A)} ${rng.pick(TAG_B)}`;
  if (kind === 1) return `${rng.pick(NICK_A)}${rng.pick(NICK_B)}${rng.int(100)}`;
  return `${rng.pick(TAG_B)}_${rng.pick(NICK_A)}`;
}

function place(city: CityState, b: PlacedBuilding, nearX: number, nearZ: number, rng: Rng, spread = 3): boolean {
  const size = gridSizeForCore(city.buildings.find((x) => x.type === 'core')?.level ?? 1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = Math.min(size, spread + Math.floor(attempt / 6));
    const x = Math.round(nearX + rng.range(-r, r));
    const z = Math.round(nearZ + rng.range(-r, r));
    const rot = rng.int(4);
    if (canPlace(city, b.type, x, z, rot)) {
      b.x = x;
      b.z = z;
      b.rot = rot;
      city.buildings.push(b);
      return true;
    }
  }
  return false;
}

/**
 * Cidade de um rival bot. `coreLevel` define o tamanho e o que pode ser
 * construído; o layout segue boas práticas (muralha entre a entrada e o
 * Núcleo, torres na frente, economia atrás) com variação pela semente.
 */
export function generateBotCity(seed: number, coreLevel: number): BotCity {
  const rng = new Rng(mixSeed(seed, 31337));
  const L = Math.max(1, Math.min(10, coreLevel));
  const size = gridSizeForCore(L);
  const element = rng.pick(ELEMENTS);
  const city: CityState = { element, buildings: [], storage: [], research: {}, name: '' };
  const lvl = (type: BuildingType) => Math.max(1, Math.min(type === 'core' ? L : L, maxLevel(type), L - rng.int(L >= 4 ? 3 : 2)));
  let n = 0;
  const mk = (type: BuildingType): PlacedBuilding => ({ id: `bot${seed}-${n++}-${type}`, type, level: type === 'core' ? L : lvl(type), x: 0, z: 0, rot: 0 });

  const cx = Math.floor(size / 2) - 1 + rng.range(-1, 2);
  const cz = Math.floor(size / 2) - 1 + rng.range(-2, 2);
  const core = mk('core');
  core.x = cx;
  core.z = cz;
  city.buildings.push(core);

  // muralha entre a entrada (lado esquerdo) e o Núcleo
  const walls = maxCountFor(city, 'barrier') - rng.int(3);
  const wallX = Math.max(2, cx - 4 - rng.int(3));
  const wallLen = Math.min(walls, size - 2);
  const z0 = Math.max(0, Math.round(cz + 1 - wallLen / 2));
  let placedWalls = 0;
  for (let z = z0; z < z0 + wallLen && placedWalls < walls; z++) {
    const b = mk('barrier');
    if (canPlace(city, 'barrier', wallX, z, 0)) {
      b.x = wallX;
      b.z = z;
      city.buildings.push(b);
      placedWalls++;
    }
  }
  // segunda linha curta em cidades maiores
  for (let z = cz - 1; z < cz + 4 && placedWalls < walls; z++) {
    const b = mk('barrier');
    if (canPlace(city, 'barrier', cx - 2, z, 0)) {
      b.x = cx - 2;
      b.z = z;
      city.buildings.push(b);
      placedWalls++;
    }
  }

  const defenses: BuildingType[] = ['cannon', 'laser', 'frost', 'tesla', 'mortar'];
  for (const type of defenses) {
    const count = maxCountFor(city, type) - (rng.int(100) < 25 ? 1 : 0);
    for (let i = 0; i < count; i++) place(city, mk(type), cx - 2 - rng.int(5), cz + rng.range(-4, 4), rng, 2);
  }
  for (let i = 0; i < maxCountFor(city, 'trap'); i++) place(city, mk('trap'), wallX - 2 - rng.int(3), cz + rng.range(-3, 3), rng, 2);
  const eco: BuildingType[] = ['generator', 'vault', 'barracks', 'lab'];
  for (const type of eco) {
    const count = maxCountFor(city, type);
    for (let i = 0; i < count; i++) place(city, mk(type), cx + 4 + rng.int(4), cz + rng.range(-4, 4), rng, 3);
  }
  for (let i = 0; i < 6 + rng.int(6); i++) {
    const type = rng.pick<BuildingType>(['palm', 'palm', 'lamp', 'flowers', 'neon']);
    place(city, mk(type), rng.int(size), rng.int(size), rng, 2);
  }

  const research: Record<string, number> = {};
  if (L >= 4) {
    for (const id of ['vida_barreiras', 'dano_torres', 'vida_nucleo']) research[id] = Math.min(5, Math.floor((L - 3) / 1.5) + rng.int(2));
  }
  const ownerName = botOwnerName(rng);
  const trophies = Math.max(0, (L - 1) * 260 + rng.range(-120, 160));
  const squadInfo = generateBotSquad(mixSeed(seed, 77), L);
  return {
    seed,
    name: `${rng.pick(CITY_A)} ${ownerName.split(/[ _]/)[0]}`,
    ownerName,
    element,
    coreLevel: L,
    trophies,
    buildings: city.buildings,
    research,
    squad: squadInfo.squad,
    squadLevels: squadInfo.levels,
    loot: Math.round((350 + L * L * 260) * (0.8 + rng.int(40) / 100)),
  };
}

/** Esquadrão de um rival: raridade e nível crescem com o nível da cidade. */
export function generateBotSquad(seed: number, level: number): { squad: number[]; levels: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>> } {
  const rng = new Rng(seed);
  const L = Math.max(1, Math.min(10, level));
  const table: Rarity[] =
    L <= 1 ? ['comum', 'comum', 'comum', 'comum', 'raro'] :
    L <= 3 ? ['comum', 'comum', 'raro', 'raro', 'epico'] :
    L <= 5 ? ['raro', 'raro', 'epico', 'epico', 'lendario'] :
    L <= 7 ? ['raro', 'epico', 'epico', 'lendario', 'lendario'] :
    ['epico', 'epico', 'lendario', 'lendario', 'extremo'];
  const squad: number[] = [];
  const levels: Record<number, Pick<OwnedCharacter, 'level' | 'stars'>> = {};
  const usedCls = new Set<string>();
  for (const r of table) {
    const pool = charactersOfRarity(r).filter((c) => !squad.includes(c.id));
    let pick = rng.pick(pool);
    for (let k = 0; k < 6 && usedCls.has(pick.cls); k++) pick = rng.pick(pool);
    usedCls.add(pick.cls);
    squad.push(pick.id);
    levels[pick.id] = { level: Math.max(1, Math.min(30, L * 3 - 2 + rng.int(3))), stars: Math.min(5, 1 + Math.floor((L - 1) / 3) + (rng.int(100) < 20 ? 1 : 0)) };
  }
  return { squad, levels };
}

/** Nível de cidade adequado para um jogador, pelos troféus e pelo poder. */
export function suggestedBotLevel(trophies: number, playerCoreLevel: number, rng: Rng): number {
  const byTrophies = 1 + Math.floor(trophies / 280);
  const base = Math.round((byTrophies + playerCoreLevel) / 2);
  return Math.max(1, Math.min(10, base + rng.range(-1, 1)));
}

