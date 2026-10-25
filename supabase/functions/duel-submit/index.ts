// Fim do duelo ao vivo: cada jogador manda o combinado e as jogadas dos dois
// lados. Quando os dois concordam, o servidor re-simula e paga cada um.
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.submitDuel(userId, body));
