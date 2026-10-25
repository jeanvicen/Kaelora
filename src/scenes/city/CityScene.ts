import * as THREE from 'three';
import type { GestureHandlers } from '../../core/input.ts';
import type { GameScene } from '../../core/scene.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import { canPlace, distanceToEntrance, footprint, gridSize, isDecor, levelStats } from '../../meta/buildings.ts';
import { generatorAmount } from '../../meta/city.ts';
import type { BuildingType, PlacedBuilding, SaveData } from '../../meta/types.ts';
import { IsoCameraRig } from '../../render/cameras.ts';
import { ELEMENT_COLORS, C } from '../../render/colors.ts';
import { DayClock, applyTimeOfDay } from '../../render/daynight.ts';
import { createWater, waterUniforms } from '../../render/environment.ts';
import { createBuildingView, type BuildingView } from '../../render/models/factory.ts';
import { hash01 } from '../../render/models/buildings.ts';
import { SpriteParticles } from '../../render/particles.ts';
import { lightUniforms, createVoxelObject } from '../../render/toon.ts';
import { Palette, VoxelGrid, buildVoxelGeometry } from '../../render/voxel.ts';
import { buildingModel } from '../../render/models/buildings.ts';
import { WorldLabels } from '../../ui/worldLabels.ts';
import { BuildingsLayer, worldCenter } from './buildingsLayer.ts';
import { GridOverlay } from './gridOverlay.ts';
import { ISLAND_MARGIN, buildIsland } from './island.ts';
import { CityLife } from './life.ts';

export type CityMode = 'view' | 'edit' | 'place';

export interface CityHost {
  getSave(): SaveData;
  onSelect(id: string | null): void;
  commitMove(id: string, x: number, z: number, rot: number): boolean;
  onPlacementValidity(valid: boolean): void;
  onLabelsChanged?(): void;
  /** Rótulos clicáveis (coleta de gerador). */
  onCollect(id: string): void;
  onTapEmpty?(): void;
}

interface Placement {
  type: BuildingType;
  level: number;
  view: BuildingView;
  x: number;
  z: number;
  rot: number;
  valid: boolean;
  /** id da construção sendo movida (modo edição) ou do item do estoque. */
  moveId?: string;
  storageId?: string;
  origin?: { x: number; z: number; rot: number };
}

const LIGHT_DIR = new THREE.Vector3(0.55, 0.8, 0.12).normalize();

export class CityScene implements GameScene {
  readonly id = 'city';
  readonly scene = new THREE.Scene();
  readonly rig = new IsoCameraRig();
  readonly gestures: GestureHandlers;
  readonly layer = new BuildingsLayer();
  readonly grid = new GridOverlay();
  readonly clock = new DayClock(480, 0.4);
  mode: CityMode = 'view';
  selected: string | null = null;
  night = 0;
  private placement: Placement | null = null;
  private island: THREE.Group | null = null;
  private islandSize = -1;
  private gate: THREE.Group | null = null;
  private beachProps = new THREE.Group();
  private water: THREE.Mesh;
  private life: CityLife;
  private particles: SpriteParticles;
  private glow: SpriteParticles;
  private labels: WorldLabels;
  private labelMap = new Map<string, { el: HTMLElement; label: ReturnType<WorldLabels['add']>; kind: string }>();
  private width = 1;
  private height = 1;
  private dragOffset = { x: 0, z: 0 };
  private labelTimer = 0;
  private chirpTimer = 4;
  private raycaster = new THREE.Raycaster();
  active = false;

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  constructor(
    private host: CityHost,
    uiRoot: HTMLElement,
    density: number,
  ) {
    this.scene.background = new THREE.Color(0x0e66b8);
    this.water = createWater(700, 140);
    this.water.position.y = -0.75;
    this.scene.add(this.water);
    this.scene.add(this.layer.group);
    this.scene.add(this.grid.group);
    this.scene.add(this.beachProps);
    this.life = new CityLife(density);
    this.scene.add(this.life.group);
    this.particles = new SpriteParticles(500, false);
    this.glow = new SpriteParticles(300, true);
    this.scene.add(this.particles.points, this.glow.points);
    this.labels = new WorldLabels(uiRoot, 'world-labels city-labels');
    this.gestures = this.makeGestures();
  }

