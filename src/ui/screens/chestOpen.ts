import type { App } from '../../app.ts';
import { getCharacter } from '../../content/catalog.ts';
import { CLASS_INFO } from '../../content/classes.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { chestDef, openChest, type ChestOpening, type OpenedCard } from '../../meta/chests.ts';
import { formatNumber } from '../../meta/economy.ts';
import { RARITY_COLORS } from '../../render/colors.ts';
import { ChestStage } from '../../scenes/chest/ChestStage.ts';
import { h, tweenNumber } from '../dom.ts';
import { icon } from '../icons.ts';
import { ELEMENT_NAMES } from '../panels/buildingPanel.ts';
import { RARITY_NAMES, charCard, lazyPortrait } from '../panels/charCard.ts';

const RANK = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 } as const;

let stage: ChestStage | null = null;

/**
 * Abertura de baú: o resultado é decidido ANTES da animação (pelo "servidor":
 * offline é a lógica local; online, a Edge Function). Depois é só show.
 */
export function openChestScreen(app: App, uid: string, onDone?: () => void): void {
  const r = app.store.update('open-chest', (d) => openChest(d, uid, Date.now()));
  if (!r.ok) {
    app.ui.toast(r.reason, 'error');
    return;
  }
  const opening = r.opening;
  const seen = !!app.save.progression.seenChestIntro[opening.type] || app.save.settings.skipChestIntro;
  stage ??= new ChestStage();
  const st = stage;
  let index = -1;
  let busy = false;
  let state: 'intro' | 'reveal' | 'summary' = 'intro';

  const stageEl = h('div', { class: 'co-stage' });
  const hint = h('div', { class: 'co-hint stroke-sm' }, seen ? 'Toque para abrir' : '');
  const counter = h('div', { class: 'co-counter stroke-sm' });
  const cardSlot = h('div', { class: 'co-card-slot' });
  const skipBtn = h('button', { class: 'btn small dark co-skip', onClick: (e) => (e.stopPropagation(), skipAll()) }, 'Pular', icon('play'));
  skipBtn.style.display = seen ? '' : 'none';
  const summary = h('div', { class: 'co-summary hidden' });

  const screen = h(
    'div',
    { class: `chest-open-screen chest-${opening.type}`, style: { '--best': RARITY_COLORS[opening.best].css } },
    stageEl,
    h('div', { class: 'co-top' }, h('div', { class: 'co-title stroke' }, chestDef(opening.type).name), counter, h('div', { class: 'grow' }), skipBtn),
    cardSlot,
    hint,
    summary,
  );

  screen.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    tap();
  });

  const tap = () => {
    if (state === 'intro') {
      if (seen) st.skipToOpen();
      return;
    }
    if (state === 'reveal' && !busy) next();
  };

  const next = () => {
    index++;
    if (index >= opening.cards.length) return showSummary();
    reveal(opening.cards[index]);
  };

  const reveal = (c: OpenedCard) => {
    busy = true;
    const def = getCharacter(c.id);
    const rank = RANK[c.rarity];
    counter.textContent = `${index + 1}/${opening.cards.length}`;
    hint.textContent = '';
    st.showCharacter(def);
    audio.rarityForReveal = rank;
    audio.play('reveal');
    if (rank >= 3) {
      app.ui.flash(RARITY_COLORS[c.rarity].css, 600, 0.85);
      vibrate([30, 40, 30, 40, 120]);
      audio.cheer(1);
    } else if (rank === 2) {
      app.ui.flash(RARITY_COLORS[c.rarity].css, 300, 0.4);
      vibrate(30);
    } else vibrate(12);
    setTimeout(() => audio.voice(c.id, rank >= 3 ? 'victory' : 'deploy'), rank >= 3 ? 700 : 350);
    const card = revealCard(app, c);
    cardSlot.replaceChildren(card);
    const spin = rank >= 3 ? 1500 : 800;
    setTimeout(() => {
      busy = false;
      hint.textContent = index < opening.cards.length - 1 ? 'Toque para a próxima' : 'Toque para ver tudo';
    }, spin);
  };

  const skipAll = () => {
    if (state === 'summary') return;
    st.skipToOpen();
    showSummary();
  };

  const showSummary = () => {
    state = 'summary';
    skipBtn.style.display = 'none';
    hint.textContent = '';
    cardSlot.replaceChildren();
    counter.textContent = '';
    finishSeen();
    summary.replaceChildren(summaryPanel(app, opening, () => close()));
    summary.classList.remove('hidden');
    audio.play('coins');
  };

  const finishSeen = () => {
    if (!app.save.progression.seenChestIntro[opening.type]) app.store.update('chest-seen', (d) => (d.progression.seenChestIntro[opening.type] = true));
  };

  const close = () => {
    app.ui.closeScreen();
  };

  st.frame = () => stageEl.getBoundingClientRect();
  st.setChest(opening.type, opening.best, chestDef(opening.type).shakeSec);
  st.onPhase = (p) => {
    if (p === 'open' && state === 'intro') {
      state = 'reveal';
      setTimeout(() => state === 'reveal' && index < 0 && next(), 250);
    }
    if (p === 'shake') hint.textContent = seen ? 'Toque para abrir' : '';
  };
  app.ui.openScreen(
    screen,
    () => {
      app.popOverlay();
      st.dispose();
      st.onPhase = null;
      audio.setMusic('city');
      onDone?.();
    },
    false,
    true,
  );
  app.pushOverlay(st);
  audio.setMusic('chest');
  setTimeout(() => st.play(), 250);
  app.queueLevelUps(opening.levelsGained);
}

