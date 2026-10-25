// Embrulho comum das Edge Functions: CORS, autenticação pelo JWT do jogador,
// banco com a service role e tradução de erros do jogo para HTTP.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GameError, GameServer } from './kaelora-server.js';
import { SupabaseDb } from './db.ts';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('KAELORA_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

type Server = InstanceType<typeof GameServer>;
// deno-lint-ignore no-explicit-any
export type Handler = (server: Server, userId: string, body: any) => Promise<unknown>;

/** Cria o endpoint: só aceita POST de jogador autenticado. */
export function serve(handler: Handler): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    // quem está chamando (pelo token do próprio jogador)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: who, error: authError } = await asUser.auth.getUser();
    if (authError || !who?.user) return json({ error: 'Faça login para jogar online' }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const server = new GameServer(new SupabaseDb(admin) as never);
    try {
      const body = await req.json().catch(() => ({}));
      const out = await handler(server, who.user.id, body ?? {});
      return json(out);
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Erro no servidor' }, 500);
    }
  });
}
