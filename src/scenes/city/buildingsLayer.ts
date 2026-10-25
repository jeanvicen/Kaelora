import * as THREE from 'three';
import { footprint } from '../../meta/buildings.ts';
import type { BuildingType, Element, PlacedBuilding } from '../../meta/types.ts';
import { BUILDING_VOXEL, barrierLinkModel, buildingModel, decorVariants, tierOf } from '../../render/models/buildings.ts';
import { animateBuilding, createBuildingView, type BuildingView } from '../../render/models/factory.ts';
import { InstancedVoxel } from '../../render/models/props.ts';
import { buildVoxelGeometry } from '../../render/voxel.ts';

/** Tipos simples (sem partes móveis) que são desenhados instanciados. */
const INSTANCED: ReadonlySet<BuildingType> = new Set(['barrier', 'palm', 'lamp', 'neon', 'flowers', 'trap']);

const instGeoCache = new Map<string, THREE.BufferGeometry>();
function instancedGeometry(type: BuildingType, tier: number, variant: number, element: Element): THREE.BufferGeometry {
  const key = `${type}|${tier}|${variant}`;
  let g = instGeoCache.get(key);
  if (!g) {
    const level = tier === 1 ? 1 : tier === 2 ? 4 : 7;
    const model = buildingModel(type, level, element, variant * 101 + 7);
    g = buildVoxelGeometry(model.base, { scale: BUILDING_VOXEL });
    instGeoCache.set(key, g);
  }
  return g;
}
const linkGeoCache = new Map<number, THREE.BufferGeometry>();
function linkGeometry(tier: number): THREE.BufferGeometry {
  let g = linkGeoCache.get(tier);
  if (!g) {
    g = buildVoxelGeometry(barrierLinkModel(tier === 1 ? 1 : tier === 2 ? 4 : 7), { scale: BUILDING_VOXEL });
    linkGeoCache.set(tier, g);
  }
  return g;
}

