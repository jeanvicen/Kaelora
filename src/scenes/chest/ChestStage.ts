import * as THREE from 'three';
import type { CharacterDef } from '../../content/types.ts';
import { audio } from '../../core/audio.ts';
import { vibrate } from '../../core/device.ts';
import type { GameOverlay } from '../../core/game.ts';
import type { ChestType, Rarity } from '../../meta/types.ts';
import { CharacterView } from '../../render/characterView.ts';
import { RARITY_COLORS } from '../../render/colors.ts';
import { radialTexture } from '../../render/environment.ts';
import { CHEST_ACCENT, CHEST_BASE_H, CHEST_D, CHEST_VOXEL, CHEST_W, createChestView, type ChestView } from '../../render/models/chest.ts';
import { SpriteParticles, VoxelDebris } from '../../render/particles.ts';
import { applyStageLighting, backgroundTexture, raysTexture } from '../../render/showroom.ts';

export type ChestPhase = 'idle' | 'drop' | 'shake' | 'burst' | 'open';

const RANK: Record<Rarity, number> = { comum: 0, raro: 1, epico: 2, lendario: 3, extremo: 4 };
/** Onde o personagem revelado pousa. */
const LAND = new THREE.Vector3(0.45, 0, 0.45);
const EXTREME_COLS = [new THREE.Color(0xff2a4a), new THREE.Color(0xff2ad4), new THREE.Color(0xff8a1a)];

interface Popped {
  view: CharacterView;
  t: number;
  leaving: number;
}

/**
 * Cena da abertura de baú (desenhada como overlay do loop do jogo):
 * queda, tremedeira crescente, fresta brilhando na cor da melhor carta,
 * tampa explodindo em luz e personagens pulando para fora.
 */
