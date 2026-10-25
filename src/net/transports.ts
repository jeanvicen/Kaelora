import type { CloudClient } from './cloud.ts';
import type { DuelMsg, DuelTransport } from './lockstep.ts';

/** Duas abas do mesmo aparelho (ótimo para testar sem servidor). */
export class BroadcastTransport implements DuelTransport {
  onMessage: ((msg: DuelMsg) => void) | null = null;
  onStatus: ((s: 'connected' | 'reconnecting') => void) | null = null;
  private ch: BroadcastChannel;

  constructor(name: string) {
    this.ch = new BroadcastChannel(name);
    this.ch.onmessage = (e) => this.onMessage?.(e.data as DuelMsg);
    queueMicrotask(() => this.onStatus?.('connected'));
  }

  send(msg: DuelMsg): void {
    this.ch.postMessage(msg);
  }

  close(): void {
    this.ch.close();
  }
}

/** Supabase Realtime (broadcast): o duelo online de verdade. */
export class SupabaseTransport implements DuelTransport {
  onMessage: ((msg: DuelMsg) => void) | null = null;
  onStatus: ((s: 'connected' | 'reconnecting') => void) | null = null;
  private ch: ReturnType<CloudClient['realtime']>;
  private ready = false;
  private queue: DuelMsg[] = [];

  constructor(cloud: CloudClient, name: string) {
    this.ch = cloud.realtime(name);
    this.ch
      .on('broadcast', { event: 'm' }, ({ payload }) => this.onMessage?.(payload as DuelMsg))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.ready = true;
          for (const m of this.queue.splice(0)) this.send(m);
          this.onStatus?.('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.ready = false;
          this.onStatus?.('reconnecting');
        }
      });
  }

  send(msg: DuelMsg): void {
    if (!this.ready) {
      this.queue.push(msg);
      return;
    }
    void this.ch.send({ type: 'broadcast', event: 'm', payload: msg });
  }

  close(): void {
    void this.ch.unsubscribe();
  }
}

/**
 * Par de transportes em memória com latência, variação e perda de pacotes
 * controladas (testes do lockstep). `pump(now)` entrega o que já "chegou".
 */
export function memoryPair(opts: { latency?: number; jitter?: number; drop?: number; seed?: number } = {}) {
  let seed = opts.seed ?? 12345;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let now = 0;
  const inflight: { at: number; to: MemoryEnd; msg: DuelMsg; order: number }[] = [];
  let order = 0;
  class MemoryEnd implements DuelTransport {
    onMessage: ((msg: DuelMsg) => void) | null = null;
    onStatus: ((s: 'connected' | 'reconnecting') => void) | null = null;
    peer!: MemoryEnd;
    down = false;
    send(msg: DuelMsg): void {
      if (this.down || this.peer.down) return;
      if (opts.drop && rand() < opts.drop) return;
      const at = now + (opts.latency ?? 50) + rand() * (opts.jitter ?? 0);
      inflight.push({ at, to: this.peer, msg: JSON.parse(JSON.stringify(msg)), order: order++ });
    }
    close(): void {
      this.down = true;
    }
  }
  const a = new MemoryEnd();
  const b = new MemoryEnd();
  a.peer = b;
  b.peer = a;
  return {
    a,
    b,
    pump(t: number) {
      now = t;
      inflight.sort((x, y) => x.at - y.at || x.order - y.order);
      while (inflight.length && inflight[0].at <= now) {
        const it = inflight.shift()!;
        if (!it.to.down) it.to.onMessage?.(it.msg);
      }
    },
    /** Derruba/levanta um lado (queda de conexão). */
    setDown(end: 'a' | 'b', down: boolean) {
      const e = end === 'a' ? a : b;
      e.down = down;
      if (!down) e.onStatus?.('connected');
    },
  };
}
