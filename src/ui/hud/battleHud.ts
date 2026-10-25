import { getCharacter } from '../../content/catalog.ts';
import { ELEMENT_INFO } from '../../content/classes.ts';
import type { BattleSim } from '../../sim/battle.ts';
import { ENERGY_UNIT } from '../../sim/battle.ts';
import type { Team } from '../../sim/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface BattleHudHandlers {
  deploy(slot: number): void;
  ability(slot: number): void;
  ultimate(): void;
  pause(): void;
  portrait(charId: number): Promise<string>;
}

interface CardEl {
  root: HTMLButtonElement;
  cost: HTMLElement;
  ring: HTMLElement;
  hp: HTMLElement;
  cd: HTMLElement;
  state: string;
}

/**
 * HUD da batalha: tempo, estrelas, energia, cartas, Ultimate e avisos.
 * Tudo em HTML sobre o canvas, atualizado a cada quadro de forma barata.
 */
export class BattleHud {
  readonly el: HTMLElement;
  private timer: HTMLElement;
  private timerBox: HTMLElement;
  private destr: HTMLElement;
  private stars: HTMLElement[] = [];
  private energyFill: HTMLElement;
  private energyNum: HTMLElement;
  private energySegs: HTMLElement[] = [];
  private cards: CardEl[] = [];
  private ult: HTMLButtonElement;
  private ultFill: HTMLElement;
  private banner: HTMLElement;
  private combo: HTMLElement;
  private hint: HTMLElement;
  private comboTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEnergy = -1;
  private lastUltReady = false;
  readonly cardRow: HTMLElement;
  interactive = true;

