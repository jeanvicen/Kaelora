import type { App } from '../../app.ts';
import { CLASS_INFO } from '../../content/classes.ts';
import type { CharacterDef } from '../../content/types.ts';
import { MAX_STARS, starUpCost } from '../../meta/collection.ts';
import type { OwnedCharacter, Rarity } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export const RARITY_NAMES: Record<Rarity, string> = {
  comum: 'Comum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
  extremo: 'Extremo',
};

export const RARITY_ORDER: Rarity[] = ['comum', 'raro', 'epico', 'lendario', 'extremo'];

/** Fila de retratos: só renderiza o que aparece na tela. */
let observer: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();

export function lazyPortrait(app: App, el: HTMLElement, id: number): void {
  const load = () => void app.characterPortrait(id).then((u) => (el.style.backgroundImage = `url(${u})`));
  if (typeof IntersectionObserver === 'undefined') return load();
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        pending.get(e.target)?.();
        pending.delete(e.target);
        observer!.unobserve(e.target);
      }
    },
    { rootMargin: '120px' },
  );
  pending.set(el, load);
  observer.observe(el);
}

export function starsRow(stars: number, max = MAX_STARS): HTMLElement {
  const row = h('div', { class: 'stars-row' });
  for (let i = 0; i < max; i++) row.appendChild(icon(i < stars ? 'star' : 'starEmpty'));
  return row;
}

/** Carta de personagem (coleção, seletor, baús). */
export function charCard(
  app: App,
  def: CharacterDef,
  owned: OwnedCharacter | undefined,
  opts: { onClick?: () => void; inSquad?: boolean; canUp?: boolean; isNew?: boolean } = {},
): HTMLElement {
  const pic = h('div', { class: 'cc-portrait' });
  lazyPortrait(app, pic, def.id);
  const cost = owned ? starUpCost(owned) : null;
  const frag = owned && cost ? Math.min(1, owned.fragments / cost.fragments) : 1;
  const card = h(
    'button',
    {
      class: `ccard rar-${def.rarity} ${owned ? 'owned' : 'locked'} ${opts.inSquad ? 'in-squad' : ''} ${opts.canUp ? 'can-up' : ''}`,
      onClick: opts.onClick,
    },
    def.rarity === 'extremo' ? h('div', { class: 'cc-prism prismatic' }) : null,
    pic,
    owned ? null : h('div', { class: 'cc-q stroke' }, '?'),
    h('div', { class: `cc-el el-dot el-bg-${def.element}` }),
    h('div', { class: 'cc-cost stroke-sm' }, String(def.cost)),
    owned ? h('div', { class: 'cc-lvl stroke-sm' }, `Nv ${owned.level}`) : h('div', { class: 'cc-lock' }, icon('lock')),
    h(
      'div',
      { class: 'cc-info' },
      h('div', { class: 'cc-name stroke-sm' }, def.name),
      h('div', { class: 'cc-cls' }, CLASS_INFO[def.cls].name),
      owned ? starsRow(owned.stars) : null,
      owned
        ? h(
            'div',
            { class: `bar cc-frag ${cost && owned.fragments >= cost.fragments ? '' : 'pink'}` },
            h('i', { style: { width: `${frag * 100}%` } }),
            h('span', null, cost ? `${owned.fragments}/${cost.fragments}` : 'MÁX'),
          )
        : null,
    ),
    opts.inSquad ? h('div', { class: 'cc-ribbon stroke-sm' }, 'Esquadrão') : null,
    opts.canUp ? h('div', { class: 'cc-up' }, icon('up')) : null,
    opts.isNew ? h('div', { class: 'cc-new stroke-sm' }, 'NOVO!') : null,
  );
  return card;
}