export function variantFor(b: PlacedBuilding): number {
  const n = decorVariants(b.type);
  if (n <= 1) return 0;
  let h = 0;
  for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

export function worldCenter(b: Pick<PlacedBuilding, 'type' | 'x' | 'z' | 'rot'>, out = new THREE.Vector3()): THREE.Vector3 {
  const [w, d] = footprint(b.type, b.rot);
  return out.set(b.x + w / 2, 0, b.z + d / 2);
}

interface UpgradeFx {
  group: THREE.Group;
  scan: THREE.Mesh;
  h: number;
}

/**
 * Mantém a cidade 3D sincronizada com o save: cria/atualiza/remove
 * construções, liga as barreiras vizinhas com muralhas e desenha efeitos
 * de melhoria (holograma de andaime) e de ruína (escurecido).
 */
export class BuildingsLayer {
  readonly group = new THREE.Group();
  readonly views = new Map<string, BuildingView>();
  private viewKeys = new Map<string, string>();
  private instGroup = new THREE.Group();
  private instanced: InstancedVoxel[] = [];
  private upgradeFx = new Map<string, UpgradeFx>();
  /** Construções simples "destacadas" do instancing (selecionadas/arrastadas). */
  private detached = new Set<string>();
  private buildings: PlacedBuilding[] = [];
  private element: Element = 'mare';
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private bounce = new Map<string, number>();

  constructor() {
    this.group.add(this.instGroup);
  }

  isInstancedType(type: BuildingType): boolean {
    return INSTANCED.has(type);
  }

  private visualKey(b: PlacedBuilding): string {
    return `${b.type}|${tierOf(b.level)}|${b.type === 'core' || b.type === 'barracks' ? this.element : ''}|${variantFor(b)}`;
  }

  /** Recria o que mudou. Chame depois de qualquer alteração no save. */
  sync(buildings: PlacedBuilding[], element: Element): void {
    this.buildings = buildings;
    const elementChanged = element !== this.element;
    this.element = element;
    const alive = new Set<string>();
    for (const b of buildings) {
      alive.add(b.id);
      const individual = !INSTANCED.has(b.type) || this.detached.has(b.id);
      if (!individual) {
        this.dropView(b.id);
        continue;
      }
      const key = this.visualKey(b);
      let view = this.views.get(b.id);
      if (!view || this.viewKeys.get(b.id) !== key || elementChanged) {
        if (view) this.group.remove(view.root);
        view = createBuildingView(b.type, b.level, element, variantFor(b));
        view.root.userData.buildingId = b.id;
        this.views.set(b.id, view);
        this.viewKeys.set(b.id, key);
        this.group.add(view.root);
      }
      this.placeView(view, b);
      this.applyStateLook(view, b);
    }
    for (const id of [...this.views.keys()]) if (!alive.has(id)) this.dropView(id);
    for (const id of [...this.upgradeFx.keys()]) {
      const b = buildings.find((x) => x.id === id);
      if (!b || !b.upgradeEndsAt) this.removeUpgradeFx(id);
    }
    for (const b of buildings) if (b.upgradeEndsAt && !this.upgradeFx.has(b.id)) this.addUpgradeFx(b);
    this.rebuildInstanced();
  }

  private dropView(id: string): void {
    const v = this.views.get(id);
    if (v) this.group.remove(v.root);
    this.views.delete(id);
    this.viewKeys.delete(id);
  }

  placeView(view: BuildingView, b: Pick<PlacedBuilding, 'type' | 'x' | 'z' | 'rot'>, lift = 0): void {
    worldCenter(b, view.root.position);
    view.root.position.y = lift;
    view.root.rotation.y = -b.rot * (Math.PI / 2);
  }

  private applyStateLook(view: BuildingView, b: PlacedBuilding): void {
    const tint = view.material.uniforms.uTint.value;
    if (b.ruined) tint.set(0.18, 0.16, 0.26, 0.75);
    else tint.set(1, 1, 1, 0);
  }

  /** Reconstrói os InstancedMesh das construções simples e das muralhas. */
  private rebuildInstanced(): void {
    for (const inst of this.instanced) {
      this.instGroup.remove(inst.group);
      inst.body.dispose();
      inst.outline?.dispose();
    }
    this.instanced = [];
    const groups = new Map<string, PlacedBuilding[]>();
    for (const b of this.buildings) {
      if (!INSTANCED.has(b.type) || this.detached.has(b.id)) continue;
      const key = `${b.type}|${tierOf(b.level)}|${variantFor(b)}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(b);
    }
    for (const [key, list] of groups) {
      const [type, tierS, varS] = key.split('|');
      const geo = instancedGeometry(type as BuildingType, Number(tierS), Number(varS), this.element);
      const inst = new InstancedVoxel(geo, list.length);
      inst.body.userData.ids = list.map((b) => b.id);
      list.forEach((b, i) => {
        worldCenter(b, this.v);
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.rot * (Math.PI / 2));
        this.s.set(1, 1, 1);
        if (b.ruined) this.s.set(1, 0.45, 1);
        this.m.compose(this.v, this.q, this.s);
        inst.setMatrixAt(i, this.m);
      });
      inst.commit();
      this.instanced.push(inst);
      this.instGroup.add(inst.group);
    }

    // Muralhas entre barreiras vizinhas (por tier do menor nível).
    const barriers = this.buildings.filter((b) => b.type === 'barrier' && !b.ruined);
    const at = new Map<string, PlacedBuilding>();
    for (const b of barriers) at.set(`${b.x},${b.z}`, b);
    const links = new Map<number, THREE.Matrix4[]>();
    for (const b of barriers) {
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
      ]) {
        const n = at.get(`${b.x + dx},${b.z + dz}`);
        if (!n) continue;
        const tier = tierOf(Math.min(b.level, n.level));
        const m = new THREE.Matrix4();
        this.v.set(b.x + 0.5 + dx * 0.5, 0, b.z + 0.5 + dz * 0.5);
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dz ? Math.PI / 2 : 0);
        this.s.set(1, 1, 1);
        m.compose(this.v, this.q, this.s);
        let arr = links.get(tier);
        if (!arr) links.set(tier, (arr = []));
        arr.push(m);
      }
    }
    for (const [tier, mats] of links) {
      const inst = new InstancedVoxel(linkGeometry(tier), mats.length);
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.commit();
      this.instanced.push(inst);
      this.instGroup.add(inst.group);
    }
  }

  /** Destaca uma construção simples do instancing para poder mexer nela. */
  detach(id: string): BuildingView | null {
    const b = this.buildings.find((x) => x.id === id);
    if (!b) return null;
    if (INSTANCED.has(b.type) && !this.detached.has(id)) {
      this.detached.add(id);
      this.sync(this.buildings, this.element);
    }
    return this.views.get(id) ?? null;
  }

  reattach(id: string): void {
    if (this.detached.delete(id)) this.sync(this.buildings, this.element);
  }

  reattachAll(): void {
    if (this.detached.size) {
      this.detached.clear();
      this.sync(this.buildings, this.element);
    }
  }

  /** Pula de alegria (seleção, melhoria concluída, posicionamento). */
  pop(id: string): void {
    this.bounce.set(id, 0);
  }

  private addUpgradeFx(b: PlacedBuilding): void {
    const [w, d] = footprint(b.type, b.rot);
    const view = this.views.get(b.id);
    const h = (view?.height ?? 1.5) + 0.3;
    const group = new THREE.Group();
    const box = new THREE.BoxGeometry(w - 0.1, h, d - 0.1);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x3ff6ff, transparent: true, opacity: 0.85 }),
    );
    edges.position.y = h / 2;
    group.add(edges);
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.1, d - 0.1),
      new THREE.MeshBasicMaterial({ color: 0x3ff6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    scan.rotation.x = -Math.PI / 2;
    group.add(scan);
    worldCenter(b, group.position);
    this.group.add(group);
    this.upgradeFx.set(b.id, { group, scan, h });
  }

  private removeUpgradeFx(id: string): void {
    const fx = this.upgradeFx.get(id);
    if (!fx) return;
    this.group.remove(fx.group);
    fx.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    this.upgradeFx.delete(id);
  }

  update(dt: number, time: number): void {
    for (const [id, view] of this.views) {
      animateBuilding(view, time, dt);
      const t = this.bounce.get(id);
      if (t !== undefined) {
        const k = t + dt;
        const sq = Math.exp(-k * 7) * Math.sin(k * 22) * 0.18;
        view.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
        if (k > 0.8) {
          this.bounce.delete(id);
          view.body.scale.set(1, 1, 1);
        } else this.bounce.set(id, k);
      }
    }
    for (const fx of this.upgradeFx.values()) {
      fx.scan.position.y = ((Math.sin(time * 2.2) + 1) / 2) * fx.h;
    }
  }

  /** Raycast nas construções (malhas individuais) ou pela casa no chão. */
  pick(ray: THREE.Raycaster, ground: THREE.Vector3 | null): string | null {
    const bodies: THREE.Object3D[] = [];
    for (const v of this.views.values()) v.root.traverse((o) => o.name === 'body' && bodies.push(o));
    const hits = ray.intersectObjects(bodies, false);
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && o.userData.buildingId === undefined) o = o.parent;
      if (o) return o.userData.buildingId as string;
    }
    if (ground) {
      const gx = Math.floor(ground.x);
      const gz = Math.floor(ground.z);
      for (const b of this.buildings) {
        const [w, d] = footprint(b.type, b.rot);
        if (gx >= b.x && gx < b.x + w && gz >= b.z && gz < b.z + d) return b.id;
      }
    }
    return null;
  }

  /** Ponto do topo de uma construção (para rótulos e efeitos). */
  topOf(b: PlacedBuilding, out = new THREE.Vector3()): THREE.Vector3 {
    worldCenter(b, out);
    const view = this.views.get(b.id);
    out.y = (view?.height ?? (b.type === 'barrier' ? 1.2 : 1)) + 0.25;
    return out;
  }

  dispose(): void {
    for (const id of [...this.views.keys()]) this.dropView(id);
    for (const id of [...this.upgradeFx.keys()]) this.removeUpgradeFx(id);
    for (const inst of this.instanced) this.instGroup.remove(inst.group);
    this.instanced = [];
  }
}
