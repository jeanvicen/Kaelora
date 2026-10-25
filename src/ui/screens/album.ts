import type { App } from '../../app.ts';
import { ELEMENTS } from '../../content/classes.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { albumMilestones, albumProgress, claimAlbum, type AlbumMilestone } from '../../meta/collection.ts';
import { formatNumber, type Reward } from '../../meta/economy.ts';
import type { Element } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';
import { CHEST_NAMES } from './result.ts';

const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

/** Álbum: % da coleção por elemento e recompensas a cada marco. */
export function renderAlbum(app: App, root: HTMLElement, onChange: () => void): void {
  const save = app.save;
  const prog = albumProgress(save);
  root.replaceChildren(
    h(
      'div',
      { class: 'al-total' },
      h('div', { class: 'al-total-title stroke-sm' }, 'Coleção completa'),
      h('div', { class: 'bar gold al-total-bar' }, h('i', { style: { width: `${Math.max(1, prog.total.pct)}%` } }), h('span', null, `${prog.total.owned}/${prog.total.count} • ${pct(prog.total.pct)}`)),
    ),
    h('div', { class: 'al-grid' }, ...ELEMENTS.map((el) => elementCard(app, el, root, onChange))),
  );
}

function elementCard(app: App, el: Element, root: HTMLElement, onChange: () => void): HTMLElement {
  const part = albumProgress(app.save).byElement[el];
  const ms = albumMilestones(app.save, el);
  return h(
    'div',
    { class: `al-card el-${el}`, style: { '--elc': `var(--el-${el})` } },
    h(
      'div',
      { class: 'al-head' },
      h('span', { class: 'el-gem al-gem' }),
      h('span', { class: 'al-name stroke-sm' }, ELEMENT_NAMES[el]),
      h('span', { class: 'grow' }),
      h('span', { class: 'al-count' }, `${part.owned}/${part.count} • ${pct(part.pct)}`),
    ),
    h(
      'div',
      { class: 'al-track' },
      h('div', { class: 'al-fill', style: { width: `${trackFill(part.pct, ms) * 100}%` } }),
      ...ms.map((m, i) => milestoneNode(app, m, (i + 1) / ms.length, root, onChange)),
    ),
  );
}

function rewardIcons(r: Reward): HTMLElement {
  return h(
    'span',
    { class: 'al-rw' },
    r.chest ? icon('chest') : r.diamonds ? icon('gem') : icon('coin'),
  );
}

/** Os marcos ficam igualmente espaçados; o preenchimento anda por trechos. */
function trackFill(p: number, ms: AlbumMilestone[]): number {
  let prev = 0;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i].pct;
    if (p <= m) return (i + (p - prev) / (m - prev)) / ms.length;
    prev = m;
  }
  return 1;
}

function milestoneNode(app: App, m: AlbumMilestone, at: number, root: HTMLElement, onChange: () => void): HTMLElement {
  const state = m.claimed ? 'claimed' : m.reached ? 'ready' : 'locked';
  const node = h(
    'button',
    {
      class: `al-node ${state}`,
      style: { left: `${at * 100}%` },
      'aria-label': `Marco ${m.pct}%`,
      onClick: () => {
        if (m.claimed) return;
        if (!m.reached) {
          app.ui.toast(`${m.pct}%: junte ${m.needed} personagens. Prêmio: ${describe(m.reward)}`, 'info', 'book');
          return;
        }
        const r = app.store.update('album-claim', (d) => claimAlbum(d, m.element, m.pct, Date.now()));
        if (!r.ok) return app.ui.toast(r.reason, 'error');
        audio.play('coins');
        audio.play('star');
        vibrate([15, 30, 15]);
        app.ui.flash('#ffd23f', 300, 0.4);
        app.ui.toast(`Álbum ${m.pct}%: ${describe(m.reward)}${r.reward?.chestLost ? ' (baú perdido: inventário cheio)' : ''}`, 'gold', 'gift');
        renderAlbum(app, root, onChange);
        onChange();
      },
    },
    m.claimed ? icon('check') : rewardIcons(m.reward),
    h('span', { class: 'al-node-pct stroke-sm' }, `${m.pct}%`),
  );
  return node;
}

export function describe(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${formatNumber(r.coins)} moedas`);
  if (r.diamonds) parts.push(`${formatNumber(r.diamonds)} diamantes`);
  if (r.chest) parts.push(CHEST_NAMES[r.chest]);
  return parts.join(' + ');
}
