// Entrada do jogador online: cria o estado (ou importa o progresso do aparelho
// com limites), processa invasões pendentes e devolve o save.
import { serve } from '../_shared/handler.ts';

serve((server, userId, body) => server.bootstrap(userId, { name: body.name, element: body.element, localSave: body.localSave }));
