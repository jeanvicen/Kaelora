# KAELORA — Especificação do Jogo (Klipza Studio)

> Este arquivo é a fonte da verdade do projeto. Leia inteiro antes de qualquer tarefa.
> Ao fim de cada sessão, atualize `PROGRESS.md` com o que foi feito, o que falta e bugs conhecidos.

---

## 0. Como trabalhar neste projeto

- Construa por **FASES** (seção 15). Uma fase por vez, nunca pule.
- Antes de codar uma fase: apresente um plano curto (arquivos a criar/alterar, decisões técnicas) e espere aprovação.
- Ao terminar uma fase: `npm run typecheck`, `npm run build` e `npm test` sem erros, commit com mensagem clara, atualizar `PROGRESS.md` e **PARAR** pedindo teste no celular.
- **Edições cirúrgicas.** Nunca reescreva, refatore ou "melhore" algo que não foi pedido. Ao corrigir um bug, mexa só no necessário e diga exatamente o que mudou.
- Toda UI e texto do jogo em **português do Brasil**. Código, arquivos e variáveis em inglês.
- **Mobile first:** teste sempre em viewport 844×390 (paisagem). Toque é o controle principal.
- Sem artista 3D: todos os modelos são **gerados por código** (voxel procedural, ver seção 3).
- Sem assets de áudio: efeitos sonoros gerados via Web Audio (síntese procedural).

---

## 1. Visão

**Pitch:** Construa sua cidade, monte um esquadrão de 5 personagens entre mais de 1000, e invada cidades de outros jogadores por uma estrada que liga as duas. Se o seu Núcleo cair, sua cidade é saqueada, e a vingança começa.

**Pilares (toda decisão deve servir a eles):**
1. **Sessões curtas e intensas:** uma batalha dura até 3 minutos.
2. **Tudo que você constrói pode cair:** perder dói, por isso vencer importa.
3. **Sempre existe um próximo objetivo visível:** nunca deixe o jogador sem saber o que fazer.
4. **Abrir um baú é um evento:** suspense, luz, som e recompensa.
5. **Bonito em qualquer celular:** estilo forte e leve, não realismo pesado.

---

## 2. Stack e arquitetura

- **Front:** Three.js + TypeScript (strict) + Vite, empacotado como **PWA instalável** (manifest, service worker, ícones, tela cheia, trava em paisagem).
- **UI:** camada HTML/CSS sobre o canvas (não desenhar UI dentro do WebGL).
- **Backend:** Supabase (Auth, Postgres com RLS, Realtime, Edge Functions).
- **Deploy:** Vercel. Repositório no GitHub.
- **Testes:** Vitest (obrigatório para a simulação de batalha e para o gerador de personagens).

**Estrutura de pastas:**
```
src/
  core/        loop do jogo, gerenciador de cenas, input de toque, save, áudio
  sim/         simulação de batalha DETERMINÍSTICA (sem Three.js, sem DOM)
  render/      geração voxel, materiais toon, contorno, partículas, câmeras
  scenes/      city/, battle/, chest/, menus/
  content/     gerador de personagens, nomes, habilidades, balanceamento
  data/        JSON de construções, baús, economia, eventos
  ui/          componentes HTML/CSS das telas
  net/         cliente Supabase, sincronização, matchmaking
supabase/
  migrations/  tabelas e RLS
  functions/   validação de batalha, abertura de baús, saque
```

**Regra de ouro da simulação:** `src/sim` roda em tick fixo de 30 Hz, com RNG por semente e sem `Math.random()` nem `Date.now()`. A mesma semente + as mesmas jogadas = o mesmo resultado, sempre. Isso permite replay, validação no servidor e multiplayer ao vivo.

**Desempenho:** meta de 60 fps em celular intermediário, mínimo 30 fps. Use InstancedMesh, geometria voxel com faces internas removidas e merge por chunk, atlas de cores, pooling de partículas e projéteis, sombras simples (blob shadow), três presets de gráficos (Baixo/Médio/Alto).

---

## 3. Direção de arte: "Voxel Toon"

