// Matchmaking: lista alvos (jogadores reais + rivais-bot) ou começa a batalha
// contra um deles (o servidor sorteia a semente e guarda a cidade do alvo).
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => (body.op === 'start' ? server.startBattle(userId, body) : server.matchmaking(userId, body)));
