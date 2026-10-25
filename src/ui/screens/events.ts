import type { App } from '../../app.ts';
import { getCharacter } from '../../content/catalog.ts';
import { eventSquad } from '../../content/eventSquad.ts';
import { formatDuration } from '../../meta/economy.ts';
import { EVENT_MILESTONES, currentEvent } from '../../meta/retention.ts';
import { msUntilNextWeek } from '../../meta/time.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';
import { lazyPortrait } from '../panels/charCard.ts';
import { celebrateReward, rewardChips } from '../panels/rewards.ts';

/** Evento semanal: regra especial, progresso e prêmios. */
export function openEvents(app: App): void {
  const ev = currentEvent(Date.now());
  const body = h('div', { class: 'ev-body' });
  const render = () => {
    const s = app.save;
    const wins = s.events.wins;
    const squad = ev.rules.element ? eventSquad(s, ev.rules.element) : null;
    body.replaceChildren(
      h(
        'div',
        { class: `panel ev-card ${ev.rules.element ? `el-${ev.rules.element}` : ''}`, style: ev.rules.element ? { '--elc': `var(--el-${ev.rules.element})` } : {} },
        h('div', { class: 'ev-rays' }),
        h('div', { class: 'ev-icon' }, icon(ev.icon as IconName)),
        h('div', { class: 'ev-title stroke' }, ev.title),
        h('p', { class: 'ev-text' }, ev.text),
        squad
          ? h(
              'div',
              { class: 'ev-squad' },
              ...squad.ids.map((id) => {
                const c = getCharacter(id);
                const pic = h('div', { class: `mini-portrait rar-${c.rarity}` });
                lazyPortrait(app, pic, id);
                return h('div', { class: 'ev-member' }, pic, squad.loaners.includes(id) ? h('span', { class: 'ev-loan' }, 'emprestado') : h('span', { class: 'dim' }, c.name));
              }),
            )
          : null,
        h('button', { class: 'btn red big ev-play', onClick: () => (app.ui.closeScreen(), app.startEvent()) }, icon('swords'), 'Jogar evento'),
      ),
      h(
        'div',
        { class: 'panel ev-side' },
        h('div', { class: 'panel-head' }, icon('flag'), h('div', { class: 'panel-title' }, `Vitórias: ${wins}`)),
        h(
          'div',
          { class: 'panel-body col' },
          ...EVENT_MILESTONES.map((m) => {
            const claimed = s.events.claimed.includes(m.wins);
            const ready = wins >= m.wins && !claimed;
            return h(
              'div',
              { class: `mission ${claimed ? 'claimed' : ready ? 'ready' : ''}` },
              h('div', { class: 'grow col' }, h('div', { class: 'ms-text stroke-sm' }, `${m.wins} vitória${m.wins > 1 ? 's' : ''}`), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (wins / m.wins) * 100)}%` } }))),
              rewardChips(m.reward),
              claimed
                ? h('div', { class: 'ms-done' }, icon('check'))
                : h(
                    'button',
                    {
                      class: `btn small ${ready ? 'green' : 'dark'}`,
                      disabled: !ready,
                      onClick: async () => {
                        const r = await app.claim('event', { wins: m.wins });
                        if (!r.ok) return app.ui.toast(r.reason, 'error');
                        celebrateReward(app, 'Evento', r.reward);
                        render();
                      },
                    },
                    'Pegar',
                  ),
            );
          }),
          h('p', { class: 'dim ev-note' }, ev.rules.element ? `Só personagens ${ELEMENT_NAMES[ev.rules.element]}. Seus mais fortes desse elemento entram; o evento empresta o resto.` : 'Use seu esquadrão normal. Cada vitória traz um rival novo.'),
        ),
      ),
    );
  };
  render();
  const screen = h(
    'div',
    { class: 'events-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Evento semanal'),
      h('div', { class: 'grow' }),
      h('div', { class: 'chip' }, icon('clock'), h('span', { class: 'stroke-sm' }, `Termina em ${formatDuration(Math.round(msUntilNextWeek(Date.now()) / 1000))}`)),
    ),
    body,
  );
  app.ui.openScreen(screen);
}
