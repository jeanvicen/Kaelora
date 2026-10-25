# PROGRESS — Kaelora

Registro do andamento por fase (seção 15 do `CLAUDE.md`). Atualizado ao fim de cada fase.

## Fase 1 — Base e Cidade ✅

**Feito**
- Projeto Vite 8 + TypeScript 7 (strict) + Three.js r186, PWA com `vite-plugin-pwa` (manifest em pt-BR, `display: fullscreen`, `orientation: landscape`, service worker com precache e aviso de nova versão).
- Ícones do PWA gerados por código (`scripts/generate-icons.mjs`, rasterizador PNG em Node puro, sem dependências): `any`, `maskable`, `apple-touch-icon`, favicon.
- Trava em paisagem: manifest + `requestFullscreen` → `screen.orientation.lock` (Android) e overlay "gire o celular" no retrato (iOS).
- Gerador voxel (`src/render/voxel.ts`): grade com ferramentas de escultura, greedy meshing com faces internas removidas, oclusão ambiente por vértice, normais suavizadas para o contorno, merge de geometrias.
- Material toon de 3 tons (luz / meio-tom / sombra) com néon permanente, janelas que acendem à noite (algumas ficam apagadas, sorteadas), folhas balançando no vento, neblina e flash/tint por objeto (`src/render/toon.ts`).
- Contorno preto inverted hull com espessura constante em pixels (peças emissivas ficam sem contorno para não vazar nos degraus).
- Céu com gradiente, sol/lua e estrelas; oceano toon com faixas de profundidade, espuma animada na costa e brilhos; dia e noite com keyframes de cor (`src/render/daynight.ts`). Ciclo completo a cada 8 minutos.
- Presets de gráficos Baixo/Médio/Alto (pixel ratio, contorno, bloom só no Alto, densidade da vida na cidade) com detecção automática.
- Modelos voxel de TODAS as construções (Núcleo com cristal flutuante do elemento, Barreira com muralhas automáticas entre vizinhas, Canhão, Laser, Gelo, Tesla, Morteiro, Armadilha, Gerador com moeda holográfica, Cofre, Quartel, Laboratório e 6 decorações), com 3 tiers visuais por nível.
- Cidade: ilha voxel com grama em xadrez, calçada com luzes, praia irregular, falésias, portal de entrada, estrada e ponte para o mar; palmeiras e pedras na praia.
- Câmera isométrica de toque: arrastar (com inércia), pinça e roda do mouse para zoom, toque para selecionar (raycast nas malhas + casa no chão).
- Modo edição: arrastar e soltar, girar, guardar no estoque, recolocar do estoque, pegada verde/vermelha, ordem das defesas na estrada (por distância até a entrada) em selos numerados.
- Construir pela loja (abas por categoria, miniaturas renderizadas dos modelos 3D reais, limites por nível do Núcleo).
- Melhorias com tempo real, 2 construtores, aceleração com diamantes, conclusão com festa de partículas; o Núcleo libera níveis e a grade cresce (24 → 40) mantendo a cidade centralizada.
- Gerador de moedas com bolha de coleta flutuante; Cofre; reparo de construções destruídas (estado "ruína" já suportado).
- Vida na cidade instanciada: moradores voxel andando (evitam construções), carros flutuantes, pássaros (dormem à noite), barcos, nuvens voxel e fumaça.
- Áudio 100% procedural (`src/core/audio.ts`): ~45 efeitos, vozes curtas com formantes, ambiência (mar/brisa/pássaros, multidão) e música generativa (cidade tropical-futurista, batalha, baú).
- Save local em IndexedDB com fallback para localStorage, debounce, gravação ao ir para segundo plano, exportar/importar código do save.
- UI em HTML/CSS: splash com logo animado, login (nome + elemento da ilha), HUD (perfil/XP, troféus/liga, moedas, diamantes, próximo objetivo sempre visível, botões laterais, barra inferior com BATALHAR), painel da construção, barra de edição, configurações completas, toasts, modais.
- `data/buildings.json` e `data/economy.json` com todos os números.
- Testes (Vitest): gerador voxel e lógica da cidade (16 testes).

**Bugs conhecidos / observações**
- Antialias do WebGL é definido ao criar o contexto: trocar de/para o preset Baixo só muda o antialias depois de recarregar.

## Fase 2 — Batalha ✅

