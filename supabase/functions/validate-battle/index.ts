// Valida a batalha: re-simula com a semente e as jogadas (src/sim
// determinística). O resultado do servidor é o oficial; se o alvo for um
// jogador real, o saque é aplicado na cidade dele.
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.validateBattle(userId, body));
