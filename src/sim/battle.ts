import { Rng, mixSeed } from './rng.ts';
import { botThink } from './ai.ts';
import {
  TILE,
  type AbilitySpec,
  type BattleResult,
  type BattleSetup,
  type Command,
  type ProjectileStyle,
  type SimElement,
  type SimEvent,
  type StructureKind,
  type StructureSpec,
  type Team,
  type TimedCommand,
  type UnitSpec,
} from './types.ts';

// ============================================================ regras fixas

/** Solar > Raiz > Maré > Solar ; Volt > Cristal > Sombra > Volt */
const BEATS: Record<SimElement, SimElement> = {
  solar: 'raiz',
  raiz: 'mare',
  mare: 'solar',
  volt: 'cristal',
  cristal: 'sombra',
  sombra: 'volt',
};
export function hasAdvantage(a: SimElement, b: SimElement): boolean {
  return BEATS[a] === b;
}
export const ADVANTAGE_PCT = 130;

const UNIT_RADIUS = 300;
const STRUCT_RADIUS: Record<StructureKind, number> = {
  core: 1400,
  barrier: 500,
  cannon: 900,
  laser: 900,
  frost: 900,
  tesla: 900,
  mortar: 900,
  trap: 400,
  generator: 1000,
  vault: 1000,
  barracks: 1300,
  lab: 1300,
  gate: 1000,
};
const TOWER_KINDS: ReadonlySet<StructureKind> = new Set(['cannon', 'laser', 'frost', 'tesla', 'mortar', 'core']);
/** Não contam para a % de destruição (como muros e armadilhas). */
const UNCOUNTED: ReadonlySet<StructureKind> = new Set(['barrier', 'trap', 'gate']);
const MELEE = new Set(['tanque', 'lutador', 'assassino', 'construtor', 'sabotador']);
const RANGED_STYLE: Record<string, ProjectileStyle> = {
  atirador: 'bullet',
  mago: 'orb',
  curandeiro: 'orb',
  invocador: 'orb',
  controlador: 'orb',
  bombardeiro: 'bomb',
  suporte: 'arrow',
  drone: 'bullet',
  turret: 'bullet',
};

// ============================================================ estado

type BuffKind = 'slow' | 'stun' | 'burn' | 'dmgUp' | 'regen' | 'taunt' | 'disabled' | 'atkSlow';
interface Buff {
  kind: BuffKind;
  ticks: number;
  power: number;
  src: number;
}

export interface UnitState {
  id: number;
  team: Team;
  slot: number;
  spec: UnitSpec;
  /** 'drone' e 'turret' são invocações. */
  role: 'hero' | 'drone' | 'turret';
  x: number;
  hp: number;
  maxHp: number;
  atkCd: number;
  abilityCd: number;
  shield: number;
  buffs: Buff[];
  alive: boolean;
  life: number;
  targetId: number;
  moving: boolean;
  /** Rajada pendente (Atirador). */
  barrage: { left: number; cd: number; dmg: number; target: number } | null;
  /** Bônus do próximo golpe (Assassino). */
  nextHitPct: number;
  spawnTick: number;
  dmgDealt: number;
  lastAttackTick: number;
  lastAbilityTick: number;
}

export interface StructState {
  id: number;
  team: Team;
  spec: StructureSpec;
  x: number;
  hp: number;
  maxHp: number;
  atkCd: number;
  alive: boolean;
  revealed: boolean;
  buffs: Buff[];
  radius: number;
  targetId: number;
  lastAttackTick: number;
}

interface Projectile {
  id: number;
  team: Team;
  src: number;
  style: ProjectileStyle;
  targetId: number;
  toX: number;
  homing: boolean;
  ticks: number;
  dmg: number;
  splash: number;
  crit: boolean;
  adv: boolean;
  heavy: boolean;
  element: SimElement;
  vsBuildings: number;
  slow: number;
  slowTicks: number;
  heal: boolean;
  atkSlow: number;
  fx: AbilitySpec | null;
  /** Projétil de torre não acerta construções; de personagem acerta tudo. */
  fromStructure: boolean;
}

export interface CardState {
  spec: UnitSpec;
  state: 'hand' | 'field' | 'cooldown';
  cd: number;
  unitId: number;
}

export interface TeamState {
  energy: number;
  cards: CardState[];
  ult: number;
  ultMax: number;
  ultReady: boolean;
  dmg: number;
  abilities: number;
  ults: number;
  coreId: number;
  surrendered: boolean;
  element: SimElement;
}

/** Unidades de energia internas por ponto de energia. */
export const ENERGY_UNIT = 900;

// ============================================================ simulação

