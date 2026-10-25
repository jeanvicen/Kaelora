// Abertura de baú decidida no servidor (semente secreta, garantia, fragmentos).
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.openChest(userId, body));
