-- ============================================================
-- Kaelora — esquema inicial (Fase 5)
--
-- Regra de ouro: moedas, diamantes, baús e resultados são escritos SÓ pelo
-- servidor (Edge Functions com a service role, que ignora RLS). O cliente
-- autenticado só LÊ o que é dele (e o que é público, como cidades e ranking).
-- O estado canônico de cada jogador fica em `player_state` (jsonb); as outras
-- tabelas são projeções dele, mantidas pelas Edge Functions.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ estado canônico
create table if not exists public.player_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.player_state enable row level security;
-- sem políticas: nenhum cliente lê ou escreve (contém a semente secreta do RNG)

-- ------------------------------------------------------------ perfis
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  avatar integer not null default 0,
  account_level integer not null default 1,
  trophies integer not null default 0,
  best_trophies integer not null default 0,
  league text not null default 'bronze',
  battles integer not null default 0,
  wins integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "perfis públicos para quem está logado" on public.profiles for select to authenticated using (true);
create index if not exists profiles_trophies_idx on public.profiles (trophies desc);

-- ------------------------------------------------------------ cidades (o layout salvo é a defesa)
create table if not exists public.cities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  element text not null,
  core_level integer not null default 1,
  layout jsonb not null,
  research jsonb not null default '{}'::jsonb,
  power integer not null default 0,
  trophies integer not null default 0,
  coins_at_risk integer not null default 0,
  shield_until timestamptz,
  protected_until timestamptz,
  pending_choice boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.cities enable row level security;
create policy "cidades visíveis para quem está logado" on public.cities for select to authenticated using (true);
create index if not exists cities_matchmaking_idx on public.cities (trophies);

-- ------------------------------------------------------------ coleção e esquadrão
create table if not exists public.owned_characters (
  user_id uuid not null references auth.users (id) on delete cascade,
  char_id integer not null check (char_id between 1 and 1008),
  level integer not null default 1,
  stars integer not null default 1 check (stars between 1 and 5),
  fragments integer not null default 0,
  copies integer not null default 1,
  obtained_at timestamptz not null default now(),
  primary key (user_id, char_id)
);
alter table public.owned_characters enable row level security;
create policy "coleção: só a própria" on public.owned_characters for select to authenticated using (auth.uid() = user_id);

create table if not exists public.squads (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 0 and 4),
  char_id integer not null,
  primary key (user_id, slot)
);
alter table public.squads enable row level security;
create policy "esquadrões visíveis para quem está logado" on public.squads for select to authenticated using (true);

-- ------------------------------------------------------------ batalhas (semente + jogadas = replay)
create table if not exists public.battles (
  id text primary key,
  attacker_id uuid not null references auth.users (id) on delete cascade,
  defender_id uuid references auth.users (id) on delete set null,
  kind text not null,
  seed bigint not null,
  setup jsonb not null,
  commands jsonb not null,
  result jsonb not null,
  client_hash bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.battles enable row level security;
create policy "batalhas: atacante ou defensor" on public.battles for select to authenticated using (auth.uid() = attacker_id or auth.uid() = defender_id);
create index if not exists battles_attacker_idx on public.battles (attacker_id, created_at desc);
create index if not exists battles_defender_idx on public.battles (defender_id, created_at desc);

-- ------------------------------------------------------------ baús
create table if not exists public.chests (
  user_id uuid not null references auth.users (id) on delete cascade,
  uid text not null,
  type text not null check (type in ('madeira', 'prata', 'ouro', 'magico', 'extremo')),
  source text not null default '',
  received_at timestamptz not null default now(),
  primary key (user_id, uid)
);
alter table public.chests enable row level security;
create policy "baús: só os próprios" on public.chests for select to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------ saque, escudo e vingança
create table if not exists public.raid_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  shield_until timestamptz,
  beginner_until timestamptz,
  pending_choice jsonb,
  revenge jsonb not null default '[]'::jsonb,
  log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.raid_status enable row level security;
create policy "saque: só o próprio" on public.raid_status for select to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------ retenção (Fase 6)
create table if not exists public.missions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day text not null,
  list jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.missions enable row level security;
create policy "missões: só as próprias" on public.missions for select to authenticated using (auth.uid() = user_id);

create table if not exists public.events (
  id text primary key,
  week text not null,
  title text not null,
  rules jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
alter table public.events enable row level security;
create policy "eventos públicos" on public.events for select to authenticated using (true);

create table if not exists public.season_pass (
  user_id uuid primary key references auth.users (id) on delete cascade,
  season integer not null default 1,
  xp integer not null default 0,
  premium boolean not null default false,
  claimed_free integer[] not null default '{}',
  claimed_premium integer[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.season_pass enable row level security;
create policy "passe: só o próprio" on public.season_pass for select to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------ ranking
create or replace view public.leaderboards
with (security_invoker = true) as
  select id as user_id, name, account_level, trophies, league,
         rank() over (order by trophies desc, best_trophies desc) as position
  from public.profiles
  order by trophies desc
  limit 1000;

-- ------------------------------------------------------------ matchmaking
-- Cidades que podem ser invadidas agora, com troféus parecidos (aleatórias).
create or replace function public.matchmaking_candidates(p_user uuid, p_trophies integer, p_limit integer default 8)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id
  from public.cities c
  where c.user_id <> p_user
    and abs(c.trophies - p_trophies) <= 400
    and (c.shield_until is null or c.shield_until < now())
    and (c.protected_until is null or c.protected_until < now())
    and not c.pending_choice
  order by random()
  limit greatest(1, least(p_limit, 20));
$$;
revoke all on function public.matchmaking_candidates(uuid, integer, integer) from public, anon, authenticated;

-- ------------------------------------------------------------ tempo real
-- O defensor recebe na hora quando a cidade dele é atacada.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.raid_status;
  end if;
end $$;
