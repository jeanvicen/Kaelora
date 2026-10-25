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

## Fase 2 — Batalha ⏳
## Fase 3 — Coleção ⏳
## Fase 4 — Baús e Economia ⏳
## Fase 5 — Online ⏳
## Fase 6 — Retenção ⏳
## Fase 7 — Conteúdo e polimento ⏳
## Fase 8 — Multiplayer ao vivo ⏳