export class ChestStage implements GameOverlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  frame: () => DOMRect | null = () => null;
  phase: ChestPhase = 'idle';
  /** Câmera lenta da própria cena (Lendário/Extremo). */
  timeScale = 1;
  onPhase: ((p: ChestPhase) => void) | null = null;

  private chest: ChestView | null = null;
  private type: ChestType = 'madeira';
  private best: Rarity = 'comum';
  private shakeSec = 1.4;
  private t = 0;
  private time = 0;
  private slowUntil = 0;
  private crack: THREE.Mesh;
  private rays: THREE.Mesh;
  private glow: THREE.Mesh;
  private pillar: THREE.Mesh;
  private floorGlow: THREE.Mesh;
  private sparkles = new SpriteParticles(500, true);
  private debris = new VoxelDebris(220);
  private lidVel = new THREE.Vector3();
  private lidSpin = 0;
  private popped: Popped[] = [];
  private camShake = 0;
  private camX = 0;
  private zoom = 0; // 0 = perto do baú, 1 = aberto (mostra personagens)
  private nextShakeSound = 0;
  private spawnAcc = 0;
  private bestColor = new THREE.Color();
  /** Para onde o baú desliza quando os personagens começam a sair. */
  private chestTarget = new THREE.Vector3();

  constructor() {
    this.scene.background = backgroundTexture();
    const add = (geo: THREE.BufferGeometry, opacity: number, map?: THREE.Texture) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      if (map) mat.map = map;
      return new THREE.Mesh(geo, mat);
    };
    this.floorGlow = add(new THREE.PlaneGeometry(6, 4), 0.5, radialTexture());
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = 0.01;
    this.crack = add(new THREE.BoxGeometry(CHEST_W * CHEST_VOXEL + 0.04, 0.07, CHEST_D * CHEST_VOXEL + 0.04), 0);
    this.crack.position.y = CHEST_BASE_H * CHEST_VOXEL;
    this.rays = add(new THREE.PlaneGeometry(5, 5), 0, raysTexture());
    this.rays.position.set(0, 0.7, -0.8);
    this.glow = add(new THREE.PlaneGeometry(3.4, 3.4), 0, radialTexture());
    this.glow.position.set(0, 0.7, -0.6);
    this.pillar = add(new THREE.CylinderGeometry(0.42, 0.55, 6, 24, 1, true), 0);
    this.pillar.position.y = 3.3;
    this.debris.groundY = 0;
    this.scene.add(this.floorGlow, this.rays, this.glow, this.pillar, this.crack, this.sparkles.points, this.debris.mesh);
  }

  /** Prepara um baú fechado (ainda sem animação). */
  setChest(type: ChestType, best: Rarity, shakeSec: number): void {
    this.clearChest();
    this.type = type;
    this.best = best;
    this.shakeSec = shakeSec * (RANK[best] >= 3 ? 1.35 : 1);
    this.chest = createChestView(type);
    this.scene.add(this.chest.root);
    this.bestColor.setHex(RARITY_COLORS[best].hex);
    for (const m of [this.crack, this.rays, this.glow, this.pillar]) (m.material as THREE.MeshBasicMaterial).color.copy(this.bestColor);
    (this.floorGlow.material as THREE.MeshBasicMaterial).color.setHex(CHEST_ACCENT[type]);
    this.setOpacity(this.crack, 0);
    this.setOpacity(this.rays, 0);
    this.setOpacity(this.glow, 0);
    this.setOpacity(this.pillar, 0);
    this.phase = 'idle';
    this.zoom = 0;
    this.timeScale = 1;
    this.chest.root.position.set(0, 4, 0);
    this.chestTarget.set(0, 0, 0);
    this.rays.position.x = this.glow.position.x = 0;
  }

  /** Começa a sequência: cai, treme e abre sozinho. */
  play(): void {
    this.setPhase('drop');
    audio.play('whoosh', { pitch: 0.7 });
  }

  /** Pula direto para o baú aberto. */
  skipToOpen(): void {
    if (this.phase === 'open' || this.phase === 'burst') return;
    if (this.chest) this.chest.root.position.y = 0;
    this.burst();
  }

  /** Um personagem pula de dentro do baú; o anterior sai de cena. */
  showCharacter(def: CharacterDef): void {
    for (const p of this.popped) if (!p.leaving) p.leaving = 0.001;
    // o baú vai para trás e o personagem pousa ao lado (sem esconder o baú)
    this.chestTarget.set(-0.8, 0, -0.55);
    const view = new CharacterView(def);
    view.face(1, Math.PI / 2 - 0.25);
    view.shadow.visible = true;
    this.scene.add(view.root);
    this.popped.push({ view, t: 0, leaving: 0 });
    const col = def.rarity === 'extremo' ? EXTREME_COLS[0] : new THREE.Color(RARITY_COLORS[def.rarity].hex);
    this.sparkles.burst(0, 0.8, 0, 30 + RANK[def.rarity] * 25, col, 3 + RANK[def.rarity], 0.1, 1.1, { up: 2.5, gravity: 4 });
    // brilho do baú aberto acompanha a carta revelada
    for (const m of [this.rays, this.glow, this.pillar]) (m.material as THREE.MeshBasicMaterial).color.copy(col);
    if (RANK[def.rarity] >= 3) {
      this.slowMo(1.1, 0.35);
      this.camShake = 0.35;
      view.state = 'celebrate';
      setTimeout(() => (view.state = 'idle'), 2400);
    } else {
      setTimeout(() => view.ability(), 350);
    }
  }

  /** Câmera lenta por `seconds` reais. */
  slowMo(seconds: number, scale: number): void {
    this.slowUntil = this.time + seconds;
    this.timeScale = scale;
  }

  private setPhase(p: ChestPhase): void {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p);
  }

  private setOpacity(m: THREE.Mesh, o: number): void {
    (m.material as THREE.MeshBasicMaterial).opacity = o;
  }

  private burst(): void {
    const chest = this.chest;
    if (!chest) return;
    this.setPhase('burst');
    this.timeScale = 1;
    this.slowUntil = 0;
    this.lidVel.set(0, 4.2, -1.6);
    this.lidSpin = -7;
    this.camShake = 0.6;
    const h = CHEST_BASE_H * CHEST_VOXEL;
    const col = [this.bestColor.getHex(), CHEST_ACCENT[this.type], 0xffffff];
    this.debris.explode(0, h, 0, CHEST_W * CHEST_VOXEL, 0.3, CHEST_D * CHEST_VOXEL, col, 40, 4.5, 0.1);
    this.sparkles.burst(0, h + 0.2, 0, 90, this.bestColor, 5, 0.13, 1.3, { up: 3, gravity: 3 });
    audio.play('chestOpen');
    audio.rarityForReveal = RANK[this.best];
    audio.play('reveal');
    vibrate(RANK[this.best] >= 3 ? [40, 30, 120] : [30, 20, 40]);
  }

  private clearChest(): void {
    if (this.chest) this.scene.remove(this.chest.root);
    this.chest = null;
    for (const p of this.popped) {
      this.scene.remove(p.view.root);
      p.view.dispose();
    }
    this.popped = [];
    this.sparkles.clear();
    this.debris.clear();
  }

  dispose(): void {
    this.clearChest();
    this.phase = 'idle';
  }

  update(rawDt: number, width: number, height: number): void {
    this.time += rawDt;
    if (this.slowUntil && this.time > this.slowUntil) {
      this.slowUntil = 0;
      this.timeScale = 1;
    }
    const dt = rawDt * this.timeScale;
    this.t += dt;
    applyStageLighting();
    const chest = this.chest;
    const special = RANK[this.best] >= 3;

    if (chest) {
      const root = chest.root;
      switch (this.phase) {
        case 'drop': {
          // queda com quique
          const k = Math.min(1, this.t / 0.45);
          root.position.y = 4 * (1 - k * k);
          if (k >= 1) {
            root.position.y = 0;
            this.camShake = 0.25;
            audio.play('chestShake', { pitch: 0.6, volume: 1.2 });
            vibrate(25);
            this.debris.explode(0, 0, 0, 1.2, 0.05, 0.8, [0xd8cff0, 0xb7b0cc], 12, 1.6, 0.06);
            this.setPhase('shake');
            this.nextShakeSound = 0.15;
          }
          break;
        }
        case 'shake': {
          const k = Math.min(1, this.t / this.shakeSec);
          const amp = 0.02 + k * k * 0.12;
          const f = 18 + k * 22;
          root.rotation.z = Math.sin(this.t * f) * amp;
          root.rotation.x = Math.cos(this.t * f * 0.8) * amp * 0.4;
          root.position.y = Math.max(0, Math.sin(this.t * f * 0.5)) * k * 0.08;
          chest.lid.rotation.x = -Math.max(0, Math.sin(this.t * f * 1.3)) * k * 0.25;
          this.setOpacity(this.crack, k * 0.95);
          this.setOpacity(this.rays, k * 0.45);
          this.setOpacity(this.glow, k * 0.5);
          this.rays.scale.setScalar(0.6 + k * 0.6);
          this.camShake = Math.max(this.camShake, k * 0.08);
          if (this.t >= this.nextShakeSound) {
            audio.play('chestShake', { pitch: 0.8 + k * 0.7 });
            vibrate(8);
            this.nextShakeSound = this.t + 0.32 - k * 0.2;
          }
          if (k > 0.25 && Math.random() < dt * 30 * k) {
            const a = Math.random() * Math.PI * 2;
            this.sparkles.emit(Math.cos(a) * 0.5, CHEST_BASE_H * CHEST_VOXEL, Math.sin(a) * 0.35, Math.cos(a) * 0.8, 1 + Math.random(), Math.sin(a) * 0.5, this.bestColor, 0.06, 0.6);
          }
          // Lendário/Extremo: o fim da tremedeira fica em câmera lenta
          if (special && k > 0.62 && !this.slowUntil) this.slowMo(1.2, 0.4);
          if (k >= 1) {
            root.rotation.set(0, 0, 0);
            this.burst();
          }
          break;
        }
        case 'burst':
        case 'open': {
          root.rotation.z *= 0.8;
          root.rotation.x *= 0.8;
          root.position.y = 0;
          const follow = Math.min(1, dt * 4);
          root.position.x += (this.chestTarget.x - root.position.x) * follow;
          root.position.z += (this.chestTarget.z - root.position.z) * follow;
          this.pillar.position.x = this.crack.position.x = root.position.x;
          this.pillar.position.z = this.crack.position.z = root.position.z;
          const rx = this.popped.length ? LAND.x : 0;
          this.rays.position.x += (rx - this.rays.position.x) * follow;
          this.glow.position.x = this.rays.position.x;
          // tampa voando
          const lid = chest.lid;
          if (lid.visible) {
            this.lidVel.y -= 9 * dt;
            lid.position.addScaledVector(this.lidVel, dt);
            lid.rotation.x += this.lidSpin * dt;
            if (lid.position.y < -2) lid.visible = false;
          }
          const k = Math.min(1, this.t / 0.5);
          this.setOpacity(this.crack, Math.max(0, 0.95 - k));
          this.setOpacity(this.rays, 0.35 + Math.sin(this.time * 2) * 0.08);
          this.setOpacity(this.glow, 0.45);
          this.setOpacity(this.pillar, 0.22 + Math.sin(this.time * 3) * 0.06);
          this.rays.scale.setScalar(1.3);
          if (this.phase === 'burst' && this.t > 0.55) this.setPhase('open');
          // fonte de brilhos saindo do baú
          this.spawnAcc += dt * (8 + RANK[this.best] * 8);
          while (this.spawnAcc > 1) {
            this.spawnAcc--;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.35;
            const c = this.best === 'extremo' ? EXTREME_COLS[Math.floor(Math.random() * 3)] : this.bestColor;
            this.sparkles.emit(root.position.x + Math.cos(a) * r, CHEST_BASE_H * CHEST_VOXEL, root.position.z + Math.sin(a) * r * 0.6, Math.cos(a) * 0.3, 1.6 + Math.random() * 1.4, Math.sin(a) * 0.2, c, 0.05 + Math.random() * 0.05, 1.3, { drag: 0.4 });
          }
          break;
        }
      }
      this.zoom += ((this.phase === 'open' || this.phase === 'burst' ? 1 : 0) - this.zoom) * Math.min(1, rawDt * 3);
    }
    this.rays.rotation.z = this.time * 0.3;

    // personagens que saltaram do baú
    for (let i = this.popped.length - 1; i >= 0; i--) {
      const p = this.popped[i];
      p.t += dt;
      const v = p.view;
      if (p.leaving) {
        p.leaving += dt * 2.2;
        const k = Math.min(1, p.leaving);
        v.root.position.x = LAND.x + k * 2.6;
        v.root.position.y = Math.sin(k * Math.PI) * 0.6;
        v.root.position.z = LAND.z - k * 0.8;
        v.scale = 1 - k * 0.7;
        if (k >= 1) {
          this.scene.remove(v.root);
          v.dispose();
          this.popped.splice(i, 1);
          continue;
        }
      } else {
        // arco: sai de dentro do baú e pousa ao lado dele
        const k = Math.min(1, p.t / 0.55);
        const e = 1 - Math.pow(1 - k, 2);
        const from = this.chest?.root.position ?? LAND;
        v.root.position.set(from.x + (LAND.x - from.x) * e, CHEST_BASE_H * CHEST_VOXEL * (1 - e) + Math.sin(k * Math.PI) * 1.1, from.z + (LAND.z - from.z) * e);
        v.scale = 0.25 + e * 0.75;
        if (k >= 1 && p.t < 0.6) {
          this.camShake = Math.max(this.camShake, 0.12);
          audio.play('deploy', { volume: 0.7 });
        }
      }
      v.update(dt);
    }

    this.sparkles.update(dt);
    this.debris.update(dt);
    this.frameCamera(width, height, rawDt);
  }

  private frameCamera(width: number, height: number, dt: number): void {
    const rect = this.frame() ?? new DOMRect(0, 0, width, height);
    const w = Math.max(1, rect.width);
    const hgt = Math.max(1, rect.height);
    const aspect = w / hgt;
    // fechado: perto do baú; aberto: mostra o personagem na frente
    const contentH = 1.5 + this.zoom * 0.95;
    const contentW = 2.0 + this.zoom * 1.0;
    const cy = 0.55 + this.zoom * 0.42;
    const cx = this.popped.length ? -0.18 * this.zoom : 0;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(contentH / 2 / tanV, contentW / 2 / (tanV * aspect));
    this.camShake = Math.max(0, this.camShake - dt * 1.6);
    const s = this.camShake * this.camShake;
    const jx = (Math.random() - 0.5) * s * 0.6;
    const jy = (Math.random() - 0.5) * s * 0.6;
    this.camX += (cx - this.camX) * Math.min(1, dt * 3);
    this.camera.position.set(this.camX + jx, cy + 0.28 * dist * 0.18 + jy, dist + 0.4);
    this.camera.lookAt(this.camX + jx * 0.5, cy + jy * 0.5, 0.3);
    this.camera.aspect = aspect;
    this.camera.near = 0.1;
    this.camera.far = dist + 30;
    this.camera.setViewOffset(w, hgt, -rect.left, -rect.top, width, height);
    this.camera.updateProjectionMatrix();
  }
}
