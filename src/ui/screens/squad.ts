import type { App } from '../../app.ts';
import { allCharacters, getCharacter } from '../../content/catalog.ts';
import { CLASSES, CLASS_INFO, ELEMENTS } from '../../content/classes.ts';
import { ELEMENT_SYNERGY_HP, activeSynergies, characterPower, squadPower } from '../../content/squad.ts';
import type { CharacterDef } from '../../content/types.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { albumClaimableCount, albumProgress, canStarUp } from '../../meta/collection.ts';
import { formatNumber } from '../../meta/economy.ts';
import type { ClassId, Element, Rarity } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { RARITY_ORDER, charCard, starsRow } from '../panels/charCard.ts';
import { renderAlbum } from './album.ts';
import { openCharacter } from './character.ts';

type Tab = 'squad' | 'collection' | 'album';
type SortKey = 'power' | 'rarity' | 'level' | 'cost';

interface Filters {
  element: Element | null;
  rarity: Rarity | null;
  cls: ClassId | null;
  ownedOnly: boolean;
  sort: SortKey;
}

const RANK: Record<Rarity, number> = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 };
// Filtros lembrados entre aberturas da tela (na mesma sessão).
const filters: Filters = { element: null, rarity: null, cls: null, ownedOnly: false, sort: 'power' };

