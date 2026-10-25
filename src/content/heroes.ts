import type { ClassId, Element, Rarity } from '../meta/types.ts';
import type { CharacterLook } from './types.ts';

/**
 * Os 60 primeiros personagens, feitos com capricho manual: nome, título,
 * uma linha de história, 3 falas (entrada, habilidade, vitória), habilidade
 * com nome próprio e um toque especial no visual.
 * Os ids 1–5 são os iniciais (Comuns fracos).
 */
export interface HeroSpec {
  name: string;
  title: string;
  cls: ClassId;
  element: Element;
  rarity: Rarity;
  lore: string;
  lines: [string, string, string];
  ability: string;
  look?: Partial<CharacterLook>;
  starter?: boolean;
}

export const HEROES: HeroSpec[] = [
  // ---------------------------------------------------------------- iniciais (Comum)
  {
    name: 'Toco', title: 'o Escudo de Coco', cls: 'tanque', element: 'raiz', rarity: 'comum', starter: true,
    lore: 'Carregava cocos no porto até descobrir que aguentava mais pancada que qualquer muralha.',
    lines: ['Pode vir, que eu seguro!', 'Muralha de raiz!', 'Nem fez cosquinha.'], ability: 'Casca Grossa',
    look: { hat: 'helmet', accessory: 'pads', primary: 0x8fd64a, secondary: 0x8e5a2e },
  },
  {
    name: 'Faíska', title: 'a Pimenta do Bairro', cls: 'lutador', element: 'solar', rarity: 'comum', starter: true,
    lore: 'Dona da barraca de churrasco mais quente da orla, luta do mesmo jeito que tempera: sem economizar.',
    lines: ['Vai esquentar!', 'Toma essa brasa!', 'Fácil demais!'], ability: 'Brasa Rápida',
    look: { hat: 'headband', accessory: 'scarf', hairColor: 0xff4f5e },
  },
  {
    name: 'Zapi', title: 'Mira Neon', cls: 'atirador', element: 'volt', rarity: 'comum', starter: true,
    lore: 'Consertava letreiros de néon e pegou gosto por acertar tudo o que pisca.',
    lines: ['Na mira!', 'Rajada carregada!', 'Nem precisei recarregar.'], ability: 'Pisca-Pisca',
    look: { hat: 'cap', accessory: 'backpack' },
  },
  {
    name: 'Lumara', title: 'a Maré Mansa', cls: 'curandeiro', element: 'mare', rarity: 'comum', starter: true,
    lore: 'Salva-vidas da praia de cristal, nunca deixa ninguém afundar — nem no mar, nem na batalha.',
    lines: ['Respira fundo!', 'Onda de cura!', 'Todo mundo inteiro?'], ability: 'Boia de Cura',
    look: { hat: 'halo', accessory: 'none', primary: 0xff4f5e, secondary: 0xf6f2ea },
  },
  {
    name: 'Bumbo', title: 'o Barulhento', cls: 'bombardeiro', element: 'sombra', rarity: 'comum', starter: true,
    lore: 'Fazia fogos para as festas da ilha; um dia errou a quantidade e descobriu sua vocação.',
    lines: ['Tampa os ouvidos!', 'Chuva de bombas!', 'Que festa!'], ability: 'Foguetório',
    look: { hat: 'goggles', accessory: 'backpack' },
  },
  // ---------------------------------------------------------------- Comuns
  {
    name: 'Pipoca', title: 'o Ligeiro', cls: 'assassino', element: 'volt', rarity: 'comum',
    lore: 'Entregador de patinete elétrico que conhece todo atalho da cidade.',
    lines: ['Já cheguei!', 'Curto-circuito!', 'Entrega feita.'], ability: 'Atalho Elétrico',
    look: { hat: 'cap', accessory: 'scarf' },
  },
  {
    name: 'Marola', title: 'a Mestra das Docas', cls: 'construtor', element: 'mare', rarity: 'comum',
    lore: 'Ergue píeres em uma tarde e derruba muralhas em menos tempo ainda.',
    lines: ['Hora da obra!', 'Torreta no lugar!', 'Obra entregue no prazo.'], ability: 'Píer Armado',
    look: { hat: 'hardhat' },
  },
  {
    name: 'Grilo', title: 'o Desmontador', cls: 'sabotador', element: 'raiz', rarity: 'comum',
    lore: 'Desmonta qualquer coisa com um alicate e muita curiosidade. Montar de volta? Nem sempre.',
    lines: ['Deixa que eu desligo!', 'Pane geral!', 'Ops, quebrou.'], ability: 'Alicate Curioso',
    look: { hat: 'goggles', accessory: 'backpack' },
  },
  {
    name: 'Nina Vela', title: 'a Torcida', cls: 'suporte', element: 'solar', rarity: 'comum',
    lore: 'Puxa o coro da arquibancada desde criança; o grito dela faz qualquer um correr mais rápido.',
    lines: ['Vamos, time!', 'Grita comigo!', 'É campeão!'], ability: 'Coro da Arquibancada',
    look: { accessory: 'banner', hat: 'headband' },
  },
  {
    name: 'Quiri', title: 'a Colecionadora de Drones', cls: 'invocador', element: 'cristal', rarity: 'comum',
    lore: 'Montou o primeiro drone com peças de liquidificador. Hoje tem uma esquadrilha.',
    lines: ['Decolar!', 'Esquadrilha, ataque!', 'Bons drones.'], ability: 'Esquadrilha Caseira',
    look: { accessory: 'drone', hat: 'goggles' },
  },
  {
    name: 'Brizo', title: 'o Meteorologista', cls: 'controlador', element: 'mare', rarity: 'comum',
    lore: 'Previa o tempo na TV local até aprender a mudar o tempo de lugar.',
    lines: ['Frente fria chegando.', 'Campo de estase!', 'Previsão confirmada.'], ability: 'Frente Fria',
    look: { hat: 'antenna' },
  },
  {
    name: 'Tatu Lis', title: 'o Aprendiz de Selva', cls: 'mago', element: 'raiz', rarity: 'comum',
    lore: 'Estudou magia em livros de botânica; os feitiços dele ainda cheiram a mato.',
    lines: ['Abracadabraúna!', 'Meteoro de semente!', 'Funcionou mesmo?'], ability: 'Semente Cadente',
    look: { hat: 'wizard' },
  },
  // ---------------------------------------------------------------- Raros
  {
    name: 'Kaiara', title: 'a Fornalha', cls: 'tanque', element: 'solar', rarity: 'raro',
    lore: 'Forjou o próprio escudo no núcleo de um vulcão desativado.',
    lines: ['Atrás de mim!', 'Escudo de magma!', 'Ainda quente.'], ability: 'Escudo de Magma',
    look: { hat: 'horns' },
  },
  {
    name: 'Vento Rubi', title: 'Punho Lapidado', cls: 'lutador', element: 'cristal', rarity: 'raro',
    lore: 'Treinou socando geodos até que eles começaram a brilhar.',
    lines: ['Brilha, punho!', 'Golpe lapidado!', 'Sem nem um arranhão.'], ability: 'Golpe Lapidado',
    look: { hat: 'headband', hairColor: 0xff2a4a },
  },
  {
    name: 'Oluá', title: 'Arpão Azul', cls: 'atirador', element: 'mare', rarity: 'raro',
    lore: 'Pescador de tempestades, nunca erra um alvo em movimento.',
    lines: ['Fisguei!', 'Rajada de arpões!', 'Bela pescaria.'], ability: 'Rajada de Arpões',
    look: { hat: 'cap', accessory: 'scarf' },
  },
  {
    name: 'Lunara Tau', title: 'a Eclipse', cls: 'mago', element: 'sombra', rarity: 'raro',
    lore: 'Lê o futuro no reflexo da lua no mar de néon.',
    lines: ['As estrelas avisaram.', 'Meteoro da meia-noite!', 'Previsível.'], ability: 'Meteoro da Meia-Noite',
    look: { hat: 'hood', accessory: 'cape' },
  },
  {
    name: 'Doutor Jambo', title: 'Médico das Raízes', cls: 'curandeiro', element: 'raiz', rarity: 'raro',
    lore: 'Médico de árvores que descobriu que gente também tem raiz.',
    lines: ['Calma, vai sarar.', 'Seiva vital!', 'Paciente estável.'], ability: 'Seiva Vital',
    look: { hat: 'none', accessory: 'backpack', secondary: 0xf6f2ea },
  },
  {
    name: 'Lagarta Zuni', title: 'Rainha da Colmeia', cls: 'invocador', element: 'volt', rarity: 'raro',
    lore: 'Constrói drones em forma de inseto que zumbem em 220 volts.',
    lines: ['Zum zum!', 'Enxame elétrico!', 'Colmeia feliz.'], ability: 'Enxame Elétrico',
    look: { hat: 'antenna', accessory: 'drone' },
  },
  {
    name: 'Ruivo Breu', title: 'Passo Calado', cls: 'assassino', element: 'sombra', rarity: 'raro',
    lore: 'Ninguém lembra de ter visto ele chegar. Só de ver ele indo embora.',
    lines: ['...', 'Da sombra.', 'Nunca estive aqui.'], ability: 'Passo Calado',
    look: { hat: 'hood', hairColor: 0xff5a2e },
  },
  {
    name: 'Dona Fia', title: 'Mãos de Ferro', cls: 'construtor', element: 'solar', rarity: 'raro',
    lore: 'Construiu meia orla sozinha e a outra metade ensinando.',
    lines: ['Capricha na obra!', 'Torreta solar!', 'Ficou uma beleza.'], ability: 'Torreta Solar',
    look: { hat: 'hardhat', hairColor: 0xe8eaf6 },
  },
  {
    name: 'Pixo', title: 'o Hacker de Praia', cls: 'sabotador', element: 'volt', rarity: 'raro',
    lore: 'Invade sistemas com um tablet rachado e um coco na outra mão.',
    lines: ['Acesso liberado.', 'Desligando torres...', 'Sistema derrubado.'], ability: 'Invasão de Sistema',
    look: { hat: 'cap', accessory: 'backpack' },
  },
  {
    name: 'Maré Alta', title: 'Controle Remoto do Mar', cls: 'controlador', element: 'mare', rarity: 'raro',
    lore: 'Comanda as marés com um controle remoto que ninguém sabe de onde veio.',
    lines: ['Maré subindo!', 'Estase das ondas!', 'Tudo sob controle.'], ability: 'Estase das Ondas',
    look: { hat: 'visor', accessory: 'aura' },
  },
  {
    name: 'Tambor Rei', title: 'o Batuqueiro', cls: 'bombardeiro', element: 'raiz', rarity: 'raro',
    lore: 'Toca tambor com bombas de semente que explodem em flores... e destroços.',
    lines: ['No ritmo!', 'Batucada explosiva!', 'Bis!'], ability: 'Batucada Explosiva',
    look: { hat: 'headband' },
  },
  {
    name: 'Jupi Sol', title: 'a Bandeira Viva', cls: 'suporte', element: 'solar', rarity: 'raro',
    lore: 'Carrega a bandeira da ilha e nunca a deixa tocar o chão.',
    lines: ['Pela ilha!', 'Avante, time!', 'A bandeira continua de pé.'], ability: 'Avante, Ilha!',
    look: { accessory: 'banner', hat: 'cap' },
  },
  {
    name: 'Cobalto', title: 'Segurança Aposentado', cls: 'tanque', element: 'volt', rarity: 'raro',
    lore: 'Robô de segurança aposentado que voltou à ativa por saudade.',
    lines: ['Protocolo de defesa.', 'Escudo carregado.', 'Ameaça neutralizada.'], ability: 'Protocolo Escudo',
    look: { hat: 'visor', skin: 0xb9c3de, accessory: 'pads' },
  },
  {
    name: 'Íris Prisma', title: 'a Sete Cores', cls: 'mago', element: 'cristal', rarity: 'raro',
    lore: 'Separa a luz em sete cores e usa cada uma como arma.',
    lines: ['Olha que bonito!', 'Meteoro prismático!', 'Arco-íris de vitória.'], ability: 'Meteoro Prismático',
    look: { hat: 'crown', accessory: 'cape' },
  },
  // ---------------------------------------------------------------- Épicos
  {
    name: 'Barão Abissal', title: 'Guardião das Fossas', cls: 'tanque', element: 'sombra', rarity: 'epico',
    lore: 'Guardião das fossas abissais, fala pouco e aguenta tudo.',
    lines: ['Das profundezas.', 'Ninguém passa.', 'Silêncio.'], ability: 'Pressão Abissal',
    look: { hat: 'horns', accessory: 'cape' },
  },
  {
    name: 'Jaguara', title: 'Garra da Mata', cls: 'lutador', element: 'raiz', rarity: 'epico',
    lore: 'Criada pelos felinos da selva neon, luta de quatro quando ninguém está vendo.',
    lines: ['Grrr!', 'Bote da onça!', 'Caçada encerrada.'], ability: 'Bote da Onça',
    look: { hat: 'mask', accessory: 'tail', hairColor: 0xffd04a },
  },
  {
    name: 'Zéfiro Trovão', title: 'Mais Rápido que o Raio', cls: 'atirador', element: 'volt', rarity: 'epico',
    lore: 'Atira mais rápido que o raio — literalmente, ele cronometrou.',
    lines: ['Rápido!', 'Rajada relâmpago!', 'Recorde batido.'], ability: 'Rajada Relâmpago',
    look: { hat: 'goggles', accessory: 'scarf' },
  },
  {
    name: 'Madame Coral', title: 'Ternura do Recife', cls: 'curandeiro', element: 'mare', rarity: 'epico',
    lore: 'Cuida dos recifes e dos heróis com a mesma ternura e paciência infinita.',
    lines: ['Shhh, vai passar.', 'Abraço do recife!', 'Todos curados.'], ability: 'Abraço do Recife',
    look: { hat: 'halo', accessory: 'wings', hairColor: 0xff8fcf },
  },
  {
    name: 'Orbe Tatá', title: 'Pastor de Sóis', cls: 'invocador', element: 'solar', rarity: 'epico',
    lore: 'Invoca pequenos sóis que seguem ele como cachorrinhos.',
    lines: ['Vem, solzinho!', 'Sóis, ao ataque!', 'Bons garotos.'], ability: 'Sóis de Estimação',
    look: { hat: 'crown', accessory: 'drone' },
  },
  {
    name: 'Lâmina Lua', title: 'Corte de Luar', cls: 'assassino', element: 'cristal', rarity: 'epico',
    lore: 'Suas lâminas são feitas de luar cristalizado; só cortam à noite... e de dia também.',
    lines: ['Brilho final.', 'Corte lunar!', 'Limpo.'], ability: 'Corte Lunar',
    look: { hat: 'mask', accessory: 'scarf', hairColor: 0xe8eaf6 },
  },
  {
    name: 'Engenheira Bia', title: 'Gênio das Pontes', cls: 'construtor', element: 'volt', rarity: 'epico',
    lore: 'Projetou a primeira ponte flutuante da ilha aos doze anos.',
    lines: ['Cálculos prontos!', 'Torreta Tesla!', 'Estrutura aprovada.'], ability: 'Torreta Tesla',
    look: { hat: 'goggles', accessory: 'backpack', hairColor: 0x3fd4ff },
  },
  {
    name: 'Fumaça', title: 'o Apagão', cls: 'sabotador', element: 'sombra', rarity: 'epico',
    lore: 'Some numa nuvem preta e deixa as torres sem energia.',
    lines: ['Puf!', 'Apagão!', 'Saí de fininho.'], ability: 'Apagão',
    look: { hat: 'mask', accessory: 'cape' },
  },
  {
    name: 'Professor Ampère', title: 'Aula Prática', cls: 'controlador', element: 'volt', rarity: 'epico',
    lore: 'Dá aula de física e prova cada teoria no campo de batalha.',
    lines: ['Prestem atenção.', 'Campo de força!', 'Matéria dada.'], ability: 'Aula de Física',
    look: { hat: 'antenna', accessory: 'aura', hairColor: 0xe8eaf6 },
  },
  {
    name: 'Vulcânia', title: 'Moradora da Cratera', cls: 'bombardeiro', element: 'solar', rarity: 'epico',
    lore: 'Mora na cratera e acha que toda festa precisa de um pouco de lava.',
    lines: ['Vai ferver!', 'Erupção!', 'Ficou quentinho.'], ability: 'Erupção',
    look: { hat: 'goggles', hairColor: 0xff5a2e },
  },
  {
    name: 'Maestro Ondas', title: 'Regente do Mar', cls: 'suporte', element: 'mare', rarity: 'epico',
    lore: 'Rege o mar como uma orquestra, e o time como uma banda.',
    lines: ['Um, dois, três!', 'Sinfonia das marés!', 'Bravo!'], ability: 'Sinfonia das Marés',
    look: { accessory: 'banner', hat: 'crown' },
  },
  {
    name: 'Quartzo', title: 'Golem da Mina', cls: 'tanque', element: 'cristal', rarity: 'epico',
    lore: 'Golem de cristal que acordou numa mina de néon e decidiu proteger quem o achou.',
    lines: ['Duro como pedra.', 'Muralha de cristal!', 'Inquebrável.'], ability: 'Muralha de Cristal',
    look: { hat: 'helmet', skin: 0xd8c4ff, accessory: 'aura' },
  },
  {
    name: 'Kiri', title: 'Voz das Sombras', cls: 'invocador', element: 'sombra', rarity: 'epico',
    lore: 'Conversa com as sombras e elas a obedecem.',
    lines: ['Venham, sombras.', 'Legião sombria!', 'Voltem a dormir.'], ability: 'Legião Sombria',
    look: { hat: 'hood', accessory: 'drone' },
  },
  {
    name: 'Arara Faísca', title: 'Olho de Rapina', cls: 'atirador', element: 'solar', rarity: 'epico',
    lore: 'Atiradora de elite com a pontaria de uma ave de rapina e as cores de uma arara.',
    lines: ['Avistado!', 'Penas de fogo!', 'Na mosca.'], ability: 'Penas de Fogo',
    look: { hat: 'visor', accessory: 'wings', hairColor: 0xff4f5e },
  },
  // ---------------------------------------------------------------- Lendários
  {
    name: 'Rei Tubarão', title: 'Senhor dos Sete Recifes', cls: 'tanque', element: 'mare', rarity: 'lendario',
    lore: 'Dizem que nunca perdeu uma luta embaixo d’água — nem fora dela.',
    lines: ['Curvem-se!', 'Muralha das marés!', 'O mar é meu.'], ability: 'Muralha das Marés',
    look: { hat: 'crown', accessory: 'cape', skin: 0x7fb8d8 },
  },
  {
    name: 'Ayra Sol', title: 'a Aurora', cls: 'lutador', element: 'solar', rarity: 'lendario',
    lore: 'Nasceu no primeiro raio de sol de um eclipse e luta com o brilho de mil manhãs.',
    lines: ['Amanheceu!', 'Punho da aurora!', 'Mais um dia vencido.'], ability: 'Punho da Aurora',
    look: { hat: 'crown', accessory: 'scarf', hairColor: 0xffd04a },
  },
  {
    name: 'Volta', title: 'o Trovão Vivo', cls: 'atirador', element: 'volt', rarity: 'lendario',
    lore: 'Atingido por um raio, absorveu a carga e nunca mais descarregou.',
    lines: ['Carga máxima!', 'Tempestade de balas!', 'Zzzt.'], ability: 'Tempestade de Balas',
    look: { hat: 'visor', accessory: 'aura', hairColor: 0xf9ff5a },
  },
  {
    name: 'Grã-Mestra Ixora', title: 'Biblioteca Viva', cls: 'mago', element: 'raiz', rarity: 'lendario',
    lore: 'A floresta inteira é sua biblioteca; cada folha, um feitiço.',
    lines: ['A selva responde.', 'Meteoro florescente!', 'A natureza vence.'], ability: 'Meteoro Florescente',
    look: { hat: 'wizard', accessory: 'cape', hairColor: 0x7dff6a },
  },
  {
    name: 'Santo Lumen', title: 'Halo Partido', cls: 'curandeiro', element: 'cristal', rarity: 'lendario',
    lore: 'Seu halo cura até as rachaduras das torres aliadas... e dos corações.',
    lines: ['Luz sobre vocês.', 'Pulso de cristal!', 'Ninguém fica pra trás.'], ability: 'Pulso de Cristal',
    look: { hat: 'halo', accessory: 'wings' },
  },
  {
    name: 'Noxa Varal', title: 'a Noite em Pessoa', cls: 'assassino', element: 'sombra', rarity: 'lendario',
    lore: 'Quando ela some, alguém cai.',
    lines: ['Boa noite.', 'Passo do vazio!', 'Dorme em paz.'], ability: 'Passo do Vazio',
    look: { hat: 'hood', accessory: 'cape', hairColor: 0xb45bff },
  },
  {
    name: 'Mestre Trovoada', title: 'Oficina nas Nuvens', cls: 'construtor', element: 'volt', rarity: 'lendario',
    lore: 'Constrói torres que disparam raios; sua oficina fica dentro de uma nuvem.',
    lines: ['Ao trabalho!', 'Torre da tempestade!', 'Obra-prima.'], ability: 'Torre da Tempestade',
    look: { hat: 'goggles', accessory: 'backpack', hairColor: 0xe8eaf6 },
  },
  {
    name: 'Vetor Reverso', title: 'Dono do Tempo', cls: 'controlador', element: 'cristal', rarity: 'lendario',
    lore: 'Já viu esta batalha mil vezes e sabe exatamente quando parar o tempo.',
    lines: ['O tempo é meu.', 'Congelem!', 'Como previsto.'], ability: 'Tempo Parado',
    look: { hat: 'crown', accessory: 'aura' },
  },
  {
    name: 'Dinamite Duda', title: 'Sem Meio-Termo', cls: 'bombardeiro', element: 'volt', rarity: 'lendario',
    lore: 'Nunca fez nada pela metade, principalmente explosões.',
    lines: ['Afasta!', 'Bombardeio total!', 'Uhuul!'], ability: 'Bombardeio Total',
    look: { hat: 'goggles', accessory: 'backpack', hairColor: 0xff5aa8 },
  },
  {
    name: 'Matriarca Ceiba', title: 'a Árvore Ancestral', cls: 'suporte', element: 'raiz', rarity: 'lendario',
    lore: 'A árvore mais velha da ilha ganhou pernas para defender seus netos.',
    lines: ['Força, meus filhos.', 'Grito da floresta!', 'A raiz permanece.'], ability: 'Grito da Floresta',
    look: { hat: 'crown', accessory: 'banner', skin: 0xa8743f, hairColor: 0x2fd46b },
  },
  {
    name: 'Leviatã Bebê', title: 'Fofo e Gigante', cls: 'invocador', element: 'mare', rarity: 'lendario',
    lore: 'Parece um bichinho fofo, mas invoca criaturas do tamanho de prédios.',
    lines: ['Blub!', 'Venham, crias do mar!', 'Blub blub!'], ability: 'Crias do Mar',
    look: { hat: 'none', accessory: 'tail', skin: 0x7fd8ff },
  },
  {
    name: 'Bug Prisma', title: 'a Falha Viva', cls: 'sabotador', element: 'cristal', rarity: 'lendario',
    lore: 'Uma falha no sistema que ganhou vontade própria.',
    lines: ['Erro 404!', 'Pane cristalina!', 'Desfragmentado.'], ability: 'Pane Cristalina',
    look: { hat: 'visor', accessory: 'aura', skin: 0xd8c4ff },
  },
  // ---------------------------------------------------------------- Extremos
  {
    name: 'Kaelor', title: 'o Primeiro Núcleo', cls: 'tanque', element: 'cristal', rarity: 'extremo',
    lore: 'O guardião original do cristal que deu nome à ilha. Acordou de um sono de mil anos.',
    lines: ['Eu sou a muralha.', 'Fortaleza eterna!', 'Kaelora permanece.'], ability: 'Fortaleza Eterna',
    look: { hat: 'crown', accessory: 'wings' },
  },
  {
    name: 'Sol Negro', title: 'Brilho ao Contrário', cls: 'lutador', element: 'sombra', rarity: 'extremo',
    lore: 'Um sol que se apagou e escolheu brilhar ao contrário.',
    lines: ['Escuridão ardente!', 'Punho do eclipse!', 'Apagado.'], ability: 'Punho do Eclipse',
    look: { hat: 'horns', accessory: 'aura' },
  },
  {
    name: 'Ômega Volt', title: 'a Última Arma', cls: 'atirador', element: 'volt', rarity: 'extremo',
    lore: 'A última arma do laboratório secreto; aprendeu a atirar sozinha.',
    lines: ['Sistema ômega online.', 'Disparo final!', 'Alvos eliminados.'], ability: 'Disparo Ômega',
    look: { hat: 'visor', accessory: 'wings', skin: 0xb9c3de },
  },
  {
    name: 'Imperatriz Maré', title: 'Soberana do Oceano', cls: 'mago', element: 'mare', rarity: 'extremo',
    lore: 'Governa o oceano inteiro e só vem à terra quando o mar se cansa de esperar.',
    lines: ['O mar me trouxe.', 'Meteoro abissal!', 'As ondas obedecem.'], ability: 'Meteoro Abissal',
    look: { hat: 'crown', accessory: 'aura', hairColor: 0x3ff6ff },
  },
  {
    name: 'Pira Eterna', title: 'Cura que Queima', cls: 'curandeiro', element: 'solar', rarity: 'extremo',
    lore: 'Cura queimando: tudo o que ela toca renasce mais forte.',
    lines: ['Renasça!', 'Chama da vida!', 'De pé, todos!'], ability: 'Chama da Vida',
    look: { hat: 'halo', accessory: 'wings', hairColor: 0xff9f1a },
  },
  {
    name: 'Ceifador Verde', title: 'Guardião Silencioso', cls: 'assassino', element: 'raiz', rarity: 'extremo',
    lore: 'A floresta tem um guardião silencioso; quem desmata conhece a lâmina dele.',
    lines: ['A mata vê tudo.', 'Corte selvagem!', 'Voltou à terra.'], ability: 'Corte Selvagem',
    look: { hat: 'hood', accessory: 'wings' },
  },
  {
    name: 'Arquiteta do Caos', title: 'Estruturas Impossíveis', cls: 'construtor', element: 'sombra', rarity: 'extremo',
    lore: 'Constrói torres em dimensões que não existem — e elas atiram mesmo assim.',
    lines: ['Planta nova!', 'Torreta do vazio!', 'Estrutura impossível.'], ability: 'Torreta do Vazio',
    look: { hat: 'crown', accessory: 'aura' },
  },
  {
    name: 'Tempestade Rubra', title: 'Nuvem de Guerra', cls: 'bombardeiro', element: 'solar', rarity: 'extremo',
    lore: 'Uma nuvem de guerra em forma de gente. Onde passa, chove fogo.',
    lines: ['Céu vermelho!', 'Chuva de meteoros!', 'Ninguém em pé.'], ability: 'Chuva Rubra',
    look: { hat: 'helmet', accessory: 'wings', hairColor: 0xff2a4a },
  },
];
