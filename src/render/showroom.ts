import * as THREE from 'three';
import type { CharacterDef } from '../content/types.ts';
import type { Rarity } from '../meta/types.ts';
import { CharacterView } from './characterView.ts';
import { C, ELEMENT_COLORS, RARITY_COLORS, shade } from './colors.ts';
import { applyTimeOfDay } from './daynight.ts';
import { radialTexture } from './environment.ts';
import { SpriteParticles } from './particles.ts';
import { createVoxelObject, lightUniforms } from './toon.ts';
import { Palette, VoxelGrid, buildVoxelGeometry } from './voxel.ts';

/**
 * Vitrine 3D dos personagens: pódio voxel com néon na cor da raridade,
 * raios de luz girando, brilho e partículas. Renderizada pelo loop do
 * jogo por cima de tudo (Game.overlay), enquadrada num retângulo da tela.
 */
export interface ShowroomSlot {
  root: THREE.Group;
  view: CharacterView | null;
  def: CharacterDef | null;
  podium: THREE.Group;
  glow: THREE.Mesh;
  rays: THREE.Mesh;
  hit: THREE.Mesh;
  silhouette: boolean;
  spawnAcc: number;
}

const PODIUM_SPACING = 1.55;

export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  /** Retângulo (CSS px) onde o conteúdo deve aparecer. */
  frame: () => DOMRect | null = () => null;
  slots: ShowroomSlot[] = [];
  /** Giro do personagem arrastando (modo único). */
  yaw = 0;
  private yawVel = 0;
  private sparkles = new SpriteParticles(260, true);
  private floor: THREE.Mesh;
  private time = 0;
  private bg: THREE.CanvasTexture;
  private raycaster = new THREE.Raycaster();
  private silhouetteMat = new THREE.MeshBasicMaterial({ color: 0x0b0820 });
  /** Topo do personagem mais alto (para enquadrar). */
  private contentTop = 2;

  constructor() {
    this.bg = backgroundTexture();
    this.scene.background = this.bg;
    const floorMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x6a4dff, transparent: true, opacity: 0.45, depthWrite: false });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.01;
    this.scene.add(this.floor, this.sparkles.points);
  }

  /** Um personagem no centro (tela de detalhes, revelação de baú). */
  showSingle(def: CharacterDef, opts: { silhouette?: boolean } = {}): void {
    this.setSlots([def], opts.silhouette ? [true] : [false]);
    this.yaw = 0;
    this.yawVel = 0;
  }

  /** Esquadrão lado a lado. */
  showLineup(defs: (CharacterDef | null)[]): void {
    this.setSlots(defs, defs.map(() => false));
  }

  private setSlots(defs: (CharacterDef | null)[], silhouettes: boolean[]): void {
    for (const s of this.slots) this.disposeSlot(s);
    this.slots = [];
    this.sparkles.clear();
    const n = defs.length;
    defs.forEach((def, i) => {
      const root = new THREE.Group();
      root.position.x = (i - (n - 1) / 2) * PODIUM_SPACING;
      const rarity: Rarity | null = def?.rarity ?? null;
      const col = rarity ? RARITY_COLORS[rarity].hex : 0x6a5acd;
      const podium = createVoxelObject(podiumGeometry(rarity));
      root.add(podium);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ map: radialTexture(), color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.set(0, 1.3, -0.9);
      const rays = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 4.4),
        new THREE.MeshBasicMaterial({ map: raysTexture(), color: col, transparent: true, opacity: rarityRayOpacity(rarity), blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      rays.position.set(0, 1.0, -1.0);
      root.add(rays, glow);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.1;
      root.add(hit);
      let view: CharacterView | null = null;
      if (def) {
        view = new CharacterView(def);
        view.root.position.y = PODIUM_TOP;
        view.shadow.visible = false;
        view.face(1, Math.PI / 2 - (n > 1 ? 0.3 : 0.45));
        if (silhouettes[i]) applySilhouette(view.root, this.silhouetteMat);
        root.add(view.root);
      }
      this.scene.add(root);
      this.slots.push({ root, view, def, podium, glow, rays, hit, silhouette: silhouettes[i], spawnAcc: 0 });
    });
    this.contentTop = PODIUM_TOP + 1.4;
    for (const sl of this.slots)
      if (sl.view) {
        sl.view.update(0);
        const box = new THREE.Box3().setFromObject(sl.view.root);
        this.contentTop = Math.max(this.contentTop, box.max.y);
      }
    const top = defs.reduce<Rarity | null>((best, d) => (d && (!best || RANK[d.rarity] > RANK[best]) ? d.rarity : best), null);
    (this.floor.material as THREE.MeshBasicMaterial).color.setHex(top ? shade(RARITY_COLORS[top].hex, -0.2) : 0x6a4dff);
    this.floor.scale.set(Math.max(1, n * 0.45), 1, 1);
  }

  /** Troca o personagem de uma vaga do esquadrão. */
  replaceSlot(i: number, def: CharacterDef): void {
    const defs = this.slots.map((s) => s.def);
    defs[i] = def;
    this.showLineup(defs);
    this.cheer(i);
  }

  /** Comemoração curta + chuva de brilhos. */
  cheer(i: number): void {
    const s = this.slots[i];
    if (!s?.view || s.silhouette) return;
    s.view.ability();
    const col = new THREE.Color(s.def ? RARITY_COLORS[s.def.rarity].hex : 0xffffff);
    const p = s.root.position;
    this.sparkles.burst(p.x, 1.0, p.z, 26, col, 2.6, 0.12, 0.9, { up: 1.5, gravity: 2.5 });
  }

  attack(i: number): void {
    const v = this.slots[i]?.view;
    if (v && !this.slots[i].silhouette) v.attack();
  }

  setCelebrate(on: boolean): void {
    for (const s of this.slots) if (s.view && !s.silhouette) s.view.state = on ? 'celebrate' : 'idle';
  }

  /** Arrastar gira o personagem (com inércia). */
  drag(dx: number): void {
    this.yaw += dx * 0.012;
    this.yawVel = dx * 0.6;
  }

  /** Índice da vaga sob o ponto (coordenadas de tela), ou -1. */
  pick(clientX: number, clientY: number, canvas: HTMLCanvasElement): number {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.slots.map((s) => s.hit),
      false,
    );
    if (!hits.length) return -1;
    return this.slots.findIndex((s) => s.hit === hits[0].object);
  }

  /** Posição na tela (CSS px) do pé do pódio de uma vaga. */
  slotScreen(i: number, canvas: HTMLCanvasElement, y = 0): { x: number; y: number } {
    const s = this.slots[i];
    if (!s) return { x: 0, y: 0 };
    const v = new THREE.Vector3(s.root.position.x, y, s.root.position.z).project(this.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Chamado pelo loop do jogo a cada quadro. */
  update(dt: number, width: number, height: number): void {
    this.time += dt;
    this.applyLighting();
    this.frameCamera(width, height);
    if (!this.yawVel || Math.abs(this.yawVel) < 0.01) this.yawVel = 0;
    this.yaw += this.yawVel * dt;
    this.yawVel *= Math.exp(-dt * 4);
    const single = this.slots.length === 1;
    for (const s of this.slots) {
      s.rays.rotation.z = this.time * 0.25;
      (s.glow.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(this.time * 2.2) * 0.08;
      s.rays.lookAt(this.camera.position.x, s.rays.getWorldPosition(tmpV).y, this.camera.position.z);
      if (!s.view) continue;
      s.view.update(dt);
      if (single) s.view.facing.rotation.y = 0.35 + this.yaw;
      // brilhos subindo (Épico ou acima)
      const rk = s.def && !s.silhouette ? RANK[s.def.rarity] : 0;
      if (rk >= 2) {
        s.spawnAcc += dt * (rk === 2 ? 8 : rk === 3 ? 16 : 28);
        while (s.spawnAcc > 1) {
          s.spawnAcc--;
          const a = Math.random() * Math.PI * 2;
          const rad = 0.45 + Math.random() * 0.35;
          const extreme = s.def!.rarity === 'extremo';
          const col = extreme ? EXTREME_COLS[Math.floor(Math.random() * 3)] : sparkleColor(s.def!.rarity, s.def!.element);
          this.sparkles.emit(s.root.position.x + Math.cos(a) * rad, PODIUM_TOP + Math.random() * 0.2, s.root.position.z + Math.sin(a) * rad, 0, 0.6 + Math.random() * 0.8, 0, col, 0.05 + Math.random() * 0.06, 1.4, { drag: 0.2 });
        }
      }
    }
    this.sparkles.update(dt);
  }

  private applyLighting(): void {
    applyTimeOfDay(0.47, { near: 200, far: 400 });
    lightUniforms.uSunDir.value.set(0.35, 0.75, 0.75).normalize();
    lightUniforms.uNight.value = 0;
  }

  /** Enquadra o conteúdo dentro de `frame()` usando view offset da câmera. */
  private frameCamera(width: number, height: number): void {
    const n = Math.max(1, this.slots.length);
    const rect = this.frame() ?? new DOMRect(0, 0, width, height);
    const w = Math.max(1, rect.width);
    const hgt = Math.max(1, rect.height);
    const aspect = w / hgt;
    const contentW = n === 1 ? 1.7 : (n - 1) * PODIUM_SPACING + 1.6;
    const contentH = this.contentTop + 0.15;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(contentH / 2 / tanV, contentW / 2 / (tanV * aspect)) * 1.06;
    const pitch = n === 1 ? 0.1 : 0.16;
    const cy = contentH / 2 - 0.05;
    this.camera.position.set(0, cy + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    this.camera.lookAt(0, cy, 0);
    this.camera.aspect = aspect;
    this.camera.near = Math.max(0.1, dist - 6);
    this.camera.far = dist + 20;
    // O canvas inteiro é uma "janela" ao redor do retângulo: offsets negativos.
    this.camera.setViewOffset(w, hgt, -rect.left, -rect.top, width, height);
    this.camera.updateProjectionMatrix();
  }

  private disposeSlot(s: ShowroomSlot): void {
    this.scene.remove(s.root);
    s.view?.dispose();
    (s.glow.material as THREE.Material).dispose();
    (s.rays.material as THREE.Material).dispose();
    s.glow.geometry.dispose();
    s.rays.geometry.dispose();
    s.hit.geometry.dispose();
    (s.hit.material as THREE.Material).dispose();
  }

  dispose(): void {
    for (const s of this.slots) this.disposeSlot(s);
    this.slots = [];
    this.sparkles.clear();
  }
}

const tmpV = new THREE.Vector3();
const PODIUM_TOP = 0.3;
const RANK: Record<Rarity, number> = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 };
const EXTREME_COLS = [new THREE.Color(0xff2a4a), new THREE.Color(0xff2ad4), new THREE.Color(0xff8a1a)];

function sparkleColor(r: Rarity, el: CharacterDef['element']): THREE.Color {
  return new THREE.Color(r === 'lendario' ? 0xffd24a : ELEMENT_COLORS[el].glow);
}

function rarityRayOpacity(r: Rarity | null): number {
  return r === 'extremo' ? 0.5 : r === 'lendario' ? 0.42 : r === 'epico' ? 0.3 : r === 'raro' ? 0.2 : 0.12;
}

/** Pinta o personagem de preto (personagem ainda não encontrado). */
function applySilhouette(root: THREE.Object3D, mat: THREE.Material): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name === 'body') m.material = mat;
  });
}