/** Carta que gira e revela o personagem. */
function revealCard(app: App, c: OpenedCard): HTMLElement {
  const def = getCharacter(c.id);
  const pic = h('div', { class: 'rc-portrait' });
  lazyPortrait(app, pic, c.id);
  const front = h(
    'div',
    { class: `rc-face rc-front rar-${c.rarity}` },
    def.rarity === 'extremo' ? h('div', { class: 'cc-prism prismatic' }) : null,
    h('div', { class: `rc-rarity ${c.rarity === 'extremo' ? 'prismatic' : ''}` }, RARITY_NAMES[c.rarity]),
    pic,
    h('div', { class: 'rc-name stroke' }, def.name),
    h('div', { class: 'rc-sub' }, h('span', { class: `el-dot el-bg-${def.element}` }), `${ELEMENT_NAMES[def.element]} • ${CLASS_INFO[def.cls].name}`),
    c.isNew ? h('div', { class: 'rc-new stroke' }, 'NOVO!') : h('div', { class: 'rc-frag stroke-sm' }, `+${c.fragments} fragmentos`),
    c.pity ? h('div', { class: 'rc-pity' }, icon('shield'), 'Garantia!') : null,
  );
  const back = h('div', { class: `rc-face rc-back rar-${c.rarity}` }, h('div', { class: 'rc-back-logo stroke' }, 'K'));
  return h('div', { class: `reveal-card rar-${c.rarity} ${RANK[c.rarity] >= 3 ? 'big' : ''}` }, h('div', { class: 'rc-inner' }, back, front));
}

function summaryPanel(app: App, o: ChestOpening, onClose: () => void): HTMLElement {
  const coins = h('b', null, '0');
  const gems = h('b', null, '0');
  setTimeout(() => {
    tweenNumber(coins, 0, o.coins, 700, formatNumber);
    if (o.diamonds) tweenNumber(gems, 0, o.diamonds, 700, formatNumber);
  }, 150);
  return h(
    'div',
    { class: 'panel co-sum-panel' },
    h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Você ganhou!'), h('div', { class: 'grow' }), h('span', { class: 'chip small' }, icon('coin'), coins), o.diamonds ? h('span', { class: 'chip small' }, icon('gem'), gems) : null),
    h(
      'div',
      { class: 'panel-body col' },
      h('div', { class: 'co-sum-grid' }, ...o.cards.map((c) => charCard(app, getCharacter(c.id), app.save.collection[c.id], { isNew: c.isNew }))),
      h(
        'div',
        { class: 'row co-sum-actions' },
        h('button', { class: 'btn green big', onClick: onClose }, 'Continuar'),
      ),
    ),
  );
}
