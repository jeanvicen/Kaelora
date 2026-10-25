// Tipos do estado persistente do jogador (save). Lógica pura: sem DOM, sem Three.js.

export type Element = 'solar' | 'raiz' | 'mare' | 'volt' | 'cristal' | 'sombra';
export type ClassId =
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
export type Rarity = 'comum' | 'raro' | 'epico' | 'lendario' | 'extremo';
export type ChestType = 'madeira' | 'prata' | 'ouro' | 'magico' | 'extremo';
export type GraphicsPreset = 'baixo' | 'medio' | 'alto';

export type BuildingType =
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
  | 'palm'
  | 'lamp'
  | 'neon'
  | 'flowers'
  | 'statue'
  | 'fountain';

/** Construção posicionada na grade da cidade. */
export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  level: number;
  /** Canto superior-esquerdo na grade. */
  x: number;
  z: number;
  /** Rotação em passos de 90° (0..3). */
  rot: number;
  /** Upgrade em andamento: termina em `upgradeEndsAt` (ms). */
  upgradeEndsAt?: number;
  /** Destruída num saque: desativada até reparo. */
  ruined?: boolean;
  /** Geradores: moedas acumuladas desde a última coleta (calculado por tempo). */
  lastCollectAt?: number;
}

/** Construção guardada no estoque (fora da grade). */
export interface StoredBuilding {
  id: string;
  type: BuildingType;
  level: number;
}

export interface CityState {
  element: Element;
  buildings: PlacedBuilding[];
  storage: StoredBuilding[];
  research: Record<string, number>;
  researchQueue?: { id: string; endsAt: number } | null;
  /** Nome da cidade exibido para rivais. */
  name: string;
}

export interface OwnedCharacter {
  level: number;
  xp: number;
  stars: number;
  fragments: number;
  obtainedAt: number;
  copies: number;
}

export interface ChestItem {
  uid: string;
  type: ChestType;
  source: string;
  receivedAt: number;
}

export interface MissionState {
  id: string;
  progress: number;
  goal: number;
  claimed: boolean;
}

export interface DefenseLogEntry {
  id: string;
  at: number;
  attackerName: string;
  attackerSeed: number;
  won: boolean; // true = a defesa venceu
  stars: number;
  coinsLost: number;
  ruined: string[];
  replay: string; // replay codificado
  seen: boolean;
}

export interface RevengeEntry {
  id: string;
  raiderName: string;
  raiderSeed: number;
  raiderPower: number;
  coinsLost: number;
  ruined: string[];
  expiresAt: number;
  done: boolean;
}

export interface RaidStatus {
  /** Cidade saqueada aguardando escolha (reconstruir ou retomar). */
  pendingChoice: null | { revengeId: string; at: number };
  shieldUntil: number;
  beginnerUntil: number;
  lastCheckAt: number;
  log: DefenseLogEntry[];
  revenge: RevengeEntry[];
}

export interface Settings {
  sound: number;
  music: number;
  graphics: GraphicsPreset;
  vibration: boolean;
  shake: boolean;
  language: 'pt-BR';
  skipChestIntro: boolean;
  dayNight: boolean;
}

export interface Stats {
  battles: number;
  wins: number;
  stars: number;
  coresDestroyed: number;
  chestsOpened: number;
  buildingsDestroyed: number;
  damageDealt: number;
  raidsDefended: number;
  duelsWon: number;
  trainingWins: number;
}

export interface SaveData {
  version: number;
  profile: {
    id: string;
    name: string;
    createdAt: number;
    accountXp: number;
    accountLevel: number;
    trophies: number;
    bestTrophies: number;
    avatar: number;
  };
  currencies: { coins: number; diamonds: number };
  city: CityState;
  collection: Record<number, OwnedCharacter>;
  squad: number[];
  chests: {
    inventory: ChestItem[];
    pity: { sinceLegendary: number; sinceExtreme: number };
    free: { lastClaimAt: number };
    openedTotal: number;
  };
  progression: {
    tutorialStep: number;
    seenIntro: boolean;
    seenChestIntro: Record<string, boolean>;
    lastGoal: string;
  };
  missions: { day: string; list: MissionState[] };
  login: { lastDay: string; streak: number; claimedToday: boolean };
  pass: { season: number; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  league: { week: string; startTrophies: number; rewardsClaimed: string[] };
  events: { week: string; wins: number; claimed: number[] };
  album: { claimed: string[] };
  raids: RaidStatus;
  settings: Settings;
  stats: Stats;
  /** Contador do RNG local de "servidor offline" (baús, saques). */
  rng: { seed: number; counter: number };
  /** Seleção de alvos de invasão atual (cidades rivais). */
  targets: { seeds: number[]; refreshedAt: number };
}
