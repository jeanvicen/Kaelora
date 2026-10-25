import type { App } from '../../app.ts';
import { TRAINING_DIFFICULTIES, trainingLevel } from '../../content/training.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

/** Treinamento: cidades-teste e duelo contra bot. Nada se perde. */
export function openTraining(app: App): void {
  const cards = TRAINING_DIFFICULTIES.map((d, i) =>
    h(
      'div',
      { class: `tr-card tr-${d.id}` },
      h('div', { class: 'tr-skulls' }, ...Array.from({ length: i + 1 }, () => icon('skull'))),
      h('b', { class: 'stroke tr-name' }, d.name),
      h('span', { class: 'dim' }, `Cidade-teste nível ${trainingLevel(app.save, d.id)}`),
      h('button', { class: 'btn red small', onClick: () => (app.ui.closeScreen(), app.startTraining(d.id)) }, icon('swords'), 'Invadir'),
      h('button', { class: 'btn purple small', onClick: () => (app.ui.closeScreen(), app.startBotDuel(d.id)) }, icon('versus'), 'Duelo x bot'),
    ),
  );
  const screen = h(
    'div',
    { class: 'training-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Treinamento'),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn dark small', onClick: () => (app.ui.closeScreen(), app.startTraining('facil', true)) }, icon('book'), 'Tutorial guiado'),
    ),
    h('p', { class: 'tr-note dim' }, 'Aqui nada se perde: sem troféus em jogo. Invadir dá um pouco de XP e moedas; o duelo contra bot é treino livre para o Duelo ao vivo.'),
    h('div', { class: 'tr-cards' }, ...cards),
  );
  app.ui.openScreen(screen);
}
