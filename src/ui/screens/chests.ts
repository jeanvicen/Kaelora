import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { CHEST_TYPES, chestDef, chestLockReason, chestOdds, chestPrice, countsForPity, pityRemaining } from '../../meta/chests.ts';
import { formatNumber, unlockLevel } from '../../meta/economy.ts';
import { MAX_CHESTS } from '../../meta/raids.ts';
import type { ChestItem, ChestType } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { RARITY_NAMES } from '../panels/charCard.ts';
import { openChestScreen } from './chestOpen.ts';

/** Inventário de baús, loja e chances (sempre visíveis antes de abrir). */
export function openChests(app: App): void {
  let selected: { kind: 'inv'; uid: string } | { kind: 'shop'; type: ChestType } | null = null;
  const inv = h('div', { class: 'ch-inv' });
  const shop = h('div', { class: 'ch-shop' });
  const side = h('div', { class: 'ch-side panel' });
  const gemChip = h('div', { class: 'chip' }, icon('gem'), h('span', { class: 'stroke-sm' }));
  const coinChip = h('div', { class: 'chip' }, icon('coin'), h('span', { class: 'stroke-sm' }));
  const invTitle = h('div', { class: 'ch-title stroke-sm' });

  const render = () => {
    const save = app.save;
    (gemChip.lastChild as HTMLElement).textContent = formatNumber(save.currencies.diamonds);
    (coinChip.lastChild as HTMLElement).textContent = formatNumber(save.currencies.coins);
    const items = save.chests.inventory;
    if (selected?.kind === 'inv' && !items.some((c) => c.uid === (selected as { uid: string }).uid)) selected = null;
    if (!selected && items.length) selected = { kind: 'inv', uid: items[0].uid };
    if (!selected) selected = { kind: 'shop', type: 'prata' };
    invTitle.textContent = `Seus baús (${items.length}/${MAX_CHESTS})`;
    const slots: HTMLElement[] = [];
    for (let i = 0; i < MAX_CHESTS; i++) {
      const it = items[i];
      if (!it) {
        slots.push(h('div', { class: 'ch-slot empty' }, icon('chest'), h('span', { class: 'dim' }, 'Vazio')));
        continue;
      }
      const sel = selected.kind === 'inv' && selected.uid === it.uid;
      slots.push(
        h(
          'button',
          {
            class: `ch-slot chest-${it.type} ${sel ? 'sel' : ''}`,
            onClick: () => {
              if (sel) return open(it);
              selected = { kind: 'inv', uid: it.uid };
              audio.play('tap');
              render();
            },
          },
          chestPic(app, it.type),
          h('span', { class: 'ch-name stroke-sm' }, chestDef(it.type).name.replace('Baú ', '').replace('de ', '')),
          h('span', { class: 'ch-src' }, it.source),
          sel ? h('span', { class: 'ch-open-tag stroke-sm' }, 'ABRIR') : null,
        ),
      );
    }
    inv.replaceChildren(...slots);

    shop.replaceChildren(
      h('div', { class: 'ch-title stroke-sm' }, 'Loja de baús'),
      h(
        'div',
        { class: 'ch-shop-row' },
        ...CHEST_TYPES.filter((t) => chestPrice(t) !== null).map((t) => {
          const lock = chestLockReason(save, t);
          const sel = selected?.kind === 'shop' && selected.type === t;
          return h(
            'button',
            {
              class: `ch-buy chest-${t} ${sel ? 'sel' : ''} ${lock ? 'locked' : ''}`,
              onClick: () => {
                selected = { kind: 'shop', type: t };
                render();
              },
            },
            chestPic(app, t),
            lock ? h('span', { class: 'ch-price lock' }, icon('lock'), `Nível ${unlockLevel(lock)}`) : h('span', { class: 'ch-price' }, icon('gem'), formatNumber(chestPrice(t)!)),
          );
        }),
      ),
    );
    renderSide();
  };

  const renderSide = () => {
    const save = app.save;
    const sel = selected!;
    const type = sel.kind === 'inv' ? save.chests.inventory.find((c) => c.uid === sel.uid)!.type : sel.type;
    const def = chestDef(type);
    const pity = pityRemaining(save);
    const odds = chestOdds(type);
    let action: HTMLElement;
    if (sel.kind === 'inv') {
      const item = save.chests.inventory.find((c) => c.uid === sel.uid)!;
      action = h('button', { class: 'btn green big ch-action', onClick: () => open(item) }, icon('chest'), 'Abrir agora');
    } else {
      const lock = chestLockReason(save, type);
      const price = chestPrice(type)!;
      action = lock
        ? h('div', { class: 'ch-locked dim' }, icon('lock'), `Libera no nível de conta ${unlockLevel(lock)}`)
        : h(
            'button',
            { class: `btn ${save.currencies.diamonds >= price ? 'purple' : 'dark'} big ch-action`, onClick: () => buy(type) },
            'Comprar e abrir',
            h('span', { class: 'cost' }, icon('gem'), formatNumber(price)),
          );
    }
    side.replaceChildren(
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, def.name)),
      h(
        'div',
        { class: 'panel-body col ch-side-body' },
        h(
          'div',
          { class: 'ch-facts' },
          h('span', { class: 'chip small' }, icon('squad'), `${def.cards} personagens`),
          h('span', { class: 'chip small' }, icon('coin'), `${formatNumber(def.coins[0])}–${formatNumber(def.coins[1])}`),
          def.diamonds[1] > 0 ? h('span', { class: 'chip small' }, icon('gem'), `${def.diamonds[0]}–${def.diamonds[1]}`) : null,
        ),
        h('div', { class: 'ch-odds-title' }, 'Chance por personagem'),
        h(
          'div',
          { class: 'ch-odds' },
          ...odds.map((o) =>
            h(
              'div',
              { class: `ch-odd rar-${o.rarity}` },
              h('span', { class: `ch-odd-name rar-text ${o.rarity === 'extremo' ? 'prism-text' : ''}` }, RARITY_NAMES[o.rarity]),
              h('div', { class: 'ch-odd-bar' }, h('i', { style: { width: `${Math.max(2, Math.sqrt(o.pct / 100) * 100)}%` } })),
              h('b', null, `${String(o.pct).replace('.', ',')}%`),
            ),
          ),
        ),
        countsForPity(type)
          ? h(
              'div',
              { class: 'ch-pity' },
              icon('shield'),
              h('span', null, `Lendário garantido em até `, h('b', null, String(pity.legendary)), ` baú${pity.legendary > 1 ? 's' : ''} • Extremo em até `, h('b', null, String(pity.extreme))),
            )
          : h('div', { class: 'ch-pity dim' }, icon('info'), 'Baús de Ouro ou melhores contam para a garantia de Lendário e Extremo.'),
        action,
      ),
    );
  };

  const open = (item: ChestItem) => {
    openChestScreen(app, item.uid, () => render());
  };

  const buy = async (type: ChestType) => {
    const r = await app.buyChestAction(type);
    if (!r.ok) {
      app.ui.toast(r.reason, 'error', 'gem');
      return;
    }
    audio.play('coins');
    openChestScreen(app, r.uid, () => render());
  };

  const screen = h(
    'div',
    { class: 'chests-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Baús'),
      h('div', { class: 'grow' }),
      coinChip,
      gemChip,
    ),
    h('div', { class: 'ch-body' }, h('div', { class: 'ch-main' }, invTitle, inv, shop), side),
  );
  render();
  app.ui.openScreen(screen);
}

function chestPic(app: App, type: ChestType): HTMLElement {
  const el = h('span', { class: 'ch-pic' });
  void app.chestThumb(type).then((u) => (el.style.backgroundImage = `url(${u})`));
  return el;
}