/** Esquadrão (vitrine 3D), Coleção (1008 cartas) e Álbum, em abas. */
export function openSquad(app: App, initial: Tab = 'squad'): void {
  let tab: Tab = initial;
  let selected = -1;
  /** Vaga do esquadrão esperando um substituto (modo seletor). */
  let pickSlot = -1;
  let raf = 0;
  const canvas = app.game.renderer.canvas;

  // ---------------------------------------------------------- cabeçalho
  const tabBtns = {
    squad: h('button', { class: 'tab', onClick: () => setTab('squad') }, 'Esquadrão'),
    collection: h('button', { class: 'tab', onClick: () => setTab('collection') }, 'Coleção', h('span', { class: 'tab-count' })),
    album: h('button', { class: 'tab', onClick: () => setTab('album') }, 'Álbum', h('span', { class: 'badge tab-badge' })),
  };
  const powerChip = h('div', { class: 'chip' }, icon('bolt'), h('span', { class: 'stroke-sm' }));
  const coinChip = h('div', { class: 'chip' }, icon('coin'), h('span', { class: 'stroke-sm' }));
  const head = h(
    'div',
    { class: 'scr-head' },
    h('button', { class: 'back-btn', 'aria-label': 'Voltar', onClick: () => back() }, icon('back')),
    h('div', { class: 'tabs sq-tabs' }, tabBtns.squad, tabBtns.collection, tabBtns.album),
    h('div', { class: 'grow' }),
    powerChip,
    coinChip,
  );

  // ---------------------------------------------------------- aba esquadrão (vitrine)
  const stage = h('div', { class: 'sq-stage' });
  const labels = h('div', { class: 'sq-labels' });
  const synRow = h('div', { class: 'sq-syn' });
  const squadPane = h(
    'div',
    { class: 'sq-pane sq-squad' },
    stage,
    labels,
    h('div', { class: 'sq-foot' }, synRow, h('div', { class: 'sq-hint dim' }, 'Toque num personagem para ver ou trocar')),
  );
  let down: { x: number; y: number; id: number } | null = null;
  stage.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
  stage.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 10) return;
    const i = app.showroom.pick(e.clientX, e.clientY, canvas);
    select(i === selected ? -1 : i);
  });

  const labelEls: HTMLElement[] = [];
  const renderLabels = () => {
    const save = app.save;
    labelEls.length = 0;
    labels.replaceChildren(
      ...save.squad.map((id, i) => {
        const def = getCharacter(id);
        const owned = save.collection[id];
        const el = h(
          'div',
          { class: `sq-label rar-${def.rarity} ${i === selected ? 'sel' : ''}`, onClick: () => select(i === selected ? -1 : i) },
          h('div', { class: 'sql-top' }, h('span', { class: `el-dot el-bg-${def.element}` }), h('span', { class: 'sql-name stroke-sm' }, def.name)),
          h('div', { class: 'sql-row' }, h('span', { class: 'sql-lvl' }, `Nv ${owned?.level ?? 1}`), starsRow(owned?.stars ?? 1), h('span', { class: 'sql-cost' }, icon('energy'), String(def.cost))),
          i === selected
            ? h(
                'div',
                { class: 'sql-actions' },
                h('button', { class: 'btn small blue', onClick: (e) => (e.stopPropagation(), openDetail(id)) }, icon('info'), 'Ver'),
                h('button', { class: 'btn small green', onClick: (e) => (e.stopPropagation(), startPick(i)) }, icon('replay'), 'Trocar'),
              )
            : null,
        );
        labelEls.push(el);
        return el;
      }),
    );
    const defs = save.squad.map((id) => getCharacter(id));
    const syn = activeSynergies(defs);
    const hints: HTMLElement[] = [];
    if (!syn.some((s) => s.kind === 'element')) hints.push(h('div', { class: 'syn-chip off' }, `3 do mesmo elemento: +${ELEMENT_SYNERGY_HP}% de vida`));
    if (!syn.some((s) => s.kind === 'class')) hints.push(h('div', { class: 'syn-chip off' }, '2 da mesma classe: bônus da classe'));
    synRow.replaceChildren(h('span', { class: 'sq-syn-title stroke-sm' }, 'Sinergias'), ...syn.map((s) => h('div', { class: 'syn-chip' }, s.text)), ...hints);
  };

  const placeLabels = () => {
    raf = requestAnimationFrame(placeLabels);
    if (tab !== 'squad') return;
    const base = labels.getBoundingClientRect();
    for (let i = 0; i < labelEls.length; i++) {
      const p = app.showroom.slotScreen(i, canvas, 0);
      labelEls[i].style.transform = `translate(${p.x - base.left}px, ${p.y - base.top + 4}px) translateX(-50%)`;
    }
  };

  const select = (i: number) => {
    selected = i;
    if (i >= 0) {
      app.showroom.cheer(i);
      audio.voice(app.save.squad[i], 'deploy', 0.8);
    }
    renderLabels();
  };

  // ---------------------------------------------------------- aba coleção
  const grid = h('div', { class: 'cgrid scroll-y' });
  const pickBanner = h('div', { class: 'pick-banner' });
  const filterBar = h('div', { class: 'cfilters scroll-x' });
  const collectionPane = h('div', { class: 'sq-pane sq-collection' }, pickBanner, filterBar, grid);

  const chipBtn = (label: string | HTMLElement, active: boolean, onClick: () => void, cls = '') => h('button', { class: `fchip ${active ? 'on' : ''} ${cls}`, onClick }, label);

  const renderFilters = () => {
    filterBar.replaceChildren(
      h(
        'div',
        { class: 'frow' },
        chipBtn('Todos', !filters.element, () => ((filters.element = null), renderCollection())),
        ...ELEMENTS.map((el) => chipBtn(h('span', { class: `el-dot el-bg-${el}` }), filters.element === el, () => ((filters.element = filters.element === el ? null : el), renderCollection()), `fel el-${el}`)),
        h('span', { class: 'fsep' }),
        ...RARITY_ORDER.map((r) => chipBtn(h('span', { class: `fr-dot rar-${r}` }), filters.rarity === r, () => ((filters.rarity = filters.rarity === r ? null : r), renderCollection()), `frar rar-${r}`)),
        h('span', { class: 'fsep' }),
        clsSelect(),
        h('span', { class: 'grow' }),
        chipBtn('Só os meus', filters.ownedOnly, () => ((filters.ownedOnly = !filters.ownedOnly), renderCollection())),
        sortSelect(),
      ),
    );
  };

  const clsSelect = () => {
    const sel = h('select', { class: 'fselect', 'aria-label': 'Classe' }, h('option', { value: '' }, 'Classe'), ...CLASSES.map((c) => h('option', { value: c }, CLASS_INFO[c].name)));
    sel.value = filters.cls ?? '';
    sel.addEventListener('change', () => {
      filters.cls = (sel.value || null) as ClassId | null;
      renderCollection();
    });
    return sel;
  };
  const sortSelect = () => {
    const sel = h(
      'select',
      { class: 'fselect', 'aria-label': 'Ordenar' },
      h('option', { value: 'power' }, 'Poder'),
      h('option', { value: 'rarity' }, 'Raridade'),
      h('option', { value: 'level' }, 'Nível'),
      h('option', { value: 'cost' }, 'Custo'),
    );
    sel.value = filters.sort;
    sel.addEventListener('change', () => {
      filters.sort = sel.value as SortKey;
      renderCollection();
    });
    return sel;
  };

  const filtered = (): CharacterDef[] => {
    const save = app.save;
    const own = (d: CharacterDef) => !!save.collection[d.id];
    const list = allCharacters().filter(
      (d) =>
        (!filters.element || d.element === filters.element) &&
        (!filters.rarity || d.rarity === filters.rarity) &&
        (!filters.cls || d.cls === filters.cls) &&
        (!(filters.ownedOnly || pickSlot >= 0) || own(d)),
    );
    const power = new Map<number, number>();
    const pw = (d: CharacterDef) => {
      let p = power.get(d.id);
      if (p === undefined) power.set(d.id, (p = characterPower(d, save.collection[d.id])));
      return p;
    };
    const key: Record<SortKey, (a: CharacterDef, b: CharacterDef) => number> = {
      power: (a, b) => pw(b) - pw(a),
      rarity: (a, b) => RANK[b.rarity] - RANK[a.rarity] || pw(b) - pw(a),
      level: (a, b) => (save.collection[b.id]?.level ?? 0) - (save.collection[a.id]?.level ?? 0) || pw(b) - pw(a),
      cost: (a, b) => a.cost - b.cost || pw(b) - pw(a),
    };
    return list.sort((a, b) => Number(own(b)) - Number(own(a)) || key[filters.sort](a, b) || a.id - b.id);
  };

  const renderCollection = () => {
    renderFilters();
    const save = app.save;
    const list = filtered();
    const inSquad = new Set(save.squad);
    if (pickSlot >= 0) {
      const out = getCharacter(save.squad[pickSlot]);
      pickBanner.replaceChildren(
        h('span', { class: 'stroke-sm' }, 'Quem entra no lugar de ', h('b', { class: `rar-${out.rarity} rar-text` }, out.name), '?'),
        h('button', { class: 'btn small dark', onClick: () => cancelPick() }, icon('close'), 'Cancelar'),
      );
      pickBanner.style.display = '';
    } else pickBanner.style.display = 'none';
    grid.replaceChildren(
      ...list.map((d) =>
        charCard(app, d, save.collection[d.id], {
          inSquad: inSquad.has(d.id),
          canUp: canStarUp(save, d.id).ok,
          onClick: () => (pickSlot >= 0 ? pickInto(d.id) : openDetail(d.id, list.map((x) => x.id))),
        }),
      ),
    );
    if (!list.length) grid.appendChild(h('div', { class: 'cempty dim' }, 'Nenhum personagem com esses filtros.'));
    grid.scrollTop = 0;
  };

  const startPick = (slot: number) => {
    pickSlot = slot;
    selected = -1;
    setTab('collection');
  };
  const cancelPick = () => {
    pickSlot = -1;
    setTab('squad');
  };
  const pickInto = (id: number) => {
    const slot = pickSlot;
    const r = app.act('squadSlot', { slot, id });
    if (!r.ok) return app.ui.toast(r.reason, 'error');
    pickSlot = -1;
    audio.play('deploy');
    vibrate(15);
    setTab('squad');
    app.showroom.showLineup(app.save.squad.map((x) => getCharacter(x)));
    const at = app.save.squad.indexOf(id);
    app.showroom.cheer(at);
    audio.voice(id, 'deploy');
  };

  // ---------------------------------------------------------- aba álbum
  const albumPane = h('div', { class: 'sq-pane sq-album scroll-y' });

  // ---------------------------------------------------------- geral
  const refreshHead = () => {
    const save = app.save;
    (powerChip.lastChild as HTMLElement).textContent = formatNumber(squadPower(save.squad, save.collection));
    (coinChip.lastChild as HTMLElement).textContent = formatNumber(save.currencies.coins);
    const prog = albumProgress(save).total;
    tabBtns.collection.querySelector('.tab-count')!.textContent = ` ${prog.owned}/${prog.count}`;
    const claim = albumClaimableCount(save);
    const badge = tabBtns.album.querySelector('.tab-badge') as HTMLElement;
    badge.textContent = String(claim);
    badge.style.display = claim ? '' : 'none';
  };

  const setTab = (t: Tab) => {
    tab = t;
    for (const k of Object.keys(tabBtns) as Tab[]) tabBtns[k].classList.toggle('active', k === t);
    squadPane.style.display = t === 'squad' ? '' : 'none';
    collectionPane.style.display = t === 'collection' ? '' : 'none';
    albumPane.style.display = t === 'album' ? '' : 'none';
    screen.classList.toggle('solid', t !== 'squad');
    app.ui.setScreenOpaque(screen, t !== 'squad');
    if (t === 'squad') renderLabels();
    if (t === 'collection') renderCollection();
    if (t === 'album') renderAlbum(app, albumPane, refreshHead);
    refreshHead();
  };

  const back = () => {
    if (pickSlot >= 0) return cancelPick();
    app.ui.closeScreen();
  };

  const openDetail = (id: number, list?: number[]) => {
    openCharacter(app, id, {
      list,
      onChange: () => {
        refreshHead();
        if (tab === 'collection') renderCollection();
        // a vitrine é restaurada pela pilha quando o detalhe fecha
        if (tab === 'squad') renderLabels();
      },
    });
  };

  const screen = h('div', { class: 'squad-screen' }, head, squadPane, collectionPane, albumPane);
  app.ui.openScreen(
    screen,
    () => {
      cancelAnimationFrame(raf);
      app.popShowroom();
    },
    initial !== 'squad',
    true,
  );
  app.pushShowroom(
    () => {
      const r = stage.getBoundingClientRect();
      return new DOMRect(r.left, r.top, r.width, Math.max(1, r.height - 46));
    },
    (sr) => sr.showLineup(app.save.squad.map((x) => getCharacter(x))),
  );
  setTab(initial);
  placeLabels();
}
