import type { DuelProfile, DuelStart } from '../content/duelSetup.ts';
import type { Team } from '../sim/types.ts';
import type { DuelMsg, DuelTransport } from './lockstep.ts';

/**
 * Pareamento do duelo ao vivo. No lobby todo mundo anuncia que está
 * procurando; quem tem o id "menor" vira anfitrião e convida. Depois, no
 * canal da partida, o convidado manda o perfil, o anfitrião responde com o
 * combinado (semente + os dois esquadrões) e o convidado confirma.
 */
export interface DuelMatch {
  start: DuelStart;
  team: Team;
  transport: DuelTransport;
}

const TROPHY_WINDOW = 400;
const WIDEN_AFTER_MS = 15_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;

export class DuelLobby {
  private lobby: DuelTransport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = Date.now();
  private busy = false;
  private closed = false;

  constructor(
    private open: (channel: string) => DuelTransport,
    private me: DuelProfile,
    private onMatch: (m: DuelMatch) => void,
    private onInfo: (text: string) => void = () => {},
  ) {}

  start(): void {
    this.startedAt = Date.now();
    this.lobby = this.open('kaelora-duel-lobby');
    this.lobby.onMessage = (m) => this.onLobby(m);
    const seek = () => this.lobby?.send({ k: 'seek', id: this.me.id, trophies: this.me.trophies, at: this.startedAt });
    seek();
    this.timer = setInterval(seek, 1000);
  }

  stop(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lobby?.close();
    this.lobby = null;
  }

  private compatible(trophies: number): boolean {
    return Math.abs(trophies - this.me.trophies) <= TROPHY_WINDOW || Date.now() - this.startedAt > WIDEN_AFTER_MS;
  }

  private onLobby(m: DuelMsg): void {
    if (this.busy || this.closed) return;
    if (m.k === 'seek' && m.id !== this.me.id && this.me.id < m.id && this.compatible(m.trophies)) {
      const matchId = `${this.me.id.slice(0, 12)}-${m.id.slice(0, 12)}-${Date.now().toString(36)}`;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      this.lobby?.send({ k: 'match', matchId, host: this.me.id, guest: m.id, seed });
      void this.handshake(matchId, 0, seed);
    } else if (m.k === 'match' && m.guest === this.me.id) {
      void this.handshake(m.matchId, 1, m.seed);
    }
  }

  private async handshake(matchId: string, team: Team, seed: number): Promise<void> {
    this.busy = true;
    if (this.timer) clearInterval(this.timer);
    const t = this.open(`kaelora-duel-${matchId}`);
    this.onInfo(team === 0 ? 'Oponente encontrado! Combinando a partida...' : 'Convite recebido! Combinando a partida...');
    const ok = await new Promise<DuelStart | null>((resolve) => {
      let start: DuelStart | null = null;
      const iv = setInterval(() => {
        if (team === 1 && !start) t.send({ k: 'hello', id: this.me.id, profile: this.me });
        if (team === 0 && start) t.send({ k: 'start', start });
      }, 400);
      const to = setTimeout(() => finish(null), HANDSHAKE_TIMEOUT_MS);
      const finish = (s: DuelStart | null) => {
        clearInterval(iv);
        clearTimeout(to);
        resolve(s);
      };
      t.onMessage = (m) => {
        if (team === 0 && m.k === 'hello' && !start) {
          start = { matchId, seed, host: this.me, guest: m.profile as DuelProfile };
          t.send({ k: 'start', start });
        } else if (team === 0 && m.k === 'ready' && start) finish(start);
        else if (team === 1 && m.k === 'start') {
          start = m.start;
          t.send({ k: 'ready', id: this.me.id });
          finish(start);
        }
      };
      if (team === 1) t.send({ k: 'hello', id: this.me.id, profile: this.me });
    });
    if (this.closed) return t.close();
    if (!ok) {
      // não fechou: volta a procurar
      t.close();
      this.busy = false;
      this.onInfo('O oponente não respondeu. Procurando de novo...');
      this.timer = setInterval(() => this.lobby?.send({ k: 'seek', id: this.me.id, trophies: this.me.trophies, at: this.startedAt }), 1000);
      return;
    }
    // o convidado continua respondendo "ready" se o anfitrião repetir o start
    if (team === 1) t.onMessage = (m) => m.k === 'start' && t.send({ k: 'ready', id: this.me.id });
    this.stop();
    this.onMatch({ start: ok, team, transport: t });
  }
}
