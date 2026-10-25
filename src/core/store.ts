import type { SaveData } from '../meta/types.ts';
import { Emitter } from './events.ts';
import { writeSave } from './save.ts';

export interface StoreEvents extends Record<string, unknown> {
  change: { reason: string };
  saved: { at: number };
}

/**
 * Guarda o save em memória, avisa a UI a cada mudança e grava no IndexedDB
 * com debounce (e imediatamente quando o app vai para segundo plano).
 */
export class Store extends Emitter<StoreEvents> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(public data: SaveData) {
    super();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.flush();
      });
      window.addEventListener('pagehide', () => void this.flush());
    }
  }

  /** Aplica uma mutação, notifica ouvintes e agenda o save. */
  update<T>(reason: string, fn: (d: SaveData) => T): T {
    const result = fn(this.data);
    this.dirty = true;
    this.emit('change', { reason });
    this.schedule();
    return result;
  }

  /** Troca o save inteiro (importação, reconstrução, login na nuvem). */
  replace(data: SaveData, reason = 'replace'): void {
    this.data = data;
    this.dirty = true;
    this.emit('change', { reason });
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 600);
  }

  /** Grava agora. `force` grava mesmo sem mudanças pendentes (save novo). */
  async flush(force = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty && !force) return;
    this.dirty = false;
    await writeSave(this.data);
    this.emit('saved', { at: Date.now() });
  }
}
