import type { BattleSetup, Command, Team, TimedCommand } from './types.ts';

/** Replay = configuração da batalha + lista de jogadas. Nada mais é preciso. */
export interface Replay {
  setup: BattleSetup;
  commands: TimedCommand[];
  /** Hash final esperado (para conferir se o replay bateu). */
  hash: number;
  meta?: { attacker: string; defender: string; at: number };
}

const CMD_CODES: Record<Command['t'], number> = { deploy: 0, ability: 1, ultimate: 2, surrender: 3 };
const CODE_CMDS: Command['t'][] = ['deploy', 'ability', 'ultimate', 'surrender'];

/** Compacta as jogadas: [tick, time*8 + código*... ] para caber num link. */
function packCommands(cmds: TimedCommand[]): number[] {
  const out: number[] = [];
  let last = 0;
  for (const c of cmds) {
    const slot = 'slot' in c.cmd ? c.cmd.slot : 0;
    out.push(c.tick - last, c.team * 32 + CMD_CODES[c.cmd.t] * 8 + slot);
    last = c.tick;
  }
  return out;
}

function unpackCommands(arr: number[]): TimedCommand[] {
  const out: TimedCommand[] = [];
  let tick = 0;
  for (let i = 0; i + 1 < arr.length; i += 2) {
    tick += arr[i];
    const v = arr[i + 1];
    const team = (v >= 32 ? 1 : 0) as Team;
    const t = CODE_CMDS[Math.floor((v % 32) / 8)];
    const slot = v % 8;
    const cmd: Command = t === 'deploy' || t === 'ability' ? { t, slot } : { t };
    out.push({ tick, team, cmd });
  }
  return out;
}

function toBase64Url(s: string): string {
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
}

/** Codifica um replay como texto curto (para links compartilháveis). */
export function encodeReplay(r: Replay): string {
  return toBase64Url(JSON.stringify({ v: 1, s: r.setup, c: packCommands(r.commands), h: r.hash, m: r.meta }));
}

export function decodeReplay(text: string): Replay | null {
  try {
    const o = JSON.parse(fromBase64Url(text.trim()));
    if (!o || o.v !== 1 || !o.s) return null;
    return { setup: o.s as BattleSetup, commands: unpackCommands(o.c ?? []), hash: o.h ?? 0, meta: o.m };
  } catch {
    return null;
  }
}