  // ------------------------------------------------------------ ciclo de vida

  enter(): void {
    this.active = true;
    this.labels.root.style.display = '';
    this.refresh();
    const core = this.host.getSave().city.buildings.find((b) => b.type === 'core');
    if (core && this.rig.target.lengthSq() === 0) {
      const c = worldCenter(core);
      this.rig.target.set(c.x - 1, 0, c.z + 1);
      this.rig.distance = 30;
    }
    audio.setMusic('city');
    audio.setAmbience('city');
  }

  exit(): void {
    this.active = false;
    this.labels.root.style.display = 'none';
    this.cancelPlacement();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.rig.resize(w, h);
  }

  /** Recarrega tudo a partir do save (chame após qualquer mudança). */
  refresh(): void {
    const save = this.host.getSave();
    const size = gridSize(save.city);
    if (size !== this.islandSize) this.rebuildIsland(size, save);
    this.layer.sync(save.city.buildings, save.city.element);
    this.life.smokeSources = save.city.buildings
      .filter((b) => b.type === 'generator' && !b.ruined)
      .map((b) => {
        const c = worldCenter(b);
        // chaminé fica no canto do modelo; gira junto com a construção
        const off = new THREE.Vector3(0.625, 0, -0.625).applyAxisAngle(new THREE.Vector3(0, 1, 0), -b.rot * (Math.PI / 2));
        return new THREE.Vector3(c.x + off.x, 1.6, c.z + off.z);
      });
    for (const b of save.city.buildings) {
      if (b.ruined && Math.random() < 0.5) {
        const c = worldCenter(b);
        this.life.smokeSources.push(new THREE.Vector3(c.x, 0.6, c.z));
      }
    }
    this.life.setFreeCells(this.freeCellFn(save));
    if (this.selected && !save.city.buildings.some((b) => b.id === this.selected)) this.select(null);
    this.updateSelectionMarker();
    this.rebuildLabels();
  }

  private freeCellFn(save: SaveData): (x: number, z: number) => boolean {
    const size = gridSize(save.city);
    const occ = new Set<number>();
    for (const b of save.city.buildings) {
      const [w, d] = footprint(b.type, b.rot);
      for (let x = b.x; x < b.x + w; x++) for (let z = b.z; z < b.z + d; z++) occ.add(x * 1000 + z);
    }
    return (x, z) => x >= 0 && z >= 0 && x < size && z < size && !occ.has(x * 1000 + z);
  }

  private rebuildIsland(size: number, save: SaveData): void {
    if (this.island) this.scene.remove(this.island);
    const info = buildIsland(size);
    this.island = info.group;
    this.scene.add(this.island);
    this.islandSize = size;
    waterUniforms.uIsland.value.set(info.bounds.x0 + 2.2, info.bounds.z0 + 2.2, info.bounds.x1 - 2.2, info.bounds.z1 - 2.2);
    this.grid.setSize(size);
    this.rig.bounds = { x0: -3, z0: -1, x1: size + 1, z1: size + 3 };
    this.rig.minDistance = 11;
    this.rig.maxDistance = 30 + size * 0.9;
    this.life.setCity(size, this.freeCellFn(save));
    this.buildGate(size, save);
    this.buildBeachProps(size);
  }

