// Resgate de recompensas (álbum, missões, sequência de login, passe, ligas).
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.claimReward(userId, body));
