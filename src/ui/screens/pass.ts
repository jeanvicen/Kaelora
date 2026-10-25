import type { App } from '../../app.ts';
import { getCharacter } from '../../content/catalog.ts';
import { audio } from '../../core/audio.ts';
import { ECONOMY, formatNumber } from '../../meta/economy.ts';
import { passTier, seasonCharacter, seasonInfo } from '../../meta/retention.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { lazyPortrait } from '../panels/charCard.ts';
import { celebrateReward, rewardChips } from '../panels/rewards.ts';

/** Passe de temporada (30 dias): trilha grátis e premium, Extremo no fim. */
export function openPass(app: App): void {
  const head = h('div', { class: 'scr-head' });
  const info = h('div', { class: 'ps-info' });
  const track = h('div', { class: 'ps-track scroll-x' });
  const render = (scroll = false) => {
    const s = app.save;
    const P = ECONOMY.pass;
    const tier = passTier(s);
    const si = seasonInfo(s, Date.now());
    const inTier = s.pass.xp - tier * P.xpPerTier;
    head.replaceChildren(
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, `Passe • Temporada ${si.season}`),
      h('div', { class: 'grow' }),
      h('div', { class: 'chip' }, icon('clock'), h('span', { class: 'stroke-sm' }, `${si.daysLeft} dias`)),
      h('div', { class: 'chip' }, icon('gem'), h('span', { class: 'stroke-sm' }, formatNumber(s.currencies.diamonds))),
    );
    const ext = getCharacter(seasonCharacter(si.season));
    const extPic = h('div', { class: 'mini-portrait big rar-extremo' });
    lazyPortrait(app, extPic, ext.id);
    info.replaceChildren(
      h('div', { class: 'ps-tier stroke' }, String(tier)),
      h(
        'div',
        { class: 'col grow' },
        h('b', { class: 'stroke-sm' }, tier >= P.tiers ? 'Passe completo!' : `Nível ${tier} de ${P.tiers}`),
        h('div', { class: 'bar pink' }, h('i', { style: { width: `${tier >= P.tiers ? 100 : (inTier / P.xpPerTier) * 100}%` } }), h('span', null, tier >= P.tiers ? 'MÁX' : `${inTier}/${P.xpPerTier} XP`)),
        h('span', { class: 'dim ps-hint' }, 'XP do passe: vitórias, missões e baús.'),
      ),
      h('div', { class: 'ps-ext' }, extPic, h('div', { class: 'col' }, h('b', { class: 'prism-text ps-ext-name' }, ext.name), h('span', { class: 'dim' }, 'Extremo da temporada'))),
      s.pass.premium
        ? h('div', { class: 'chip ps-prem-on' }, icon('star'), h('span', { class: 'stroke-sm' }, 'Premium ativo'))
        : h(
            'button',
            {
              class: 'btn purple',
              onClick: async () => {
                const ok = await app.ui.confirm('Passe Premium', `Libera a trilha premium inteira (inclui ${ext.name}, Extremo) por ${P.premiumCostDiamonds} diamantes. Nada de vitória comprada: só prêmios.`, 'Comprar', 'Agora não');
                if (!ok) return;
                const r = app.act('buyPremium', {});
                if (!r.ok) return app.ui.toast(r.reason, 'error', 'gem');
                audio.play('levelUp');
                app.ui.flash('#a64dff', 400, 0.5);
                render();
              },
            },
            icon('star'),
            'Premium',
            h('span', { class: 'cost' }, icon('gem'), String(P.premiumCostDiamonds)),
          ),
    );
    const cell = (t: number, trackName: 'free' | 'premium') => {
      const reward = (trackName === 'free' ? P.free : P.premium)[t - 1];
      const claimed = (trackName === 'free' ? s.pass.claimedFree : s.pass.claimedPremium).includes(t);
      const locked = trackName === 'premium' && !s.pass.premium;
      const ready = tier >= t && !claimed && !locked;
      return h(
        'div',
        { class: `ps-cell ${trackName} ${claimed ? 'claimed' : ready ? 'ready' : tier >= t ? 'reached' : ''} ${locked ? 'locked' : ''}` },
        reward.character ? h('div', { class: 'ps-char' }, (() => {
          const p = h('div', { class: 'mini-portrait rar-extremo' });
          lazyPortrait(app, p, ext.id);
          return p;
        })()) : rewardChips(reward),
        claimed
          ? h('div', { class: 'ms-done' }, icon('check'))
          : locked
            ? h('div', { class: 'ps-lock' }, icon('lock'))
            : ready
              ? h(
                  'button',
                  {
                    class: 'btn small green',
                    onClick: async () => {
                      const r = await app.claim('pass', { tier: t, track: trackName });
                      if (!r.ok) return app.ui.toast(r.reason, 'error');
                      celebrateReward(app, `Passe nível ${t}`, r.reward);
                      if (r.character) {
                        audio.play('reveal');
                        app.ui.flash('#ff2a4a', 600, 0.7);
                        app.ui.toast(r.character.isNew ? `${getCharacter(r.character.id).name} entrou na coleção!` : `+${r.character.fragments} fragmentos de ${getCharacter(r.character.id).name}`, 'gold', 'star');
                      }
                      render();
                    },
                  },
                  'Pegar',
                )
              : null,
      );
    };
    track.replaceChildren(
      h('div', { class: 'ps-labels' }, h('div', { class: 'ps-lbl free stroke-sm' }, 'Grátis'), h('div', { class: 'ps-lbl premium stroke-sm' }, icon('star'), 'Premium')),
      ...Array.from({ length: P.tiers }, (_, i) => {
        const t = i + 1;
        return h('div', { class: `ps-col ${tier >= t ? 'on' : ''} ${t === P.tiers ? 'final' : ''}` }, h('div', { class: 'ps-num stroke-sm' }, String(t)), cell(t, 'free'), cell(t, 'premium'));
      }),
    );
    if (scroll) requestAnimationFrame(() => (track.scrollLeft = Math.max(0, (tier - 2) * 104)));
  };
  render(true);
  app.ui.openScreen(h('div', { class: 'pass-screen' }, head, info, track));
}