**Feito**
- Simulação determinística em `src/sim` (sem Three.js/DOM): tick fixo de 30 Hz, matemática inteira (milésimos de casa), RNG `sfc32` por semente, hash FNV do estado, sem `Math.random()`/`Date.now()` (teste que varre a pasta garante).
- Energia exata (máx. 10, +1 a cada 1,5 s; Frenesi 2× nos últimos 30 s), cartas de 2 a 7, recarga para voltar à mão, habilidade por personagem com anel de recarga, barra de Ultimate que enche com o dano, vantagem de elemento (+30%) nos dois ciclos, estrelas (50% / Núcleo / 60 s sobrando), tempo esgotado, desistência.
- Defesas seguem a ordem salva na cidade (distância até a entrada): barreiras, 5 torres, armadilhas escondidas até ativar, geradores/cofre/quartel/lab como alvos, Núcleo no fim.
- IA do bot dentro da simulação (RNG separado) para cidade-bot e duelos; replays = configuração + lista de jogadas, link compartilhável `#replay=`; `runBattle` headless (~5 ms por batalha).
- Personagens voxel chibi gerados por código com animações procedurais (idle, andar, atacar, habilidade, dano, morte, comemoração) e miniaturas renderizadas.
- Cena lateral 2.5D da estrada: ponte entre as ilhas, cidade do defensor com skyline neon, portal, ilhas distantes; câmera que acompanha a linha de frente.
- Transição cidade → batalha: câmera mergulha na entrada, linhas de velocidade, som de "whoosh" e descida para a vista lateral (~1,5 s).
- Juice: hit stop 45–80 ms, tremor proporcional ao dano, números flutuantes (crítico amarelo e maior), combos, câmera lenta de 1 s + explosão voxel na queda do Núcleo, colapso de construções em cubos, raios Tesla, lasers, ondas de choque, `navigator.vibrate`, som em camadas (impacto + voz + multidão), cinemática de Ultimate.
- Mapa de Invasão com 3 cidades-bot (dificuldade estimada simulando 3 batalhas), trocar rivais com moedas, chips de vantagem de elemento.
- Tela de resultado com estrelas animadas, moedas, troféus, XP, baú ganho e link do replay; pausa com desistir.
- Tutorial guiado nas 3 primeiras batalhas (dicas contextuais).
- O render 3D é suspenso enquanto uma tela opaca cobre o jogo (economiza bateria).
- Testes: determinismo, replay, energia, Frenesi, ciclo de cartas, vantagem, estrelas, tempo esgotado, armadilhas, duelo, ordem da estrada (27 testes na simulação/personagens).

**Bugs conhecidos / observações**
- Balanceamento inicial: o esquadrão inicial vence com folga cidades-bot de Núcleo 1–2 e perde a partir do Núcleo 4 (sondagem com 400 batalhas headless).

## Fase 3 — Coleção ✅

**Feito**
- Gerador determinístico dos 1008 personagens (12 classes × 6 elementos × 14 variantes) com distribuição exata de raridades (400/300/180/96/32), nomes únicos por sílabas de elemento com lista de bloqueio, visual voxel único por personagem; `data/characters.json` gerado por `scripts/export-characters.mjs`.
- 60 personagens feitos à mão (visual, habilidade, falas e história), incluindo os 5 iniciais Comuns e fracos.
- **Vitrine 3D** (`src/render/showroom.ts`): pódio voxel com néon na cor da raridade, raios de luz girando, brilho e partículas (Épico+, Extremo com aura prismática). Renderizada pelo loop do jogo como overlay (`Game.overlay`) e enquadrada no retângulo de cada tela com view offset da câmera. Telas "isoladas" escondem o HUD e o que está por baixo.
- **Esquadrão**: os 5 personagens lado a lado nos pódios, etiquetas com nível/estrelas/custo, toque para ver ou trocar, sinergias ativas e dicas das inativas.
- **Coleção**: grade com as 1008 cartas (silhuetas para os não encontrados), filtros por elemento, raridade e classe, "só os meus", ordenação (poder, raridade, nível, custo), retratos renderizados sob demanda (só o que aparece na tela).
- **Detalhes**: personagem 3D girando com o dedo, animações de ataque/habilidade/festa com voz, atributos com prévia da próxima estrela, habilidade, vantagem de elemento, história e falas, navegação entre cartas, colocar no esquadrão escolhendo a vaga.
- **Evolução**: duplicatas viram fragmentos; fragmentos + moedas sobem estrelas (1 a 5, +12% de vida e dano por estrela); XP de batalha sobe nível até o limite do Quartel.
- **Álbum**: % da coleção total e por elemento, 5 marcos por elemento (10/25/50/75/100%) com moedas, diamantes e baús.
- Próximo objetivo e selo na barra inferior avisam quando dá para evoluir alguém ou resgatar o Álbum.
- Cache LRU das geometrias voxel dos personagens (libera memória ao folhear a coleção).
- Testes: coleção, fragmentos, estrelas, esquadrão, limite do Quartel, álbum e objetivo (50 testes no total).

## Fase 4 — Baús e Economia ✅

