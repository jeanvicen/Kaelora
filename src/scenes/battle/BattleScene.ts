import * as THREE from 'three';
import { audio, type SfxName } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import type { GestureHandlers } from '../../core/input.ts';
import type { GameScene } from '../../core/scene.ts';
import { getCharacter } from '../../content/catalog.ts';
import type { Element } from '../../meta/types.ts';
import { CharacterView } from '../../render/characterView.ts';
import { C, ELEMENT_COLORS } from '../../render/colors.ts';
import { applyTimeOfDay } from '../../render/daynight.ts';
import { createBlobShadow } from '../../render/environment.ts';
import { createBarrierLink, createBuildingView, type BuildingView } from '../../render/models/factory.ts';
import { summonDroneModel, summonTurretModel } from '../../render/models/props.ts';
import { createVoxelObject, lightUniforms } from '../../render/toon.ts';
import { buildVoxelGeometry } from '../../render/voxel.ts';
import { BattleSim } from '../../sim/battle.ts';
import type { BattleResult, BattleSetup, Command, ProjectileStyle, SimEvent, StructureKind, Team, TimedCommand } from '../../sim/types.ts';
import { BattleHud } from '../../ui/hud/battleHud.ts';
import { WorldLabels } from '../../ui/worldLabels.ts';
import { BattleEffects } from './effects.ts';
import { BattleEnvironment, ROAD_HALF } from './battleEnv.ts';

const TICK = 1 / 30;
/** Personagens um pouco menores que as construções, para ler a escala. */
const BATTLE_CHAR_SCALE = 0.85;
const LIGHT_DIR = new THREE.Vector3(0.35, 0.78, 0.55).normalize();

export type BattleKind = 'raid' | 'training' | 'revenge' | 'event' | 'duel' | 'replay' | 'defense';

export interface BattleParams {
  setup: BattleSetup;
  /** Lado controlado pelo jogador (no replay/defesa só assiste). */
  playerTeam: Team;
  kind: BattleKind;
  /** Jogadas gravadas (replays). */
  replay?: TimedCommand[];
  title: { name: string; sub: string; element: Element };
  timeOfDay: number;
  tutorial?: number;
  /** Fonte externa de jogadas (multiplayer ao vivo / lockstep). */
  external?: BattleNet;
}

/** Interface do lockstep: entrega as jogadas de cada tick e recebe as locais. */
export interface BattleNet {
  /** Jogadas confirmadas para o tick (null = ainda não chegaram; a simulação espera). */
  commandsFor(tick: number): { team: Team; cmd: Command }[] | null;
  send(cmd: Command): void;
  onHash?(tick: number, hash: number): void;
  status(): string | null;
}

export interface BattleHost {
  uiRoot: HTMLElement;
  hitStop(ms: number): void;
  slowMotion(scale: number, seconds: number): void;
  portrait(charId: number): Promise<string>;
  settings(): { shake: boolean; vibration: boolean; quality: number };
  onEnd(result: BattleResult, sim: BattleSim, params: BattleParams): void;
  onPause(): void;
}

interface UnitVis {
  id: number;
  team: Team;
  obj: THREE.Object3D;
  view: CharacterView | null;
  prevX: number;
  x: number;
  z: number;
  bob: number;
  label: ReturnType<WorldLabels['add']>;
  fill: HTMLElement;
  shieldFill: HTMLElement;
  dead: boolean;
  removeAt: number;
  height: number;
  role: 'hero' | 'drone' | 'turret';
}

interface StructVis {
  id: number;
  team: Team;
  kind: StructureKind;
  root: THREE.Object3D;
  view: BuildingView | null;
  x: number;
  z: number;
  height: number;
  width: number;
  colors: number[];
  label: ReturnType<WorldLabels['add']>;
  fill: HTMLElement;
  destroyed: boolean;
  hidden: boolean;
}

interface ProjVis {
  id: number;
  style: ProjectileStyle;
  obj: THREE.Object3D;
  fromX: number;
  fromY: number;
  fromZ: number;
  total: number;
  arc: number;
  team: Team;
}

const STRUCT_COLORS: Partial<Record<StructureKind, number[]>> = {
  core: [C.white, C.cream, C.metal, C.gold],
  barrier: [C.concrete, C.steel, C.neonCyan],
  cannon: [C.concrete, C.metal, C.metalDark, C.orange],
  laser: [C.white, C.metal, C.neonCyan],
  frost: [C.ice, C.iceDeep, C.snow, C.concrete],
  tesla: [C.metal, C.orange, C.neonYellow],
  mortar: [C.metal, C.metalDark, C.neonYellow],
  generator: [C.cream, C.glass, C.gold, C.blue],
  vault: [C.steel, C.gold, C.metalDark],
  barracks: [C.cream, C.teal, C.window],
  lab: [C.white, C.glass, C.neonGreen],
};

const PROJ_COLORS: Record<ProjectileStyle, number> = {
  bullet: 0xfff3a0,
  arrow: 0xffe14f,
  orb: 0xb45bff,
  cannonball: 0x2e3452,
  shell: 0x3a3f5c,
  frost: 0x9ffcff,
  pulse: 0x3ff6ff,
  bomb: 0x1d1b30,
  shuriken: 0xffffff,
};

