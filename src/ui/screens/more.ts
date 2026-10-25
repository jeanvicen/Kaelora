import type { App } from '../../app.ts';
import { isUnlocked, unlockLevel } from '../../meta/economy.ts';
import { activeRevenges } from '../../meta/defense.ts';
import { passClaimable } from '../../meta/retention.ts';
import { EVENT_MILESTONES } from '../../meta/retention.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

/** Quantas coisas esperam o jogador no menu "Mais" (para o selo da barra). */
export function moreBadgeCount(app: App): number {
  const s = app.save;
  let n = 0;
  if (isUnlocked(s, 'passe')) n += passClaimable(s);
  if (isUnlocked(s, 'eventos')) n += EVENT_MILESTONES.filter((m) => s.events.wins >= m.wins && !s.events.claimed.includes(m.wins)).length;
  return n;
}

/** Menu "Mais": tudo que não cabe na barra inferior. */
export function openMore(app: App): void {
  const s = app.save;
  const item = (ic: IconName, label: string, sub: string, fn: () => void, opts: { feature?: string; badge?: number } = {}) => {
    const locked = opts.feature ? !isUnlocked(s, opts.feature) : false;
    return h(
      'button',
      {
        class: `more-item ${locked ? 'locked' : ''}`,
        onClick: () => {
          if (locked) return app.ui.toast(`Libera no nível de conta ${unlockLevel(opts.feature!)}`, 'info', 'lock');
          m.close();
          setTimeout(fn, 120);
        },
      },
      h('span', { class: 'more-ico' }, icon(locked ? 'lock' : ic)),
      h('b', { class: 'stroke-sm' }, label),
      h('span', { class: 'dim' }, locked ? `Nível ${unlockLevel(opts.feature!)}` : sub),
      opts.badge && !locked ? h('span', { class: 'badge more-badge' }, String(opts.badge)) : null,
    );
  };
  const evBadge = EVENT_MILESTONES.filter((x) => s.events.wins >= x.wins && !s.events.claimed.includes(x.wins)).length;
  const m = app.ui.modal(
    h(
      'div',
      { class: 'panel more-panel' },
      h('div', { class: 'panel-head' }, icon('more'), h('div', { class: 'panel-title' }, 'Mais')),
      h(
        'div',
        { class: 'panel-body more-grid' },
        item('calendar', 'Evento', 'Regras especiais da semana', () => app.openEvents(), { feature: 'eventos', badge: evBadge }),
        item('pass', 'Passe', 'Temporada de 30 dias', () => app.openPass(), { feature: 'passe', badge: passClaimable(s) }),
        item('ranking', 'Liga & Ranking', 'Reset toda segunda', () => app.openRanking(), { feature: 'ligas' }),
        item('target', 'Treinamento', 'Nada se perde', () => app.openTraining(), { feature: 'treinamento' }),
        item('shop', 'Loja', 'Baús, moedas e ofertas', () => app.openShop(), { feature: 'loja' }),
        item('user', 'Perfil', 'Conquistas e estatísticas', () => app.openProfile()),
        item('flame', 'Vingança', 'Defesas e revide', () => app.openRevengeWall(), { badge: activeRevenges(s, Date.now()).length }),
        item('versus', 'Duelo ao vivo', '1v1 em tempo real', () => app.openDuel(), { feature: 'multiplayer' }),
        item('gear', 'Configurações', 'Som, gráficos, conta', () => app.openSettings()),
      ),
    ),
  );
}