**Feito**
- `data/chests.json`: os 5 baús (Madeira, Prata, Ouro, Mágico, Extremo) com a tabela de chances exata da especificação, cartas por baú, moedas e diamantes, garantia e bloqueio por nível de conta.
- Lógica em `src/meta/chests.ts` (pura e determinística pelo RNG do save, a mesma que a Edge Function `open-chest` vai rodar na Fase 5): sorteio por carta em pontos-base (4,5% = 450/10000), garantia de Lendário a cada 40 baús de Ouro+ sem Lendário e de Extremo a cada 150, melhor carta sempre por último (suspense), duplicatas viram fragmentos.
- Tela de **Baús**: inventário (até 8), loja de baús com diamantes (Ouro/Mágico/Extremo liberam por nível de conta), **chances por personagem sempre visíveis antes de abrir** e contador da garantia.
- **Abertura em 3D** (`src/scenes/chest/ChestStage.ts`): modelos voxel dos 5 baús com tampa articulada, queda com quique, tremedeira crescente com som e vibração, fresta brilhando na cor da melhor raridade, raios de luz, tampa explodindo em cubos e brilhos, coluna de luz e fonte de partículas. Lendário/Extremo: tremedeira mais longa em câmera lenta, clarão, comemoração e som especial.
- Cada personagem pula de dentro do baú e pousa ao lado dele; a **carta gira e revela** (1,5 volta; 3,5 voltas no Lendário/Extremo) com raridade, elemento, classe e "NOVO!"/"+fragmentos" e selo de garantia. Toque para pular depois da primeira vez de cada tipo; resumo final com moedas e diamantes.
- Botão "Abrir" direto na tela de resultado da batalha.
- **Nível de conta**: comemoração com o que foi liberado e o prêmio (moedas + diamantes), mostrada quando a cidade fica livre.
- Testes: tabela de chances, reprodutibilidade, distribuição real (60 mil cartas), ordem das cartas, garantia (nunca passa de 40 baús), abertura e compra (58 testes no total).

## Fase 5 — Online ✅

**Feito**
- **Registro único de ações** (`src/meta/actions.ts`): toda mudança no save (cidade, coleção, baús, batalha, defesa) é uma função pura registrada. O cliente offline executa direto; online, aplica as determinísticas na hora (otimista) e o servidor repete e confirma; sorteios (baús, alvos, semente da batalha) esperam o servidor.
- **Servidor autoritativo** (`src/server/`, independente de banco): matchmaking (jogadores reais com troféus parecidos e sem proteção + rivais-bot), início de batalha com semente secreta, **validação por re-simulação** (`src/sim` determinística — o resultado do servidor é o oficial), saque aplicado na cidade do defensor com controle de versão otimista, importação do progresso do aparelho com limites anti-trapaça, a semente do RNG nunca vai para o cliente.
- **Supabase**: migração com todas as tabelas da especificação (`profiles`, `cities`, `owned_characters`, `squads`, `battles`, `chests`, `raid_status`, `missions`, `events`, `season_pass`, `leaderboards` + `player_state` canônico) e RLS (cliente só lê o que é dele; escrita só pelo servidor); função SQL de matchmaking; tempo real em `raid_status`.
- **Edge Functions** (Deno): `bootstrap`, `game-action`, `open-chest`, `matchmaking`, `validate-battle`, `apply-raid`, `claim-reward`. Todas usam o mesmo código do jogo empacotado em `supabase/functions/_shared/kaelora-server.js` (`npm run build:server`).
- **Cliente online** (`src/net/cloud.ts`, só carregado com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`): convidado anônimo, link mágico por e-mail, vincular e-mail, sair, aviso em tempo real quando a cidade é atacada.
- **Saque e defesa** (`src/meta/defense.ts`): Núcleo derrubado = cidade SAQUEADA (perde as moedas fora do Cofre, construções derrubadas viram ruína, coleção nunca é perdida), **escudo de 12 h**, **proteção de iniciante** (72 h ou até o nível 5, o que vier antes), escolha **Reconstruir do zero** (cidade nova + Pacote de Recomeço) ou **Retomar** (48 h para revidar e recuperar tudo + 30%).
- Rivais-bot também invadem a cidade enquanto o jogador está fora (offline e online), com força calibrada por simulação (~50% de chance de saque numa cidade típica; tabela em `economy.json`).
- Telas: relatório "Sua cidade foi invadida!", escolha da cidade saqueada, **Mural da Vingança** (revidar, prazo, registro de defesas com **replay do ataque** visto do lado da defesa), botão "Defesas" na HUD com alerta e tempo de escudo, selo "JOGADOR" nos alvos reais do Mapa de Invasão, seção "Jogo online" nas Configurações.
- Testes: servidor (bootstrap, ações, baú, matchmaking, PvP completo com saque no defensor e vingança, hash falso, importação, concorrência) e defesa (proteção, saque, Cofre, reconstrução, replay, ataques offline) — 72 testes no total.

**Bugs conhecidos / observações**
- A parte online foi testada com o servidor em memória (Vitest) e com o bundle rodando no Deno; as Edge Functions passam no `deno check`. Ainda não foi exercitada contra um projeto Supabase real (precisa criar o projeto; passo a passo no README).
- A importação do progresso do aparelho é limitada a valores plausíveis, mas um save local editado ainda pode ganhar alguma vantagem uma única vez.

## Fase 6 — Retenção ⏳
## Fase 7 — Conteúdo e polimento ⏳
## Fase 8 — Multiplayer ao vivo ⏳