export class BattleSim {
  readonly setup: BattleSetup;
  readonly rng: Rng;
  private botRng: [Rng, Rng];
  tick = 0;
  over = false;
  result: BattleResult | null = null;
  units: UnitState[] = [];
  structures: StructState[] = [];
  projectiles: Projectile[] = [];
  teams: [TeamState, TeamState];
  events: SimEvent[] = [];
  /** Jogadas aplicadas (para replay e validação). */
  readonly log: TimedCommand[] = [];
  private nextId = 1;
  private frenzyAnnounced = false;
  private destroyedRefs: string[] = [];
  private structuresDestroyed = 0;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.botRng = [new Rng(mixSeed(setup.seed, 101)), new Rng(mixSeed(setup.seed, 202))];
    this.teams = [this.makeTeam(0), this.makeTeam(1)];
    for (const team of [0, 1] as Team[]) {
      for (const s of setup.teams[team].structures) {
        const st: StructState = {
          id: this.nextId++,
          team,
          spec: s,
          x: s.x,
          hp: s.hp,
          maxHp: s.hp,
          atkCd: 30 + (this.nextId % 20),
          alive: true,
          revealed: s.kind !== 'trap',
          buffs: [],
          radius: STRUCT_RADIUS[s.kind],
          targetId: 0,
          lastAttackTick: -999,
        };
        this.structures.push(st);
        if (s.kind === 'core') this.teams[team].coreId = st.id;
      }
    }
  }

  private makeTeam(team: Team): TeamState {
    const t = this.setup.teams[team];
    return {
      energy: Math.min(this.setup.rules.energyMax, t.energyStart) * ENERGY_UNIT,
      cards: t.squad.map((spec) => ({ spec, state: 'hand', cd: 0, unitId: 0 })),
      ult: 0,
      ultMax: Math.max(1, t.ultimate.charge),
      ultReady: false,
      dmg: 0,
      abilities: 0,
      ults: 0,
      coreId: 0,
      surrendered: false,
      element: t.element,
    };
  }

  // ------------------------------------------------------------ consultas

  get frenzy(): boolean {
    return this.tick >= this.setup.rules.durationTicks - this.setup.rules.frenzyTicks;
  }

  get timeLeftTicks(): number {
    return Math.max(0, this.setup.rules.durationTicks - this.tick);
  }

  energyOf(team: Team): number {
    return this.teams[team].energy / ENERGY_UNIT;
  }

  unit(id: number): UnitState | undefined {
    return this.units.find((u) => u.id === id);
  }

  structure(id: number): StructState | undefined {
    return this.structures.find((s) => s.id === id);
  }

  /** % de destruição das construções contáveis do time (0–100). */
  destructionOf(team: Team): number {
    let total = 0;
    let gone = 0;
    for (const s of this.structures) {
      if (s.team !== team || UNCOUNTED.has(s.spec.kind)) continue;
      total += s.spec.weight;
      if (!s.alive) gone += s.spec.weight;
    }
    return total === 0 ? 0 : Math.floor((gone * 100) / total);
  }

  coreAlive(team: Team): boolean {
    const c = this.structure(this.teams[team].coreId);
    return !!c && c.alive;
  }

  /** Posição mais avançada do time (frente de batalha). */
  frontX(team: Team): number {
    let best = team === 0 ? 0 : this.setup.roadLength;
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      if (team === 0 ? u.x > best : u.x < best) best = u.x;
    }
    return best;
  }

  canDeploy(team: Team, slot: number): boolean {
    const c = this.teams[team].cards[slot];
    return !!c && c.state === 'hand' && this.teams[team].energy >= c.spec.cost * ENERGY_UNIT && !this.over;
  }

  canUseAbility(team: Team, slot: number): boolean {
    const c = this.teams[team].cards[slot];
    if (!c || c.state !== 'field') return false;
    const u = this.unit(c.unitId);
    return !!u && u.alive && u.abilityCd <= 0 && !this.hasBuff(u.buffs, 'stun') && !this.over;
  }

  // ------------------------------------------------------------ passo

  /** Avança 1 tick aplicando as jogadas deste tick. Retorna os eventos gerados. */
  step(commands: { team: Team; cmd: Command }[] = []): SimEvent[] {
    this.events = [];
    if (this.over) return this.events;
    const all = commands.slice();
    for (const team of [0, 1] as Team[]) {
      const bot = this.setup.teams[team].bot;
      if (bot) for (const cmd of botThink(this, team, bot.skill, this.botRng[team])) all.push({ team, cmd });
    }
    for (const c of all) this.apply(c.team, c.cmd);

    this.updateEnergy();
    for (const u of this.units) if (u.alive) this.updateUnit(u);
    for (const s of this.structures) if (s.alive) this.updateStructure(s);
    this.updateProjectiles();
    this.updateTraps();
    this.updateCards();
    this.units = this.units.filter((u) => u.alive);

    this.tick++;
    if (!this.frenzyAnnounced && this.frenzy) {
      this.frenzyAnnounced = true;
      this.emit({ e: 'frenzy' });
    }
    this.checkEnd();
    return this.events;
  }

  private emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  private apply(team: Team, cmd: Command): void {
    const ts = this.teams[team];
    switch (cmd.t) {
      case 'deploy': {
        if (!this.canDeploy(team, cmd.slot)) return;
        const card = ts.cards[cmd.slot];
        ts.energy -= card.spec.cost * ENERGY_UNIT;
        const u = this.spawnUnit(team, cmd.slot, card.spec, 'hero');
        card.state = 'field';
        card.unitId = u.id;
        break;
      }
      case 'ability': {
        if (!this.canUseAbility(team, cmd.slot)) return;
        const u = this.unit(ts.cards[cmd.slot].unitId)!;
        this.castAbility(u);
        ts.abilities++;
        break;
      }
      case 'ultimate': {
        if (!ts.ultReady || this.over) return;
        this.castUltimate(team);
        break;
      }
      case 'surrender':
        ts.surrendered = true;
        break;
    }
    this.log.push({ tick: this.tick, team, cmd });
  }

  private spawnUnit(team: Team, slot: number, spec: UnitSpec, role: UnitState['role'], x?: number, life = -1): UnitState {
    const spawnX = x ?? this.setup.teams[team].spawnX ?? (team === 0 ? 1500 : this.setup.roadLength - 1500);
    const u: UnitState = {
      id: this.nextId++,
      team,
      slot,
      spec,
      role,
      x: spawnX,
      hp: spec.hp,
      maxHp: spec.hp,
      atkCd: 8,
      abilityCd: role === 'hero' ? Math.min(90, spec.ability.cooldown) : 1 << 30,
      shield: 0,
      buffs: [],
      alive: true,
      life,
      targetId: 0,
      moving: false,
      barrage: null,
      nextHitPct: 0,
      spawnTick: this.tick,
      dmgDealt: 0,
      lastAttackTick: -999,
      lastAbilityTick: -999,
    };
    this.units.push(u);
    this.emit({ e: 'spawn', id: u.id, team, slot, summon: role !== 'hero' });
    return u;
  }

  private updateEnergy(): void {
    const r = this.setup.rules;
    for (const team of [0, 1] as Team[]) {
      const ts = this.teams[team];
      const max = r.energyMax * ENERGY_UNIT;
      if (ts.energy >= max) continue;
      const regenPct = this.setup.teams[team].energyRegen;
      let gain = Math.floor((ENERGY_UNIT * regenPct) / (100 * r.energyRegenTicks));
      if (this.frenzy) gain *= 2;
      ts.energy = Math.min(max, ts.energy + gain);
    }
  }

  private updateCards(): void {
    for (const team of [0, 1] as Team[]) {
      const ts = this.teams[team];
      ts.cards.forEach((c, slot) => {
        if (c.state === 'field') {
          const u = this.unit(c.unitId);
          if (!u || !u.alive) {
            c.state = 'cooldown';
            c.cd = c.spec.redeploy;
          }
        } else if (c.state === 'cooldown') {
          c.cd--;
          if (c.cd <= 0) {
            c.state = 'hand';
            c.cd = 0;
            this.emit({ e: 'cardReady', team, slot });
          }
        }
      });
    }
  }

  // ------------------------------------------------------------ utilitários

  private hasBuff(buffs: Buff[], kind: BuffKind): boolean {
    for (const b of buffs) if (b.kind === kind && b.ticks > 0) return true;
    return false;
  }

  private buffPower(buffs: Buff[], kind: BuffKind): number {
    let p = 0;
    for (const b of buffs) if (b.kind === kind && b.ticks > 0 && b.power > p) p = b.power;
    return p;
  }

  private addBuff(buffs: Buff[], kind: BuffKind, ticks: number, power: number, src: number): void {
    const cur = buffs.find((b) => b.kind === kind);
    if (cur) {
      cur.ticks = Math.max(cur.ticks, ticks);
      cur.power = Math.max(cur.power, power);
      cur.src = src;
    } else buffs.push({ kind, ticks, power, src });
  }

  private tickBuffs(buffs: Buff[]): void {
    for (let i = buffs.length - 1; i >= 0; i--) {
      buffs[i].ticks--;
      if (buffs[i].ticks <= 0) buffs.splice(i, 1);
    }
  }

  private gapUnitStruct(u: UnitState, s: StructState): number {
    return Math.max(0, Math.abs(u.x - s.x) - UNIT_RADIUS - s.radius);
  }

  private gapUnits(a: UnitState, b: UnitState): number {
    return Math.max(0, Math.abs(a.x - b.x) - UNIT_RADIUS * 2);
  }

  private elementOfEntity(id: number): SimElement | null {
    const u = this.unit(id);
    if (u) return u.spec.element;
    const s = this.structure(id);
    return s ? this.teams[s.team].element : null;
  }

  /** Inimigo mais próximo ao alcance (personagens e construções visíveis). */
  private findTarget(u: UnitState, range: number): { id: number; gap: number } | null {
    let best: { id: number; gap: number } | null = null;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team) continue;
      const g = this.gapUnits(u, o);
      if (g <= range && (!best || g < best.gap)) best = { id: o.id, gap: g };
    }
    for (const s of this.structures) {
      if (!s.alive || s.team === u.team || !s.revealed || s.spec.kind === 'trap') continue;
      const g = this.gapUnitStruct(u, s);
      if (g <= range && (!best || g < best.gap)) best = { id: s.id, gap: g };
    }
    return best;
  }

  // ------------------------------------------------------------ dano e cura

  /**
   * Aplica dano (com escudo, vantagem de elemento e crítico já calculados
   * por quem chama) e cuida de morte/destruição e carga do Ultimate.
   */
  private damage(targetId: number, srcId: number, amount: number, opts: { crit?: boolean; adv?: boolean; heavy?: boolean; team: Team }): number {
    if (amount <= 0) return 0;
    const u = this.unit(targetId);
    let dealt = 0;
    if (u && u.alive) {
      let a = amount;
      if (u.shield > 0) {
        const absorbed = Math.min(u.shield, a);
        u.shield -= absorbed;
        a -= absorbed;
      }
      dealt = Math.min(u.hp, a);
      u.hp -= a;
      this.emit({ e: 'hit', target: u.id, src: srcId, dmg: amount, crit: !!opts.crit, adv: !!opts.adv, heavy: !!opts.heavy });
      if (u.hp <= 0) {
        u.hp = 0;
        u.alive = false;
        this.emit({ e: 'death', id: u.id, team: u.team, x: u.x });
      }
    } else {
      const s = this.structure(targetId);
      if (!s || !s.alive) return 0;
      dealt = Math.min(s.hp, amount);
      s.hp -= amount;
      s.revealed = true;
      this.emit({ e: 'hit', target: s.id, src: srcId, dmg: amount, crit: !!opts.crit, adv: !!opts.adv, heavy: !!opts.heavy });
      if (s.hp <= 0) {
        s.hp = 0;
        s.alive = false;
        this.structuresDestroyed++;
        for (const r of s.spec.refIds) this.destroyedRefs.push(r);
        this.emit({ e: 'destroyed', id: s.id, kind: s.spec.kind, x: s.x, team: s.team });
      }
    }
    if (dealt > 0) {
      const ts = this.teams[opts.team];
      ts.dmg += dealt;
      const src = this.unit(srcId);
      if (src) src.dmgDealt += dealt;
      if (!ts.ultReady && src) {
        ts.ult = Math.min(ts.ultMax, ts.ult + dealt);
        if (ts.ult >= ts.ultMax) {
          ts.ultReady = true;
          this.emit({ e: 'ultimateReady', team: opts.team });
        }
      }
    }
    return dealt;
  }

  private heal(u: UnitState, amount: number): void {
    if (!u.alive || amount <= 0) return;
    const real = Math.min(u.maxHp - u.hp, amount);
    if (real <= 0) return;
    u.hp += real;
    this.emit({ e: 'heal', target: u.id, amount: real });
  }

  /** Dano de um personagem: buffs, vantagem de elemento, crítico, bônus em construções. */
  private unitDamage(u: UnitState, targetId: number, basePct = 100): { dmg: number; crit: boolean; adv: boolean } {
    let dmg = Math.floor((u.spec.dmg * basePct) / 100);
    const isStruct = !this.unit(targetId);
    if (isStruct) dmg = Math.floor((dmg * u.spec.vsBuildings) / 100);
    const up = this.buffPower(u.buffs, 'dmgUp') + this.supportAura(u);
    if (up) dmg = Math.floor((dmg * (100 + up)) / 100);
    const tEl = this.elementOfEntity(targetId);
    const adv = tEl !== null && hasAdvantage(u.spec.element, tEl);
    if (adv) dmg = Math.floor((dmg * ADVANTAGE_PCT) / 100);
    let crit = false;
    if (u.nextHitPct > 0) {
      dmg = Math.floor((dmg * (100 + u.nextHitPct)) / 100);
      u.nextHitPct = 0;
      crit = true;
    } else if (u.spec.crit > 0 && this.rng.chance(u.spec.crit)) {
      dmg = Math.floor((dmg * 150) / 100);
      crit = true;
    }
    return { dmg: Math.max(1, dmg), crit, adv };
  }

  /** Suporte por perto: +10% de dano para aliados. */
  private supportAura(u: UnitState): number {
    if (u.spec.cls === 'suporte') return 0;
    for (const o of this.units) {
      if (o.alive && o.team === u.team && o.role === 'hero' && o.spec.cls === 'suporte' && Math.abs(o.x - u.x) <= 3000) return 10;
    }
    return 0;
  }

  // ------------------------------------------------------------ personagens

  private updateUnit(u: UnitState): void {
    // vida útil de invocações
    if (u.life >= 0) {
      u.life--;
      if (u.life <= 0) {
        u.alive = false;
        this.emit({ e: 'death', id: u.id, team: u.team, x: u.x });
        return;
      }
    }
    // efeitos contínuos (a cada meio segundo)
    if (this.tick % 15 === 0) {
      const burn = this.buffPower(u.buffs, 'burn');
      if (burn > 0) {
        const src = u.buffs.find((b) => b.kind === 'burn')!.src;
        this.damage(u.id, src, burn, { team: (1 - u.team) as Team });
        if (!u.alive) return;
      }
      const regen = this.buffPower(u.buffs, 'regen');
      if (regen > 0) this.heal(u, regen);
    }
    this.tickBuffs(u.buffs);
    if (u.abilityCd > 0) u.abilityCd--;
    if (this.hasBuff(u.buffs, 'stun')) {
      u.moving = false;
      return;
    }

    // Rajada do Atirador
    if (u.barrage) {
      if (u.barrage.cd > 0) u.barrage.cd--;
      else {
        const t = this.unit(u.barrage.target) ?? this.structure(u.barrage.target);
        const tgt = t && t.alive ? u.barrage.target : this.findTarget(u, u.spec.range + 1500)?.id ?? 0;
        if (tgt) {
          const d = this.unitDamage(u, tgt, u.barrage.dmg);
          this.fireProjectile(u, tgt, 'bullet', d.dmg, 0, d.crit, d.adv, true, null);
        }
        u.barrage.left--;
        u.barrage.cd = 3;
        if (u.barrage.left <= 0) u.barrage = null;
      }
    }

    if (u.atkCd > 0) u.atkCd--;
    const slow = this.buffPower(u.buffs, 'slow');

    // Curandeiro cura o aliado mais ferido ao alcance
    if (u.spec.cls === 'curandeiro' && u.role === 'hero') {
      let ally: UnitState | null = null;
      for (const o of this.units) {
        if (!o.alive || o.team !== u.team || o.id === u.id || o.hp >= o.maxHp) continue;
        if (Math.abs(o.x - u.x) > u.spec.range + 600) continue;
        if (!ally || o.hp * ally.maxHp < ally.hp * o.maxHp) ally = o;
      }
      if (ally) {
        u.moving = false;
        u.targetId = ally.id;
        if (u.atkCd <= 0) {
          u.atkCd = this.attackInterval(u, slow);
          u.lastAttackTick = this.tick;
          this.emit({ e: 'beam', src: u.id, target: ally.id, style: 'heal' });
          this.heal(ally, u.spec.dmg);
        }
        return;
      }
    }

    // Sabotador desarma armadilhas escondidas à frente
    if (u.spec.cls === 'sabotador') {
      for (const s of this.structures) {
        if (!s.alive || s.team === u.team || s.spec.kind !== 'trap') continue;
        const ahead = u.team === 0 ? s.x - u.x : u.x - s.x;
        if (ahead >= 0 && ahead <= 3000) {
          s.alive = false;
          s.revealed = true;
          this.structuresDestroyed++;
          for (const r of s.spec.refIds) this.destroyedRefs.push(r);
          this.emit({ e: 'status', target: s.id, status: 'disabled' });
          this.emit({ e: 'destroyed', id: s.id, kind: 'trap', x: s.x, team: s.team });
        }
      }
    }

    const target = this.findTarget(u, u.spec.range);
    if (target) {
      u.moving = false;
      u.targetId = target.id;
      if (u.atkCd <= 0) this.unitAttack(u, target.id, slow);
      return;
    }
    u.targetId = 0;
    if (u.spec.speed <= 0) {
      u.moving = false;
      return;
    }
    // anda para a frente, travando em construções que bloqueiam
    const dir = u.team === 0 ? 1 : -1;
    const speed = Math.floor((u.spec.speed * (100 - slow)) / 100);
    let nx = u.x + dir * speed;
    for (const s of this.structures) {
      if (!s.alive || s.team === u.team || !s.revealed) continue;
      if (s.spec.kind !== 'barrier' && s.spec.kind !== 'core' && s.spec.kind !== 'gate') continue;
      const limit = s.x - dir * (s.radius + UNIT_RADIUS);
      if (dir > 0 && u.x <= limit && nx > limit) nx = limit;
      if (dir < 0 && u.x >= limit && nx < limit) nx = limit;
    }
    nx = Math.max(0, Math.min(this.setup.roadLength, nx));
    u.moving = nx !== u.x;
    u.x = nx;
  }

  private attackInterval(u: UnitState, slow: number): number {
    return Math.floor((u.spec.atkInterval * (100 + Math.floor(slow / 2))) / 100);
  }

  private unitAttack(u: UnitState, targetId: number, slow: number): void {
    u.atkCd = this.attackInterval(u, slow);
    u.lastAttackTick = this.tick;
    const d = this.unitDamage(u, targetId);
    const melee = u.role === 'hero' && MELEE.has(u.spec.cls);
    if (melee) {
      this.emit({ e: 'attack', src: u.id, target: targetId, style: 'melee' });
      this.damage(targetId, u.id, d.dmg, { crit: d.crit, adv: d.adv, heavy: d.crit, team: u.team });
      if (u.spec.splash > 0) this.splashAround(u, targetId, d.dmg, u.spec.splash);
      return;
    }
    this.emit({ e: 'attack', src: u.id, target: targetId, style: 'ranged' });
    const style = RANGED_STYLE[u.role === 'hero' ? u.spec.cls : u.role] ?? 'bullet';
    const p = this.fireProjectile(u, targetId, style, d.dmg, u.spec.splash, d.crit, d.adv, true, null);
    if (u.spec.cls === 'controlador' && p) p.atkSlow = 25;
  }

  /** Dano em área ao redor do alvo (golpes pesados). */
  private splashAround(u: UnitState, mainId: number, dmg: number, radius: number): void {
    const main = this.unit(mainId) ?? this.structure(mainId);
    if (!main) return;
    const cx = main.x;
    for (const o of this.units) {
      if (o.alive && o.team !== u.team && o.id !== mainId && Math.abs(o.x - cx) <= radius) this.damage(o.id, u.id, Math.floor(dmg / 2), { team: u.team });
    }
    for (const s of this.structures) {
      if (s.alive && s.revealed && s.team !== u.team && s.id !== mainId && s.spec.kind !== 'trap' && Math.abs(s.x - cx) <= radius + s.radius)
        this.damage(s.id, u.id, Math.floor(dmg / 2), { team: u.team });
    }
  }

  private fireProjectile(
    u: UnitState,
    targetId: number,
    style: ProjectileStyle,
    dmg: number,
    splash: number,
    crit: boolean,
    adv: boolean,
    homing: boolean,
    fx: AbilitySpec | null,
    toXOverride?: number,
    heavy = false,
  ): Projectile | null {
    const t = this.unit(targetId) ?? this.structure(targetId);
    const toX = toXOverride ?? (t ? t.x : u.x + (u.team === 0 ? 3000 : -3000));
    const dist = Math.abs(toX - u.x);
    const speed = style === 'bomb' || style === 'shell' ? 260 : style === 'orb' ? 380 : 650;
    const p: Projectile = {
      id: this.nextId++,
      team: u.team,
      src: u.id,
      style,
      targetId,
      toX,
      homing,
      ticks: Math.max(3, Math.floor(dist / speed)),
      dmg,
      splash,
      crit,
      adv,
      heavy: heavy || crit,
      element: u.spec.element,
      vsBuildings: 100,
      slow: 0,
      slowTicks: 0,
      heal: false,
      atkSlow: 0,
      fx,
      fromStructure: false,
    };
    this.projectiles.push(p);
    this.emit({ e: 'projectile', id: p.id, src: u.id, style, fromX: u.x, toX, ticks: p.ticks, team: u.team });
    return p;
  }

  // ------------------------------------------------------------ habilidades

  private castAbility(u: UnitState): void {
    const a = u.spec.ability;
    u.abilityCd = a.cooldown;
    u.lastAbilityTick = this.tick;
    this.emit({ e: 'ability', id: u.id, team: u.team, slot: u.slot, kind: a.kind });
    const dir = u.team === 0 ? 1 : -1;
    const hit: number[] = [];
    let dealt = 0;
    const strike = (id: number, pct: number, heavy = true) => {
      const d = this.unitDamage(u, id, pct);
      dealt += this.damage(id, u.id, d.dmg, { crit: d.crit, adv: d.adv, heavy, team: u.team });
      hit.push(id);
    };
    const enemiesIn = (x0: number, x1: number): number[] => {
      const lo = Math.min(x0, x1);
      const hi = Math.max(x0, x1);
      const out: number[] = [];
      for (const o of this.units) if (o.alive && o.team !== u.team && o.x >= lo && o.x <= hi) out.push(o.id);
      for (const s of this.structures)
        if (s.alive && s.revealed && s.team !== u.team && s.spec.kind !== 'trap' && s.x + s.radius >= lo && s.x - s.radius <= hi) out.push(s.id);
      return out;
    };
    const alliesNear = (r: number): UnitState[] => this.units.filter((o) => o.alive && o.team === u.team && Math.abs(o.x - u.x) <= r);

    switch (a.kind) {
      case 'shieldTaunt': {
        u.shield += Math.floor((u.maxHp * a.power) / 100);
        this.addBuff(u.buffs, 'taunt', a.duration, 1, u.id);
        this.emit({ e: 'shield', target: u.id, amount: u.shield });
        this.emit({ e: 'status', target: u.id, status: 'taunt' });
        break;
      }
      case 'dash': {
        let nx = u.x + dir * a.radius;
        for (const s of this.structures) {
          if (!s.alive || s.team === u.team || !s.revealed) continue;
          const limit = s.x - dir * (s.radius + UNIT_RADIUS);
          if (dir > 0 && u.x <= limit && nx > limit) nx = limit;
          if (dir < 0 && u.x >= limit && nx < limit) nx = limit;
        }
        u.x = Math.max(0, Math.min(this.setup.roadLength, nx));
        const t = this.findTarget(u, 1500);
        if (t) strike(t.id, a.power);
        break;
      }
      case 'barrage': {
        const t = this.findTarget(u, u.spec.range + 1500);
        u.barrage = { left: a.count, cd: 0, dmg: a.power, target: t?.id ?? 0 };
        break;
      }
      case 'meteor': {
        const t = this.findTarget(u, u.spec.range + 3000);
        const cx = t ? (this.unit(t.id) ?? this.structure(t.id))!.x : u.x + dir * 4000;
        const d = this.unitDamage(u, t?.id ?? 0, a.power);
        this.fireProjectile(u, t?.id ?? 0, 'orb', d.dmg, a.radius, d.crit, d.adv, false, a, cx, true);
        break;
      }
      case 'healPulse': {
        for (const o of alliesNear(a.radius)) this.heal(o, Math.floor((o.maxHp * a.power) / 100));
        break;
      }
      case 'summon': {
        for (let i = 0; i < a.count; i++) {
          const spec: UnitSpec = {
            ...u.spec,
            hp: Math.floor((u.maxHp * 35) / 100),
            dmg: Math.floor((u.spec.dmg * a.power) / 100),
            atkInterval: 24,
            speed: 45,
            range: 3200,
            splash: 0,
            crit: 0,
            vsBuildings: 100,
          };
          this.spawnUnit(u.team, -1, spec, 'drone', u.x + dir * (400 + i * 300), a.duration);
        }
        break;
      }
      case 'shadowStep': {
        let best: StructState | null = null;
        for (const s of this.structures) {
          if (!s.alive || !s.revealed || s.team === u.team || s.spec.kind === 'trap') continue;
          const ahead = (s.x - u.x) * dir;
          if (ahead <= 0 || ahead > a.radius) continue;
          if (!best || s.hp * best.maxHp < best.hp * s.maxHp) best = s;
        }
        if (best) {
          u.x = best.x - dir * (best.radius + UNIT_RADIUS);
          u.nextHitPct = a.power;
          strike(best.id, 100);
          u.atkCd = 0;
        } else u.nextHitPct = a.power;
        break;
      }
      case 'turret': {
        const spec: UnitSpec = {
          ...u.spec,
          hp: Math.floor((u.maxHp * 60) / 100),
          dmg: Math.floor((u.spec.dmg * a.power) / 100),
          atkInterval: 15,
          speed: 0,
          range: 4500,
          splash: 0,
          crit: 0,
          vsBuildings: 120,
        };
        this.spawnUnit(u.team, -1, spec, 'turret', u.x, a.duration);
        break;
      }
      case 'sabotage': {
        let best: StructState | null = null;
        let bestGap = 1 << 30;
        for (const s of this.structures) {
          if (!s.alive || !s.revealed || s.team === u.team || !TOWER_KINDS.has(s.spec.kind)) continue;
          const g = this.gapUnitStruct(u, s);
          if (g <= a.radius && g < bestGap) {
            best = s;
            bestGap = g;
          }
        }
        if (best) {
          this.addBuff(best.buffs, 'disabled', a.duration, 1, u.id);
          this.emit({ e: 'status', target: best.id, status: 'disabled' });
          strike(best.id, a.power);
        }
        break;
      }
      case 'stasis': {
        const lo = u.x - a.radius;
        const hi = u.x + a.radius + (dir > 0 ? a.radius : 0);
        for (const s of this.structures) {
          if (!s.alive || s.team === u.team || s.x < lo - s.radius || s.x > hi + s.radius) continue;
          this.addBuff(s.buffs, 'atkSlow', a.duration, 50, u.id);
          this.emit({ e: 'status', target: s.id, status: 'slow' });
        }
        // apaga projéteis inimigos na área
        this.projectiles = this.projectiles.filter((p) => {
          const cur = p.homing ? (this.unit(p.targetId)?.x ?? p.toX) : p.toX;
          const kill = p.team !== u.team && cur >= lo && cur <= hi;
          if (kill) this.emit({ e: 'projectileEnd', id: p.id });
          return !kill;
        });
        for (const id of enemiesIn(lo, hi)) strike(id, a.power, false);
        break;
      }
      case 'bombard': {
        const t = this.findTarget(u, u.spec.range + 4000);
        const cx = t ? (this.unit(t.id) ?? this.structure(t.id))!.x : u.x + dir * 4000;
        for (let i = 0; i < a.count; i++) {
          const off = this.rng.range(-a.radius / 2, a.radius / 2);
          const d = this.unitDamage(u, t?.id ?? 0, a.power);
          const p = this.fireProjectile(u, t?.id ?? 0, 'bomb', d.dmg, 1500, d.crit, d.adv, false, i === 0 ? a : null, cx + off, true);
          if (p) p.ticks += i * 4;
        }
        break;
      }
      case 'warcry': {
        for (const o of alliesNear(a.radius)) {
          this.addBuff(o.buffs, 'dmgUp', a.duration, a.power, u.id);
          this.heal(o, Math.floor(o.maxHp / 10));
          this.emit({ e: 'status', target: o.id, status: 'buff' });
        }
        break;
      }
    }
    // Habilidades instantâneas aplicam o efeito do elemento agora;
    // as de projétil aplicam quando o projétil chega.
    if (a.kind !== 'meteor' && a.kind !== 'bombard' && a.kind !== 'barrage') this.applyElementFx(u, a, hit, dealt);
  }

  /** Modificador do elemento na habilidade: queimar, regenerar, lentidão, corrente, escudo, dreno. */
  private applyElementFx(u: UnitState, a: AbilitySpec, hit: number[], dealt: number): void {
    const p = a.fxPower;
    switch (a.fx) {
      case 'burn':
        for (const id of hit) {
          const t = this.unit(id) ?? this.structure(id);
          if (t && t.alive) {
            this.addBuff(t.buffs, 'burn', 90, Math.max(1, Math.floor((u.spec.dmg * p) / 200)), u.id);
            this.emit({ e: 'status', target: id, status: 'burn' });
          }
        }
        break;
      case 'regen':
        for (const o of this.units) {
          if (!o.alive || o.team !== u.team || Math.abs(o.x - u.x) > 3500) continue;
          this.addBuff(o.buffs, 'regen', 120, Math.max(1, Math.floor((o.maxHp * p) / 800)), u.id);
          this.emit({ e: 'status', target: o.id, status: 'buff' });
        }
        break;
      case 'slow':
        for (const id of hit) {
          const t = this.unit(id);
          if (t && t.alive) this.addBuff(t.buffs, 'slow', 90, Math.min(70, p), u.id);
          const s = this.structure(id);
          if (s && s.alive) this.addBuff(s.buffs, 'atkSlow', 90, Math.min(70, p), u.id);
          this.emit({ e: 'status', target: id, status: 'slow' });
        }
        break;
      case 'chain': {
        const first = hit[0];
        if (!first) break;
        const origin = this.unit(first) ?? this.structure(first);
        if (!origin) break;
        const chained: number[] = [];
        for (const s of this.structures) {
          if (chained.length >= 2) break;
          if (!s.alive || !s.revealed || s.team === u.team || hit.includes(s.id) || s.spec.kind === 'trap') continue;
          if (Math.abs(s.x - origin.x) <= 4000) chained.push(s.id);
        }
        for (const o of this.units) {
          if (chained.length >= 2) break;
          if (!o.alive || o.team === u.team || hit.includes(o.id)) continue;
          if (Math.abs(o.x - origin.x) <= 4000) chained.push(o.id);
        }
        if (chained.length) {
          this.emit({ e: 'chain', src: first, targets: chained });
          for (const id of chained) {
            const d = this.unitDamage(u, id, Math.floor((a.power * p) / 100));
            this.damage(id, u.id, d.dmg, { adv: d.adv, team: u.team });
          }
        }
        break;
      }
      case 'shield': {
        const amount = Math.floor((u.maxHp * p) / 100);
        u.shield += amount;
        this.emit({ e: 'shield', target: u.id, amount });
        break;
      }
      case 'drain':
        if (dealt > 0) this.heal(u, Math.floor((dealt * p) / 100));
        break;
    }
  }

  private castUltimate(team: Team): void {
    const ts = this.teams[team];
    ts.ultReady = false;
    ts.ult = 0;
    ts.ults++;
    const dir = team === 0 ? 1 : -1;
    const front = this.frontX(team);
    const x0 = front - dir * 2000;
    const x1 = front + dir * 11000;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    this.emit({ e: 'ultimate', team, x0: lo, x1: hi });
    const dmg = this.setup.teams[team].ultimate.damage;
    for (const s of this.structures) {
      if (!s.alive || s.team === team || s.spec.kind === 'trap') continue;
      if (s.x + s.radius < lo || s.x - s.radius > hi) continue;
      s.revealed = true;
      this.addBuff(s.buffs, 'stun', 45, 1, 0);
      this.damage(s.id, 0, dmg, { heavy: true, team });
    }
    for (const o of this.units) {
      if (!o.alive || o.team === team || o.x < lo || o.x > hi) continue;
      this.damage(o.id, 0, Math.floor(dmg / 2), { heavy: true, team });
    }
    for (const o of this.units) if (o.alive && o.team === team) this.heal(o, Math.floor((o.maxHp * 15) / 100));
    this.emit({ e: 'explosion', x: Math.floor((lo + hi) / 2), radius: Math.floor((hi - lo) / 2), team, big: true });
  }

  // ------------------------------------------------------------ construções

  private updateStructure(s: StructState): void {
    if (this.tick % 15 === 0) {
      const burn = this.buffPower(s.buffs, 'burn');
      if (burn > 0) {
        const src = s.buffs.find((b) => b.kind === 'burn')!.src;
        this.damage(s.id, src, burn, { team: (1 - s.team) as Team });
        if (!s.alive) return;
      }
    }
    this.tickBuffs(s.buffs);
    const kind = s.spec.kind;
    if (!TOWER_KINDS.has(kind) || s.spec.dmg <= 0) return;
    if (this.hasBuff(s.buffs, 'stun') || this.hasBuff(s.buffs, 'disabled')) return;
    if (s.atkCd > 0) {
      s.atkCd--;
      return;
    }
    // alvo: provocador ao alcance primeiro, senão o mais próximo
    let best: UnitState | null = null;
    let bestGap = 1 << 30;
    let taunter: UnitState | null = null;
    for (const u of this.units) {
      if (!u.alive || u.team === s.team) continue;
      const g = this.gapUnitStruct(u, s);
      if (g > s.spec.range || g < s.spec.minRange) continue;
      if (this.hasBuff(u.buffs, 'taunt') && (!taunter || g < this.gapUnitStruct(taunter, s))) taunter = u;
      if (g < bestGap) {
        best = u;
        bestGap = g;
      }
    }
    const target = taunter ?? best;
    if (!target) {
      s.targetId = 0;
      return;
    }
    s.targetId = target.id;
    s.lastAttackTick = this.tick;
    const atkSlow = this.buffPower(s.buffs, 'atkSlow');
    s.atkCd = Math.floor((s.spec.atkInterval * (100 + atkSlow)) / 100);
    const elem = this.teams[s.team].element;
    const adv = hasAdvantage(elem, target.spec.element);
    const dmg = Math.floor((s.spec.dmg * (adv ? ADVANTAGE_PCT : 100)) / 100);

    switch (kind) {
      case 'laser':
        this.emit({ e: 'beam', src: s.id, target: target.id, style: 'laser' });
        this.damage(target.id, s.id, dmg, { adv, team: s.team });
        break;
      case 'tesla': {
        const chain = [target.id];
        let last = target;
        let cur = dmg;
        this.damage(target.id, s.id, cur, { adv, team: s.team });
        for (let i = 1; i < Math.max(1, s.spec.chain); i++) {
          let next: UnitState | null = null;
          let ng = 1 << 30;
          for (const u of this.units) {
            if (!u.alive || u.team === s.team || chain.includes(u.id)) continue;
            const g = Math.abs(u.x - last.x);
            if (g <= 2500 && g < ng) {
              next = u;
              ng = g;
            }
          }
          if (!next) break;
          cur = Math.floor((cur * s.spec.chainFalloff) / 100);
          chain.push(next.id);
          this.damage(next.id, s.id, cur, { team: s.team });
          last = next;
        }
        this.emit({ e: 'chain', src: s.id, targets: chain });
        break;
      }
      default: {
        const style: ProjectileStyle = kind === 'cannon' ? 'cannonball' : kind === 'mortar' ? 'shell' : kind === 'frost' ? 'frost' : 'pulse';
        const homing = kind !== 'mortar';
        const dist = Math.abs(target.x - s.x);
        const speed = kind === 'mortar' ? 220 : kind === 'cannon' ? 500 : 700;
        const p: Projectile = {
          id: this.nextId++,
          team: s.team,
          src: s.id,
          style,
          targetId: target.id,
          toX: target.x,
          homing,
          ticks: Math.max(kind === 'mortar' ? 40 : 4, Math.floor(dist / speed)),
          dmg,
          splash: s.spec.splash,
          crit: false,
          adv,
          heavy: kind === 'mortar' || kind === 'cannon',
          element: elem,
          vsBuildings: 100,
          slow: s.spec.slow,
          slowTicks: s.spec.slowTicks,
          heal: false,
          atkSlow: 0,
          fx: null,
          fromStructure: true,
        };
        this.projectiles.push(p);
        this.emit({ e: 'projectile', id: p.id, src: s.id, style, fromX: s.x, toX: p.toX, ticks: p.ticks, team: s.team });
      }
    }
  }

  // ------------------------------------------------------------ projéteis

  private updateProjectiles(): void {
    const list = this.projectiles;
    this.projectiles = [];
    for (const p of list) {
      if (p.homing) {
        const t = this.unit(p.targetId) ?? this.structure(p.targetId);
        if (t && t.alive) p.toX = t.x;
      }
      p.ticks--;
      if (p.ticks > 0) {
        this.projectiles.push(p);
        continue;
      }
      this.emit({ e: 'projectileEnd', id: p.id });
      this.resolveProjectile(p);
    }
  }

  private resolveProjectile(p: Projectile): void {
    const src = this.unit(p.src);
    const hit: number[] = [];
    let dealt = 0;
    const hitOne = (id: number, amount: number) => {
      dealt += this.damage(id, p.src, amount, { crit: p.crit, adv: p.adv, heavy: p.heavy, team: p.team });
      hit.push(id);
      if (p.slow > 0) {
        const u = this.unit(id);
        if (u && u.alive) {
          this.addBuff(u.buffs, 'slow', p.slowTicks, p.slow, p.src);
          this.emit({ e: 'status', target: id, status: 'slow' });
        }
      }
      if (p.atkSlow > 0) {
        const s = this.structure(id);
        if (s && s.alive) this.addBuff(s.buffs, 'atkSlow', 60, p.atkSlow, p.src);
      }
    };
    if (p.splash > 0) {
      this.emit({ e: 'explosion', x: p.toX, radius: p.splash, team: p.team, big: p.heavy && p.splash >= 1500 });
      for (const u of this.units) {
        if (!u.alive || u.team === p.team || Math.abs(u.x - p.toX) > p.splash) continue;
        hitOne(u.id, u.id === p.targetId ? p.dmg : Math.floor((p.dmg * 70) / 100));
      }
      if (!p.fromStructure) {
        for (const s of this.structures) {
          if (!s.alive || !s.revealed || s.team === p.team || s.spec.kind === 'trap') continue;
          if (Math.abs(s.x - p.toX) > p.splash + s.radius) continue;
          hitOne(s.id, s.id === p.targetId ? p.dmg : Math.floor((p.dmg * 70) / 100));
        }
      }
    } else {
      const t = this.unit(p.targetId) ?? this.structure(p.targetId);
      if (t && t.alive) hitOne(t.id, p.dmg);
    }
    if (p.fx && src) this.applyElementFx(src, p.fx, hit, dealt);
  }

  // ------------------------------------------------------------ armadilhas

  private updateTraps(): void {
    for (const s of this.structures) {
      if (!s.alive || s.spec.kind !== 'trap') continue;
      let triggered = false;
      for (const u of this.units) {
        if (u.alive && u.team !== s.team && u.role !== 'turret' && Math.abs(u.x - s.x) <= 400) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;
      s.revealed = true;
      s.alive = false;
      this.structuresDestroyed++;
      for (const r of s.spec.refIds) this.destroyedRefs.push(r);
      this.emit({ e: 'trap', id: s.id, x: s.x });
      this.emit({ e: 'explosion', x: s.x, radius: s.spec.splash, team: s.team, big: true });
      for (const u of this.units) {
        if (!u.alive || u.team === s.team || Math.abs(u.x - s.x) > s.spec.splash) continue;
        this.damage(u.id, s.id, s.spec.dmg, { heavy: true, team: s.team });
        if (u.alive && s.spec.stunTicks > 0) {
          this.addBuff(u.buffs, 'stun', s.spec.stunTicks, 1, s.id);
          this.emit({ e: 'status', target: u.id, status: 'stun' });
        }
      }
    }
  }

  // ------------------------------------------------------------ fim

  private checkEnd(): void {
    const mode = this.setup.mode;
    const timeUp = this.tick >= this.setup.rules.durationTicks;
    const surrender0 = this.teams[0].surrendered;
    const surrender1 = this.teams[1].surrendered;
    let winner: Team | null | undefined;
    if (mode === 'raid') {
      if (!this.coreAlive(1)) winner = 0;
      else if (timeUp || surrender0) winner = 1;
    } else {
      const a = this.coreAlive(0);
      const b = this.coreAlive(1);
      if (!a && !b) winner = null;
      else if (!b) winner = 0;
      else if (!a) winner = 1;
      else if (surrender0 && surrender1) winner = null;
      else if (surrender0) winner = 1;
      else if (surrender1) winner = 0;
      else if (timeUp) {
        const ca = this.structure(this.teams[0].coreId)!;
        const cb = this.structure(this.teams[1].coreId)!;
        const pa = Math.floor((ca.hp * 1000) / ca.maxHp);
        const pb = Math.floor((cb.hp * 1000) / cb.maxHp);
        winner = pa === pb ? null : pa > pb ? 0 : 1;
      }
    }
    if (winner === undefined) return;
    this.over = true;
    this.result = this.buildResult(winner, surrender0 || surrender1);
    this.emit({ e: 'end', result: this.result });
  }

  private buildResult(winner: Team | null, surrendered: boolean): BattleResult {
    const destruction = this.destructionOf(1);
    const coreDestroyed = !this.coreAlive(1);
    const timeLeft = this.timeLeftTicks;
    let stars = 0;
    if (this.setup.mode === 'raid') {
      if (destruction >= 50) stars++;
      if (coreDestroyed) stars++;
      if (winner === 0 && timeLeft >= 60 * 30) stars++;
    } else if (winner === 0) {
      stars = 1 + (destruction >= 50 ? 1 : 0) + (timeLeft >= 60 * 30 ? 1 : 0);
    }
    return {
      winner,
      stars,
      destruction,
      coreDestroyed,
      ticks: this.tick,
      timeLeftTicks: timeLeft,
      destroyedRefIds: [...new Set(this.destroyedRefs)],
      damageDealt: [this.teams[0].dmg, this.teams[1].dmg],
      abilitiesUsed: [this.teams[0].abilities, this.teams[1].abilities],
      ultimatesUsed: [this.teams[0].ults, this.teams[1].ults],
      structuresDestroyed: this.structuresDestroyed,
      surrendered,
      hash: this.hash(),
    };
  }

  /**
   * Resultado visto por um time (duelo: o time 1 também tem estrelas,
   * destruição e dano "do seu lado"). Para o time 0 é o próprio resultado.
   */
  resultFor(team: Team): BattleResult | null {
    const r = this.result;
    if (!r || team === 0) return r;
    const other = (t: Team | null): Team | null => (t === null ? null : t === 0 ? 1 : 0);
    const winner = other(r.winner);
    const destruction = this.destructionOf(0);
    const stars = winner === 0 ? 1 + (destruction >= 50 ? 1 : 0) + (r.timeLeftTicks >= 60 * 30 ? 1 : 0) : 0;
    return {
      ...r,
      winner,
      stars,
      destruction,
      coreDestroyed: !this.coreAlive(0),
      damageDealt: [r.damageDealt[1], r.damageDealt[0]],
      abilitiesUsed: [r.abilitiesUsed[1], r.abilitiesUsed[0]],
      ultimatesUsed: [r.ultimatesUsed[1], r.ultimatesUsed[0]],
    };
  }

  /** Hash do estado inteiro (FNV-1a). Igual em qualquer máquina = sem desync. */
  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (n: number) => {
      h ^= n & 0xffff;
      h = Math.imul(h, 16777619) >>> 0;
      h ^= (n >>> 16) & 0xffff;
      h = Math.imul(h, 16777619) >>> 0;
    };
    mix(this.tick);
    for (const t of this.teams) {
      mix(t.energy);
      mix(t.ult);
      mix(t.dmg);
      for (const c of t.cards) mix(c.cd * 4 + (c.state === 'hand' ? 0 : c.state === 'field' ? 1 : 2));
    }
    for (const u of this.units) {
      mix(u.id);
      mix(u.x);
      mix(u.hp);
      mix(u.shield);
      mix(u.alive ? 1 : 0);
    }
    for (const s of this.structures) {
      mix(s.hp);
      mix(s.alive ? 1 : 0);
    }
    mix(this.projectiles.length);
    mix(this.rng.calls);
    return h >>> 0;
  }
}

/**
 * Roda uma batalha inteira sem gráficos (replay, validação no servidor,
 * saques offline). Mesma semente + mesmas jogadas = mesmo resultado.
 */
export function runBattle(setup: BattleSetup, commands: TimedCommand[] = [], maxTicks = 1 << 30): { sim: BattleSim; result: BattleResult } {
  const sim = new BattleSim(setup);
  const byTick = new Map<number, { team: Team; cmd: Command }[]>();
  for (const c of commands) {
    let list = byTick.get(c.tick);
    if (!list) byTick.set(c.tick, (list = []));
    list.push({ team: c.team, cmd: c.cmd });
  }
  while (!sim.over && sim.tick < maxTicks) sim.step(byTick.get(sim.tick) ?? []);
  return { sim, result: sim.result! };
}

export { TILE };
