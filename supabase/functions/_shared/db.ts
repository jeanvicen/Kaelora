// Banco do servidor sobre o Supabase (Postgres). Implementa o mesmo contrato
// `ServerDb` que o MemoryDb dos testes: estado canônico em `player_state` com
// controle de versão otimista + projeções nas tabelas da especificação.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ConflictError, cityPower, coinsAtRisk, coreLevel, protection } from './kaelora-server.js';

// deno-lint-ignore no-explicit-any
type Any = any;

export class SupabaseDb {
  /** Último estado lido de cada jogador (para só reescrever o que mudou). */
  private loaded = new Map<string, string>();

  constructor(private sb: SupabaseClient) {}

  async load(userId: string) {
    const { data, error } = await this.sb.from('player_state').select('state, version').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const st = data.state as Any;
    st.version = data.version;
    this.loaded.set(userId, JSON.stringify(st.save));
    return st;
  }

  async store(userId: string, st: Any, expectedVersion: number | null) {
    const row = { user_id: userId, state: st, version: st.version, updated_at: new Date().toISOString() };
    if (expectedVersion === null) {
      const { error } = await this.sb.from('player_state').insert(row);
      if (error) {
        if (error.code === '23505') throw new ConflictError();
        throw error;
      }
    } else {
      const { data, error } = await this.sb.from('player_state').update(row).eq('user_id', userId).eq('version', expectedVersion).select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new ConflictError();
    }
    await this.project(userId, st.save);
  }

  /** Mantém as tabelas de leitura (perfil, cidade, coleção...) iguais ao estado canônico. */
  private async project(userId: string, s: Any) {
    const prev = this.loaded.get(userId);
    const before = prev ? JSON.parse(prev) : null;
    const changed = (k: string) => !before || JSON.stringify(before[k]) !== JSON.stringify(s[k]);
    const now = Date.now();
    const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);
    const prot = protection(s, now);
    const jobs: PromiseLike<unknown>[] = [];
    jobs.push(
      this.sb.from('profiles').upsert({
        id: userId,
        name: s.profile.name,
        avatar: s.profile.avatar ?? 0,
        account_level: s.profile.accountLevel,
        trophies: s.profile.trophies,
        best_trophies: s.profile.bestTrophies,
        battles: s.stats.battles,
        wins: s.stats.wins,
        updated_at: new Date().toISOString(),
      }),
    );
    jobs.push(
      this.sb.from('cities').upsert({
        user_id: userId,
        name: s.city.name,
        element: s.city.element,
        core_level: coreLevel(s.city),
        layout: s.city.buildings,
        research: s.city.research,
        power: cityPower(s.city.buildings, s.city.research),
        trophies: s.profile.trophies,
        coins_at_risk: coinsAtRisk(s),
        shield_until: iso(s.raids.shieldUntil),
        protected_until: prot.kind === 'beginner' ? iso(prot.until) : null,
        pending_choice: !!s.raids.pendingChoice,
        updated_at: new Date().toISOString(),
      }),
    );
    if (changed('raids'))
      jobs.push(
        this.sb.from('raid_status').upsert({
          user_id: userId,
          shield_until: iso(s.raids.shieldUntil),
          beginner_until: iso(s.raids.beginnerUntil),
          pending_choice: s.raids.pendingChoice,
          revenge: s.raids.revenge,
          // replays ficam só no estado canônico (podem ser grandes)
          log: s.raids.log.map((e: Any) => ({ ...e, replay: undefined })),
          updated_at: new Date().toISOString(),
        }),
      );
    if (changed('squad')) jobs.push(this.sb.from('squads').upsert(s.squad.map((id: number, slot: number) => ({ user_id: userId, slot, char_id: id }))));
    if (changed('collection')) {
      const rows = Object.entries(s.collection).map(([id, c]: [string, Any]) => ({ user_id: userId, char_id: Number(id), level: c.level, stars: c.stars, fragments: c.fragments, copies: c.copies }));
      if (rows.length) jobs.push(this.sb.from('owned_characters').upsert(rows));
    }
    if (changed('chests')) {
      jobs.push(
        (async () => {
          await this.sb.from('chests').delete().eq('user_id', userId);
          const rows = s.chests.inventory.map((c: Any) => ({ user_id: userId, uid: c.uid, type: c.type, source: c.source, received_at: iso(c.receivedAt) }));
          if (rows.length) await this.sb.from('chests').insert(rows);
        })(),
      );
    }
    if (changed('missions')) jobs.push(this.sb.from('missions').upsert({ user_id: userId, day: s.missions.day, list: s.missions.list, updated_at: new Date().toISOString() }));
    if (changed('pass'))
      jobs.push(
        this.sb.from('season_pass').upsert({
          user_id: userId,
          season: s.pass.season,
          xp: s.pass.xp,
          premium: s.pass.premium,
          claimed_free: s.pass.claimedFree,
          claimed_premium: s.pass.claimedPremium,
          updated_at: new Date().toISOString(),
        }),
      );
    await Promise.all(jobs);
    this.loaded.set(userId, JSON.stringify(s));
  }

  async candidates(userId: string, q: { trophies: number; now: number; limit: number }) {
    const { data: ids, error } = await this.sb.rpc('matchmaking_candidates', { p_user: userId, p_trophies: q.trophies, p_limit: q.limit });
    if (error) throw error;
    const list = (ids ?? []).map((r: Any) => (typeof r === 'string' ? r : r.matchmaking_candidates ?? r.user_id));
    if (!list.length) return [];
    const { data, error: e2 } = await this.sb.from('player_state').select('user_id, state, version').in('user_id', list);
    if (e2) throw e2;
    return (data ?? []).map((r: Any) => ({ userId: r.user_id, state: { ...r.state, version: r.version } }));
  }

  async recordBattle(rec: Any) {
    const { error } = await this.sb.from('battles').insert({
      id: rec.id,
      attacker_id: rec.attackerId,
      defender_id: rec.defenderId,
      kind: rec.kind,
      seed: rec.seed,
      setup: rec.setup,
      commands: rec.commands,
      result: rec.result,
      client_hash: rec.clientHash,
      created_at: new Date(rec.at).toISOString(),
    });
    if (error) console.error('recordBattle', error);
  }

  randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
}
