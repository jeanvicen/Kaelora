import { ECONOMY } from './economy.ts';
import type { BuildingType, Element, PlacedBuilding, SaveData, Settings } from './types.ts';

export const SAVE_VERSION = 1;

/** Os 5 personagens Comuns fracos com que todo jogador começa (ids fixos). */
export const STARTER_SQUAD = [1, 2, 3, 4, 5];

const HOUR = 3_600_000;

export function defaultSettings(graphics: Settings['graphics'] = 'medio'): Settings {
  return {
    sound: 0.8,
    music: 0.55,
    graphics,
    vibration: true,
    shake: true,
    language: 'pt-BR',
    skipChestIntro: false,
    dayNight: true,
  };
}

/** Layout inicial: Núcleo no centro, muralha protegendo a entrada (lado esquerdo). */
export function starterCity(now: number): PlacedBuilding[] {
  const list: [BuildingType, number, number, number][] = [
    ['core', 11, 10, 0],
    ['cannon', 7, 11, 0],
    ['generator', 15, 5, 0],
    ['barracks', 16, 15, 0],
    ['palm', 2, 3, 0],
    ['palm', 4, 19, 0],
    ['palm', 20, 2, 0],
    ['palm', 21, 20, 0],
    ['palm', 13, 20, 0],
    ['lamp', 10, 8, 0],
    ['lamp', 10, 14, 0],
    ['flowers', 14, 9, 0],
    ['flowers', 14, 13, 0],
    ['neon', 19, 10, 0],
  ];
  for (let z = 8; z <= 15; z++) list.push(['barrier', 5, z, 0]);
  return list.map(([type, x, z, rot], i) => {
    const b: PlacedBuilding = { id: `start-${i}-${type}`, type, level: 1, x, z, rot };
    if (type === 'generator') b.lastCollectAt = now - HOUR; // já vem com um pouco para coletar
    return b;
  });
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] >>> 0;
}

export function newGame(name: string, now: number, graphics: Settings['graphics'] = 'medio'): SaveData {
  const start = ECONOMY.start;
  const collection: SaveData['collection'] = {};
  for (const id of STARTER_SQUAD) collection[id] = { level: 1, xp: 0, stars: 1, fragments: 0, obtainedAt: now, copies: 1 };
  const cleanName = name.trim().slice(0, 16) || 'Comandante';
  return {
    version: SAVE_VERSION,
    profile: {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${randomSeed().toString(36)}-${now.toString(36)}`,
      name: cleanName,
      createdAt: now,
      accountXp: 0,
      accountLevel: 1,
      trophies: 0,
      bestTrophies: 0,
      avatar: 1,
    },
    currencies: { coins: start.coins, diamonds: start.diamonds },
    city: {
      element: start.element as Element,
      buildings: starterCity(now),
      storage: [],
      research: {},
      researchQueue: null,
      name: `Ilha de ${cleanName}`,
    },
    collection,
    squad: [...STARTER_SQUAD],
    chests: {
      inventory: start.chests.map((type, i) => ({ uid: `welcome-${i}`, type, source: 'Presente de boas-vindas', receivedAt: now })),
      pity: { sinceLegendary: 0, sinceExtreme: 0 },
      free: { lastClaimAt: 0 },
      openedTotal: 0,
    },
    progression: { tutorialStep: 0, seenIntro: false, seenChestIntro: {}, lastGoal: '' },
    missions: { day: '', list: [] },
    login: { lastDay: '', streak: 0, claimedToday: false },
    pass: { season: 0, xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    league: { week: '', startTrophies: 0, rewardsClaimed: [] },
    events: { week: '', wins: 0, claimed: [] },
    album: { claimed: [] },
    raids: {
      pendingChoice: null,
      shieldUntil: 0,
      beginnerUntil: now + ECONOMY.raid.beginnerHours * HOUR,
      lastCheckAt: now,
      log: [],
      revenge: [],
    },
    settings: defaultSettings(graphics),
    stats: {
      battles: 0,
      wins: 0,
      stars: 0,
      coresDestroyed: 0,
      chestsOpened: 0,
      buildingsDestroyed: 0,
      damageDealt: 0,
      raidsDefended: 0,
      duelsWon: 0,
      trainingWins: 0,
    },
    rng: { seed: randomSeed(), counter: 0 },
    targets: { seeds: [], refreshedAt: 0 },
    achievements: {},
    shop: { dealDay: '' },
  };
}

/** Migrações de save entre versões (aplicadas no carregamento). */
export function migrateSave(data: SaveData): SaveData {
  // v1 é a primeira versão; futuras migrações entram aqui em sequência.
  if (!data.settings) data.settings = defaultSettings();
  data.settings = { ...defaultSettings(data.settings.graphics), ...data.settings };
  data.achievements ??= {};
  data.shop ??= { dealDay: '' };
  data.version = SAVE_VERSION;
  return data;
}
