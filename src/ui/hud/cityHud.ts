import type { App } from '../../app.ts';
import { albumClaimableCount } from '../../meta/collection.ts';
import { formatNumber, leagueFor, xpToNext } from '../../meta/economy.ts';
import { evolvableCharacters, nextGoal } from '../../meta/goals.ts';
import { h, tweenNumber } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

export type NavTab = 'city' | 'squad' | 'battle' | 'chests' | 'more';

/**
 * HUD principal da cidade. Atualiza sozinho quando o save muda.
 */
export class CityHud {
  readonly el: HTMLElement;
  private coins: HTMLElement;
  private diamonds: HTMLElement;
  private coinChip: HTMLElement;
  private gemChip: HTMLElement;
  private level: HTMLElement;
  private xpBar: HTMLElement;
  private name: HTMLElement;
  private trophies: HTMLElement;
  private league: HTMLElement;
  private goal: HTMLElement;
  private goalText: HTMLElement;
  private goalIcon: HTMLElement;
  private goalBar: HTMLElement;
  private editBtn: HTMLElement;
  private sideButtons: HTMLElement;
  private navButtons = new Map<NavTab, HTMLElement>();
  private chestBadge: HTMLElement;
  private squadBadge: HTMLElement;
  private lastCoins = -1;
  private lastGems = -1;
  private goalId = '';

  constructor(private app: App) {
    this.coins = h('span', { class: 'stroke-sm' }, '0');
    this.diamonds = h('span', { class: 'stroke-sm' }, '0');
    this.coinChip = h('div', { class: 'chip interactive' }, icon('coin'), this.coins);
    this.gemChip = h('div', { class: 'chip interactive' }, icon('gem'), this.diamonds, h('button', { class: 'chip-plus', 'aria-label': 'Loja', onClick: () => app.openShop() }, icon('plus')));
    this.level = h('span', { class: 'lvl-num stroke-sm' }, '1');
    this.xpBar = h('i');
    this.name = h('div', { class: 'p-name stroke-sm' });
    this.trophies = h('span', { class: 'stroke-sm' }, '0');
    this.league = h('span', { class: 'p-league' });
    this.goalText = h('span', { class: 'goal-text stroke-sm' });
    this.goalIcon = h('span', { class: 'goal-icon' });
    this.goalBar = h('i');
    this.goal = h(
      'button',
      { class: 'goal interactive', onClick: () => app.runGoal() },
      this.goalIcon,
      h('div', { class: 'goal-main' }, h('div', { class: 'goal-label' }, 'PRÓXIMO OBJETIVO'), this.goalText, h('div', { class: 'goal-bar' }, this.goalBar)),
      h('span', { class: 'goal-go' }, icon('play')),
    );

    const profile = h(
      'button',
      { class: 'profile interactive', onClick: () => app.openProfile() },
      h('div', { class: 'lvl-hex' }, this.level),
      h('div', { class: 'p-info' }, this.name, h('div', { class: 'p-xp' }, this.xpBar)),
    );
    const trophyChip = h('button', { class: 'chip trophy-chip interactive', onClick: () => app.openRanking() }, icon('trophy'), this.trophies, this.league);

    this.editBtn = this.sideButton('hammer', 'Editar', () => app.toggleEdit());
    this.chestBadge = h('span', { class: 'badge hidden' });
    this.squadBadge = h('span', { class: 'badge hidden' });
    this.sideButtons = h(
      'div',
      { class: 'side-buttons' },
      this.editBtn,
      this.sideButton('build', 'Construir', () => app.openBuildShop()),
      this.sideButton('mission', 'Missões', () => app.openMissions(), 'missions'),
    );

    const nav = h('nav', { class: 'bottom-nav' });
    const tabs: [NavTab, IconName, string][] = [
      ['city', 'city', 'Cidade'],
      ['squad', 'squad', 'Esquadrão'],
      ['battle', 'swords', 'Batalhar'],
      ['chests', 'chest', 'Baús'],
      ['more', 'more', 'Mais'],
    ];
    for (const [id, ic, label] of tabs) {
      const b = h('button', { class: `nav-btn nav-${id}`, onClick: () => app.navigate(id) }, h('span', { class: 'nav-ico' }, icon(ic)), h('span', { class: 'nav-label stroke-sm' }, label));
      if (id === 'chests') b.appendChild(this.chestBadge);
      if (id === 'squad') b.appendChild(this.squadBadge);
      this.navButtons.set(id, b);
      nav.appendChild(b);
    }
    this.setActive('city');

    this.el = h(
      'div',
      { class: 'city-hud' },
      h('div', { class: 'hud-top' }, h('div', { class: 'hud-left' }, profile, trophyChip), this.goal, h('div', { class: 'hud-right' }, this.coinChip, this.gemChip, h('button', { class: 'gear-btn interactive', 'aria-label': 'Configurações', onClick: () => app.openSettings() }, icon('gear')))),
      this.sideButtons,
      nav,
    );
    app.store.on('change', () => this.refresh());
    this.refresh();
  }