export class BattleScene implements GameScene {
  readonly id = 'battle';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.3, 900);
  readonly gestures: GestureHandlers;
  private env = new BattleEnvironment();
  private effects!: BattleEffects;
  private world = new THREE.Group();
  sim!: BattleSim;
  params!: BattleParams;
  private hud: BattleHud | null = null;
  private hudLayer: HTMLElement;
  private labels: WorldLabels;
  private dmgLayer: HTMLElement;
  private dmgPool: HTMLElement[] = [];
  private units = new Map<number, UnitVis>();
  private structs = new Map<number, StructVis>();
  private projs = new Map<number, ProjVis>();
  private projPools = new Map<ProjectileStyle, THREE.Object3D[]>();
  private pending: Command[] = [];
  private acc = 0;
  private width = 1;
  private height = 1;
  private camX = 6;
  private camTargetX = 6;
  private manualUntil = 0;
  private trauma = 0;
  private shakeT = 0;
  private time = 0;
  private intro = 0;
  private ended = false;
  private endTimer = 0;
  private comboHits: number[] = [];
  private comboShown = 0;
  private comboShownAt = 0;
  private tutorialStep = 0;
  private ultCinematic = 0;
  private ultOverlay: HTMLElement | null = null;
  private v = new THREE.Vector3();
  private paused = false;
  private netWaiting = false;
  /** Depuração/testes: permite avançar muitos ticks num quadro. */
  debugBurst = 0;

  constructor(private host: BattleHost) {
    this.scene.add(this.env.group, this.world);
    this.hudLayer = document.createElement('div');
    this.hudLayer.className = 'battle-layer';
    this.labels = new WorldLabels(this.hudLayer, 'world-labels battle-labels');
    this.dmgLayer = document.createElement('div');
    this.dmgLayer.className = 'dmg-layer';
    this.hudLayer.appendChild(this.dmgLayer);
    this.gestures = {
      onDrag: (dx) => {
        this.camX -= (dx / this.width) * 14;
        this.camTargetX = this.camX;
        this.manualUntil = this.time + 2.5;
      },
      onTap: () => audio.unlock(),
    };
  }

  // ------------------------------------------------------------ ciclo de vida

  enter(params?: unknown): void {
    const p = params as BattleParams;
    this.params = p;
    this.sim = new BattleSim(p.setup);
    this.ended = false;
    this.endTimer = 0;
    this.acc = 0;
    this.pending = [];
    this.paused = false;
    this.comboHits = [];
    this.comboShown = 0;
    this.tutorialStep = p.tutorial ?? 0;
    this.time = 0;
    this.intro = 0;
    this.ultCinematic = 0;
    this.world.clear();
    this.units.clear();
    this.structs.clear();
    this.projs.clear();
    this.projPools.clear();
    this.labels.clear();
    const q = this.host.settings().quality;
    this.effects = new BattleEffects(q);
    this.world.add(this.effects.group);
    const L = p.setup.roadLength / 1000;
    const def = p.setup.teams[1].structures;
    const islandStart = def.length ? Math.max(8, def[0].x / 1000 - 4) : L - 12;
    this.env.build(L, p.setup.teams[0].element, p.setup.teams[1].element, p.setup.mode === 'duel' ? L / 2 + 4 : islandStart, p.setup.seed % 9973);
    for (const s of this.sim.structures) this.addStructure(s.id);
    this.camX = p.playerTeam === 0 ? 6 : L - 6;
    this.camTargetX = this.camX;
    this.host.uiRoot.appendChild(this.hudLayer);
    const watch = p.kind === 'replay' || p.kind === 'defense';
    if (!watch) {
      this.hud = new BattleHud(
        {
          deploy: (slot) => this.issue({ t: 'deploy', slot }),
          ability: (slot) => this.issue({ t: 'ability', slot }),
          ultimate: () => this.issue({ t: 'ultimate' }),
          pause: () => this.host.onPause(),
          portrait: (id) => this.host.portrait(id),
        },
        this.sim,
        p.playerTeam,
        { name: p.title.name, sub: p.title.sub, element: p.title.element },
      );
      this.hudLayer.appendChild(this.hud.el);
      this.hud.showBanner(p.kind === 'duel' ? 'DUELO!' : p.kind === 'training' ? 'TREINO!' : 'INVADIR!', 'big', 1400);
    } else {
      this.hud = null;
      const banner = document.createElement('div');
      banner.className = 'replay-badge stroke-sm';
      banner.textContent = p.kind === 'defense' ? 'DEFESA DA SUA CIDADE • REPLAY' : 'REPLAY';
      this.hudLayer.appendChild(banner);
    }
    audio.setMusic('battle');
    audio.setAmbience('battle');
    applyTimeOfDay(p.timeOfDay);
    this.updateTutorial();
  }

  exit(): void {
    this.hudLayer.remove();
    this.hud?.el.remove();
    this.hud = null;
    this.ultOverlay?.remove();
    this.ultOverlay = null;
    this.labels.clear();
    for (const u of this.units.values()) u.view?.dispose();
    this.world.clear();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.4 ? 42 : 32;
    this.camera.updateProjectionMatrix();
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Jogada do jogador: entra no próximo tick (ou vai para a rede no duelo). */
  issue(cmd: Command): void {
    if (this.ended || this.paused) return;
    const team = this.params.playerTeam;
    if (cmd.t === 'deploy' && !this.sim.canDeploy(team, cmd.slot)) {
      const c = this.sim.teams[team].cards[cmd.slot];
      if (c?.state === 'hand') audio.play('error', { volume: 0.5 });
      return;
    }
    if (cmd.t === 'ability' && !this.sim.canUseAbility(team, cmd.slot)) return;
    if (cmd.t === 'ultimate' && !this.sim.teams[team].ultReady) return;
    if (this.params.external) this.params.external.send(cmd);
    else this.pending.push(cmd);
    if (cmd.t === 'deploy') vibrate(8);
  }

  surrender(): void {
    if (this.params.external) this.params.external.send({ t: 'surrender' });
    else this.pending.push({ t: 'surrender' });
    this.paused = false;
  }

  // ------------------------------------------------------------ entidades

  private laneOf(id: number): number {
    return (((id * 37) % 7) - 3) * 0.22;
  }

  private makeHpLabel(kind: 'unit' | 'struct', team: Team): { el: HTMLElement; fill: HTMLElement; shield: HTMLElement } {
    const fill = document.createElement('i');
    const shield = document.createElement('b');
    const el = document.createElement('div');
    el.className = `hp ${kind} ${team === this.params.playerTeam ? 'ally' : 'enemy'}`;
    el.append(fill, shield);
    return { el, fill, shield };
  }

  private addStructure(id: number): void {
    const s = this.sim.structure(id)!;
    const kind = s.spec.kind;
    const team = s.team;
    const element = this.params.setup.teams[team].element;
    let root: THREE.Object3D;
    let view: BuildingView | null = null;
    let height = 1.5;
    let width = 1.6;
    const x = s.x / 1000;
    let z = -2.6;
    if (kind === 'barrier') {
      const g = new THREE.Group();
      const posts = 3;
      for (let i = 0; i < posts; i++) {
        const v = createBuildingView('barrier', s.spec.level, element, i);
        v.root.position.set(0, 0, -ROAD_HALF + 0.5 + i * ((ROAD_HALF * 2 - 1) / (posts - 1)));
        g.add(v.root);
        if (!view) view = v;
        if (i < posts - 1) {
          const link = createBarrierLink(s.spec.level);
          link.rotation.y = Math.PI / 2;
          link.position.set(0, 0, v.root.position.z + (ROAD_HALF * 2 - 1) / (posts - 1) / 2);
          link.scale.z = 1.4;
          g.add(link);
        }
      }
      root = g;
      z = 0;
      height = 1.4;
      width = 1;
    } else {
      view = createBuildingView(kind === 'gate' ? 'core' : (kind as never), s.spec.level, element, id);
      root = view.root;
      height = view.height;
      if (kind === 'core') {
        z = -0.6;
        width = 3;
      } else if (kind === 'trap') {
        z = 0;
        width = 0.8;
      } else if (kind === 'barracks' || kind === 'lab') {
        z = -3.6;
        width = 3;
      } else if (kind === 'generator' || kind === 'vault') {
        z = -3;
        width = 2;
      }
      // no duelo o time da esquerda tem as construções viradas para a direita
      if (this.params.setup.mode === 'duel' && team === 0) root.rotation.y = Math.PI;
    }
    root.position.set(x, 0, z);
    if (kind !== 'barrier' && kind !== 'trap') {
      const sh = createBlobShadow(width * 0.6, 0.25);
      root.add(sh);
    }
    this.world.add(root);
    const hidden = kind === 'trap' && team !== this.params.playerTeam;
    root.visible = !hidden;
    const { el, fill } = this.makeHpLabel('struct', team);
    if (kind === 'core') el.classList.add('core');
    const label = this.labels.add(el, new THREE.Vector3(x, height + 0.35, z), 0);
    this.labels.setVisible(label, !hidden && kind !== 'trap');
    this.structs.set(id, { id, team, kind, root, view, x, z, height, width, colors: STRUCT_COLORS[kind] ?? [C.concrete, C.metal], label, fill, destroyed: false, hidden });
  }

  private addUnit(id: number): void {
    const u = this.sim.unit(id);
    if (!u) return;
    let obj: THREE.Object3D;
    let view: CharacterView | null = null;
    let height = 1.2;
    const accent = getCharacter(u.spec.charId).look.accent;
    if (u.role === 'hero') {
      view = new CharacterView(getCharacter(u.spec.charId));
      view.face(u.team === 0 ? 1 : -1);
      obj = view.root;
      height = view.height;
    } else {
      const model = u.role === 'drone' ? summonDroneModel(accent) : summonTurretModel(accent);
      const geo = buildVoxelGeometry(model, { scale: 1 / 12, pivot: 'bottom' });
      const g = new THREE.Group();
      const body = createVoxelObject(geo);
      g.add(body);
      g.add(createBlobShadow(0.35, 0.3));
      if (u.role === 'turret') body.rotation.y = u.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      obj = g;
      height = u.role === 'drone' ? 1.2 : 0.9;
    }
    const z = this.laneOf(id);
    obj.position.set(u.x / 1000, 0, z);
    this.world.add(obj);
    const { el, fill, shield } = this.makeHpLabel('unit', u.team);
    const label = this.labels.add(el, new THREE.Vector3(u.x / 1000, height + 0.2, z), 0);
    this.units.set(id, { id, team: u.team, obj, view, prevX: u.x, x: u.x, z, bob: Math.random() * 6, label, fill, shieldFill: shield, dead: false, removeAt: 0, height, role: u.role });
  }

  // ------------------------------------------------------------ projéteis

  private projObject(style: ProjectileStyle): THREE.Object3D {
    const pool = this.projPools.get(style) ?? [];
    this.projPools.set(style, pool);
    const free = pool.find((o) => !o.visible);
    if (free) {
      free.visible = true;
      return free;
    }
    let obj: THREE.Object3D;
    const color = PROJ_COLORS[style];
    if (style === 'bullet' || style === 'arrow') {
      obj = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true }));
    } else if (style === 'cannonball' || style === 'shell' || style === 'bomb') {
      const g = new THREE.Group();
      const size = style === 'shell' ? 0.34 : 0.24;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color })));
      const spark = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      spark.position.y = size * 0.7;
      g.add(spark);
      obj = g;
    } else {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true });
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(style === 'pulse' ? 0.16 : 0.13, 0), mat));
      obj = g;
    }
    this.world.add(obj);
    pool.push(obj);
    return obj;
  }

  private heightOfEntity(id: number): { y: number; z: number; x: number } | null {
    const u = this.units.get(id);
    if (u) return { y: u.height * 0.55 * BATTLE_CHAR_SCALE, z: u.z, x: u.x / 1000 };
    const s = this.structs.get(id);
    if (s) return { y: Math.min(2.6, s.height * 0.7), z: s.z * 0.6, x: s.x };
    return null;
  }

  // ------------------------------------------------------------ eventos → visual

  private handle(ev: SimEvent): void {
    const P = this.params.playerTeam;
    switch (ev.e) {
      case 'spawn': {
        this.addUnit(ev.id);
        const u = this.units.get(ev.id);
        if (!u) break;
        const x = u.x / 1000;
        this.effects.shockwave(x, u.z, 1.2, ev.team === P ? 0x3ff6ff : 0xff4f5e, 0.4);
        this.effects.flash(new THREE.Vector3(x, 0.8, u.z), 0xffffff, 2, 0.25);
        const col = new THREE.Color(ELEMENT_COLORS[this.sim.unit(ev.id)?.spec.element ?? 'mare'].glow);
        this.effects.sparks.burst(x, 0.4, u.z, 14, col, 3, 0.18, 0.6, { up: 2, gravity: 4 });
        if (!ev.summon) {
          audio.play('deploy', { pan: this.pan(x) });
          audio.voice(this.sim.unit(ev.id)!.spec.charId, 'deploy', 0.8);
          if (u.view) u.view.scale = 0.2;
          if (ev.team === P) this.hud?.bumpCard(ev.slot);
        } else audio.play('summon', { volume: 0.6, pan: this.pan(x) });
        if (ev.team === P) this.advanceTutorial('deployed');
        break;
      }
      case 'attack': {
        const u = this.units.get(ev.src);
        if (u?.view) u.view.attack();
        if (u && ev.style === 'ranged') {
          const unit = this.sim.unit(ev.src);
          const cls = unit?.spec.cls;
          const s: SfxName = cls === 'atirador' || u.role !== 'hero' ? 'shoot' : cls === 'bombardeiro' ? 'mortar' : 'magic';
          audio.play(s, { volume: 0.45, pan: this.pan(u.x / 1000) });
        }
        break;
      }
      case 'projectile': {
        const from = this.heightOfEntity(ev.src);
        const obj = this.projObject(ev.style);
        const arc = ev.style === 'shell' ? 4.5 : ev.style === 'cannonball' ? 1.4 : ev.style === 'bomb' ? 2 : ev.style === 'orb' ? 0.3 : 0;
        const p: ProjVis = { id: ev.id, style: ev.style, obj, fromX: ev.fromX / 1000, fromY: from?.y ?? 1, fromZ: from?.z ?? 0, total: ev.ticks, arc, team: ev.team };
        obj.position.set(p.fromX, p.fromY, p.fromZ);
        this.projs.set(ev.id, p);
        const s = this.structs.get(ev.src);
        if (s) {
          const kind = s.kind;
          const sfx: SfxName = kind === 'cannon' ? 'cannon' : kind === 'mortar' ? 'mortar' : kind === 'frost' ? 'frost' : 'magic';
          audio.play(sfx, { volume: 0.55, pan: this.pan(s.x) });
          this.aimTower(s, ev.toX / 1000);
          this.effects.flash(new THREE.Vector3(s.x, Math.min(2.6, s.height * 0.75), s.z), kind === 'frost' ? 0x9ffcff : 0xffd23f, 0.9, 0.12);
        }
        break;
      }
      case 'projectileEnd': {
        const p = this.projs.get(ev.id);
        if (p) {
          p.obj.visible = false;
          this.projs.delete(ev.id);
        }
        break;
      }
      case 'beam': {
        const a = this.heightOfEntity(ev.src);
        const b = this.heightOfEntity(ev.target);
        if (!a || !b) break;
        const color = ev.style === 'heal' ? 0x5bff8a : ev.style === 'drain' ? 0xb45bff : 0x3ff6ff;
        this.effects.beam(new THREE.Vector3(a.x, a.y + (ev.style === 'laser' ? 0.6 : 0), a.z), new THREE.Vector3(b.x, b.y, b.z), color, ev.style === 'laser' ? 0.06 : 0.05);
        if (ev.style === 'laser') {
          audio.play('laser', { volume: 0.4, pan: this.pan(a.x) });
          const s = this.structs.get(ev.src);
          if (s) this.aimTower(s, b.x);
        } else audio.play('heal', { volume: 0.3 });
        break;
      }
      case 'chain': {
        const pts: THREE.Vector3[] = [];
        const src = this.heightOfEntity(ev.src);
        if (src) pts.push(new THREE.Vector3(src.x, src.y + 0.8, src.z));
        for (const t of ev.targets) {
          const p = this.heightOfEntity(t);
          if (p) pts.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        this.effects.lightning(pts);
        audio.play('tesla', { volume: 0.6 });
        break;
      }
      case 'hit':
        this.onHit(ev);
        break;
      case 'heal': {
        const p = this.heightOfEntity(ev.target);
        if (p) this.number(p.x, p.y + 0.6, p.z, `+${ev.amount}`, 'heal');
        break;
      }
      case 'shield': {
        const id = ev.target;
        this.effects.shield(() => {
          const u = this.units.get(id);
          return u && !u.dead ? u.obj.position : null;
        }, 0x8fd8ff, 2.2);
        audio.play('shield', { volume: 0.6 });
        break;
      }
      case 'status': {
        const p = this.heightOfEntity(ev.target);
        if (!p) break;
        const colors: Record<string, number> = { slow: 0x9ffcff, stun: 0xffe14f, burn: 0xff8a3d, buff: 0x5bff8a, taunt: 0xff4f5e, disabled: 0xb9c3de };
        const col = new THREE.Color(colors[ev.status] ?? 0xffffff);
        this.effects.sparks.burst(p.x, p.y + 0.3, p.z, 8, col, 1.6, 0.14, 0.6, { up: 1.5 });
        if (ev.status === 'disabled') this.number(p.x, p.y + 0.9, p.z, 'PANE!', 'status');
        if (ev.status === 'stun') this.number(p.x, p.y + 0.9, p.z, 'ATORDOADO', 'status');
        break;
      }
      case 'death': {
        const u = this.units.get(ev.id);
        if (!u) break;
        u.dead = true;
        u.removeAt = this.time + 1.4;
        this.labels.setVisible(u.label, false);
        u.view?.die();
        this.effects.sparks.burst(ev.x / 1000, 0.6, u.z, 12, new THREE.Color(0xffffff), 2.4, 0.2, 0.7, { up: 1 });
        audio.play('hit', { pitch: 0.7, volume: 0.6 });
        if (u.view) audio.voice(u.view.def.id, 'death', 0.7);
        break;
      }
      case 'destroyed':
        this.onDestroyed(ev);
        break;
      case 'ability': {
        const u = this.units.get(ev.id);
        const unit = this.sim.unit(ev.id);
        if (u?.view) u.view.ability();
        if (u && unit) {
          const def = getCharacter(unit.spec.charId);
          this.number(u.x / 1000, u.height + 1, u.z, def.ability.name + '!', 'ability', ELEMENT_COLORS[def.element].css);
          audio.play('ability', { pan: this.pan(u.x / 1000) });
          audio.voice(def.id, 'ability');
          this.effects.shockwave(u.x / 1000, u.z, 2.2, ELEMENT_COLORS[def.element].glow, 0.5);
          this.host.hitStop(45);
          this.addTrauma(0.15);
        }
        if (ev.team === P) this.advanceTutorial('ability');
        break;
      }
      case 'ultimateReady':
        if (ev.team === P) {
          audio.play('ultimateReady');
          this.advanceTutorial('ultReady');
        }
        break;
      case 'ultimate':
        this.playUltimate(ev);
        break;
      case 'trap': {
        const s = this.structs.get(ev.id);
        if (s) {
          s.root.visible = true;
          s.hidden = false;
        }
        this.number(ev.x / 1000, 1.6, 0, 'ARMADILHA!', 'status');
        audio.play('trap');
        this.addTrauma(0.45);
        this.host.hitStop(60);
        if (this.host.settings().vibration) vibrate(30);
        break;
      }
      case 'explosion': {
        const x = ev.x / 1000;
        const colors = [0xff8a3d, 0xffd23f, 0x5a4a6a];
        this.effects.explosion(x, 0.3, 0, ev.radius / 1000, colors, ev.big);
        audio.play(ev.big ? 'explosion' : 'cannon', { volume: ev.big ? 0.8 : 0.4, pan: this.pan(x) });
        if (ev.big) this.addTrauma(0.25);
        break;
      }
      case 'frenzy':
        this.hud?.showBanner('FRENESI! ENERGIA 2×', 'frenzy', 2200);
        audio.play('frenzy');
        break;
      case 'cardReady':
        if (ev.team === P) {
          this.hud?.bumpCard(ev.slot);
          audio.play('energy', { volume: 0.5 });
        }
        break;
      case 'end':
        this.onEnd(ev.result);
        break;
    }
  }

  private onHit(ev: Extract<SimEvent, { e: 'hit' }>): void {
    const P = this.params.playerTeam;
    const p = this.heightOfEntity(ev.target);
    if (!p) return;
    const targetUnit = this.units.get(ev.target);
    const targetStruct = this.structs.get(ev.target);
    if (targetUnit?.view) targetUnit.view.hurt(ev.crit ? 0xffe14f : 0xffffff);
    if (targetStruct?.view) {
      targetStruct.view.material.uniforms.uFlash.value.set(1, 1, 1, 0.75);
      targetStruct.root.userData.shake = 0.18;
    }
    const kind = ev.crit ? 'crit' : ev.adv ? 'adv' : targetUnit && targetUnit.team === P ? 'hurt' : 'dmg';
    this.number(p.x, p.y + 0.5, p.z, `${ev.dmg}${ev.crit ? '!' : ''}`, kind);
    const attackerIsPlayer = (this.units.get(ev.src)?.team ?? (this.structs.get(ev.src)?.team ?? -1)) === P || ev.src === 0;
    if (attackerIsPlayer) {
      // combo = rajada: golpes do jogador no último segundo
      this.comboHits.push(this.time);
      while (this.comboHits.length && this.time - this.comboHits[0] > 1) this.comboHits.shift();
      const n = this.comboHits.length;
      if (n < 5) this.comboShown = 0;
      else if (n >= 8 && n > this.comboShown + 2 && this.time - this.comboShownAt > 0.35) {
        this.comboShown = n;
        this.comboShownAt = this.time;
        this.hud?.showCombo(n);
        audio.cheer(0.4);
      }
    }
    // tremor proporcional ao dano
    const maxHp = targetStruct ? (this.sim.structure(ev.target)?.maxHp ?? 1000) : (this.sim.unit(ev.target)?.maxHp ?? 1000);
    const frac = Math.min(1, ev.dmg / Math.max(1, maxHp));
    this.addTrauma(frac * (ev.heavy ? 0.9 : 0.35));
    if (ev.heavy || ev.crit) {
      this.host.hitStop(ev.crit ? 55 : 45);
      audio.play(ev.crit ? 'crit' : 'heavyHit', { pan: this.pan(p.x), volume: 0.8 });
      if (this.host.settings().vibration) vibrate(12);
    } else audio.play('hit', { pan: this.pan(p.x), volume: 0.4 });
    this.effects.sparks.burst(p.x, p.y, p.z + 0.3, ev.crit ? 10 : 5, sparkColor.setHex(ev.crit ? 0xffe14f : 0xfff6d6), 2.6, 0.12, 0.35, { gravity: 6 });
  }

  private onDestroyed(ev: Extract<SimEvent, { e: 'destroyed' }>): void {
    const s = this.structs.get(ev.id);
    if (!s || s.destroyed) return;
    s.destroyed = true;
    this.labels.setVisible(s.label, false);
    const isCore = ev.kind === 'core';
    this.effects.collapse(s.x, s.z, s.width, Math.max(0.8, s.height), s.colors);
    this.effects.explosion(s.x, 0.5, s.z, s.width * 0.6, s.colors, true);
    // vira escombros: afunda e escurece
    s.root.userData.sink = 1;
    if (s.view) s.view.material.uniforms.uTint.value.set(0.2, 0.18, 0.25, 0.8);
    audio.play(isCore ? 'bigExplosion' : 'destroy', { pan: this.pan(s.x) });
    audio.cheer(isCore ? 1.4 : 0.6);
    this.addTrauma(isCore ? 1 : 0.6);
    this.host.hitStop(isCore ? 80 : 60);
    if (this.host.settings().vibration) vibrate(isCore ? [60, 40, 140] : 25);
    if (isCore) {
      this.host.slowMotion(0.25, 1);
      this.effects.explosion(s.x, 1.5, s.z, 3, [0xffffff, ELEMENT_COLORS[this.params.setup.teams[ev.team].element].glow, 0xffd23f], true);
      this.effects.shockwave(s.x, s.z, 9, 0xffffff, 1.2);
      this.flashScreen('#ffffff', 420);
      this.hud?.showBanner('NÚCLEO DESTRUÍDO!', 'win', 2400);
      this.camTargetX = s.x - 3;
      this.manualUntil = this.time + 3;
    }
  }

  private playUltimate(ev: Extract<SimEvent, { e: 'ultimate' }>): void {
    const team = ev.team;
    this.host.slowMotion(0.3, 1);
    audio.play('ultimate');
    audio.duckMusic(0.3, 2);
    this.ultCinematic = 1.6;
    const el = this.params.setup.teams[team].element;
    const color = ELEMENT_COLORS[el];
    const overlay = document.createElement('div');
    overlay.className = 'ult-overlay';
    overlay.style.setProperty('--ultc', color.css);
    overlay.innerHTML = `<div class="ult-lines"></div><div class="ult-title stroke">TEMPESTADE ${el === 'mare' ? 'DAS MARÉS' : el.toUpperCase()}!</div>`;
    this.hudLayer.appendChild(overlay);
    this.ultOverlay = overlay;
    setTimeout(() => {
      overlay.remove();
      if (this.ultOverlay === overlay) this.ultOverlay = null;
    }, 1700);
    // chuva de meteoros na janela do ataque
    const x0 = ev.x0 / 1000;
    const x1 = ev.x1 / 1000;
    for (let i = 0; i < 26; i++) {
      const x = x0 + Math.random() * (x1 - x0);
      const c = new THREE.Color(i % 2 ? color.glow : 0xffffff);
      this.effects.sparks.emit(x - 2, 9 + Math.random() * 4, (Math.random() - 0.5) * 2, 6, -16, 0, c, 0.5, 0.6, { drag: 0 });
    }
    this.effects.shockwave((x0 + x1) / 2, 0, (x1 - x0) / 2, color.glow, 1);
    this.camTargetX = (x0 + x1) / 2 - 2;
    this.manualUntil = this.time + 1.5;
    this.addTrauma(0.8);
    if (this.host.settings().vibration) vibrate([40, 30, 80]);
    if (team === this.params.playerTeam) this.advanceTutorial('ultimate');
  }

  private onEnd(result: BattleResult): void {
    this.ended = true;
    this.endTimer = result.coreDestroyed ? 2.6 : 1.8;
    if (this.hud) this.hud.interactive = false;
    this.hud?.showHint(null);
    const P = this.params.playerTeam;
    const won = result.winner === P;
    if (!result.coreDestroyed) this.hud?.showBanner(result.surrendered ? 'DESISTÊNCIA' : won ? 'VITÓRIA!' : 'TEMPO ESGOTADO!', won ? 'win' : 'lose', 2000);
    for (const u of this.units.values()) if (!u.dead && u.view && u.team === result.winner) u.view.state = 'celebrate';
    audio.play(won ? 'victory' : 'defeat');
    if (won && this.host.settings().vibration) vibrate([30, 50, 30, 50, 120]);
  }

  // ------------------------------------------------------------ juice

  private addTrauma(t: number): void {
    if (!this.host.settings().shake) return;
    this.trauma = Math.min(1, this.trauma + t);
  }

  private pan(x: number): number {
    return Math.max(-1, Math.min(1, (x - this.camX) / 9));
  }

  private number(x: number, y: number, z: number, text: string, kind: 'dmg' | 'crit' | 'adv' | 'hurt' | 'heal' | 'ability' | 'status', color?: string): void {
    this.v.set(x + (Math.random() - 0.5) * 0.3, y, z).project(this.camera);
    if (this.v.z > 1) return;
    const sx = (this.v.x * 0.5 + 0.5) * this.width;
    const sy = (-this.v.y * 0.5 + 0.5) * this.height;
    let el = this.dmgPool.find((e) => !e.isConnected);
    if (!el) {
      el = document.createElement('div');
      this.dmgPool.push(el);
    }
    el.className = `dmg-num stroke ${kind}`;
    el.textContent = text;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color ?? '';
    this.dmgLayer.appendChild(el);
    const life = kind === 'ability' ? 1200 : kind === 'crit' ? 900 : 750;
    const node = el;
    setTimeout(() => node.remove(), life);
    if (this.dmgLayer.childElementCount > 36) this.dmgLayer.firstElementChild?.remove();
  }

  private flashScreen(color: string, ms: number): void {
    const el = document.createElement('div');
    el.className = 'screen-flash';
    el.style.background = color;
    el.style.animationDuration = `${ms}ms`;
    this.hudLayer.appendChild(el);
    setTimeout(() => el.remove(), ms + 30);
  }

  private aimTower(s: StructVis, targetX: number): void {
    if (!s.view) return;
    for (const p of s.view.parts) if (p.motion === 'aim') p.aimTarget = Math.atan2(targetX - s.x, -s.z + 0.5);
  }

  // ------------------------------------------------------------ tutorial

  private updateTutorial(): void {
    if (!this.hud) return;
    const step = this.tutorialStep;
    if (step <= 0 || this.params.kind === 'replay') return this.hud.showHint(null);
    if (step === 1) this.hud.showHint('Toque numa carta para soltar o personagem na estrada!', 'cards');
  }

  private advanceTutorial(what: 'deployed' | 'ability' | 'ultReady' | 'ultimate'): void {
    if (!this.hud || this.tutorialStep <= 0) return;
    if (what === 'deployed' && this.tutorialStep === 1) {
      this.tutorialStep = 2;
      setTimeout(() => {
        if (this.tutorialStep !== 2 || !this.hud) return;
        const slot = this.sim.teams[this.params.playerTeam].cards.findIndex((c) => c.state === 'field');
        this.hud.showHint('Quando o anel encher, toque no retrato para usar a HABILIDADE!', 'card', Math.max(0, slot));
      }, 2600);
    } else if (what === 'ability' && this.tutorialStep === 2) {
      this.tutorialStep = 3;
      this.hud.showHint('Isso! A energia recarrega sozinha: continue soltando cartas.', 'center');
      setTimeout(() => this.tutorialStep === 3 && this.hud?.showHint(null), 3200);
    } else if (what === 'ultReady' && this.tutorialStep >= 2) {
      this.tutorialStep = 4;
      this.hud.showHint('ULTIMATE pronta! Toque para um ataque devastador!', 'ult');
    } else if (what === 'ultimate' && this.tutorialStep === 4) {
      this.tutorialStep = 5;
      this.hud.showHint(null);
    }
  }

  // ------------------------------------------------------------ quadro

  update(dt: number, _time: number, rawDt: number): void {
    this.time += rawDt;
    this.intro = Math.min(1, this.intro + rawDt / 0.7);
    // simulação em passo fixo
    if (!this.ended && !this.paused) {
      this.acc += dt;
      let steps = 0;
      if (this.debugBurst > 0) {
        this.acc += this.debugBurst * TICK;
        this.debugBurst = 0;
      }
      const maxSteps = this.acc > TICK * 8 ? 400 : 4;
      while (this.acc >= TICK && steps < maxSteps && !this.sim.over) {
        let cmds: { team: Team; cmd: Command }[] = [];
        if (this.params.external) {
          const got = this.params.external.commandsFor(this.sim.tick);
          if (!got) {
            this.netWaiting = true;
            this.acc = Math.min(this.acc, TICK * 2);
            break;
          }
          this.netWaiting = false;
          cmds = got;
        } else if (this.params.replay) {
          cmds = this.params.replay.filter((c) => c.tick === this.sim.tick).map((c) => ({ team: c.team, cmd: c.cmd }));
        } else {
          cmds = this.pending.map((cmd) => ({ team: this.params.playerTeam, cmd }));
          this.pending = [];
        }
        for (const u of this.units.values()) u.prevX = u.x;
        const events = this.sim.step(cmds);
        for (const u of this.units.values()) {
          const su = this.sim.unit(u.id);
          if (su) u.x = su.x;
        }
        for (const ev of events) this.handle(ev);
        if (this.params.external?.onHash && this.sim.tick % 30 === 0) this.params.external.onHash(this.sim.tick, this.sim.hash());
        this.acc -= TICK;
        steps++;
      }
      if (steps >= maxSteps) this.acc = Math.min(this.acc, TICK);
    }
    if (this.ended) {
      this.endTimer -= rawDt;
      if (this.endTimer <= 0 && this.sim.result) {
        const r = this.sim.result;
        this.endTimer = Infinity;
        this.host.onEnd(r, this.sim, this.params);
      }
    }
    const alpha = Math.min(1, this.acc / TICK);

    // personagens
    for (const u of this.units.values()) {
      const su = this.sim.unit(u.id);
      const x = (u.prevX + (u.x - u.prevX) * alpha) / 1000;
      u.obj.position.x = x;
      u.label.pos.set(x, u.height * BATTLE_CHAR_SCALE + 0.25, u.z);
      if (u.view) {
        if (!u.dead && su) u.view.state = u.view.state === 'celebrate' ? 'celebrate' : su.moving ? 'walk' : 'idle';
        u.view.scale += (BATTLE_CHAR_SCALE - u.view.scale) * Math.min(1, dt * 10);
        u.view.update(dt);
      } else {
        u.bob += dt * 4;
        if (u.role === 'drone') u.obj.position.y = 0.55 + Math.sin(u.bob) * 0.12;
      }
      if (su) {
        u.fill.style.width = `${Math.max(0, (su.hp / su.maxHp) * 100)}%`;
        u.shieldFill.style.width = su.shield > 0 ? `${Math.min(100, (su.shield / su.maxHp) * 100)}%` : '0';
      }
      if (u.dead && this.time > u.removeAt) {
        this.world.remove(u.obj);
        this.labels.remove(u.label);
        u.view?.dispose();
        this.units.delete(u.id);
      }
    }
    // construções
    for (const s of this.structs.values()) {
      const ss = this.sim.structure(s.id);
      if (ss && !s.destroyed) s.fill.style.width = `${Math.max(0, (ss.hp / ss.maxHp) * 100)}%`;
      if (s.view) {
        const u = s.view.material.uniforms.uFlash.value;
        u.w = Math.max(0, u.w - dt * 5);
        for (const part of s.view.parts) {
          if (part.motion === 'aim') {
            const target = part.aimTarget ?? 0;
            let d = target - part.obj.rotation.y;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            part.obj.rotation.y += d * Math.min(1, dt * 10);
          } else if (part.motion === 'spinBob' || part.motion === 'spin') part.obj.rotation.y += dt;
          else if (part.motion === 'counterSpin') part.obj.rotation.y -= dt * 0.6;
          else if (part.motion === 'bob') part.obj.position.y = part.baseY + Math.sin(this.time * 2.2) * 0.06;
        }
      }
      const shake = (s.root.userData.shake as number | undefined) ?? 0;
      if (shake > 0) {
        s.root.userData.shake = Math.max(0, shake - dt);
        s.root.position.x = s.x + Math.sin(this.time * 70) * shake * 0.25;
      } else s.root.position.x = s.x;
      const sink = s.root.userData.sink as number | undefined;
      if (sink !== undefined && sink > 0) {
        s.root.userData.sink = Math.max(0, sink - dt * 0.8);
        s.root.position.y = -(1 - sink) * Math.max(0.6, s.height * 0.75);
        s.root.scale.y = 0.4 + sink * 0.6;
      }
    }
    // projéteis
    const live = new Map<number, { toX: number; ticks: number; targetId: number }>();
    for (const p of this.sim.projectiles) live.set(p.id, { toX: p.toX, ticks: p.ticks, targetId: p.targetId });
    for (const p of this.projs.values()) {
      const lp = live.get(p.id);
      if (!lp) continue;
      const k = Math.min(1, Math.max(0, (p.total - lp.ticks + alpha) / p.total));
      const target = this.heightOfEntity(lp.targetId);
      const toX = lp.toX / 1000;
      const toY = target?.y ?? 0.4;
      const toZ = target?.z ?? 0;
      const x = p.fromX + (toX - p.fromX) * k;
      const y = p.fromY + (toY - p.fromY) * k + Math.sin(k * Math.PI) * p.arc;
      const z = p.fromZ + (toZ - p.fromZ) * k;
      p.obj.rotation.z = Math.atan2(toY - p.fromY + Math.cos(k * Math.PI) * p.arc * Math.PI, toX - p.fromX);
      p.obj.position.set(x, y, z);
      if (p.style === 'shell' || p.style === 'bomb' || p.style === 'cannonball') p.obj.rotation.x += dt * 8;
      if (p.style === 'orb' || p.style === 'pulse' || p.style === 'frost') {
        if (Math.random() < 0.5) this.effects.sparks.emit(x, y, z, 0, 0.3, 0, sparkColor.setHex(PROJ_COLORS[p.style]), 0.18, 0.3);
      }
    }
    this.effects.update(dt);
    this.env.update(dt);

    // câmera: segue a frente do jogador
    const P = this.params.playerTeam;
    const L = this.params.setup.roadLength / 1000;
    if (this.time > this.manualUntil) {
      const front = this.sim.frontX(P) / 1000;
      const anyUnit = [...this.units.values()].some((u) => u.team === P && !u.dead);
      const watchTeam = this.params.kind === 'defense' || this.params.kind === 'replay' ? (P === 0 ? 1 : 0) : P;
      const wf = this.sim.frontX(watchTeam as Team) / 1000;
      if (this.params.kind === 'defense') this.camTargetX = wf + 3;
      else if (anyUnit) this.camTargetX = P === 0 ? front + 4.5 : front - 4.5;
      else this.camTargetX = P === 0 ? 6 : L - 6;
    }
    this.camTargetX = Math.max(5, Math.min(L - 4, this.camTargetX));
    this.camX += (this.camTargetX - this.camX) * Math.min(1, rawDt * 2.2);
    this.camX = Math.max(4, Math.min(L - 3, this.camX));
    const k = 1 - Math.pow(1 - this.intro, 3);
    const camY = 3.9 + (1 - k) * 24;
    const camZ = 15 - (1 - k) * 8;
    this.camera.position.set(this.camX - (1 - k) * 4, camY, camZ);
    // mira abaixo da estrada para ela ficar acima das cartas
    this.camera.lookAt(this.camX, -0.35 - (1 - k) * 0.5, -1.5);
    if (this.trauma > 0) {
      this.shakeT += rawDt * 45;
      const s = this.trauma * this.trauma * 0.32;
      this.camera.position.x += Math.sin(this.shakeT * 1.31) * s;
      this.camera.position.y += Math.sin(this.shakeT * 1.73 + 1.3) * s;
      this.camera.rotation.z += Math.sin(this.shakeT * 0.97) * s * 0.03;
      this.trauma = Math.max(0, this.trauma - rawDt * 1.8);
    }
    if (this.ultCinematic > 0) {
      this.ultCinematic -= rawDt;
      this.camera.position.z -= Math.sin(Math.min(1, this.ultCinematic / 1.6) * Math.PI) * 2.5;
    }
    lightUniforms.uSunDir.value.copy(LIGHT_DIR);
    lightUniforms.uFogNear.value = 40;
    lightUniforms.uFogFar.value = 190;
    this.hud?.update(this.sim);
    if (this.hud) this.hud.el.classList.toggle('net-wait', this.netWaiting);
    this.labels.update(this.camera, this.width, this.height);
  }
}

const sparkColor = new THREE.Color();
