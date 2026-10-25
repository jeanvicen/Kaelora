import type { App } from '../../app.ts';
import { BUILDINGS, BUILDING_TYPES, countOf, maxCountFor } from '../../meta/buildings.ts';
import { buildBlockReason, buildCost } from '../../meta/city.ts';
import { formatNumber } from '../../meta/economy.ts';
import type { BuildingType } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

type Cat = 'defense' | 'economy' | 'decor';
const CATS: { id: Cat; label: string }[] = [
  { id: 'defense', label: 'Defesa' },
  { id: 'economy', label: 'Economia e Exército' },
  { id: 'decor', label: 'Decoração' },
];

function catOf(type: BuildingType): Cat {
  const c = BUILDINGS[type].category;
  if (c === 'defense') return 'defense';
  if (c === 'decor') return 'decor';
  return 'economy';
}

/** Loja de construções: escolhe um tipo e entra no posicionamento. */
export function openBuildShop(app: App, initial?: BuildingType): void {
  let cat: Cat = initial ? catOf(initial) : 'defense';
  const list = h('div', { class: 'shop-list scroll-x' });
  const tabs = h('div', { class: 'tabs' });
  const render = () => {
    tabs.replaceChildren(
      ...CATS.map((c) =>
        h(
          'button',
          {
            class: `tab ${c.id === cat ? 'active' : ''}`,
            onClick: () => {
              cat = c.id;
              render();
            },
          },
          c.label,
        ),
      ),
    );
    const save = app.store.data;
    const types = BUILDING_TYPES.filter((t) => t !== 'core' && catOf(t) === cat);
    list.replaceChildren(
      ...types.map((type) => {
        const def = BUILDINGS[type];
        const block = buildBlockReason(save, type);
        const max = maxCountFor(save.city, type);
        const count = countOf(save.city, type);
        const locked = max === 0;
        const thumb = h('div', { class: 'sc-thumb' });
        void app.buildingThumb(type, 1).then((url) => (thumb.style.backgroundImage = `url(${url})`));
        const card = h(
          'button',
          {
            class: `shop-card ${block ? 'blocked' : ''} ${locked ? 'locked' : ''} ${type === initial ? 'highlight' : ''}`,
            onClick: () => {
              if (block) {
                app.ui.toast(block, 'error');
                return;
              }
              m.close();
              app.startBuild(type);
            },
          },
          thumb,
          h('div', { class: 'sc-name stroke-sm' }, def.name),
          locked
            ? h('div', { class: 'sc-lock' }, icon('lock'), `Núcleo nv ${def.unlockCore}`)
            : h('div', { class: 'sc-count' }, `${count}/${max}`),
          h('div', { class: `sc-cost ${save.currencies.coins < buildCost(type) ? 'cant' : ''}` }, icon('coin'), formatNumber(buildCost(type))),
        );
        return card;
      }),
    );
  };
  const body = h(
    'div',
    { class: 'panel build-shop' },
    h('div', { class: 'panel-head' }, icon('build'), h('div', { class: 'panel-title' }, 'Construir'), h('div', { class: 'sub' }, 'Escolha e posicione na grade')),
    h('div', { class: 'panel-body col' }, tabs, list),
  );
  render();
  const m = app.ui.modal(body);
}
