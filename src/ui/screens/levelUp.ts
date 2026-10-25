import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { ECONOMY, formatNumber } from '../../meta/economy.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

/** Nome amigável de cada coisa liberada pelo nível de conta. */
export const FEATURE_NAMES: Record<string, [string, IconName]> = {
  invasao: ['Invasões', 'swords'],
  treinamento: ['Treinamento', 'target'],
  loja: ['Loja', 'shop'],
  eventos: ['Eventos semanais', 'calendar'],
  'bau-ouro': ['Baú de Ouro na loja', 'chest'],
  passe: ['Passe de Temporada', 'pass'],
  ligas: ['Ligas e ranking', 'trophy'],
  'fim-protecao': ['Fim da proteção de iniciante', 'shield'],
  multiplayer: ['Duelo ao vivo 1v1', 'versus'],
  'bau-magico': ['Baú Mágico na loja', 'chest'],
  'bau-extremo': ['Baú Extremo na loja', 'chest'],
};

/** Comemoração de nível de conta, com o que foi liberado e o prêmio. */
export function showLevelUp(app: App, level: number, onClose?: () => void): void {
  const unlocks = ECONOMY.account.unlocks[String(level)] ?? [];
  const r = ECONOMY.account.levelUpReward;
  const m = app.ui.modal(
    h(
      'div',
      { class: 'panel levelup-box' },
      h('div', { class: 'lu-rays' }),
      h('div', { class: 'lu-hex stroke' }, String(level)),
      h('div', { class: 'lu-title stroke' }, 'Subiu de nível!'),
      unlocks.length
        ? h(
            'div',
            { class: 'lu-unlocks' },
            h('small', null, 'LIBERADO'),
            ...unlocks.map((f) => {
              const [name, ic] = FEATURE_NAMES[f] ?? [f, 'gift'];
              return h('div', { class: 'lu-unlock' }, icon(ic), h('span', { class: 'stroke-sm' }, name));
            }),
          )
        : null,
      h(
        'div',
        { class: 'lu-reward' },
        h('span', { class: 'chip small' }, icon('coin'), formatNumber((r.coins ?? 0) * level)),
        r.diamonds ? h('span', { class: 'chip small' }, icon('gem'), formatNumber(r.diamonds)) : null,
      ),
      h('button', { class: 'btn green big', onClick: () => m.close() }, 'Oba!'),
    ),
    { onClose, closeButton: false },
  );
  audio.play('levelUp');
  setTimeout(() => audio.cheer(0.7), 250);
  vibrate([20, 40, 20, 40, 90]);
  app.ui.flash('#ffd23f', 420, 0.5);
}