  private sideButton(ic: IconName, label: string, fn: () => void, key?: string): HTMLElement {
    const b = h('button', { class: 'side-btn', onClick: fn, 'data-key': key ?? ic }, h('span', { class: 'side-ico' }, icon(ic)), h('span', { class: 'side-label stroke-sm' }, label));
    return b;
  }

  setActive(tab: NavTab): void {
    for (const [id, b] of this.navButtons) b.classList.toggle('active', id === tab);
  }

  setEditMode(on: boolean): void {
    this.el.classList.toggle('editing', on);
    this.editBtn.classList.toggle('active', on);
  }

  /** Marca um botão lateral com alerta (ex.: missão pronta para resgatar). */
  setAlert(key: string, on: boolean): void {
    const b = this.sideButtons.querySelector(`[data-key="${key}"]`);
    if (!b) return;
    let dot = b.querySelector('.dot-alert');
    if (on && !dot) b.appendChild(h('span', { class: 'dot-alert' }));
    else if (!on && dot) dot.remove();
  }

  refresh(): void {
    const s = this.app.store.data;
    const c = s.currencies;
    if (c.coins !== this.lastCoins) {
      if (this.lastCoins >= 0) {
        tweenNumber(this.coins, this.lastCoins, c.coins, 500, formatNumber);
        this.coinChip.classList.remove('bump');
        void this.coinChip.offsetWidth;
        this.coinChip.classList.add('bump');
      } else this.coins.textContent = formatNumber(c.coins);
      this.lastCoins = c.coins;
    }
    if (c.diamonds !== this.lastGems) {
      if (this.lastGems >= 0) {
        tweenNumber(this.diamonds, this.lastGems, c.diamonds, 500, formatNumber);
        this.gemChip.classList.remove('bump');
        void this.gemChip.offsetWidth;
        this.gemChip.classList.add('bump');
      } else this.diamonds.textContent = formatNumber(c.diamonds);
      this.lastGems = c.diamonds;
    }
    const p = s.profile;
    this.level.textContent = String(p.accountLevel);
    this.xpBar.style.width = `${Math.min(100, (p.accountXp / xpToNext(p.accountLevel)) * 100)}%`;
    this.name.textContent = p.name;
    this.trophies.textContent = formatNumber(p.trophies);
    this.league.textContent = leagueFor(p.trophies).name;
    const n = s.chests.inventory.length;
    this.chestBadge.textContent = String(n);
    this.chestBadge.classList.toggle('hidden', n === 0);
    const sq = evolvableCharacters(s).length + albumClaimableCount(s);
    this.squadBadge.textContent = String(sq);
    this.squadBadge.classList.toggle('hidden', sq === 0);
    this.refreshGoal();
  }

  refreshGoal(): void {
    const g = nextGoal(this.app.store.data, Date.now());
    this.goalText.textContent = g.text;
    this.goalIcon.replaceChildren(icon(g.icon));
    if (g.progress) {
      this.goalBar.parentElement!.classList.remove('hidden');
      this.goalBar.style.width = `${Math.min(100, (g.progress[0] / Math.max(1, g.progress[1])) * 100)}%`;
    } else this.goalBar.parentElement!.classList.add('hidden');
    if (g.id !== this.goalId) {
      this.goalId = g.id;
      this.goal.classList.remove('goal-new');
      void this.goal.offsetWidth;
      this.goal.classList.add('goal-new');
    }
  }
}
