import type { Element } from '../meta/types.ts';
import type { Rng } from '../sim/rng.ts';

/** Sílabas por elemento: cada elemento tem uma "sonoridade" própria. */
const SYLLABLES: Record<Element, { start: string[]; mid: string[]; end: string[] }> = {
  solar: {
    start: ['Ra', 'So', 'Ka', 'Ar', 'Ti', 'Ma', 'Yo', 'Za', 'Fa', 'Ri', 'Ig', 'Hé', 'Ca', 'Lu', 'Ba'],
    mid: ['ra', 'lu', 'ri', 'ka', 'ne', 'to', 'mi', 'sa', 'ro', 'ya', 'ze', 'di'],
    end: ['ra', 'son', 'ka', 'rel', 'tan', 'ma', 'yo', 'zar', 'fe', 'riu', 'ar', 'iro', 'sol', 'nai'],
  },
  raiz: {
    start: ['Ta', 'Ju', 'Ra', 'Mu', 'Ce', 'Bá', 'Ia', 'Po', 'Ru', 'Gua', 'Ti', 'Nê', 'Ca', 'Ja', 'Ubi'],
    mid: ['ju', 'ra', 'ti', 'ca', 'pa', 'ru', 'mo', 'ba', 'ia', 'ne', 'ro', 'qui'],
    end: ['ra', 'bá', 'tã', 'ju', 'cá', 'mã', 'ru', 'pó', 'ité', 'iba', 'oca', 'ema', 'uba', 'ana'],
  },
  mare: {
    start: ['Ma', 'Ri', 'Na', 'Lu', 'Ô', 'Ae', 'Ce', 'Mo', 'La', 'Pe', 'Ru', 'Io', 'Ma', 'Tá', 'Ola'],
    mid: ['ri', 'na', 'lu', 'ma', 'ru', 'le', 'ço', 'no', 'ai', 'ce', 'qua', 'pe'],
    end: ['rina', 'mar', 'nau', 'lua', 'ré', 'ola', 'mai', 'ruá', 'ela', 'nu', 'aia', 'quá', 'enu', 'ira'],
  },
  volt: {
    start: ['Zi', 'Vo', 'Ke', 'Tek', 'Xa', 'Zu', 'Ki', 'Vi', 'Tro', 'Ze', 'Ax', 'Ny', 'Ez', 'Kro', 'Zap'],
    mid: ['vo', 'tek', 'zi', 'ra', 'xo', 'ki', 'tro', 'zu', 'ne', 'vi', 'ax', 'ro'],
    end: ['tek', 'vol', 'zix', 'tron', 'kai', 'zar', 'vex', 'ion', 'ak', 'zor', 'kit', 'trix', 'nyx', 'vok'],
  },
  cristal: {
    start: ['Cri', 'La', 'Li', 'Vi', 'Sel', 'Ae', 'Mi', 'Ra', 'Is', 'Ne', 'Fi', 'Lu', 'Cy', 'Gli', 'Op'],
    mid: ['la', 'li', 'si', 'ra', 'na', 'ri', 'vi', 'le', 'mi', 'sa', 'ta', 'fi'],
    end: ['lis', 'tal', 'ria', 'rine', 'sel', 'vie', 'line', 'mira', 'ela', 'rys', 'iel', 'ane', 'sa', 'ina'],
  },
  sombra: {
    start: ['Nox', 'Mor', 'Ve', 'Um', 'Sha', 'Dra', 'Ka', 'Vel', 'Or', 'Zu', 'Ne', 'Bra', 'Gro', 'Ul', 'Vor'],
    mid: ['mo', 'ra', 'ga', 'ru', 'no', 've', 'za', 'ka', 'tho', 'ri', 'gu', 'dra'],
    end: ['mor', 'vel', 'brum', 'noir', 'gal', 'rak', 'ul', 'thar', 'zur', 'grim', 'vex', 'dor', 'kai', 'ruk'],
  },
};

/**
 * Nomes de personagens de jogos existentes (e variações curtas comuns) que o
 * gerador NUNCA pode produzir. Comparação sem acento e sem maiúsculas.
 */
