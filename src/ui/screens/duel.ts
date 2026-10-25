import type { App } from '../../app.ts';
import { getCharacter } from '../../content/catalog.ts';
import { duelProfileOf } from '../../content/duelSetup.ts';
import { squadPower } from '../../content/squad.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { formatNumber } from '../../meta/economy.ts';
import { DuelLobby, type DuelMatch } from '../../net/duelLobby.ts';
import { BroadcastTransport, SupabaseTransport } from '../../net/transports.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { lazyPortrait } from '../panels/charCard.ts';

const tabId = `aba-${Math.random().toString(36).slice(2, 10)}`;

/** Duelo ao vivo 1v1: online (Supabase) ou local entre duas abas. */
export function openDuel(app: App): void {
  const save = app.save;
  const status = h('div', { class: 'duel-status' });
  let lobby: DuelLobby | null = null;
  let ticker = 0;

  const search = (mode: 'online' | 'local') => {
    const id = mode === 'online' ? app.cloud!.userId! : tabId;
    const me = duelProfileOf(app.save, id);
    const open = (name: string) => (mode === 'online' ? new SupabaseTransport(app.cloud!, name) : new BroadcastTransport(name));
    const t0 = Date.now();
    const info = h('span', { class: 'dim' }, mode === 'online' ? 'Procurando alguém com troféus parecidos...' : 'Abra o Kaelora em outra aba e toque em "Duelo local" lá também.');
    const clock = h('b', { class: 'stroke duel-clock' }, '0:00');
    status.replaceChildren(
      h(
        'div',
        { class: 'duel-search' },
        h('div', { class: 'duel-radar' }, h('i'), h('i'), icon('versus')),
        h('div', { class: 'col' }, h('b', { class: 'stroke-sm' }, mode === 'online' ? 'Procurando oponente' : 'Esperando a outra aba'), info, clock),
        h('button', { class: 'btn dark small', onClick: () => cancel() }, icon('close'), 'Cancelar'),
      ),
    );
    ticker = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    lobby = new DuelLobby(open, me, (m) => found(m, mode), (text) => (info.textContent = text));
    lobby.start();
  };

  const cancel = () => {
    lobby?.stop();
    lobby = null;
    clearInterval(ticker);
    status.replaceChildren();
  };

  const found = (m: DuelMatch, mode: 'online' | 'local') => {
    clearInterval(ticker);
    lobby = null;
    const opp = m.team === 0 ? m.start.guest : m.start.host;
    const mine = m.team === 0 ? m.start.host : m.start.guest;
    audio.play('ultimateReady');
    vibrate([30, 40, 60]);
    status.replaceChildren(
      h(
        'div',
        { class: 'duel-vs' },
        h('div', { class: 'col duel-side' }, h('b', { class: 'stroke' }, mine.name), h('span', { class: 'dim' }, `${formatNumber(mine.trophies)} troféus`)),
        h('div', { class: 'duel-vs-mark stroke' }, 'VS'),
        h('div', { class: 'col duel-side' }, h('b', { class: 'stroke' }, opp.name), h('span', { class: 'dim' }, `${formatNumber(opp.trophies)} troféus`)),
      ),
    );
    setTimeout(() => {
      app.ui.closeScreen();
      app.startLiveDuel(m, mode);
    }, 1400);
  };

  const squad = h(
    'div',
    { class: 'ev-squad' },
    ...save.squad.map((id) => {
      const pic = h('div', { class: `mini-portrait rar-${getCharacter(id).rarity}` });
      lazyPortrait(app, pic, id);
      return pic;
    }),
  );
  const screen = h(
    'div',
    { class: 'duel-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Duelo ao vivo'),
      h('div', { class: 'grow' }),
      h('div', { class: 'chip' }, icon('bolt'), h('span', { class: 'stroke-sm' }, formatNumber(squadPower(save.squad, save.collection)))),
    ),
    h(
      'div',
      { class: 'duel-body' },
      h(
        'div',
        { class: 'panel duel-rules' },
        h('div', { class: 'duel-big-vs stroke' }, 'VS'),
        h('p', null, 'Os dois na mesma estrada, ao mesmo tempo: cada um ataca o Núcleo do outro e defende o seu. 3 minutos, energia e cartas como na invasão.'),
        h('p', { class: 'dim' }, 'Tudo roda em lockstep: só as jogadas viajam pela rede, e o servidor confere o resultado no fim.'),
        squad,
      ),
      h(
        'div',
        { class: 'col duel-actions' },
        h(
          'button',
          {
            class: 'btn red big',
            disabled: !app.online,
            onClick: () => (app.online ? (cancel(), search('online')) : app.ui.toast('Entre online nas Configurações para duelar com outros jogadores', 'info', 'ranking')),
          },
          icon('swords'),
          'Procurar oponente',
        ),
        h('button', { class: 'btn blue', onClick: () => (cancel(), search('local')) }, icon('versus'), 'Duelo local (2 abas)'),
        h('button', { class: 'btn purple', onClick: () => (cancel(), app.ui.closeScreen(), app.startBotDuel('normal')) }, icon('target'), 'Treino contra bot'),
        app.online ? null : h('p', { class: 'dim duel-note' }, 'Sem servidor online: teste o duelo de verdade entre duas abas deste aparelho.'),
        status,
      ),
    ),
  );
  app.ui.openScreen(screen, () => cancel());
}