  private buildGate(size: number, save: SaveData): void {
    if (this.gate) this.scene.remove(this.gate);
    const el = ELEMENT_COLORS[save.city.element];
    const p = new Palette();
    const g = new VoxelGrid(6, 30, 30);
    const stone = p.add(C.white);
    const metal = p.add(C.metal);
    const neon = p.add(el.glow, { glow: 1 });
    const pink = p.add(C.neonPink, { glow: 1 });
    for (const z0 of [1, 25]) {
      g.box(1, 0, z0, 5, 22, z0 + 4, stone);
      g.box(1, 4, z0, 5, 5, z0 + 4, neon);
      g.box(1, 12, z0, 5, 13, z0 + 4, neon);
      g.box(0, 22, z0 - 1, 6, 24, z0 + 5, metal);
    }
    g.box(1, 24, 1, 5, 28, 29, metal);
    g.box(1, 25, 2, 5, 27, 28, pink);
    for (let z = 4; z < 27; z += 3) g.set(5, 26, z, neon);
    const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: 1 / 8 });
    this.gate = createVoxelObject(geo);
    this.gate.position.set(-ISLAND_MARGIN + 3.2, -0.5, size / 2);
    this.scene.add(this.gate);
  }

  /** Palmeiras e pedras na praia, fora da grade (só decoração). */
  private buildBeachProps(size: number): void {
    this.beachProps.clear();
    const palmGeo = new Map<number, THREE.BufferGeometry>();
    const rockP = new Palette();
    const rg = new VoxelGrid(10, 6, 9);
    rg.ellipsoid(5, 1.5, 4.5, 4.6, 3.4, 4, rockP.add(C.rock));
    rg.ellipsoid(4, 3, 4, 2.6, 2.2, 2.4, rockP.add(C.rockDark));
    const rockGeo = buildVoxelGeometry({ grid: rg, palette: rockP }, { scale: 1 / 8 });
    let n = 0;
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const t = hash01(i * 97 + size) * 0.92 + 0.04;
      const out = 1.4 + hash01(i * 31) * 2.2;
      let x = 0;
      let z = 0;
      if (side === 0) [x, z] = [t * size, -out];
      else if (side === 1) [x, z] = [size + out, t * size];
      else if (side === 2) [x, z] = [t * size, size + out];
      else [x, z] = [-out, t * size];
      // não bloqueia a estrada da entrada
      if (side === 3 && Math.abs(z - size / 2) < 3.5) continue;
      if (hash01(i * 13) < 0.65) {
        const v = n++ % 4;
        let geo = palmGeo.get(v);
        if (!geo) {
          geo = buildVoxelGeometry(buildingModel('palm', 1, 'mare', v * 37 + 5).base, { scale: 1 / 8 });
          palmGeo.set(v, geo);
        }
        const palm = createVoxelObject(geo);
        palm.position.set(x, -0.5, z);
        palm.rotation.y = hash01(i * 7) * 6.28;
        palm.scale.setScalar(1.1 + hash01(i * 3) * 0.4);
        this.beachProps.add(palm);
      } else {
        const rock = createVoxelObject(rockGeo);
        rock.position.set(x, -0.62, z);
        rock.rotation.y = hash01(i * 5) * 6.28;
        rock.scale.setScalar(0.8 + hash01(i * 11) * 0.8);
        this.beachProps.add(rock);
      }
    }
  }

  // ------------------------------------------------------------ seleção e edição

  setMode(mode: CityMode): void {
    if (this.mode === 'place' && mode !== 'place') this.cancelPlacement();
    this.mode = mode;
    this.grid.showGrid(mode !== 'view');
    if (mode === 'view') this.layer.reattachAll();
    this.rebuildLabels();
  }

  select(id: string | null): void {
    if (this.selected === id) return;
    if (this.selected && this.mode !== 'place') this.layer.reattach(this.selected);
    this.selected = id;
    if (id) {
      this.layer.pop(id);
      vibrate(8);
    }
    this.updateSelectionMarker();
    this.host.onSelect(id);
  }

  private updateSelectionMarker(): void {
    const b = this.selected ? this.host.getSave().city.buildings.find((x) => x.id === this.selected) : null;
    if (!b) {
      this.grid.hideSelection();
      return;
    }
    const [w, d] = footprint(b.type, b.rot);
    this.grid.showSelection(b.x, b.z, w, d);
  }

  /** Câmera mergulha na entrada da cidade (transição para a batalha). */
  diveToEntrance(): void {
    const size = gridSize(this.host.getSave().city);
    this.rig.dive(-3, size / 2);
  }

  resetCamera(): void {
    this.rig.resetView();
    const core = this.host.getSave().city.buildings.find((b) => b.type === 'core');
    if (core) {
      const c = worldCenter(core);
      this.rig.focus(c.x - 1, c.z + 1, 30);
    }
  }

  focusOn(id: string): void {
    const b = this.host.getSave().city.buildings.find((x) => x.id === id);
    if (!b) return;
    const c = worldCenter(b);
    this.rig.focus(c.x, c.z);
  }

  /** Começa a posicionar uma construção nova (loja) ou do estoque. */
  beginPlacement(type: BuildingType, level: number, storageId?: string): void {
    this.cancelPlacement();
    this.select(null);
    const save = this.host.getSave();
    const view = createBuildingView(type, level, save.city.element, 0);
    this.scene.add(view.root);
    const [w, d] = footprint(type, 0);
    let x = Math.round(this.rig.target.x - w / 2);
    let z = Math.round(this.rig.target.z - d / 2);
    const size = gridSize(save.city);
    x = Math.max(0, Math.min(size - w, x));
    z = Math.max(0, Math.min(size - d, z));
    // procura uma vaga livre perto do centro da tela
    outer: for (let r = 0; r < size; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (canPlace(save.city, type, x + dx, z + dz, 0)) {
            x += dx;
            z += dz;
            break outer;
          }
        }
    this.placement = { type, level, view, x, z, rot: 0, valid: false, storageId };
    this.mode = 'place';
    this.grid.showGrid(true);
    this.updatePlacement();
    audio.play('open');
  }

  private updatePlacement(): void {
    const p = this.placement;
    if (!p) return;
    const save = this.host.getSave();
    p.valid = canPlace(save.city, p.type, p.x, p.z, p.rot, p.moveId);
    const [w, d] = footprint(p.type, p.rot);
    this.layer.placeView(p.view, { type: p.type, x: p.x, z: p.z, rot: p.rot }, 0.25);
    p.view.material.uniforms.uTint.value.set(p.valid ? 0.35 : 1, p.valid ? 1 : 0.3, p.valid ? 0.45 : 0.3, 0.55);
    this.grid.showFootprint(p.x, p.z, w, d, p.valid);
    this.host.onPlacementValidity(p.valid);
  }

  rotatePlacement(): void {
    const p = this.placement;
    if (!p) return;
    p.rot = (p.rot + 1) % 4;
    const [w, d] = footprint(p.type, p.rot);
    const size = gridSize(this.host.getSave().city);
    p.x = Math.max(0, Math.min(size - w, p.x));
    p.z = Math.max(0, Math.min(size - d, p.z));
    this.updatePlacement();
    audio.play('tap');
  }

  get placementInfo(): { type: BuildingType; x: number; z: number; rot: number; valid: boolean; storageId?: string } | null {
    const p = this.placement;
    return p ? { type: p.type, x: p.x, z: p.z, rot: p.rot, valid: p.valid, storageId: p.storageId } : null;
  }

  /** Encerra o posicionamento (a UI já gravou no save). */
  endPlacement(success: boolean): void {
    const p = this.placement;
    if (!p) return;
    this.scene.remove(p.view.root);
    this.placement = null;
    this.mode = 'edit';
    this.grid.hideFootprint();
    if (success) {
      this.refresh();
      const placed = this.host.getSave().city.buildings.find((b) => b.x === p.x && b.z === p.z && b.type === p.type);
      if (placed) {
        this.layer.pop(placed.id);
        this.dust(placed);
      }
    }
  }

  cancelPlacement(): void {
    if (!this.placement) return;
    const p = this.placement;
    if (p.moveId) {
      // devolve a construção para onde estava
      const b = this.host.getSave().city.buildings.find((x) => x.id === p.moveId);
      if (b && p.origin) {
        const view = this.layer.views.get(b.id);
        if (view) {
          view.material.uniforms.uTint.value.set(1, 1, 1, 0);
          this.layer.placeView(view, b);
        }
      }
    } else {
      this.scene.remove(p.view.root);
    }
    this.placement = null;
    this.grid.hideFootprint();
    if (this.mode === 'place') this.mode = 'edit';
  }

  /** Gira a construção selecionada no modo edição (se couber). */
  rotateSelected(): boolean {
    const save = this.host.getSave();
    const b = save.city.buildings.find((x) => x.id === this.selected);
    if (!b) return false;
    const rot = (b.rot + 1) % 4;
    if (!canPlace(save.city, b.type, b.x, b.z, rot, b.id)) {
      audio.play('invalid');
      vibrate([20, 40, 20]);
      return false;
    }
    const ok = this.host.commitMove(b.id, b.x, b.z, rot);
    if (ok) {
      this.layer.pop(b.id);
      audio.play('place');
    }
    return ok;
  }

  // ------------------------------------------------------------ efeitos

  dust(b: PlacedBuilding): void {
    const c = worldCenter(b);
    const [w, d] = footprint(b.type, b.rot);
    const col = new THREE.Color(0xf6eedd);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = Math.max(w, d) * 0.55;
      this.particles.emit(c.x + Math.cos(a) * r, 0.1, c.z + Math.sin(a) * r, Math.cos(a) * 1.4, 0.4, Math.sin(a) * 1.4, col, 0.32, 0.8, { grow: 0.5, drag: 3 });
    }
  }

  celebrate(id: string): void {
    const b = this.host.getSave().city.buildings.find((x) => x.id === id);
    if (!b) return;
    const top = this.layer.topOf(b);
    this.layer.pop(id);
    const cols = [0xffe14f, 0x3ff6ff, 0xff3fb4, 0x5bff8a].map((h) => new THREE.Color(h));
    for (let i = 0; i < 40; i++) {
      this.glow.emit(top.x, top.y, top.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5, cols[i % 4], 0.22, 1.4, { gravity: 7, drag: 0.8 });
    }
    this.rig.addTrauma(0.25);
  }

  coinBurst(id: string, amount: number): void {
    const b = this.host.getSave().city.buildings.find((x) => x.id === id);
    if (!b) return;
    const top = this.layer.topOf(b);
    const gold = new THREE.Color(C.gold);
    const n = Math.min(30, 8 + Math.floor(amount / 80));
    for (let i = 0; i < n; i++) {
      this.glow.emit(top.x, top.y, top.z, (Math.random() - 0.5) * 3, 4 + Math.random() * 3, (Math.random() - 0.5) * 3, gold, 0.26, 1.1, { gravity: 9, drag: 0.6 });
    }
    this.layer.pop(id);
  }

  // ------------------------------------------------------------ rótulos

  rebuildLabels(): void {
    for (const { label } of this.labelMap.values()) this.labels.remove(label);
    this.labelMap.clear();
    const save = this.host.getSave();
    const now = Date.now();
    const size = gridSize(save.city);
    // ordem das defesas na estrada (modo edição)
    if (this.mode !== 'view') {
      const order = save.city.buildings
        .filter((b) => !isDecor(b.type) && b.type !== 'barrier')
        .sort((a, b) => distanceToEntrance(a, size) - distanceToEntrance(b, size));
      order.forEach((b, i) => {
        const el = document.createElement('div');
        el.className = 'order-badge';
        el.textContent = String(i + 1);
        el.title = 'Ordem na estrada';
        const label = this.labels.add(el, this.layer.topOf(b), -4);
        this.labelMap.set(`order:${b.id}`, { el, label, kind: 'order' });
      });
    }
    for (const b of save.city.buildings) {
      if (b.upgradeEndsAt) {
        const el = document.createElement('div');
        el.className = 'upgrade-timer';
        el.innerHTML = '<span class="t"></span><div class="bar"><i></i></div>';
        const label = this.labels.add(el, this.layer.topOf(b), -6);
        this.labelMap.set(`up:${b.id}`, { el, label, kind: 'upgrade' });
      } else if (b.ruined) {
        const el = document.createElement('div');
        el.className = 'ruined-badge';
        el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" fill="currentColor"/></svg>';
        const label = this.labels.add(el, this.layer.topOf(b), -4);
        this.labelMap.set(`ruin:${b.id}`, { el, label, kind: 'ruin' });
      } else if (b.type === 'generator' && this.mode === 'view') {
        const el = document.createElement('button');
        el.className = 'collect-bubble';
        el.innerHTML = '<span class="coin-ico"></span><span class="amt"></span>';
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.host.onCollect(b.id);
        });
        const label = this.labels.add(el, this.layer.topOf(b), -6);
        this.labelMap.set(`gen:${b.id}`, { el, label, kind: 'gen' });
      }
    }
    this.updateLabelTexts(now);
  }

  private updateLabelTexts(now: number): void {
    const save = this.host.getSave();
    for (const [key, entry] of this.labelMap) {
      const id = key.slice(key.indexOf(':') + 1);
      const b = save.city.buildings.find((x) => x.id === id);
      if (!b) continue;
      if (entry.kind === 'upgrade' && b.upgradeEndsAt) {
        const left = Math.max(0, (b.upgradeEndsAt - now) / 1000);
        const t = entry.el.querySelector('.t') as HTMLElement;
        t.textContent = left < 60 ? `${Math.ceil(left)}s` : left < 3600 ? `${Math.floor(left / 60)}min ${Math.ceil(left % 60)}s` : `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}min`;
      } else if (entry.kind === 'gen') {
        const amount = generatorAmount(b, now);
        const show = amount >= 15;
        this.labels.setVisible(entry.label, show);
        (entry.el.querySelector('.amt') as HTMLElement).textContent = `+${amount}`;
        entry.el.classList.toggle('full', amount >= generatorCapacity(b));
      }
    }
  }

  // ------------------------------------------------------------ gestos

  private toNdc(x: number, y: number): { nx: number; ny: number } {
    return { nx: (x / this.width) * 2 - 1, ny: -(y / this.height) * 2 + 1 };
  }

  private pickAt(x: number, y: number): string | null {
    const { nx, ny } = this.toNdc(x, y);
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const ground = this.rig.groundPoint(nx, ny);
    return this.layer.pick(this.raycaster, ground);
  }

  private groundCell(x: number, y: number): THREE.Vector3 | null {
    const { nx, ny } = this.toNdc(x, y);
    return this.rig.groundPoint(nx, ny);
  }

  private makeGestures(): GestureHandlers {
    return {
      onTap: (x, y) => {
        audio.unlock();
        if (this.mode === 'place') {
          const g = this.groundCell(x, y);
          if (g && this.placement) {
            const [w, d] = footprint(this.placement.type, this.placement.rot);
            this.placement.x = Math.floor(g.x - w / 2 + 0.5);
            this.placement.z = Math.floor(g.z - d / 2 + 0.5);
            this.updatePlacement();
          }
          return;
        }
        const id = this.pickAt(x, y);
        if (id) {
          audio.play('tap');
          this.select(id === this.selected && this.mode === 'view' ? null : id);
        } else {
          this.select(null);
          this.host.onTapEmpty?.();
        }
      },
      onDragStart: (x, y) => {
        if (this.mode === 'place') {
          const g = this.groundCell(x, y);
          if (g && this.placement) {
            this.dragOffset = { x: this.placement.x - g.x, z: this.placement.z - g.z };
            return true;
          }
          return false;
        }
        if (this.mode !== 'edit') return false;
        const id = this.pickAt(x, y);
        if (!id) return false;
        const save = this.host.getSave();
        const b = save.city.buildings.find((v) => v.id === id);
        if (!b) return false;
        this.select(id);
        const view = this.layer.detach(id);
        if (!view) return false;
        const g = this.groundCell(x, y);
        if (!g) return false;
        this.dragOffset = { x: b.x - g.x, z: b.z - g.z };
        this.placement = { type: b.type, level: b.level, view, x: b.x, z: b.z, rot: b.rot, valid: true, moveId: b.id, origin: { x: b.x, z: b.z, rot: b.rot } };
        this.grid.hideSelection();
        audio.play('tap', { pitch: 0.8 });
        this.updatePlacement();
        return true;
      },
      onDrag: (dx, dy, x, y, captured) => {
        if (captured && this.placement) {
          const g = this.groundCell(x, y);
          if (!g) return;
          const nx = Math.round(g.x + this.dragOffset.x);
          const nz = Math.round(g.z + this.dragOffset.z);
          if (nx !== this.placement.x || nz !== this.placement.z) {
            this.placement.x = nx;
            this.placement.z = nz;
            this.updatePlacement();
            audio.play('tap', { pitch: 1.6, volume: 0.25 });
          }
          return;
        }
        this.rig.panPixels(dx, dy, this.height);
      },
      onDragEnd: (_x, _y, captured, vx, vy) => {
        if (captured && this.placement?.moveId) {
          const p = this.placement;
          const id = p.moveId!;
          this.placement = null;
          this.grid.hideFootprint();
          p.view.material.uniforms.uTint.value.set(1, 1, 1, 0);
          const ok = p.valid && this.host.commitMove(id, p.x, p.z, p.rot);
          if (ok) {
            audio.play('place');
            vibrate(12);
            const b = this.host.getSave().city.buildings.find((v) => v.id === id);
            if (b) this.dust(b);
            this.layer.pop(id);
          } else {
            audio.play('invalid');
            vibrate([20, 40, 20]);
            const b = this.host.getSave().city.buildings.find((v) => v.id === id);
            if (b) this.layer.placeView(p.view, b);
          }
          this.updateSelectionMarker();
          this.rebuildLabels();
          return;
        }
        if (!captured) this.rig.fling(vx, vy);
      },
      onPinch: (scale) => this.rig.zoom(scale),
      onWheel: (delta) => this.rig.zoom(delta > 0 ? 0.9 : 1.1),
    };
  }

  // ------------------------------------------------------------ quadro

  update(dt: number, time: number): void {
    const save = this.host.getSave();
    const t = save.settings.dayNight ? this.clock.update(dt) : 0.45;
    this.night = applyTimeOfDay(t);
    lightUniforms.uSunDir.value.copy(LIGHT_DIR);
    lightUniforms.uFogNear.value = 60 + this.rig.distance;
    lightUniforms.uFogFar.value = 160 + this.rig.distance * 2;
    (this.scene.background as THREE.Color).copy(lightUniforms.uFogColor.value);
    this.rig.update(dt, this.height);
    this.layer.update(dt, time);
    this.grid.update(dt, time);
    this.life.update(dt, time, this.night, this.particles);
    this.particles.update(dt);
    this.glow.update(dt);
    if (this.placement && !this.placement.moveId) {
      this.placement.view.root.position.y = 0.25 + Math.sin(time * 5) * 0.06;
    }
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.5;
      this.updateLabelTexts(Date.now());
    }
    this.labels.update(this.camera, this.width, this.height);
    this.chirpTimer -= dt;
    if (this.chirpTimer <= 0) {
      this.chirpTimer = 5 + Math.random() * 9;
      if (this.night < 0.5) audio.chirp();
    }
  }
}

function generatorCapacity(b: PlacedBuilding): number {
  return levelStats('generator', b.level).capacity ?? 1;
}
