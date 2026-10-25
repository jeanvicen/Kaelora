import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { getCharacter } from '../../content/catalog.ts';
import { formatNumber } from '../../meta/economy.ts';
import { nextGoal } from '../../meta/goals.ts';
import type { BattleRewards } from '../../meta/raids.ts';
import type { BattleResult } from '../../sim/types.ts';
import { h, tweenNumber } from '../dom.ts';
import { icon } from '../icons.ts';
import { openChestScreen } from './chestOpen.ts';

export const CHEST_NAMES = { madeira: 'Baú de Madeira', prata: 'Baú de Prata', ouro: 'Baú de Ouro', magico: 'Baú Mágico', extremo: 'Baú Extremo' } as const;

/** Tela de resultado: estrelas, recompensas, evolução e próximo objetivo. */
export function showResult(
  app: App,
  o: { result: BattleResult; rewards: BattleRewards | null; title: string; replayLink: string | null; onContinue: () => void; onReplay?: () => void; perspective: 'attacker' | 'defender' },
): void {
  const r = o.result;
  const won = o.perspective === 'attacker' ? r.winner === 0 : r.winner === 1;
  const stars = [0, 1, 2].map((i) => h('div', { class: 'res-star' }, icon('starEmpty'), h('span', { class: 'star-full' }, icon('star')), h('small', null, ['50% destruído', 'Núcleo derrubado', 'Sobrar 60 s'][i])));
  const rw = o.rewards;
  const rows: HTMLElement[] = [];
  const counter = (ic: 'coin' | 'trophy' | 'star', value: number, label: string, signed = false) => {
    const num = h('b', { class: 'stroke-sm' }, '0');
    rows.push(h('div', { class: 'res-row' }, icon(ic), h('span', null, label), num));
    setTimeout(() => tweenNumber(num, 0, value, 700, (n) => `${signed && n > 0 ? '+' : ''}${formatNumber(n)}`), 900);
  };
  if (rw) {
    if (rw.coins + rw.loot > 0) counter('coin', rw.coins + rw.loot, rw.loot ? `Moedas (saque ${formatNumber(rw.loot)})` : 'Moedas', true);
    if (rw.revengeRecovered) counter('coin', rw.revengeRecovered, 'Vingança: moedas recuperadas', true);
    if (rw.trophies) counter('trophy', rw.trophies, 'Troféus', true);
    counter('star', rw.accountXp, 'XP da conta', true);
  }
  const openBtn = h(
    'button',
    {
      class: 'btn small green res-open',
      onClick: () => {
        const item = [...app.save.chests.inventory].reverse().find((c) => c.type === rw?.chest);
        if (!item) return;
        openBtn.remove();
        openChestScreen(app, item.uid);
      },
    },
    'Abrir',
  );
  const chest = rw?.chest
    ? h('div', { class: `res-chest chest-${rw.chest}` }, h('div', { class: 'res-chest-ico' }, icon('chest')), h('span', { class: 'stroke-sm' }, CHEST_NAMES[rw.chest]), openBtn)
    : rw?.chestBlocked
      ? h('div', { class: 'res-chest blocked' }, icon('chest'), h('span', null, 'Baús cheios! Abra algum para ganhar mais.'))
      : null;
  const squad = rw
    ? h(
        'div',
        { class: 'res-squad' },
        ...rw.characters.map((c) => {
          const def = getCharacter(c.id);
          const pic = h('div', { class: `mini-portrait rar-${def.rarity}` });
          void app.characterPortrait(c.id).then((u) => (pic.style.backgroundImage = `url(${u})`));
          return h('div', { class: 'res-char' }, pic, c.levelAfter > c.levelBefore ? h('span', { class: 'lvl-up stroke-sm' }, `Nível ${c.levelAfter}!`) : h('span', { class: 'xp-gain' }, c.capped ? 'Nível máx.' : `+${c.xp} XP`));
        }),
      )
    : null;
  const goal = nextGoal(app.store.data, Date.now());
  const share = o.replayLink
    ? h(
        'button',
        {
          class: 'btn dark small',
          onClick: async () => {
            const link = o.replayLink!;
            try {
              if (navigator.share) await navigator.share({ title: 'Replay do Kaelora', text: `Olha essa batalha: ${o.title}`, url: link });
              else {
                await navigator.clipboard.writeText(link);
                app.ui.toast('Link do replay copiado!', 'good');
              }
            } catch {
              // compartilhamento cancelado
            }
          },
        },
        icon('share'),
        'Compartilhar',
      )
    : null;
  const box = h(
    'div',
    { class: `result-screen ${won ? 'won' : 'lost'}` },
    h('div', { class: 'res-rays' }),
    h('div', { class: 'res-title' }, won ? 'VITÓRIA!' : 'DERROTA'),
    h('div', { class: 'res-sub stroke-sm' }, o.title),
    h('div', { class: 'res-stars' }, ...stars),
    h(
      'div',
      { class: 'res-body' },
      h(
        'div',
        { class: 'panel res-panel' },
        h('div', { class: 'res-line' }, h('span', null, 'Destruição'), h('b', null, `${r.destruction}%`)),
        h('div', { class: 'res-line' }, h('span', null, 'Tempo'), h('b', null, `${Math.floor(r.ticks / 30 / 60)}:${String(Math.floor((r.ticks / 30) % 60)).padStart(2, '0')}`)),
        h('div', { class: 'res-line' }, h('span', null, 'Dano causado'), h('b', null, formatNumber(r.damageDealt[o.perspective === 'attacker' ? 0 : 1]))),
        ...rows,
      ),
      h('div', { class: 'col res-right' }, chest, squad, h('div', { class: 'res-goal' }, h('small', null, 'PRÓXIMO OBJETIVO'), h('span', { class: 'stroke-sm' }, goal.text))),
    ),
    h(
      'div',
      { class: 'res-actions' },
      o.onReplay ? h('button', { class: 'btn purple small', onClick: () => o.onReplay?.() }, icon('replay'), 'Ver replay') : null,
      share,
      h('button', { class: 'btn green big', onClick: () => o.onContinue() }, 'Continuar', icon('play')),
    ),
  );
  app.ui.openScreen(box, undefined);
  // estrelas entram uma por uma, com som
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (i < r.stars) {
        stars[i].classList.add('on');
        audio.play('star', { pitch: 1 + i * 0.12 });
      }
    }, 450 + i * 380);
  }
}
