import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { chestDef, chestLockReason, chestPrice } from '../../meta/chests.ts';
import { ECONOMY, formatDuration, formatNumber, unlockLevel } from '../../meta/economy.ts';
import { dailyDeal, dealBought } from '../../meta/shop.ts';
import { msUntilNextDay } from '../../meta/time.ts';
import type { ChestType } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { openChestScreen } from './chestOpen.ts';
import { CHEST_NAMES } from './result.ts';

/** Pacotes de diamantes (dinheiro de verdade) — mostrados, mas sem pagamento ainda. */
const DIAMOND_PACKS = [
  { diamonds: 80, price: 'R$ 4,90' },
  { diamonds: 500, price: 'R$ 24,90', tag: '+25%' },
  { diamonds: 1200, price: 'R$ 49,90', tag: '+50%' },
];

/** Loja: oferta do dia, baús, moedas e diamantes. Nada de vitória comprada. */
export function openShop(app: App): void {
  const body = h('div', { class: 'shop-body scroll-x' });
  const gems = h('span', { class: 'stroke-sm' });
  const coins = h('span', { class: 'stroke-sm' });
  const render = () => {
    const s = app.save;
    const now = Date.now();
    gems.textContent = formatNumber(s.currencies.diamonds);
    coins.textContent = formatNumber(s.currencies.coins);
    const deal = dailyDeal(now);
    const bought = dealBought(s, now);
    const chestPic = (t: ChestType) => {
      const el = h('span', { class: 'shop-pic' });
      void app.chestThumb(t).then((u) => (el.style.backgroundImage = `url(${u})`));
      return el;
    };
    const coinPic = (n: number) => h('span', { class: 'shop-pic coins' }, icon('coin'), n >= 5000 ? icon('coin') : null, n >= 10000 ? icon('coin') : null);
    body.replaceChildren(
      h(
        'div',
        { class: 'shop-sec' },
        h('div', { class: 'shop-sec-title stroke-sm' }, 'Oferta do dia'),
        h(
          'div',
          { class: `shop-deal ${bought ? 'sold' : ''}` },
          h('div', { class: 'deal-ribbon stroke-sm' }, `-${Math.round(ECONOMY.shop.dailyDealDiscount * 100)}%`),
          deal.chest ? chestPic(deal.chest) : coinPic(deal.coins ?? 0),
          h('b', { class: 'stroke-sm' }, deal.chest ? CHEST_NAMES[deal.chest] : `${formatNumber(deal.coins ?? 0)} moedas`),
          h('span', { class: 'dim' }, bought ? 'Levado! Volte amanhã.' : `Troca em ${formatDuration(Math.round(msUntilNextDay(now) / 1000))}`),
          h(
            'button',
            {
              class: `btn ${bought ? 'dark' : 'pink'}`,
              disabled: bought,
              onClick: async () => {
                const r = await app.buyDealAction();
                if (!r.ok) return app.ui.toast(r.reason, 'error', 'gem');
                audio.play('coins');
                render();
                if (r.chest) {
                  const item = [...app.save.chests.inventory].reverse().find((c) => c.type === r.chest);
                  if (item) void openChestScreen(app, item.uid, render);
                } else app.ui.toast(`+${formatNumber(r.coins ?? 0)} moedas`, 'gold', 'coin');
              },
            },
            h('s', { class: 'deal-old' }, String(deal.full)),
            icon('gem'),
            String(deal.price),
          ),
        ),
      ),
      h(
        'div',
        { class: 'shop-sec' },
        h('div', { class: 'shop-sec-title stroke-sm' }, 'Baús'),
        h(
          'div',
          { class: 'shop-row' },
          ...ECONOMY.shop.chests.map((c) => {
            const lock = chestLockReason(s, c.type);
            return h(
              'div',
              { class: `shop-item ${lock ? 'locked' : ''}` },
              chestPic(c.type),
              h('b', { class: 'stroke-sm' }, chestDef(c.type).name.replace('Baú ', '').replace('de ', '')),
              lock
                ? h('span', { class: 'dim' }, icon('lock'), ` Nível ${unlockLevel(lock)}`)
                : h(
                    'button',
                    {
                      class: 'btn small purple',
                      onClick: async () => {
                        const r = await app.buyChestAction(c.type);
                        if (!r.ok) return app.ui.toast(r.reason, 'error', 'gem');
                        void openChestScreen(app, r.uid, render);
                      },
                    },
                    icon('gem'),
                    String(chestPrice(c.type)),
                  ),
            );
          }),
        ),
      ),
      h(
        'div',
        { class: 'shop-sec' },
        h('div', { class: 'shop-sec-title stroke-sm' }, 'Moedas'),
        h(
          'div',
          { class: 'shop-row' },
          ...ECONOMY.shop.coins.map((p, i) =>
            h(
              'div',
              { class: 'shop-item' },
              coinPic(p.coins),
              h('b', { class: 'stroke-sm' }, formatNumber(p.coins)),
              h(
                'button',
                {
                  class: 'btn small green',
                  onClick: () => {
                    const r = app.act('buyCoins', { index: i });
                    if (!r.ok) return app.ui.toast(r.reason, 'error', 'gem');
                    audio.play('coins');
                    app.ui.toast(`+${formatNumber(r.coins)} moedas`, 'gold', 'coin');
                    render();
                  },
                },
                icon('gem'),
                String(p.diamonds),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'shop-sec' },
        h('div', { class: 'shop-sec-title stroke-sm' }, 'Diamantes'),
        h(
          'div',
          { class: 'shop-row' },
          ...DIAMOND_PACKS.map((p) =>
            h(
              'div',
              { class: 'shop-item gems' },
              p.tag ? h('div', { class: 'deal-ribbon small stroke-sm' }, p.tag) : null,
              h('span', { class: 'shop-pic coins' }, icon('gem')),
              h('b', { class: 'stroke-sm' }, formatNumber(p.diamonds)),
              h('button', { class: 'btn small dark', onClick: () => app.ui.toast('Compras com dinheiro chegam quando o pagamento seguro estiver ativo.', 'info', 'lock') }, p.price),
            ),
          ),
        ),
        h('p', { class: 'dim shop-fair' }, icon('shield'), ' Jogo justo: o matchmaking compara o poder do esquadrão e da cidade. Chances de baú sempre visíveis.'),
      ),
    );
  };
  render();
  app.ui.openScreen(
    h(
      'div',
      { class: 'shop-screen' },
      h(
        'div',
        { class: 'scr-head' },
        h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
        h('div', { class: 'scr-title stroke' }, 'Loja'),
        h('div', { class: 'grow' }),
        h('div', { class: 'chip' }, icon('coin'), coins),
        h('div', { class: 'chip' }, icon('gem'), gems),
      ),
      body,
    ),
  );
}
