import type { App } from '../../app.ts';
import { audio } from '../../core/audio.ts';
import { albumProgress } from '../../meta/collection.ts';
import { achievementViews } from '../../meta/achievements.ts';
import { missionText } from '../../meta/retention.ts';
import { formatNumber, leagueFor, xpToNext } from '../../meta/economy.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { lazyPortrait } from '../panels/charCard.ts';

/** Perfil: avatar, nomes, estatísticas e conquistas. */
export function openProfile(app: App): void {
  const left = h('div', { class: 'panel pf-left scroll-y' });
  const right = h('div', { class: 'panel pf-right' });
  const render = () => {
    const s = app.save;
    const p = s.profile;
    const avatarId = s.collection[p.avatar] ? p.avatar : s.squad[0];
    const pic = h('button', { class: 'pf-avatar', 'aria-label': 'Trocar avatar', onClick: () => pickAvatar() });
    lazyPortrait(app, pic, avatarId);
    const lg = leagueFor(p.trophies);
    const st = s.stats;
    const stat = (ic: IconName, label: string, v: string) => h('div', { class: 'cs-stat' }, icon(ic), h('span', { class: 'dim' }, label), h('b', null, v));
    left.replaceChildren(
      h(
        'div',
        { class: 'pf-id' },
        pic,
        h(
          'div',
          { class: 'col grow' },
          h('div', { class: 'pf-name stroke' }, p.name, h('button', { class: 'pf-edit', 'aria-label': 'Mudar nome', onClick: () => editName('rename', 'Seu nome', p.name, 16) }, icon('wrench'))),
          h('div', { class: 'dim pf-city' }, s.city.name, h('button', { class: 'pf-edit', 'aria-label': 'Mudar nome da cidade', onClick: () => editName('cityName', 'Nome da cidade', s.city.name, 24) }, icon('wrench'))),
          h('div', { class: 'bar cyan' }, h('i', { style: { width: `${Math.min(100, (p.accountXp / xpToNext(p.accountLevel)) * 100)}%` } }), h('span', null, `Nível ${p.accountLevel} • ${p.accountXp}/${xpToNext(p.accountLevel)} XP`)),
        ),
      ),
      h(
        'div',
        { class: 'cs-stats pf-stats' },
        stat('trophy', `Liga ${lg.name}`, formatNumber(p.trophies)),
        stat('star', 'Recorde', formatNumber(p.bestTrophies)),
        stat('swords', 'Batalhas', formatNumber(st.battles)),
        stat('check', 'Vitórias', `${formatNumber(st.wins)} (${st.battles ? Math.round((st.wins / st.battles) * 100) : 0}%)`),
        stat('star', 'Estrelas', formatNumber(st.stars)),
        stat('flame', 'Núcleos derrubados', formatNumber(st.coresDestroyed)),
        stat('build', 'Construções destruídas', formatNumber(st.buildingsDestroyed)),
        stat('sword', 'Dano causado', formatNumber(st.damageDealt)),
        stat('shield', 'Defesas seguradas', formatNumber(st.raidsDefended)),
        stat('chest', 'Baús abertos', formatNumber(st.chestsOpened)),
        stat('versus', 'Duelos vencidos', formatNumber(st.duelsWon)),
        stat('squad', 'Coleção', `${albumProgress(s).total.owned}/1008`),
      ),
    );
    const list = achievementViews(s);
    right.replaceChildren(
      h('div', { class: 'panel-head' }, icon('trophy'), h('div', { class: 'panel-title' }, 'Conquistas'), h('span', { class: 'dim' }, `${list.filter((a) => a.done).length}/${list.length}`)),
      h(
        'div',
        { class: 'panel-body col scroll-y pf-ach' },
        ...list.map((a) =>
          h(
            'div',
            { class: `mission ${a.done ? 'claimed' : a.ready ? 'ready' : ''}` },
            h('div', { class: 'pf-medals' }, ...a.tiers.map((_, i) => h('span', { class: `medal m${i} ${i < a.claimed ? 'on' : ''}` }))),
            h(
              'div',
              { class: 'grow col' },
              h('div', { class: 'ms-text stroke-sm' }, a.title, h('span', { class: 'dim pf-ach-text' }, ` — ${missionText(a.text, a.goal)}`)),
              h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (a.value / a.goal) * 100)}%` } }), h('span', null, a.done ? 'COMPLETA' : `${formatNumber(Math.min(a.value, a.goal))}/${formatNumber(a.goal)}`)),
            ),
            a.done
              ? h('div', { class: 'ms-done' }, icon('check'))
              : h(
                  'button',
                  {
                    class: `btn small ${a.ready ? 'green' : 'dark'}`,
                    disabled: !a.ready,
                    onClick: async () => {
                      const r = await app.claim('achievement', { id: a.id });
                      if (!r.ok) return app.ui.toast(r.reason, 'error');
                      audio.play('star');
                      audio.play('coins');
                      app.ui.toast(`${a.title}: +${r.diamonds} diamantes`, 'gold', 'gem');
                      render();
                    },
                  },
                  icon('gem'),
                  String(a.diamonds[a.claimed] ?? 0),
                ),
          ),
        ),
      ),
    );
  };

  const editName = (action: 'rename' | 'cityName', title: string, current: string, max: number) => {
    const input = h('input', { class: 'input', maxlength: max, value: current }) as HTMLInputElement;
    const m = app.ui.modal(
      h(
        'div',
        { class: 'panel confirm-box' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title)),
        h(
          'div',
          { class: 'panel-body col' },
          input,
          h(
            'button',
            {
              class: 'btn green',
              onClick: () => {
                const r = app.act(action, { name: input.value });
                if (!r.ok) return app.ui.toast(r.reason, 'error');
                m.close();
                render();
              },
            },
            'Salvar',
          ),
        ),
      ),
    );
    setTimeout(() => input.focus(), 50);
  };

  const pickAvatar = () => {
    const s = app.save;
    const ids = Object.keys(s.collection).map(Number).slice(0, 60);
    const m = app.ui.modal(
      h(
        'div',
        { class: 'panel avatar-modal' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Escolha seu avatar')),
        h(
          'div',
          { class: 'panel-body avatar-grid scroll-y' },
          ...ids.map((id) => {
            const pic = h('button', { class: `mini-portrait big ${id === s.profile.avatar ? 'sel' : ''}`, onClick: () => (app.act('avatar', { id }), m.close(), render()) });
            lazyPortrait(app, pic, id);
            return pic;
          }),
        ),
      ),
    );
  };

  render();
  app.ui.openScreen(
    h(
      'div',
      { class: 'profile-screen' },
      h('div', { class: 'scr-head' }, h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')), h('div', { class: 'scr-title stroke' }, 'Perfil')),
      h('div', { class: 'pf-body' }, left, right),
    ),
  );
}
