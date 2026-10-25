import type { DuelStart } from '../content/duelSetup.ts';
import type { Command, Team, TimedCommand } from '../sim/types.ts';

/**
 * Lockstep do duelo ao vivo. Os dois aparelhos rodam a MESMA simulação
 * determinística; só as jogadas viajam pela rede. O tempo é dividido em
 * turnos de 3 ticks (100 ms); uma jogada feita agora entra 2 turnos depois
 * (≈200 ms de atraso de entrada), e a simulação só avança um turno quando já
 * tem as jogadas dos dois lados para ele. A cada segundo os dois comparam o
 * hash do estado: se divergir, é desync.
 */

export type DuelMsg =
  | { k: 'seek'; id: string; trophies: number; at: number }
  | { k: 'match'; matchId: string; host: string; guest: string; seed: number }
  | { k: 'start'; start: DuelStart }
  | { k: 'ready'; id: string }
  | { k: 'turn'; t: number; c: [number, Command][]; back?: [number, [number, Command][]][] }
  | { k: 'hash'; tick: number; h: number }
  | { k: 'resend'; from: number }
  | { k: 'bye'; id: string }
  | { k: 'hello'; id: string; profile: unknown };

/** Como as mensagens viajam (Supabase Realtime, BroadcastChannel ou memória). */
export interface DuelTransport {
  send(msg: DuelMsg): void;
  onMessage: ((msg: DuelMsg) => void) | null;
  /** O próprio transporte avisa queda/volta da conexão (se souber). */
  onStatus: ((s: 'connected' | 'reconnecting') => void) | null;
  close(): void;
}

export const TURN_TICKS = 3;
export const DELAY_TURNS = 2;
const RESEND_AFTER_MS = 600;
/** Cada turno enviado leva junto os anteriores (perda isolada se recupera sozinha). */
const REDUNDANCY = 3;
export const ABANDON_AFTER_MS = 20_000;

export interface LockstepEvents {
  onDesync?: (tick: number) => void;
  /** O oponente sumiu: vitória por W.O. para quem ficou. */
  onAbandon?: () => void;
}

export class Lockstep {
  private mine = new Map<number, [number, Command][]>();
  private theirs = new Map<number, [number, Command][]>();
  private sentUpTo = -1;
  private pending: Command[] = [];
  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  private waitingSince = 0;
  private lastResendAsk = 0;
  private abandoned = false;
  private desynced = false;
  private reconnecting = false;
  /** Todas as jogadas aplicadas (para o replay e para o servidor validar). */
  readonly log: TimedCommand[] = [];

  constructor(
    private transport: DuelTransport,
    readonly team: Team,
    private events: LockstepEvents = {},
    private clock: () => number = () => performance.now(),
  ) {
    transport.onMessage = (m) => this.receive(m);
    transport.onStatus = (st) => {
      this.reconnecting = st === 'reconnecting';
      if (st === 'connected') this.askResend(true);
    };
  }

  get other(): Team {
    return this.team === 0 ? 1 : 0;
  }

  /** Jogada local: entra no próximo turno ainda não enviado. */
  send(cmd: Command): void {
    if (this.abandoned) return;
    this.pending.push(cmd);
  }

  /** Jogadas confirmadas para o tick (null = esperando o oponente). */
  commandsFor(tick: number): { team: Team; cmd: Command }[] | null {
    const turn = Math.floor(tick / TURN_TICKS);
    this.flushUpTo(turn + DELAY_TURNS);
    let theirs = this.theirs.get(turn);
    if (!theirs) {
      const now = this.clock();
      if (!this.waitingSince) this.waitingSince = now;
      if (now - this.waitingSince > RESEND_AFTER_MS) this.askResend();
      if (now - this.waitingSince > ABANDON_AFTER_MS && !this.abandoned) {
        // oponente sumiu: daqui em diante ele "desistiu" (só neste aparelho)
        this.abandoned = true;
        this.events.onAbandon?.();
      }
      if (!this.abandoned) return null;
      theirs = tick % TURN_TICKS === 0 ? [[tick, { t: 'surrender' }]] : [];
    } else this.waitingSince = 0;
    const mine = (this.mine.get(turn) ?? []).filter(([t]) => t === tick).map(([, cmd]) => ({ team: this.team, cmd }));
    const other = theirs.filter(([t]) => t === tick).map(([, cmd]) => ({ team: this.other, cmd }));
    // ordem fixa nos dois aparelhos: time 0 primeiro
    const out = this.team === 0 ? [...mine, ...other] : [...other, ...mine];
    for (const c of out) this.log.push({ tick, team: c.team, cmd: c.cmd });
    return out;
  }

  /** Hash a cada segundo: os dois lados comparam. */
  onHash(tick: number, hash: number): void {
    this.myHashes.set(tick, hash);
    this.transport.send({ k: 'hash', tick, h: hash });
    this.checkHash(tick);
  }

  status(): string | null {
    if (this.desynced) return 'Dessincronizou! A partida vai terminar.';
    if (this.abandoned) return 'O oponente saiu. Vitória por W.O.!';
    if (this.reconnecting) return 'Reconectando...';
    if (this.waitingSince && this.clock() - this.waitingSince > 600) return 'Esperando o oponente...';
    return null;
  }

  /** Sai no meio do duelo avisando o outro lado (ele vence por W.O.). */
  leave(myId: string): void {
    this.transport.send({ k: 'bye', id: myId });
    this.transport.close();
  }

  /** Fim normal: só fecha (sem "bye", o outro pode estar terminando os últimos ticks). */
  close(): void {
    this.transport.close();
  }

  // ------------------------------------------------------------------ interno

  private flushUpTo(turn: number): void {
    while (this.sentUpTo < turn) {
      const t = ++this.sentUpTo;
      const c: [number, Command][] = this.pending.map((cmd) => [t * TURN_TICKS, cmd]);
      this.pending = [];
      this.mine.set(t, c);
      const back: [number, [number, Command][]][] = [];
      for (let i = 1; i <= REDUNDANCY && t - i >= 0; i++) back.push([t - i, this.mine.get(t - i) ?? []]);
      this.transport.send({ k: 'turn', t, c, back });
    }
  }

  private askResend(force = false): void {
    const now = this.clock();
    if (!force && now - this.lastResendAsk < 1000) return;
    this.lastResendAsk = now;
    let from = 0;
    while (this.theirs.has(from)) from++;
    this.transport.send({ k: 'resend', from });
  }

  private checkHash(tick: number): void {
    const a = this.myHashes.get(tick);
    const b = this.theirHashes.get(tick);
    if (a === undefined || b === undefined) return;
    if (a !== b && !this.desynced) {
      this.desynced = true;
      this.events.onDesync?.(tick);
    }
    this.myHashes.delete(tick);
    this.theirHashes.delete(tick);
  }

  private receive(m: DuelMsg): void {
    switch (m.k) {
      case 'turn':
        if (!this.theirs.has(m.t)) this.theirs.set(m.t, m.c);
        for (const [t, c] of m.back ?? []) if (!this.theirs.has(t)) this.theirs.set(t, c);
        break;
      case 'hash':
        this.theirHashes.set(m.tick, m.h);
        this.checkHash(m.tick);
        break;
      case 'resend':
        // o outro perdeu mensagens: manda de novo tudo a partir de `from`
        for (let t = Math.max(0, m.from); t <= this.sentUpTo; t++) this.transport.send({ k: 'turn', t, c: this.mine.get(t) ?? [] });
        break;
      case 'bye':
        if (!this.abandoned) {
          this.abandoned = true;
          this.events.onAbandon?.();
        }
        break;
    }
  }
}
