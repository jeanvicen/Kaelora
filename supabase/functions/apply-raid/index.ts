// Invasões pendentes (rivais enquanto o jogador estava fora) e a escolha da
// cidade saqueada: reconstruir do zero ou retomar em até 48 h.
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.applyRaid(userId, body));