- Modelos voxel/low-poly gerados por código, com **toon shading de 3 tons**, **contorno preto** (inverted hull) e cores muito saturadas. Visual de desenho animado caprichado, cara de pixel art em 3D.
- **Mundo:** era futurista-tropical. Cidades com néon, vegetação vibrante, tecnologia brilhante, céu com gradiente e nuvens voxel. **Nada medieval.**
- **Ciclo de dia e noite** na cidade: à noite as janelas e o néon acendem.
- **Personagens:** proporção chibi (cabeça grande), silhueta forte que identifica a classe à distância.
- **Animações** (procedurais, por transformação de partes): idle, andar, atacar, habilidade, dano, morte e comemoração.
- **Destruição:** construções que caem explodem em cubos voxel com física simples e somem aos poucos.
- **Cores de raridade** (usadas em cartas, bordas, brilhos, baús e auras):
  - Comum: cinza `#9AA3AD`
  - Raro: azul `#3B8BFF`
  - Épico: roxo `#A64DFF`
  - Lendário: dourado `#FFC93C` com brilho pulsante
  - Extremo: vermelho prismático animado (gradiente que gira entre vermelho, magenta e laranja) com aura de partículas

---

## 4. Cidade (vista de cima)

- Câmera isométrica: arrastar para mover, pinça para zoom, toque para selecionar.
- Grade de 24×24 (cresce com o nível do Núcleo).
- **Modo edição:** arrastar e soltar, girar, guardar no estoque, com indicação verde/vermelha de posição válida.
- **Construções** (todas com nível, vida, custo e tempo de upgrade, definidos em `data/buildings.json`):
  - **Núcleo:** coração da cidade, tem vida. Se cair, a cidade cai. O nível dele libera tudo o mais.
  - **Barreiras / Muralhas:** bloqueiam o avanço na estrada.
  - **Torres:** Canhão (dano em área), Laser (alvo único rápido), Gelo (lentidão), Tesla (ricochete), Morteiro (longo alcance).
  - **Armadilhas:** escondidas do atacante até serem ativadas.
  - **Geradores de moedas** e **Cofre** (protege uma parte das moedas em caso de saque).
  - **Quartel:** aumenta o nível máximo dos personagens.
  - **Laboratório:** pesquisas permanentes (mais energia, mais vida das barreiras etc.).
- **Vida na cidade:** moradores voxel andando, veículos, fumaça, luzes e pássaros.
- **O layout salvo é a defesa.** A ordem das defesas na estrada segue a distância de cada uma até a entrada da cidade.

---

## 5. Batalha (vista lateral na estrada)

**Transição:** ao confirmar uma invasão, a câmera desce da vista de cima, gira e para numa **visão lateral 2.5D** da estrada que liga a cidade do atacante (esquerda) à do defensor (direita). Duração de 1,5 s com som e efeito de velocidade.

**Estrutura:**
- As defesas do defensor aparecem ao longo da estrada; o **Núcleo** fica no final.
- O atacante tem as **5 cartas** do esquadrão na parte de baixo da tela.
- **Energia:** máximo 10, recarrega 1 a cada 1,5 s. Cada carta custa entre 2 e 7. Jogar uma carta coloca o personagem na estrada; ele pode voltar para a mão depois de um tempo de recarga.
- Cada personagem tem **ataque automático** e **1 habilidade** com recarga, ativada tocando no retrato dele.
- **Ultimate do esquadrão:** uma barra que enche com o dano causado; quando cheia, um ataque especial em tela cheia com câmera lenta.
- **Duração:** 3 minutos. Nos últimos 30 s, a energia recarrega 2× mais rápido ("Frenesi").
- **Vitória:** derrubar o Núcleo. **Estrelas:** 1 por 50% destruído, 1 pelo Núcleo, 1 por vencer com 60 s ou mais sobrando.
- Barras de vida visíveis em tudo: Núcleo, barreiras, torres e personagens.

**Sensação (juice), obrigatório:**
- Hit stop de 40 a 60 ms em golpes fortes, tremor de câmera proporcional ao dano.
- Números de dano flutuantes (crítico em amarelo e maior), textos de combo.
- Câmera lenta de 1 s quando o Núcleo cai, com explosão voxel.
- Vibração do celular (`navigator.vibrate`) em impactos e vitória.
- Som em camadas: impacto, voz curta do personagem, multidão da cidade.

---

## 6. Derrota e cidade saqueada

- Se o Núcleo do defensor cai, a cidade fica **SAQUEADA**:
  - Perde as moedas não protegidas pelo Cofre.
  - Algumas construções ficam destruídas (desativadas até reparo).
  - **Nunca perde a coleção de personagens.**
