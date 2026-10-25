import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { ECONOMY, formatDuration, leagueFor } from '../../meta/economy.ts';
import { missionViews } from '../../meta/retention.ts';
import { dayKey, msUntilNextDay } from '../../meta/time.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { celebrateReward, rewardChips } from '../panels/rewards.ts';

let dailyShownFor = '';

/** Na entrada do dia: calendário de login e prêmio da liga da semana passada. */
export function showDailyIfNeeded(app: App): void {
  const s = app.save;
  const show = () => {
    if (app.ui.hasScreen || app.ui.modals.childElementCount || app.game.current !== app.city) return void setTimeout(show, 2000);
    if (s.league.pending) return showLeagueReward(app, () => setTimeout(() => showDailyIfNeeded(app), 400));
    const today = dayKey(Date.now());
    if (!s.login.claimedToday && s.login.lastDay === today && dailyShownFor !== today) {
      dailyShownFor = today;
      showLoginCalendar(app);
    }
  };
  if (s.league.pending || (!s.login.claimedToday && dailyShownFor !== dayKey(Date.now()))) show();
}

function loginStrip(app: App, onClaim?: () => void): HTMLElement {
  const s = app.save;
  const today = Math.max(1, Math.min(7, s.login.streak));
  const strip = h('div', { class: 'login-strip' });
  ECONOMY.login.forEach((r, i) => {
    const day = i + 1;
    const state = day < today || (day === today && s.login.claimedToday) ? 'done' : day === today ? 'today' : 'future';
    strip.appendChild(
      h(
        'div',
        { class: `login-day ${state} ${day === 7 ? 'big' : ''}` },
        h('div', { class: 'ld-num stroke-sm' }, `Dia ${day}`),
        h('div', { class: 'ld-ico' }, icon(r.chest ? 'chest' : r.diamonds ? 'gem' : 'coin')),
        rewardChips(r),
        state === 'done' ? h('div', { class: 'ld-check' }, icon('check')) : null,
      ),
    );
  });
  const btn = s.login.claimedToday
    ? h('div', { class: 'login-next dim' }, icon('clock'), `Próximo prêmio em ${formatDuration(Math.round(msUntilNextDay(Date.now()) / 1000))}`)
    : h(
        'button',
        {
          class: 'btn green big',
          onClick: async () => {
            try {
              const r = await app.claim('login', {});
              if (!r.ok) return app.ui.toast(r.reason, 'error');
              celebrateReward(app, `Login dia ${r.day}`, r.reward);
              onClaim?.();
            } catch (e) {
              app.ui.toast(e instanceof Error ? e.message : 'Erro', 'error');
            }
          },
        },
        icon('gift'),
        `Pegar prêmio do dia ${today}`,
      );
  return h('div', { class: 'col login-box' }, strip, h('div', { class: 'login-foot' }, h('span', { class: 'dim' }, 'Entre todo dia: a sequência de 7 dias dá prêmios cada vez maiores.'), btn));
}

export function showLoginCalendar(app: App): void {
  const m = app.ui.modal(
    h('div', { class: 'panel login-cal' }, h('div', { class: 'panel-head' }, icon('calendar'), h('div', { class: 'panel-title' }, 'Prêmio de login')), h('div', { class: 'panel-body' }, loginStrip(app, () => m.close()))),
  );
  audio.play('notify');
}

function showLeagueReward(app: App, onDone: () => void): void {
  const p = app.save.league.pending;
  if (!p) return onDone();
  const lg = ECONOMY.leagues.find((l) => l.id === p.leagueId) ?? leagueFor(0);
  const m = app.ui.modal(
    h(
      'div',
      { class: 'panel levelup-box league-reward' },
      h('div', { class: 'lu-rays' }),
      h('div', { class: `league-badge big lg-${lg.id}` }, icon('trophy')),
      h('div', { class: 'lu-title stroke' }, `Fim da semana: Liga ${lg.name}!`),
      h('p', { class: 'dim', style: { position: 'relative', margin: '0', textAlign: 'center' } }, 'Os troféus tiveram um reset suave. Bora subir de novo!'),
      h('div', { class: 'lu-reward' }, rewardChips(lg.reward, false)),
      h(
        'button',
        {
          class: 'btn green big',
          onClick: async () => {
            try {
              const r = await app.claim('league', {});
              if (r.ok) celebrateReward(app, `Liga ${lg.name}`, r.reward);
            } finally {
              m.close();
            }
          },
        },
        'Resgatar',
      ),
    ),
    { dismissable: false, closeButton: false, onClose: onDone },
  );
  audio.play('levelUp');
}

/** Missões do dia + calendário de login. */
export function openDaily(app: App): void {
  const body = h('div', { class: 'panel-body daily-body' });
  const render = () => {
    const s = app.save;
    const list = missionViews(s);
    const allClaimed = list.length > 0 && list.every((m) => m.claimed);
    body.replaceChildren(
      h(
        'div',
        { class: 'col daily-missions' },
        h('div', { class: 'daily-title stroke-sm' }, icon('mission'), 'Missões do dia', h('span', { class: 'dim daily-timer' }, `novas em ${formatDuration(Math.round(msUntilNextDay(Date.now()) / 1000))}`)),
        ...list.map((m) =>
          h(
            'div',
            { class: `mission ${m.claimed ? 'claimed' : m.progress >= m.goal ? 'ready' : ''}` },
            h(
              'div',
              { class: 'grow col' },
              h('div', { class: 'ms-text stroke-sm' }, m.text),
              h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (m.progress / m.goal) * 100)}%` } }), h('span', null, `${m.progress.toLocaleString('pt-BR')}/${m.goal.toLocaleString('pt-BR')}`)),
            ),
            rewardChips(m.reward),
            m.claimed
              ? h('div', { class: 'ms-done' }, icon('check'))
              : h(
                  'button',
                  {
                    class: `btn small ${m.progress >= m.goal ? 'green' : 'dark'}`,
                    disabled: m.progress < m.goal,
                    onClick: async () => {
                      const r = await app.claim('mission', { id: m.id });
                      if (!r.ok) return app.ui.toast(r.reason, 'error');
                      celebrateReward(app, 'Missão', r.reward);
                      app.queueLevelUps(r.levels);
                      render();
                    },
                  },
                  'Pegar',
                ),
          ),
        ),
        h(
          'div',
          { class: `mission bonus ${s.missions.bonusClaimed ? 'claimed' : allClaimed ? 'ready' : ''}` },
          h('div', { class: 'grow ms-text stroke-sm' }, 'Bônus: complete as 3 missões'),
          rewardChips(ECONOMY.missions.allDoneReward),
          s.missions.bonusClaimed
            ? h('div', { class: 'ms-done' }, icon('check'))
            : h(
                'button',
                {
                  class: `btn small ${allClaimed ? 'pink' : 'dark'}`,
                  disabled: !allClaimed,
                  onClick: async () => {
                    const r = await app.claim('missionBonus', {});
                    if (!r.ok) return app.ui.toast(r.reason, 'error');
                    celebrateReward(app, 'Bônus do dia', r.reward);
                    render();
                  },
                },
                'Pegar',
              ),
        ),
      ),
      h('div', { class: 'col daily-login' }, h('div', { class: 'daily-title stroke-sm' }, icon('calendar'), `Login: dia ${Math.max(1, s.login.streak)} de 7`), loginStrip(app, render)),
    );
  };
  render();
  app.ui.modal(h('div', { class: 'panel daily-panel' }, h('div', { class: 'panel-head' }, icon('mission'), h('div', { class: 'panel-title' }, 'Diário')), body));
}