// ------------------------------------------------------------ geometrias e texturas

const podiumCache = new Map<string, THREE.BufferGeometry>();

/** Pódio voxel redondo: base metálica, aro néon na cor da raridade e tampo claro. */
function podiumGeometry(rarity: Rarity | null): THREE.BufferGeometry {
  const key = rarity ?? 'none';
  const hit = podiumCache.get(key);
  if (hit) return hit;
  const p = new Palette();
  const R = 9;
  const g = new VoxelGrid(R * 2 + 1, 5, R * 2 + 1);
  const neonCol = rarity ? RARITY_COLORS[rarity].hex : C.neonPurple;
  const base = p.add(C.metalDeep);
  const mid = p.add(C.metalDark);
  const neon = p.add(neonCol, { glow: 1 });
  const top = p.add(0xe6e1f7);
  const topAlt = p.add(0xd2cbee);
  const inlay = p.add(shade(neonCol, 0.35), { glow: 0.25 });
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const d = Math.hypot(x, z);
      const gx = x + R;
      const gz = z + R;
      if (d <= R) {
        g.set(gx, 0, gz, base);
        g.set(gx, 1, gz, mid);
      }
      if (d <= R - 0.6) g.set(gx, 2, gz, d > R - 1.8 ? neon : mid);
      if (d <= R - 1.6) g.set(gx, 3, gz, (x + z) & 1 ? top : topAlt);
      if (d <= R - 1.6 && d > R - 2.8 && ((Math.atan2(z, x) * 8) / Math.PI) % 2 < 1) g.set(gx, 3, gz, inlay);
    }
  const geo = buildVoxelGeometry({ grid: g, palette: p }, { scale: PODIUM_TOP / 4, pivot: 'bottom', ao: 0.8 });
  podiumCache.set(key, geo);
  return geo;
}

let raysTex: THREE.CanvasTexture | null = null;
function raysTexture(): THREE.CanvasTexture {
  if (raysTex) return raysTex;
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n / 2.2;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size / 2, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  raysTex = new THREE.CanvasTexture(cv);
  raysTex.colorSpace = THREE.SRGBColorSpace;
  return raysTex;
}

function backgroundTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 8;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1b1060');
  g.addColorStop(0.55, '#3a1f8a');
  g.addColorStop(0.75, '#26145e');
  g.addColorStop(1, '#0b0f33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