- O jogador saqueado escolhe:
  - **Reconstruir do zero:** começa uma cidade nova e recebe um Pacote de Recomeço (moedas + 1 baú de Prata).
  - **Retomar:** tem **48 horas** para invadir quem o saqueou usando o que sobrou. Se vencer, recupera o que perdeu mais um bônus.
- Depois de saqueado: **escudo de 12 h** contra novas invasões.
- **Mural da Vingança:** lista quem te saqueou, com botão direto para revidar.
- **Proteção de iniciante:** ninguém pode invadir o jogador nas primeiras 72 h ou até o nível de conta 5.

---

## 7. Personagens (1008)

**Geração** em `src/content`, totalmente determinística por semente e salva em `data/characters.json`:
- **12 classes:** Tanque, Lutador, Atirador, Mago, Curandeiro, Invocador, Assassino, Construtor, Sabotador, Controlador, Bombardeiro, Suporte.
- **6 elementos** em dois ciclos de vantagem (+30% de dano):
  - Solar > Raiz > Maré > Solar
  - Volt > Cristal > Sombra > Volt
- **14 variantes** por combinação de classe e elemento: 12 × 6 × 14 = **1008 personagens**.
- Cada um tem: nome único, visual voxel único (cabeça, corpo, arma, acessório, paleta), atributos (vida, dano, velocidade, alcance, custo de energia) e habilidade (base da classe + modificador do elemento + modificador da variante).
- **Nomes:** gerador de sílabas por elemento com checagem de unicidade. Nenhum nome repetido e nenhum nome de personagem de jogo existente.
- **Os 60 primeiros** são feitos com capricho manual: visual e habilidade especiais, falas e uma linha de história.

**Distribuição de raridades:** Comum 400, Raro 300, Épico 180, Lendário 96, Extremo 32.

**Começo:** o jogador inicia com **5 personagens Comuns fracos**. Todo o resto vem de baús.

**Evolução:** duplicatas viram fragmentos. Fragmentos + moedas sobem estrelas (1 a 5); XP de batalha sobe nível (limitado pelo Quartel).

**Sinergias do esquadrão:**
- 3 ou mais do mesmo elemento: +15% de vida para o esquadrão.
- 2 da mesma classe: bônus pequeno da classe.
- Mostrar as sinergias ativas na tela de montagem.

**Álbum:** coleção com porcentagem de conclusão por elemento e recompensas a cada marco (10%, 25%, 50%, 75%, 100%).

---

## 8. Baús

| Baú | Comum | Raro | Épico | Lendário | Extremo |
|---|---|---|---|---|---|
| Madeira | 85% | 14% | 1% | 0% | 0% |
| Prata | 60% | 32% | 7% | 1% | 0% |
| Ouro | 35% | 40% | 20% | 4,5% | 0,5% |
| Mágico | 0% | 45% | 40% | 13% | 2% |
| Extremo | 0% | 0% | 50% | 40% | 10% |

- As chances aparecem na tela, sempre, antes de abrir.
- **Garantia:** Lendário garantido a cada 40 baús de Ouro ou superiores sem Lendário; Extremo garantido a cada 150.
- **Animação de abertura:** baú treme, a fresta brilha na cor da raridade mais alta, a tampa explode em luz, a carta gira e revela. Lendário e Extremo têm cena especial com câmera lenta e som próprio. Toque para pular depois da primeira vez.
- Baús vêm de vitórias, missões, eventos, passe e loja.
- Toda abertura é decidida **no servidor** (Edge Function), nunca no cliente.

---

## 9. Economia e progressão

- **Moedas:** ganhas em batalhas, geradores e missões. Usadas em construções e evolução.
- **Diamantes:** raros. Vêm de conquistas, eventos, passe e loja. Usados em baús especiais e aceleradores.
- **Nível de conta:** XP de tudo que o jogador faz. Cada nível libera algo novo (construção, modo, slot, tipo de baú).
- **Troféus e ligas:** Bronze, Prata, Ouro, Diamante, Mestre e Extremo, com recompensas por liga.
- Todos os números ficam em `data/economy.json` para balancear sem mexer em código.

---

## 10. Loops de retenção (o que faz voltar)

- **Sessão:** uma batalha de 3 min sempre termina com recompensa e com o próximo objetivo visível.
- **Diário:** baú grátis a cada 4 h (máximo 2 acumulados), 3 missões diárias, sequência de login de 7 dias com recompensa crescente.
- **Semanal:** liga com reset, evento semanal com regra especial (ex.: "só personagens Volt", "Núcleo com o dobro de vida").
- **Temporada (30 dias):** passe com trilha grátis e premium, personagem Extremo exclusivo no fim, ranking global.
- **Social:** Mural da Vingança, replays compartilháveis da batalha, ranking de amigos.
- **Barra de "próximo objetivo"** sempre visível na tela da cidade.
- **Notificações (PWA):** baú pronto, cidade atacada, escudo acabando, evento começando.

