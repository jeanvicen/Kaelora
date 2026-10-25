import type { App } from '../../app.ts';
import { botOwnerName } from '../../content/botCity.ts';
import { ECONOMY, formatDuration, formatNumber, leagueFor } from '../../meta/economy.ts';
import { msUntilNextWeek, weekKey } from '../../meta/time.ts';
import { Rng, hashString } from '../../sim/rng.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { rewardChips } from '../panels/rewards.ts';

interface RankRow {
  name: string;
  trophies: number;
  level: number;
  me: boolean;
}

/** Ranking offline: rivais da semana com troféus perto dos seus. */
function offlineRanking(app: App): RankRow[] {
  const s = app.save;
  const rng = new Rng(hashString(`rank:${weekKey(Date.now())}:${s.profile.id}`));
  const rows: RankRow[] = [];
  for (let i = 0; i < 29; i++) {
    const t = Math.max(0, Math.round(s.profile.trophies + (rng.int(1000) / 1000 - 0.45) * 900 + (i - 14) * 18));
    rows.push({ name: botOwnerName(rng), trophies: t, level: Math.max(1, Math.round(t / 180) + rng.range(0, 4)), me: false });
  }
  rows.push({ name: s.profile.name, trophies: s.profile.trophies, level: s.profile.accountLevel, me: true });
  return rows.sort((a, b) => b.trophies - a.trophies);
}

/** Ligas (com recompensa semanal) e ranking. */
export function openLeague(app: App): void {
  const s = app.save;
  const cur = leagueFor(s.profile.trophies);
  const idx = ECONOMY.leagues.findIndex((l) => l.id === cur.id);
  const next = ECONOMY.leagues[idx + 1];
  const ladder = h(
    'div',
    { class: 'lg-ladder' },
    ...[...ECONOMY.leagues].reverse().map((l) =>
      h(
        'div',
        { class: `lg-row lg-${l.id} ${l.id === cur.id ? 'cur' : ''}` },
        h('div', { class: `league-badge lg-${l.id}` }, icon('trophy')),
        h('div', { class: 'col grow' }, h('b', { class: 'stroke-sm' }, l.name), h('span', { class: 'dim' }, `${formatNumber(l.min)}+ troféus`)),
        rewardChips(l.reward),
      ),
    ),
  );
  const list = h('div', { class: 'rank-list scroll-y' }, h('p', { class: 'dim' }, 'Carregando...'));
  const renderRows = (rows: RankRow[]) =>
    list.replaceChildren(
      ...rows.map((r, i) =>
        h(
          'div',
          { class: `rank-row ${r.me ? 'me' : ''}` },
          h('span', { class: `rank-pos ${i < 3 ? `top${i + 1}` : ''} stroke-sm` }, String(i + 1)),
          h('span', { class: 'rank-name stroke-sm' }, r.name),
          h('span', { class: 'rank-lvl' }, `Nv ${r.level}`),
          h('span', { class: 'rank-tr' }, icon('trophy'), formatNumber(r.trophies)),
        ),
      ),
    );
  if (app.online && app.cloud) {
    void app.cloud
      .leaderboard()
      .then((rows) => renderRows(rows.map((r) => ({ name: r.name, trophies: r.trophies, level: r.account_level, me: r.user_id === app.cloud!.userId }))))
      .catch(() => renderRows(offlineRanking(app)));
  } else renderRows(offlineRanking(app));
  const screen = h(
    'div',
    { class: 'league-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Liga & Ranking'),
      h('div', { class: 'grow' }),
      h('div', { class: 'chip' }, icon('clock'), h('span', { class: 'stroke-sm' }, `Reset em ${formatDuration(Math.round(msUntilNextWeek(Date.now()) / 1000))}`)),
    ),
    h(
      'div',
      { class: 'lg-body' },
      h(
        'div',
        { class: 'panel lg-left' },
        h(
          'div',
          { class: 'lg-me' },
          h('div', { class: `league-badge big lg-${cur.id}` }, icon('trophy')),
          h(
            'div',
            { class: 'col grow' },
            h('b', { class: 'stroke lg-name' }, `Liga ${cur.name}`),
            h('span', { class: 'stroke-sm' }, icon('trophy'), ` ${formatNumber(s.profile.trophies)} troféus`),
            next
              ? h('div', { class: 'bar gold' }, h('i', { style: { width: `${Math.min(100, ((s.profile.trophies - cur.min) / (next.min - cur.min)) * 100)}%` } }), h('span', null, `${formatNumber(next.min - s.profile.trophies)} para ${next.name}`))
              : h('span', { class: 'gold-text' }, 'Topo do mundo!'),
          ),
        ),
        h('p', { class: 'dim lg-note' }, 'Toda segunda-feira você ganha a recompensa da sua liga e os troféus têm um reset suave.'),
        ladder,
      ),
      h('div', { class: 'panel lg-right' }, h('div', { class: 'panel-head' }, icon('ranking'), h('div', { class: 'panel-title' }, app.online ? 'Ranking global' : 'Ranking da semana')), list),
    ),
  );
  app.ui.openScreen(screen);
}
