import type { App } from '../../app.ts';
import type { OnlineTarget } from '../../net/cloud.ts';
import { getCharacter } from '../../content/catalog.ts';
import { ELEMENT_INFO } from '../../content/classes.ts';
import { activeSynergies, squadPower } from '../../content/squad.ts';
import { buildRaidSetup } from '../../content/battleSetup.ts';
import { estimateDifficulty } from '../../content/difficulty.ts';
import { buildSquad } from '../../content/squad.ts';
import { formatNumber, leagueFor } from '../../meta/economy.ts';
import { refreshCost } from '../../meta/raids.ts';
import { ELEMENT_COLORS } from '../../render/colors.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';


/** Mapa de Invasão: escolha um rival e ataque. */
export function openInvasionMap(app: App): void {
  const list = h('div', { class: 'targets' });
  const costLabel = h('span', { class: 'cost' }, icon('coin'), h('span'));
  const refreshCostLabel = () => ((costLabel.lastChild as HTMLElement).textContent = String(refreshCost(app.store.data)));
  const squadRow = h('div', { class: 'inv-squad' });
  const render = async (force = false) => {
    let targets: OnlineTarget[];
    list.classList.add('loading');
    try {
      targets = await app.invasionTargets(force);
    } catch (e) {
      app.ui.toast(e instanceof Error ? e.message : 'Sem conexão', 'error');
      list.classList.remove('loading');
      return;
    }
    list.classList.remove('loading');
    const save = app.store.data;
    const myPower = squadPower(save.squad, save.collection);
    const squadEls = save.squad.map((id) => getCharacter(id).element);
    list.replaceChildren(...targets.map((t) => targetCard(app, t, squadEls)));
    refreshCostLabel();
    squadRow.replaceChildren(
      h('div', { class: 'inv-squad-title stroke-sm' }, 'Seu esquadrão', h('span', { class: 'inv-power' }, icon('bolt'), formatNumber(myPower))),
      h(
        'div',
        { class: 'inv-squad-list' },
        ...save.squad.map((id) => {
          const c = getCharacter(id);
          const pic = h('div', { class: `mini-portrait rar-${c.rarity}` });
          void app.characterPortrait(id).then((u) => (pic.style.backgroundImage = `url(${u})`));
          return pic;
        }),
      ),
      ...activeSynergies(save.squad.map((id) => getCharacter(id))).map((s) => h('div', { class: 'syn-chip' }, s.text)),
      h('button', { class: 'btn blue small', onClick: () => app.navigate('squad') }, icon('squad'), 'Trocar'),
    );
  };
  const screen = h(
    'div',
    { class: 'invasion-screen' },
    h(
      'div',
      { class: 'scr-head' },
      h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => app.ui.closeScreen() }, icon('back')),
      h('div', { class: 'scr-title stroke' }, 'Mapa de Invasão'),
      h('div', { class: 'grow' }),
      h('div', { class: 'chip' }, icon('trophy'), h('span', { class: 'stroke-sm' }, `${app.store.data.profile.trophies} • ${leagueFor(app.store.data.profile.trophies).name}`)),
      h('button', { class: 'btn purple small', onClick: () => app.openTraining() }, icon('target'), 'Treino'),
      h(
        'button',
        {
          class: 'btn dark small',
          onClick: () => {
            const cost = refreshCost(app.store.data);
            if (app.store.data.currencies.coins < cost) return app.ui.toast('Moedas insuficientes', 'error');
            void render(true);
          },
        },
        icon('replay'),
        'Procurar',
        costLabel,
      ),
    ),
    list,
    squadRow,
  );
  refreshCostLabel();
  void render();
  app.ui.openScreen(screen);
}

function targetCard(app: App, target: OnlineTarget, squadEls: string[]): HTMLElement {
  const t = target.city;
  const save = app.store.data;
  const squad = buildSquad(save.squad, save.collection, save.city.research).specs;
  const key = `${t.seed}|${t.coreLevel}|${save.squad.map((id) => `${id}:${save.collection[id]?.level}:${save.collection[id]?.stars}`).join(',')}`;
  const diff = estimateDifficulty(key, (seed) =>
    buildRaidSetup({
      seed,
      attacker: { name: 'sim', element: save.city.element, squad, research: save.city.research },
      defender: { name: t.ownerName, city: { buildings: t.buildings, element: t.element }, research: t.research },
    }),
  );
  const adv = squadEls.filter((e) => ELEMENT_INFO[e as keyof typeof ELEMENT_INFO].beats === t.element).length;
  const weak = squadEls.filter((e) => ELEMENT_INFO[t.element].beats === e).length;
  const el = ELEMENT_COLORS[t.element];
  return h(
    'div',
    { class: `target-card diff-${diff.cls}`, style: { '--elc': el.css } },
    h('div', { class: 'tc-island' }, h('div', { class: 'tc-core' }), h('div', { class: 'tc-lvl stroke-sm' }, `Núcleo ${t.coreLevel}`)),
    h('div', { class: 'tc-owner stroke-sm' }, t.ownerName, target.isPlayer ? h('span', { class: 'tc-real' }, 'JOGADOR') : null),
    h('div', { class: 'tc-city dim' }, t.name),
    h(
      'div',
      { class: 'tc-stats' },
      h('span', { class: 'chip small' }, icon('trophy'), formatNumber(t.trophies)),
      h('span', { class: `chip small el-${t.element}` }, h('span', { class: `el-dot el-bg-${t.element}` }), ELEMENT_NAMES[t.element]),
    ),
    h('div', { class: 'tc-loot' }, icon('coin'), h('b', null, formatNumber(t.loot)), h('span', { class: 'dim' }, ' para saquear')),
    adv ? h('div', { class: 'tc-adv good' }, `${adv} com vantagem (+30%)`) : weak ? h('div', { class: 'tc-adv bad' }, `${weak} em desvantagem`) : h('div', { class: 'tc-adv' }, 'Sem vantagem de elemento'),
    h('div', { class: `tc-diff ${diff.cls}` }, diff.label),
    h('button', { class: 'btn red', onClick: () => void app.startRaid(t, 'raid', { targetKey: target.key }) }, icon('swords'), 'Atacar!'),
  );
}
