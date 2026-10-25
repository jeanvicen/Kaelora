// Tipos da simulação de batalha. Tudo inteiro: posições em milésimos de casa,
// tempos em ticks (30 por segundo), porcentagens inteiras.

export const TICK_RATE = 30;
/** 1 casa da grade = 1000 unidades de posição. */
export const TILE = 1000;

export type Team = 0 | 1;
export type SimElement = 'solar' | 'raiz' | 'mare' | 'volt' | 'cristal' | 'sombra';
export type SimClass =
  | 'tanque'
  | 'lutador'
  | 'atirador'
  | 'mago'
  | 'curandeiro'
  | 'invocador'
  | 'assassino'
  | 'construtor'
  | 'sabotador'
  | 'controlador'
  | 'bombardeiro'
  | 'suporte';

export type AbilityKind =
  | 'shieldTaunt'
  | 'dash'
  | 'barrage'
  | 'meteor'
  | 'healPulse'
  | 'summon'
  | 'shadowStep'
  | 'turret'
  | 'sabotage'
  | 'stasis'
  | 'bombard'
  | 'warcry';

export type ElementFx = 'burn' | 'regen' | 'slow' | 'chain' | 'shield' | 'drain';

export interface AbilitySpec {
  kind: AbilityKind;
  /** Força principal em % (ex.: 300 = 3x o dano base; cura em % da vida). */
  power: number;
  /** Duração em ticks (escudo, buff, invocação, lentidão...). */
  duration: number;
  /** Raio em unidades de posição. */
  radius: number;
  /** Recarga em ticks. */
  cooldown: number;
  /** Quantidade (tiros, invocações, alvos). */
  count: number;
  fx: ElementFx;
  /** Força do efeito do elemento em %. */
  fxPower: number;
}

/** Personagem pronto para a batalha (atributos já com nível, estrelas e sinergias). */
export interface UnitSpec {
  charId: number;
  cls: SimClass;
  element: SimElement;
  hp: number;
  dmg: number;
  /** Ticks entre ataques. */
  atkInterval: number;
  /** Unidades de posição por tick. */
  speed: number;
  range: number;
  splash: number;
  /** Chance de crítico em ‰. */
  crit: number;
  cost: number;
  /** % de dano extra contra construções (ex.: 150 = +50%). */
  vsBuildings: number;
  ability: AbilitySpec;
  /** Ticks para o card voltar à mão depois que o personagem cai. */
  redeploy: number;
}

export type StructureKind =
  | 'core'
  | 'barrier'
  | 'cannon'
  | 'laser'
  | 'frost'
  | 'tesla'
  | 'mortar'
  | 'trap'
  | 'generator'
  | 'vault'
  | 'barracks'
  | 'lab'
  | 'gate';

export interface StructureSpec {
  kind: StructureKind;
  x: number;
  hp: number;
  dmg: number;
  atkInterval: number;
  range: number;
  minRange: number;
  splash: number;
  /** Lentidão em % (torre de gelo). */
  slow: number;
  slowTicks: number;
  chain: number;
  chainFalloff: number;
  stunTicks: number;
  level: number;
  /** Ids das construções da cidade que esta peça representa (muralhas juntam várias). */
  refIds: string[];
  /** Quantas construções da cidade esta peça representa (para o %). */
  weight: number;
}

export interface TeamSetup {
  name: string;
  element: SimElement;
  /** Até 5 cartas. */
  squad: UnitSpec[];
  structures: StructureSpec[];
  energyStart: number;
  /** % de velocidade de recarga de energia (100 = normal). */
  energyRegen: number;
  ultimate: { charge: number; damage: number };
  /** Bot que joga por este time (null = humano / jogadas gravadas). */
  bot: null | { skill: number };
  /** Onde os personagens deste time entram na estrada (padrão: ponta do time). */
  spawnX?: number;
}

export type BattleMode = 'raid' | 'duel';

export interface BattleRules {
  durationTicks: number;
  frenzyTicks: number;
  energyMax: number;
  /** Ticks para recarregar 1 de energia. */
  energyRegenTicks: number;
}

export interface BattleSetup {
  version: number;
  seed: number;
  mode: BattleMode;
  roadLength: number;
  rules: BattleRules;
  teams: [TeamSetup, TeamSetup];
}

export type Command = { t: 'deploy'; slot: number } | { t: 'ability'; slot: number } | { t: 'ultimate' } | { t: 'surrender' };

export interface TimedCommand {
  tick: number;
  team: Team;
  cmd: Command;
}

export interface BattleResult {
  winner: Team | null;
  stars: number;
  destruction: number;
  coreDestroyed: boolean;
  ticks: number;
  timeLeftTicks: number;
  destroyedRefIds: string[];
  damageDealt: [number, number];
  abilitiesUsed: [number, number];
  ultimatesUsed: [number, number];
  structuresDestroyed: number;
  surrendered: boolean;
  hash: number;
}

export type SimEvent =
  | { e: 'spawn'; id: number; team: Team; slot: number; summon: boolean }
  | { e: 'attack'; src: number; target: number; style: 'melee' | 'ranged' }
  | { e: 'projectile'; id: number; src: number; style: ProjectileStyle; fromX: number; toX: number; ticks: number; team: Team }
  | { e: 'projectileEnd'; id: number }
  | { e: 'beam'; src: number; target: number; style: 'laser' | 'heal' | 'drain' }
  | { e: 'chain'; src: number; targets: number[] }
  | { e: 'hit'; target: number; src: number; dmg: number; crit: boolean; adv: boolean; heavy: boolean }
  | { e: 'heal'; target: number; amount: number }
  | { e: 'shield'; target: number; amount: number }
  | { e: 'status'; target: number; status: 'slow' | 'stun' | 'burn' | 'buff' | 'taunt' | 'disabled' }
  | { e: 'death'; id: number; team: Team; x: number }
  | { e: 'destroyed'; id: number; kind: StructureKind; x: number; team: Team }
  | { e: 'ability'; id: number; team: Team; slot: number; kind: AbilityKind }
  | { e: 'ultimate'; team: Team; x0: number; x1: number }
  | { e: 'ultimateReady'; team: Team }
  | { e: 'trap'; id: number; x: number }
  | { e: 'explosion'; x: number; radius: number; team: Team; big: boolean }
  | { e: 'frenzy' }
  | { e: 'cardReady'; team: Team; slot: number }
  | { e: 'end'; result: BattleResult };

export type ProjectileStyle = 'bullet' | 'arrow' | 'orb' | 'cannonball' | 'shell' | 'frost' | 'pulse' | 'bomb' | 'shuriken';
