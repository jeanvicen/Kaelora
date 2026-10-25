import type { App } from '../../app.ts';
import { RESEARCH } from '../../content/squad.ts';
import { audio } from '../../core/audio.ts';
import { formatDuration, formatNumber } from '../../meta/economy.ts';
import { researchBlockReason, researchCap, researchLevel, researchSpeedupCost } from '../../meta/research.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

/** Laboratório: pesquisas permanentes (uma por vez). */
export function openLab(app: App): void {
  const body = h('div', { class: 'panel-body lab-list scroll-y' });
  const head = h('div', { class: 'lab-cap dim' });
  let timer = 0;
  const render = () => {
    const s = app.save;
    const now = Date.now();
    const cap = researchCap(s);
    const q = s.city.researchQueue;
    head.textContent = cap ? `Seu Laboratório libera pesquisas até o nível ${cap}. Uma pesquisa por vez.` : 'Construa um Laboratório (Núcleo nível 4) para pesquisar.';
    body.replaceChildren(
      ...RESEARCH.map((r) => {
        const lvl = researchLevel(s, r.id);
        const busy = q?.id === r.id;
        const block = researchBlockReason(s, r.id);
        const maxed = lvl >= r.maxLevel;
        const pips = h('div', { class: 'lab-pips' }, ...Array.from({ length: r.maxLevel }, (_, i) => h('span', { class: `pip ${i < lvl ? 'on' : i < cap ? '' : 'locked'}` })));
        let action: HTMLElement;
        if (busy) {
          action = h(
            'div',
            { class: 'col lab-busy' },
            h('span', { class: 'stroke-sm' }, icon('clock'), ` ${formatDuration(Math.max(0, (q!.endsAt - now) / 1000))}`),
            h(
              'button',
              {
                class: 'btn small blue',
                onClick: () => {
                  const res = app.act('speedupResearch', {});
                  if (!res.ok) return app.ui.toast(res.reason, 'error', 'gem');
                  audio.play('upgradeDone');
                  app.ui.toast(`${r.name} concluída!`, 'good', 'up');
                  render();
                },
              },
              'Acelerar',
              h('span', { class: 'cost' }, icon('gem'), String(researchSpeedupCost(s, now))),
            ),
          );
        } else if (maxed) action = h('div', { class: 'gold-text' }, 'Máximo!');
        else {
          const hard = block && !block.startsWith('Faltam');
          action = h(
            'button',
            {
              class: `btn small ${hard ? 'dark' : 'green'}`,
              disabled: !!hard,
              onClick: () => {
                const res = app.act('startResearch', { id: r.id });
                if (!res.ok) return app.ui.toast(res.reason, 'error');
                audio.play('magic');
                render();
              },
            },
            'Pesquisar',
            h('span', { class: 'cost' }, icon('coin'), formatNumber(r.costs[lvl])),
            h('span', { class: 'cost time' }, icon('clock'), formatDuration(r.times[lvl])),
          );
        }
        return h(
          'div',
          { class: `lab-row ${busy ? 'busy' : ''}` },
          h('div', { class: 'lab-ico' }, icon('bolt')),
          h(
            'div',
            { class: 'col grow' },
            h('b', { class: 'stroke-sm' }, r.name, h('span', { class: 'lab-eff' }, ` +${lvl * r.perLevel}${r.unit === '%' ? '%' : ` ${r.unit}`}`)),
            h('span', { class: 'dim' }, r.description),
            pips,
            block && !busy && !maxed && block.startsWith('Melhore') ? h('span', { class: 'lab-note' }, icon('lock'), block) : null,
          ),
          action,
        );
      }),
    );
  };
  render();
  timer = window.setInterval(() => (document.body.contains(body) ? render() : clearInterval(timer)), 1000);
  app.ui.modal(h('div', { class: 'panel lab-panel' }, h('div', { class: 'panel-head' }, icon('bolt'), h('div', { class: 'panel-title' }, 'Laboratório'), head), body));
}