**Monetização justa:** diamantes, passe, pacotes e skins cosméticas. Nada de vitória comprada: o matchmaking compara o poder do esquadrão e da cidade. Chances de baú sempre visíveis.

---

## 11. Modos

1. **Invasão (PvP assíncrono):** atacar a cidade de outro jogador. A defesa é a IA usando o layout salvo dele. Matchmaking por poder e troféus.
2. **Treinamento:** cidades-teste e bots com dificuldade ajustável. Nada se perde. Inclui um tutorial guiado nas 3 primeiras batalhas.
3. **Eventos:** desafios com regras especiais e recompensas exclusivas.
4. **Multiplayer ao vivo 1v1:** os dois jogadores na mesma estrada, cada um atacando o Núcleo do outro, ao mesmo tempo. Lockstep com a simulação determinística via Supabase Realtime.

---

## 12. Telas e fluxo

Splash com logo animado → Login → **Cidade** (tela principal, com acesso a tudo) → Esquadrão/Coleção/Álbum → Baús → Mapa de Invasão → Batalha → Resultado → Treinamento → Multiplayer → Eventos → Passe → Loja → Perfil e Ranking → Configurações (som, música, gráficos Baixo/Médio/Alto, vibração, idioma, conta).

- Navegação com barra inferior de ícones grandes.
- Transições animadas entre telas (máximo 300 ms).
- Botões com animação de toque e som.

---

## 13. Backend e segurança

- **Tabelas** (com RLS): `profiles`, `cities` (layout em JSON), `owned_characters`, `squads`, `battles` (semente + lista de jogadas), `chests`, `raid_status` (saque, escudo, prazo de retomada), `missions`, `events`, `season_pass`, `leaderboards`.
- **Edge Functions:** `validate-battle` (roda a mesma `src/sim` com a semente e as jogadas e confirma o resultado), `open-chest`, `apply-raid`, `claim-reward`, `matchmaking`.
- Moedas, diamantes, baús e resultados são escritos **só pelo servidor**. O cliente nunca define valores.
- Save local (IndexedDB) nas fases offline, migrando para a nuvem na Fase 5.

---

## 14. Proibido

- Nomes, personagens, artes, sons, danças ou identidade visual de qualquer jogo existente.
- `Math.random()` ou `Date.now()` dentro de `src/sim`.
- Lógica de economia ou de baús no cliente (a partir da Fase 5).
- Reescrever partes que já funcionam sem pedido.

---

## 15. Fases

**Fase 1 — Base e Cidade**
Projeto Vite + TS + Three.js, PWA, trava em paisagem, gerador voxel com toon shading e contorno, cena da cidade com grade, câmera de toque, modo edição, construções básicas (Núcleo, Barreira, Torre Canhão, Gerador), ciclo de dia e noite, save local.

**Fase 2 — Batalha**
Simulação determinística com testes, cena lateral da estrada, transição da cidade para a batalha, 5 personagens iniciais, energia, cartas, habilidades, ultimate, cidade-bot, tela de resultado com estrelas e todo o juice da seção 5.

**Fase 3 — Coleção**
Gerador dos 1008 personagens com testes de unicidade, 60 personagens manuais, tela de esquadrão, evolução, sinergias e álbum.

**Fase 4 — Baús e Economia**
Cinco tipos de baú com animação de abertura, garantia, moedas, diamantes, nível de conta e todos os números em JSON.

**Fase 5 — Online**
Supabase Auth, save na nuvem, Invasão PvP assíncrona, matchmaking, saque, escudo, retomada de 48 h, Mural da Vingança, proteção de iniciante e validação no servidor.

**Fase 6 — Retenção**
Missões diárias, baú grátis, sequência de login, ligas, eventos semanais, passe de temporada e notificações.

**Fase 7 — Conteúdo e polimento**
Treinamento com tutorial, Loja, Perfil, Ranking, Configurações, presets de gráficos, polimento visual e sonoro em todas as telas.

**Fase 8 — Multiplayer ao vivo**
Duelo 1v1 em tempo real com lockstep, reconexão e tratamento de desconexão.
