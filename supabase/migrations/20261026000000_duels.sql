-- ============================================================
-- Kaelora — duelo ao vivo (Fase 8)
-- O jogo acontece em lockstep pelo Supabase Realtime (broadcast, sem tabela).
-- No fim, cada jogador manda as jogadas para a Edge Function `duel-submit`;
-- quando os dois concordam, o servidor re-simula e paga cada lado uma vez.
-- ============================================================
create table if not exists public.duels (
  match_id text primary key,
  record jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.duels enable row level security;
-- sem políticas: só o servidor lê e escreve

create index if not exists duels_created_idx on public.duels (created_at);