export const BLOCKED_NAMES = new Set(
  [
    // plataforma / aventura
    'mario', 'luigi', 'peach', 'bowser', 'yoshi', 'toad', 'wario', 'waluigi', 'link', 'zelda', 'ganon', 'samus', 'kirby', 'sonic', 'tails',
    'knuckles', 'amy', 'shadow', 'rayman', 'crash', 'spyro', 'kratos', 'atreus', 'lara', 'nathan', 'ellie', 'joel', 'geralt', 'ciri', 'yennefer',
    'master', 'chief', 'cortana', 'pikachu', 'eevee', 'mewtwo', 'ash', 'misty', 'brock', 'steve', 'alex', 'creeper', 'cloud', 'tifa', 'aerith',
    'sephiroth', 'squall', 'noctis', 'lightning', 'dante', 'vergil', 'leon', 'claire', 'jill', 'ada', 'chris', 'ezio', 'altair', 'arthur',
    // brawl / clash
    'shelly', 'colt', 'bull', 'jessie', 'poco', 'nita', 'spike', 'crow', 'mortis', 'piper', 'pam', 'frank', 'bibi', 'bea', 'barley', 'rico',
    'darryl', 'penny', 'carl', 'jacky', 'gale', 'max', 'sandy', 'surge', 'amber', 'byron', 'edgar', 'colette', 'belle', 'lola', 'fang', 'eve',
    'janet', 'otis', 'sam', 'gus', 'buster', 'chester', 'gray', 'mandy', 'willow', 'maisie', 'hank', 'pearl', 'larry', 'lawrie', 'angelo', 'berry',
    'shade', 'meeple', 'lily', 'clancy', 'moe', 'kenji', 'juju', 'melodie', 'draco', 'kit', 'mico', 'charlie', 'chuck', 'ollie', 'lumi', 'finx',
    'kaze', 'mina', 'ziggy', 'gigi', 'pierce', 'sirius', 'tick', 'emz', 'ruffs', 'squeak', 'grom', 'griff', 'stu', 'belle', 'buzz', 'fang',
    'valkyrie', 'pekka', 'golem', 'goblin', 'barbarian', 'hog', 'miner', 'princess', 'sparky', 'bandit', 'archer', 'witch', 'wizard',
    // moba / heróis
    'ahri', 'akali', 'annie', 'ashe', 'garen', 'lux', 'jinx', 'vi', 'zed', 'yasuo', 'yone', 'teemo', 'ekko', 'sona', 'nami', 'lulu', 'riven',
    'irelia', 'katarina', 'darius', 'draven', 'thresh', 'leona', 'diana', 'zoe', 'neeko', 'senna', 'lucian', 'ezreal', 'kayle', 'morgana',
    'lina', 'lion', 'tiny', 'zeus', 'axe', 'pudge', 'mirana', 'luna', 'sven', 'invoker', 'kael', 'rubick', 'nyx', 'slark', 'razor', 'viper',
    'tracer', 'mercy', 'genji', 'hanzo', 'mei', 'ana', 'kiriko', 'moira', 'reaper', 'sombra', 'echo', 'juno', 'zarya', 'lucio', 'reinhardt',
    'layla', 'miya', 'alucard', 'zilong', 'lesley', 'selena', 'gusion', 'fanny', 'chou', 'nana', 'odette', 'kagura', 'lancelot', 'ling',
    'jett', 'sage', 'phoenix', 'raze', 'omen', 'viper', 'cypher', 'sova', 'killjoy', 'skye', 'yoru', 'astra', 'neon', 'fade', 'harbor',
    // gacha / rpg
    'lumine', 'aether', 'paimon', 'diluc', 'venti', 'klee', 'zhongli', 'raiden', 'nahida', 'ganyu', 'keqing', 'xiao', 'hutao', 'ayaka',
    'kaeya', 'amber', 'lisa', 'jean', 'barbara', 'fischl', 'mona', 'qiqi', 'eula', 'yelan', 'tighnari', 'nilou', 'alhaitham', 'furina',
    // battle royale / outros
    'jonesy', 'peely', 'midas', 'kelly', 'alok', 'chrono', 'moco', 'hayato', 'bloodhound', 'wraith', 'pathfinder', 'lifeline', 'octane',
    'gibraltar', 'caustic', 'mirage', 'crypto', 'wattson', 'loba', 'horizon', 'valk', 'ash', 'catalyst', 'vantage', 'conduit',
  ].map(normalizeName),
);

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Um nome é proibido se for igual a um bloqueado (ou só ele + uma letra). */
export function isBlockedName(name: string): boolean {
  const n = normalizeName(name);
  if (BLOCKED_NAMES.has(n)) return true;
  for (const part of name.split(/[\s-]+/)) if (BLOCKED_NAMES.has(normalizeName(part))) return true;
  return false;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Gera um nome inédito com sílabas do elemento. `taken` guarda os nomes
 * já usados (normalizados) para garantir unicidade.
 */
export function generateName(element: Element, rng: Rng, taken: Set<string>): string {
  const s = SYLLABLES[element];
  for (let attempt = 0; attempt < 400; attempt++) {
    const parts = attempt < 300 && rng.int(100) < 65 ? 2 : 3;
    let name = rng.pick(s.start);
    if (parts === 3) name += rng.pick(s.mid);
    name += rng.pick(s.end).toLowerCase();
    // evita letras repetidas em excesso ("aaa", "rrr")
    if (/(.)\1\1/i.test(name)) continue;
    if (/[aeiouáéíóúâêôãõ]{3}/i.test(name)) continue;
    name = capitalize(name);
    if (name.length < 4 || name.length > 10) continue;
    const key = normalizeName(name);
    if (taken.has(key) || isBlockedName(name)) continue;
    taken.add(key);
    return name;
  }
  throw new Error(`Não foi possível gerar nome único para ${element}`);
}
