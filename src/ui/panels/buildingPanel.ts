import type { App } from '../../app.ts';
import { BUILDINGS, levelStats, levelCap } from '../../meta/buildings.ts';
import { generatorAmount, repairCost, speedUpCostFor, upgradeBlockReason } from '../../meta/city.ts';
import { formatDuration, formatNumber } from '../../meta/economy.ts';
import type { Element, PlacedBuilding } from '../../meta/types.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

export const ELEMENT_NAMES: Record<Element, string> = {
  solar: 'Solar',
  raiz: 'Raiz',
  mare: 'Maré',
  volt: 'Volt',
  cristal: 'Cristal',
  sombra: 'Sombra',
};

function stat(ic: IconName, label: string, value: string, next?: string): HTMLElement {
  return h('div', { class: 'stat' }, icon(ic), h('span', null, label), h('b', null, value), next ? h('span', { class: 'next' }, next) : null);
}

/** Lista de atributos de uma construção (com o ganho do próximo nível). */
export function buildingStats(b: Pick<PlacedBuilding, 'type' | 'level'>, showNext: boolean): HTMLElement[] {
  const def = BUILDINGS[b.type];
  const cur = levelStats(b.type, b.level);
  const nxt = showNext && b.level < def.levels.length ? levelStats(b.type, b.level + 1) : null;
  const diff = (a?: number, c?: number, fmt = (n: number) => formatNumber(n)) => (nxt && a !== undefined && c !== undefined && c !== a ? `+${fmt(c - a)}` : undefined);
  const out: HTMLElement[] = [];
  if (def.category === 'decor') return [h('p', { class: 'dim decor-note' }, 'Decoração: deixa a cidade mais bonita. Não entra na batalha.')];
  out.push(stat('heart', 'Vida', formatNumber(cur.hp), diff(cur.hp, nxt?.hp)));
  if (cur.dmg !== undefined && cur.interval) {
    const dps = (d: number) => Math.round(d / (cur.interval ?? 1));
    out.push(stat('sword', 'Dano/s', formatNumber(dps(cur.dmg)), nxt?.dmg !== undefined ? diff(dps(cur.dmg), dps(nxt.dmg)) : undefined));
  } else if (cur.dmg !== undefined) {
    out.push(stat('sword', 'Dano', formatNumber(cur.dmg), diff(cur.dmg, nxt?.dmg)));
  }
  if (cur.range) out.push(stat('range', 'Alcance', `${cur.range} casas`));
  if (cur.slow) out.push(stat('speed', 'Lentidão', `${cur.slow}%`, diff(cur.slow, nxt?.slow, (n) => `${n}%`)));
  if (cur.chain) out.push(stat('bolt', 'Ricochete', `${cur.chain} alvos`, diff(cur.chain, nxt?.chain)));
  if (cur.rate) out.push(stat('coin', 'Produção', `${formatNumber(cur.rate)}/h`, diff(cur.rate, nxt?.rate)));
  if (cur.capacity) out.push(stat('chest', 'Capacidade', formatNumber(cur.capacity), diff(cur.capacity, nxt?.capacity)));
  if (cur.protect) out.push(stat('shield', 'Protege', `${cur.protect}% (até ${formatNumber(cur.protectCap ?? 0)})`));
  if (cur.maxCharLevel) out.push(stat('squad', 'Nível máx. do esquadrão', String(cur.maxCharLevel), diff(cur.maxCharLevel, nxt?.maxCharLevel)));
  if (cur.maxResearch) out.push(stat('book', 'Pesquisas até nível', String(cur.maxResearch), diff(cur.maxResearch, nxt?.maxResearch)));
  if (def.battle.splash) out.push(stat('target', 'Área', `${def.battle.splash} casas`));
  if (def.battle.minRange) out.push(stat('range', 'Ponto cego', `${def.battle.minRange} casas`));
  return out;
}

/**
 * Painel flutuante da construção selecionada (modo normal).
 */
