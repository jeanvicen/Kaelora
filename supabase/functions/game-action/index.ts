// Ações da cidade, coleção e preferências. O servidor repete a MESMA função
// pura que o cliente aplicou e devolve o estado oficial.
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.action(userId, body.name, body.args));
