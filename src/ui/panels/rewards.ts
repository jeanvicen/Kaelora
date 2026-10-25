import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { formatNumber, type Reward } from '../../meta/economy.ts';
import type { AppliedReward } from '../../meta/rewards.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { CHEST_NAMES } from '../screens/result.ts';

/** Fichinhas de uma recompensa (moedas, diamantes, baú, personagem). */
export function rewardChips(r: Reward, small = true): HTMLElement {
  return h(
    'span',
    { class: `rw-chips ${small ? 'small' : ''}` },
    r.coins ? h('span', { class: 'rw-chip coin' }, icon('coin'), formatNumber(r.coins)) : null,
    r.diamonds ? h('span', { class: 'rw-chip gem' }, icon('gem'), formatNumber(r.diamonds)) : null,
    r.chest ? h('span', { class: `rw-chip chest chest-${r.chest}` }, icon('chest'), CHEST_NAMES[r.chest].replace('Baú ', '').replace('de ', '')) : null,
    r.character ? h('span', { class: 'rw-chip char prismatic-text' }, icon('star'), 'Extremo da temporada') : null,
  );
}

/** Festa de recompensa recebida (som, vibração e aviso). */
export function celebrateReward(app: App, title: string, r: AppliedReward | undefined): void {
  if (!r) return;
  const parts: string[] = [];
  if (r.coins) parts.push(`+${formatNumber(r.coins)} moedas`);
  if (r.diamonds) parts.push(`+${formatNumber(r.diamonds)} diamantes`);
  if (r.chest) parts.push(r.chestLost ? `${CHEST_NAMES[r.chest]} perdido (baús cheios)` : CHEST_NAMES[r.chest]);
  audio.play('coins');
  if (r.chest || (r.diamonds ?? 0) > 0) audio.play('star');
  vibrate([15, 30, 15]);
  app.ui.toast(`${title}: ${parts.join(' • ') || 'resgatado!'}`, 'gold', 'gift');
}
