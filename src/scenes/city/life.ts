import * as THREE from 'three';
import {
  InstancedVoxel,
  birdModel,
  boatModel,
  citizenModel,
  cloudModel,
  cloudOutlineMaterial,
  hoverCarModel,
  propGeometry,
} from '../../render/models/props.ts';
import { createVoxelObject } from '../../render/toon.ts';
import { buildVoxelGeometry } from '../../render/voxel.ts';
import type { SpriteParticles } from '../../render/particles.ts';

interface Walker {
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  wait: number;
  phase: number;
  variant: number;
  slot: number;
  heading: number;
}

const CITIZEN_VARIANTS = 4;

/**
 * Vida na cidade: moradores andando, carros voando, pássaros, barcos,
 * nuvens e fumaça. Tudo instanciado para custar poucos draw calls.
 */
export class CityLife {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];
  private citizenMeshes: InstancedVoxel[] = [];
  private cars: InstancedVoxel;
  private carData: { r: number; h: number; speed: number; phase: number; ecc: number }[] = [];
  private birds: InstancedVoxel;
  private birdData: { phase: number; off: THREE.Vector3 }[] = [];
  private boats: InstancedVoxel;
  private boatData: { r: number; speed: number; phase: number }[] = [];
  private clouds: THREE.Group[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();
  private e = new THREE.Euler();
  private smokeTimer = 0;
  smokeSources: THREE.Vector3[] = [];
  private center = new THREE.Vector2();
  private size = 24;
  private isFree: (x: number, z: number) => boolean = () => true;

  constructor(density: number) {
    const citizens = Math.round(6 + 10 * density);
    for (let v = 0; v < CITIZEN_VARIANTS; v++) {
      const geo = propGeometry(`citizen-${v}`, () => citizenModel(v * 3 + 1), 1 / 14);
      const inst = new InstancedVoxel(geo, Math.ceil(citizens / CITIZEN_VARIANTS));
      this.citizenMeshes.push(inst);
      this.group.add(inst.group);
    }
    for (let i = 0; i < citizens; i++) {
      const variant = i % CITIZEN_VARIANTS;
      this.walkers.push({ x: 12, z: 12, tx: 12, tz: 12, speed: 0.7 + Math.random() * 0.6, wait: Math.random() * 3, phase: Math.random() * 6, variant, slot: Math.floor(i / CITIZEN_VARIANTS), heading: Math.random() * 6.28 });
    }

    const carCount = Math.round(3 + 4 * density);
    this.cars = new InstancedVoxel(propGeometry('car', () => hoverCarModel(0), 1 / 11), carCount);
    for (let i = 0; i < carCount; i++) this.carData.push({ r: 0, h: 3.5 + (i % 3) * 1.1, speed: (0.12 + Math.random() * 0.12) * (i % 2 ? 1 : -1), phase: Math.random() * 6.28, ecc: 0.75 + Math.random() * 0.3 });
    this.group.add(this.cars.group);

    const birdCount = Math.round(4 + 5 * density);
    this.birds = new InstancedVoxel(propGeometry('bird', birdModel, 1 / 16), birdCount);
    for (let i = 0; i < birdCount; i++) this.birdData.push({ phase: Math.random() * 6, off: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 3) });
    this.group.add(this.birds.group);

    const boatCount = Math.round(2 + 2 * density);
    this.boats = new InstancedVoxel(propGeometry('boat', () => boatModel(1), 1 / 9), boatCount);
    for (let i = 0; i < boatCount; i++) this.boatData.push({ r: 0, speed: 0.03 + Math.random() * 0.03, phase: (i / boatCount) * 6.28 });
    this.group.add(this.boats.group);

    for (let i = 0; i < 5; i++) {
      const geo = buildVoxelGeometry(cloudModel(i * 13 + 3), { scale: 1 / 2.4, pivot: 'center' });
      const cloud = createVoxelObject(geo, { outline: cloudOutlineMaterial() });
      cloud.userData.speed = 0.4 + Math.random() * 0.4;
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  /** Reposiciona tudo para uma cidade de lado `size` e informa as casas livres. */
  setCity(size: number, isFree: (x: number, z: number) => boolean): void {
    this.size = size;
    this.isFree = isFree;
    this.center.set(size / 2, size / 2);
    for (const w of this.walkers) {
      const c = this.randomFreeCell() ?? { x: size / 2, z: size / 2 };
      w.x = w.tx = c.x;
      w.z = w.tz = c.z;
    }
    const base = size * 0.75 + 6;
    this.carData.forEach((c, i) => (c.r = base - (i % 3) * 2));
    this.boatData.forEach((b, i) => (b.r = size * 0.7 + 14 + (i % 2) * 5));
    this.clouds.forEach((cl, i) => {
      cl.position.set(-20 + i * ((size + 40) / 5), 15 + (i % 3) * 2.5, -6 + ((i * 7) % 5) * (size / 4));
    });
  }

  /** Atualiza as casas livres sem reposicionar ninguém (construção nova, movida...). */
  setFreeCells(isFree: (x: number, z: number) => boolean): void {
    this.isFree = isFree;
  }

  private randomFreeCell(): { x: number; z: number } | null {
    for (let k = 0; k < 30; k++) {
      const x = Math.floor(Math.random() * this.size);
      const z = Math.floor(Math.random() * this.size);
      if (this.isFree(x, z)) return { x: x + 0.5, z: z + 0.5 };
    }
    return null;
  }

  private pathFree(x0: number, z0: number, x1: number, z1: number): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.isFree(Math.floor(x0 + (x1 - x0) * t), Math.floor(z0 + (z1 - z0) * t))) return false;
    }
    return true;
  }

  update(dt: number, time: number, night: number, particles: SpriteParticles | null): void {
    // moradores
    const counters = new Array(CITIZEN_VARIANTS).fill(0);
    for (const w of this.walkers) {
      const dx = w.tx - w.x;
      const dz = w.tz - w.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (w.wait > 0) w.wait -= dt;
      else if (d < 0.05) {
        // escolhe um novo destino perto, com caminho livre
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 1 + Math.random() * 4;
          const nx = w.x + Math.cos(a) * r;
          const nz = w.z + Math.sin(a) * r;
          if (nx < 0.3 || nz < 0.3 || nx > this.size - 0.3 || nz > this.size - 0.3) continue;
          if (this.isFree(Math.floor(nx), Math.floor(nz)) && this.pathFree(w.x, w.z, nx, nz)) {
            w.tx = nx;
            w.tz = nz;
            break;
          }
        }
        w.wait = 0.5 + Math.random() * 2.5;
      } else {
        const step = Math.min(d, w.speed * dt);
        w.x += (dx / d) * step;
        w.z += (dz / d) * step;
        moving = true;
      }
      // se uma construção nasceu em cima, teleporta para uma casa livre
      if (!this.isFree(Math.floor(w.x), Math.floor(w.z))) {
        const c = this.randomFreeCell();
        if (c) {
          w.x = w.tx = c.x;
          w.z = w.tz = c.z;
        }
      }
      w.phase += dt * (moving ? 12 : 2);
      const bob = moving ? Math.abs(Math.sin(w.phase)) * 0.06 : 0;
      if (moving) w.heading = Math.atan2(w.tx - w.x, w.tz - w.z);
      this.e.set(0, w.heading, moving ? Math.sin(w.phase) * 0.12 : 0);
      this.q.setFromEuler(this.e);
      this.p.set(w.x, bob, w.z);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      const mesh = this.citizenMeshes[w.variant];
      mesh.setMatrixAt(counters[w.variant]++, this.m);
    }
    this.citizenMeshes.forEach((m) => m.commit());

    // carros voadores em órbitas elípticas
    this.carData.forEach((c, i) => {
      const a = c.phase + time * c.speed;
      const x = this.center.x + Math.cos(a) * c.r;
      const z = this.center.y + Math.sin(a) * c.r * c.ecc;
      const ta = a + Math.sign(c.speed) * 0.05;
      const nx = this.center.x + Math.cos(ta) * c.r;
      const nz = this.center.y + Math.sin(ta) * c.r * c.ecc;
      this.e.set(0, Math.atan2(nz - z, nx - x) * -1, Math.sin(time * 2 + i) * 0.05);
      this.q.setFromEuler(this.e);
      this.p.set(x, c.h + Math.sin(time * 1.5 + i) * 0.15, z);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.cars.setMatrixAt(i, this.m);
    });
    this.cars.commit();

    // bando de pássaros
    const bx = this.center.x + Math.cos(time * 0.13) * this.size * 0.45;
    const bz = this.center.y + Math.sin(time * 0.21) * this.size * 0.35;
    const by = 8 + Math.sin(time * 0.3) * 1.5;
    const heading = Math.atan2(Math.cos(time * 0.21) * 0.21 * this.size * 0.35, -Math.sin(time * 0.13) * 0.13 * this.size * 0.45);
    this.birdData.forEach((b, i) => {
      const flap = Math.sin(time * 9 + b.phase);
      this.e.set(0, -heading + Math.PI / 2, 0);
      this.q.setFromEuler(this.e);
      this.p.set(bx + b.off.x, by + b.off.y + flap * 0.05, bz + b.off.z);
      this.s.set(1, 0.4 + Math.abs(flap) * 1.4, 1);
      this.m.compose(this.p, this.q, this.s);
      this.birds.setMatrixAt(i, this.m);
    });
    this.birds.commit();

    // barcos
    this.boatData.forEach((b, i) => {
      const a = b.phase + time * b.speed;
      const x = this.center.x + Math.cos(a) * b.r;
      const z = this.center.y + Math.sin(a) * b.r;
      this.e.set(Math.sin(time * 1.3 + i) * 0.04, -a - Math.PI / 2, Math.sin(time * 1.1 + i) * 0.05);
      this.q.setFromEuler(this.e);
      this.p.set(x, -0.75 + Math.sin(time * 1.6 + i) * 0.06, z);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.boats.setMatrixAt(i, this.m);
    });
    this.boats.commit();

    // nuvens
    for (const cl of this.clouds) {
      cl.position.x += dt * (cl.userData.speed as number);
      if (cl.position.x > this.size + 30) cl.position.x = -30;
    }

    // fumaça das chaminés
    if (particles && this.smokeSources.length) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.35;
        const col = smokeColor.setRGB(0.92 - night * 0.4, 0.92 - night * 0.4, 0.98 - night * 0.3);
        for (const s of this.smokeSources) {
          particles.emit(s.x + (Math.random() - 0.5) * 0.1, s.y, s.z, (Math.random() - 0.3) * 0.2, 0.55, (Math.random() - 0.5) * 0.15, col, 0.28, 2.6, {
            grow: 0.22,
            drag: 0.3,
          });
        }
      }
    }
  }
}

const smokeColor = new THREE.Color();