export class BuildingPanel {
  readonly el: HTMLElement;
  private id: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private app: App) {
    this.el = h('div', { class: 'building-panel panel hidden' });
    app.store.on('change', () => this.id && this.render());
  }

  show(id: string | null): void {
    this.id = id;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!id) {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    this.render();
    this.timer = setInterval(() => this.renderLive(), 500);
  }

  private building(): PlacedBuilding | undefined {
    return this.app.store.data.city.buildings.find((b) => b.id === this.id);
  }

  private renderLive(): void {
    const b = this.building();
    if (!b) return this.show(null);
    const t = this.el.querySelector('.live-time');
    if (t && b.upgradeEndsAt) t.textContent = formatDuration((b.upgradeEndsAt - Date.now()) / 1000);
    const g = this.el.querySelector('.live-collect');
    if (g) g.textContent = `+${formatNumber(generatorAmount(b, Date.now()))}`;
    const sp = this.el.querySelector('.live-speed');
    if (sp) sp.textContent = String(speedUpCostFor(b, Date.now()));
  }

  private render(): void {
    const b = this.building();
    if (!b) return this.show(null);
    const save = this.app.store.data;
    const def = BUILDINGS[b.type];
    const now = Date.now();
    const thumb = h('div', { class: 'bp-thumb' });
    void this.app.buildingThumb(b.type, b.level).then((url) => {
      thumb.style.backgroundImage = `url(${url})`;
    });
    const isDecor = def.category === 'decor';
    const title = h(
      'div',
      { class: 'bp-title' },
      h('div', { class: 'panel-title' }, def.name),
      isDecor ? null : h('div', { class: 'bp-level' }, `Nível ${b.level}`, h('span', { class: 'faint' }, ` / ${levelCap(save.city, b.type)}`)),
      b.type === 'core' ? h('div', { class: `bp-element el-${save.city.element}` }, `Elemento: ${ELEMENT_NAMES[save.city.element]}`) : null,
    );
    const actions = h('div', { class: 'bp-actions' });

    if (b.ruined) {
      const cost = repairCost(b);
      actions.append(
        h('div', { class: 'bp-note red-note' }, icon('wrench'), 'Destruída no saque. Desativada até o reparo.'),
        h('button', { class: 'btn green', disabled: save.currencies.coins < cost, onClick: () => this.app.repair(b.id) }, icon('wrench'), 'Reparar', h('span', { class: 'cost' }, icon('coin'), formatNumber(cost))),
      );
    } else if (b.upgradeEndsAt) {
      const cost = speedUpCostFor(b, now);
      actions.append(
        h('div', { class: 'bp-note' }, icon('clock'), 'Melhorando… ', h('b', { class: 'live-time' }, formatDuration((b.upgradeEndsAt - now) / 1000))),
        h('button', { class: 'btn blue', onClick: () => this.app.speedUp(b.id) }, 'Acelerar', h('span', { class: 'cost' }, icon('gem'), h('span', { class: 'live-speed' }, String(cost)))),
      );
    } else if (!isDecor) {
      const block = upgradeBlockReason(save, b);
      const maxed = b.level >= def.levels.length;
      if (!maxed) {
        const next = levelStats(b.type, b.level + 1);
        const affordable = save.currencies.coins >= next.cost;
        const hardBlock = block && block !== 'Moedas insuficientes';
        actions.append(
          h(
            'button',
            { class: `btn ${hardBlock ? 'dark' : 'green'}`, disabled: !!hardBlock, onClick: () => this.app.upgrade(b.id) },
            icon('up'),
            'Melhorar',
            h('span', { class: `cost ${affordable ? '' : 'cant'}` }, icon('coin'), formatNumber(next.cost)),
            next.time > 0 ? h('span', { class: 'cost time' }, icon('clock'), formatDuration(next.time)) : null,
          ),
        );
        if (hardBlock) actions.append(h('div', { class: 'bp-note' }, icon('lock'), block!));
      } else actions.append(h('div', { class: 'bp-note gold-note' }, icon('star'), 'Nível máximo!'));
    }
    if (b.type === 'generator' && !b.ruined) {
      const amount = generatorAmount(b, now);
      actions.prepend(h('button', { class: 'btn', disabled: amount <= 0, onClick: () => this.app.collect(b.id) }, icon('coin'), 'Coletar', h('span', { class: 'live-collect' }, `+${formatNumber(amount)}`)));
    }
    if (b.type === 'core') actions.append(h('button', { class: 'btn purple small', onClick: () => this.app.openElementPicker() }, 'Trocar elemento'));
    if (b.type === 'barracks') actions.append(h('button', { class: 'btn blue small', onClick: () => this.app.navigate('squad') }, icon('squad'), 'Esquadrão'));

    this.el.replaceChildren(
      h('button', { class: 'close-btn', 'aria-label': 'Fechar', onClick: () => this.app.city.select(null) }, icon('close')),
      h('div', { class: 'bp-head' }, thumb, title),
      h('div', { class: 'bp-desc dim' }, def.description),
      h('div', { class: 'bp-stats' }, ...buildingStats(b, !b.upgradeEndsAt && !b.ruined)),
      actions,
    );
  }
}