  constructor(
    h0: BattleHudHandlers,
    sim: BattleSim,
    private team: Team,
    title: { name: string; sub: string; element: string },
  ) {
    this.timer = h('span', { class: 'bt-time stroke' }, '3:00');
    this.timerBox = h('div', { class: 'bt-timer' }, icon('clock'), this.timer);
    this.destr = h('span', { class: 'bt-destr stroke-sm' }, '0%');
    for (let i = 0; i < 3; i++) this.stars.push(h('span', { class: 'bt-star' }, icon('star')));
    this.energyFill = h('i');
    this.energyNum = h('span', { class: 'bt-energy-num stroke' }, '5');
    const segs = h('div', { class: 'bt-energy-segs' });
    for (let i = 0; i < 10; i++) {
      const s = h('span');
      this.energySegs.push(s);
      segs.appendChild(s);
    }
    this.cardRow = h('div', { class: 'bt-cards' });
    const t = sim.teams[team];
    t.cards.forEach((c, slot) => {
      const def = getCharacter(c.spec.charId);
      const portrait = h('div', { class: 'bc-portrait' });
      void h0.portrait(def.id).then((url) => (portrait.style.backgroundImage = `url(${url})`));
      const cost = h('div', { class: 'bc-cost stroke-sm' }, String(c.spec.cost));
      const ring = h('div', { class: 'bc-ring' });
      const hp = h('div', { class: 'bc-hp' }, h('i'));
      const cd = h('div', { class: 'bc-cd stroke' });
      const root = h(
        'button',
        { class: `bcard rar-${def.rarity} el-${def.element} silent`, 'aria-label': def.name },
        ring,
        portrait,
        h('div', { class: 'bc-el', style: { background: ELEMENT_INFO[def.element] ? `var(--el-${def.element})` : '' } }),
        cost,
        h('div', { class: 'bc-name stroke-sm' }, def.name),
        h('div', { class: 'bc-ab stroke-sm' }, 'HABILIDADE'),
        hp,
        cd,
      ) as HTMLButtonElement;
      root.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.interactive) return;
        const st = sim.teams[team].cards[slot].state;
        if (st === 'hand') h0.deploy(slot);
        else if (st === 'field') h0.ability(slot);
        root.classList.remove('tapped');
        void root.offsetWidth;
        root.classList.add('tapped');
      });
      this.cards.push({ root, cost, ring, hp, cd, state: '' });
      this.cardRow.appendChild(root);
    });
    this.ultFill = h('div', { class: 'ult-fill' });
    this.ult = h('button', { class: 'bt-ult silent', 'aria-label': 'Ultimate' }, this.ultFill, h('div', { class: 'ult-core' }, icon('ult'), h('span', { class: 'stroke-sm' }, 'ULTIMATE'))) as HTMLButtonElement;
    this.ult.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.interactive) h0.ultimate();
    });
    this.banner = h('div', { class: 'bt-banner' });
    this.combo = h('div', { class: 'bt-combo stroke' });
    this.hint = h('div', { class: 'bt-hint hidden' });

    this.el = h(
      'div',
      { class: 'battle-hud' },
      h(
        'div',
        { class: 'bt-top' },
        h('div', { class: 'bt-left' }, h('button', { class: 'bt-pause', 'aria-label': 'Pausar', onClick: () => h0.pause() }, icon('pause')), h('div', { class: 'bt-foe' }, h('div', { class: 'bt-foe-name stroke-sm' }, title.name), h('div', { class: 'bt-foe-sub' }, h('span', { class: `el-dot el-bg-${title.element}` }), title.sub))),
        h('div', { class: 'bt-center' }, this.timerBox, h('div', { class: 'bt-progress' }, ...this.stars, this.destr)),
        h('div', { class: 'bt-right' }),
      ),
      h('div', { class: 'bt-bottom' }, h('div', { class: 'bt-energy' }, icon('energy'), h('div', { class: 'bt-energy-bar' }, this.energyFill, segs), this.energyNum), this.cardRow),
      this.ult,
      this.banner,
      this.combo,
      this.hint,
    );
  }

  /** Atualiza tudo (chamar a cada quadro). */
  update(sim: BattleSim): void {
    const t = sim.teams[this.team];
    const secs = Math.ceil(sim.timeLeftTicks / 30);
    this.timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.timerBox.classList.toggle('frenzy', sim.frenzy);
    this.timerBox.classList.toggle('hurry', secs <= 10);
    const enemy: Team = this.team === 0 ? 1 : 0;
    const destr = sim.destructionOf(enemy);
    this.destr.textContent = `${destr}%`;
    const coreDown = !sim.coreAlive(enemy);
    const s = [destr >= 50, coreDown, coreDown && sim.timeLeftTicks >= 1800];
    this.stars.forEach((el, i) => {
      const was = el.classList.contains('on');
      el.classList.toggle('on', s[i]);
      if (s[i] && !was) {
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 600);
      }
    });
    const energy = t.energy / ENERGY_UNIT;
    this.energyFill.style.width = `${(energy / 10) * 100}%`;
    const whole = Math.floor(energy);
    if (whole !== this.lastEnergy) {
      this.energyNum.textContent = String(whole);
      this.energySegs.forEach((seg, i) => seg.classList.toggle('full', i < whole));
      if (whole > this.lastEnergy && this.lastEnergy >= 0) {
        this.energyNum.classList.remove('bump');
        void this.energyNum.offsetWidth;
        this.energyNum.classList.add('bump');
      }
      this.lastEnergy = whole;
    }
    t.cards.forEach((c, slot) => {
      const el = this.cards[slot];
      let st: string = c.state;
      if (c.state === 'hand') st = energy >= c.spec.cost ? 'ready' : 'poor';
      if (c.state === 'field') {
        const u = sim.unit(c.unitId);
        if (u) {
          const cdFrac = u.abilityCd <= 0 ? 1 : 1 - u.abilityCd / Math.max(1, u.spec.ability.cooldown);
          el.ring.style.setProperty('--p', `${Math.round(cdFrac * 360)}deg`);
          st = u.abilityCd <= 0 ? 'field-ready' : 'field';
          (el.hp.firstElementChild as HTMLElement).style.width = `${Math.max(0, (u.hp / u.maxHp) * 100)}%`;
        }
      }
      if (c.state === 'cooldown') el.cd.textContent = String(Math.ceil(c.cd / 30));
      if (c.state === 'hand' && energy < c.spec.cost) el.root.style.setProperty('--need', `${Math.round((1 - energy / c.spec.cost) * 100)}%`);
      if (st !== el.state) {
        el.root.classList.remove(`st-${el.state}`);
        el.root.classList.add(`st-${st}`);
        el.state = st;
      }
    });
    const ultK = t.ultReady ? 1 : t.ult / t.ultMax;
    this.ultFill.style.setProperty('--p', `${Math.round(ultK * 360)}deg`);
    this.ult.classList.toggle('ready', t.ultReady);
    if (t.ultReady && !this.lastUltReady) this.showBanner('ULTIMATE PRONTA!', 'ult');
    this.lastUltReady = t.ultReady;
  }

  showBanner(text: string, kind: 'info' | 'frenzy' | 'ult' | 'big' | 'win' | 'lose' = 'info', ms = 1600): void {
    this.banner.className = `bt-banner show ${kind}`;
    this.banner.textContent = text;
    void this.banner.offsetWidth;
    setTimeout(() => {
      if (this.banner.textContent === text) this.banner.classList.remove('show');
    }, ms);
  }

  showCombo(n: number): void {
    this.combo.textContent = `COMBO x${n}!`;
    this.combo.classList.remove('show');
    void this.combo.offsetWidth;
    this.combo.classList.add('show');
    if (this.comboTimer) clearTimeout(this.comboTimer);
    this.comboTimer = setTimeout(() => this.combo.classList.remove('show'), 1100);
  }

  /** Dica do tutorial apontando para uma área (cartas, ultimate...). */
  showHint(text: string | null, target: 'cards' | 'card' | 'ult' | 'center' = 'center', slot = 0): void {
    if (!text) {
      this.hint.classList.add('hidden');
      return;
    }
    this.hint.className = `bt-hint hint-${target}`;
    this.hint.replaceChildren(h('span', { class: 'hint-arrow' }), h('span', { class: 'hint-text stroke-sm' }, text));
    if (target === 'card') {
      const r = this.cards[slot].root.getBoundingClientRect();
      this.hint.style.left = `${r.left + r.width / 2}px`;
    } else this.hint.style.left = '';
    for (const c of this.cards) c.root.classList.remove('hint-glow');
    if (target === 'card' || target === 'cards') this.cards.forEach((c, i) => (target === 'cards' || i === slot) && c.root.classList.add('hint-glow'));
    this.ult.classList.toggle('hint-glow', target === 'ult');
  }

  bumpCard(slot: number): void {
    const el = this.cards[slot]?.root;
    if (!el) return;
    el.classList.remove('back');
    void el.offsetWidth;
    el.classList.add('back');
  }

  cardRect(slot: number): DOMRect | null {
    return this.cards[slot]?.root.getBoundingClientRect() ?? null;
  }
}
