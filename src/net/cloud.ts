import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import type { EventRules } from '../content/battleSetup.ts';
import type { BotCity } from '../content/botCity.ts';
import type { ActionArgs, ActionName, ActionResult } from '../meta/actions.ts';
import type { BattleRewards } from '../meta/raids.ts';
import type { ChestResult } from '../meta/chests.ts';
import type { DefenseLogEntry, Element, SaveData } from '../meta/types.ts';
import type { BattleResult, TimedCommand } from '../sim/types.ts';

/**
 * Cliente online (Supabase): login, Edge Functions e tempo real.
 * Só é carregado quando o projeto tem VITE_SUPABASE_URL e
 * VITE_SUPABASE_ANON_KEY — sem isso o jogo roda 100% offline.
 */
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const ONLINE_AVAILABLE = !!(URL_ && ANON);

export interface OnlineTarget {
  key: string;
  isPlayer: boolean;
  city: BotCity;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export class CloudClient {
  private channel: RealtimeChannel | null = null;
  userId: string | null = null;

  private constructor(private sb: SupabaseClient) {}

  /** Conecta (carrega a biblioteca só agora, para o modo offline ficar leve). */
  static async connect(): Promise<CloudClient | null> {
    if (!ONLINE_AVAILABLE) return null;
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(URL_!, ANON!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return new CloudClient(sb);
  }

  async session(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    this.userId = data.session?.user.id ?? null;
    return data.session;
  }

  /** Conta de convidado (anônima) — dá para vincular um e-mail depois. */
  async signInGuest(): Promise<void> {
    const { data, error } = await this.sb.auth.signInAnonymously();
    if (error) throw new CloudError(error.message);
    this.userId = data.user?.id ?? null;
  }

  /** Link mágico por e-mail (sem senha). */
  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new CloudError(error.message);
  }

  /** Transforma a conta de convidado em conta com e-mail (mantém o progresso). */
  async linkEmail(email: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ email });
    if (error) throw new CloudError(error.message);
  }

  async currentEmail(): Promise<string | null> {
    const { data } = await this.sb.auth.getUser();
    return data.user?.email ?? null;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.userId = null;
  }

  private async call<T>(fn: string, body: object): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(fn, { body: body as Record<string, unknown> });
    if (error) {
      let msg = error.message;
      let status = 0;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        status = ctx.status;
        try {
          const j = await ctx.json();
          if (j?.error) msg = j.error;
        } catch {
          // corpo não era JSON
        }
      }
      throw new CloudError(msg, status);
    }
    return data as T;
  }

  bootstrap(p: { name?: string; element?: Element; localSave?: SaveData }) {
    return this.call<{ save: SaveData; created: boolean; imported: boolean; defenses: DefenseLogEntry[] }>('bootstrap', p);
  }

  action<K extends ActionName>(name: K, args: ActionArgs<K>) {
    return this.call<{ result: ActionResult<K>; save: SaveData }>('game-action', { name, args });
  }

  openChest(uid: string) {
    return this.call<{ result: ChestResult; save: SaveData }>('open-chest', { uid });
  }

  matchmaking(force = false) {
    return this.call<{ targets: OnlineTarget[]; save: SaveData }>('matchmaking', { op: 'list', force });
  }

  startBattle(p: { kind: 'raid' | 'revenge' | 'event' | 'training'; targetKey?: string; revengeId?: string; difficulty?: string }) {
    return this.call<{ seed: number; target: BotCity; kind: string; event: EventRules | null; save: SaveData }>('matchmaking', { op: 'start', ...p });
  }

  validateBattle(commands: TimedCommand[], hash: number) {
    return this.call<{ result: BattleResult; rewards: BattleRewards; desync: boolean; save: SaveData }>('validate-battle', { commands, hash });
  }

  applyRaid(choice?: 'rebuild' | 'retake') {
    return this.call<{ defenses: DefenseLogEntry[]; choice: unknown; save: SaveData }>('apply-raid', { choice });
  }

  claimReward(p: Record<string, unknown>) {
    return this.call<{ result: unknown; save: SaveData }>('claim-reward', p);
  }

  /** Ranking global (view `leaderboards`). */
  async leaderboard(limit = 100): Promise<{ user_id: string; name: string; account_level: number; trophies: number; league: string; position: number }[]> {
    const { data, error } = await this.sb.from('leaderboards').select('user_id, name, account_level, trophies, league, position').limit(limit);
    if (error) throw new CloudError(error.message);
    return data ?? [];
  }

  /** Avisa na hora quando a cidade do jogador é atacada. */
  watchRaids(onChange: () => void): void {
    if (!this.userId || this.channel) return;
    this.channel = this.sb
      .channel(`raids:${this.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raid_status', filter: `user_id=eq.${this.userId}` }, () => onChange())
      .subscribe();
  }

  /** Canal de tempo real (Fase 8: duelo ao vivo em lockstep). */
  realtime(name: string): RealtimeChannel {
    return this.sb.channel(name, { config: { broadcast: { self: false, ack: false } } });
  }
}
