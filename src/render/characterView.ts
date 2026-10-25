import * as THREE from 'three';
import type { CharacterDef } from '../content/types.ts';
import { CHAR_VOXEL, characterParts, partGeometry, type PartModel } from './models/characters.ts';
import { createToonMaterial, createVoxelObject, type ToonMaterial } from './toon.ts';
import { createBlobShadow, radialTexture } from './environment.ts';

const MELEE = new Set(['tanque', 'lutador', 'assassino', 'construtor', 'sabotador']);
const STAFF = new Set(['mago', 'curandeiro', 'invocador']);

export type AnimState = 'idle' | 'walk' | 'dead' | 'celebrate';

/**
 * Personagem voxel montado em partes e animado por transformação:
 * idle, andar, atacar, habilidade, dano, morte e comemoração.
 */
export class CharacterView {
  readonly root = new THREE.Group();
  /** Gira para o lado que o personagem olha. */
  readonly facing = new THREE.Group();
  /** Corpo inteiro (balanço, inclinação, queda). */
  readonly pivot = new THREE.Group();
  readonly material: ToonMaterial;
  readonly height: number;
  readonly def: Pick<CharacterDef, 'id' | 'cls' | 'look'>;
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private head: THREE.Object3D;
  private body: THREE.Object3D;
  private back: THREE.Object3D | null = null;
  private float: THREE.Object3D | null = null;
  private aura: THREE.Mesh | null = null;
  readonly shadow: THREE.Mesh;
  readonly muzzleLocal: THREE.Vector3;
  state: AnimState = 'idle';
  private t = Math.random() * 10;
  private attackT = 1;
  private abilityT = 1;
  private hurtT = 1;
  private deathT = 0;
  private flash = 0;
  private flashColor = new THREE.Color(1, 1, 1);
  private melee: boolean;
  private staff: boolean;
  scale = 1;

  constructor(def: Pick<CharacterDef, 'id' | 'cls' | 'look'>, opts: { outline?: boolean } = {}) {
    this.def = def;
    const parts = characterParts(def);
    this.material = createToonMaterial();
    this.melee = MELEE.has(def.cls);
    this.staff = STAFF.has(def.cls);
    const make = (name: string, part: PartModel) => {
      const geo = partGeometry(`${def.id}:${name}`, part);
      const obj = createVoxelObject(geo, { material: this.material, outline: opts.outline === false ? null : undefined });
      obj.position.set(part.at[0] * CHAR_VOXEL, part.at[1] * CHAR_VOXEL, part.at[2] * CHAR_VOXEL);
      return obj;
    };
    this.legL = make('legL', parts.legL);
    this.legR = make('legR', parts.legR);
    this.body = make('body', parts.body);
    this.head = make('head', parts.head);
    this.armL = make('armL', parts.armL);
    this.armR = make('armR', parts.armR);
    if (parts.weapon) this.armR.add(make('weapon', parts.weapon));
    if (parts.offhand) {
      const off = make('offhand', parts.offhand);
      if (def.cls === 'tanque') off.position.x -= 0.1;
      this.armL.add(off);
    }
    if (parts.back) {
      this.back = make('back', parts.back);
      this.body.add(this.back);
    }
    if (parts.float) this.float = make('float', parts.float);
    this.pivot.add(this.legL, this.legR, this.body, this.head, this.armL, this.armR);
    if (this.float) this.pivot.add(this.float);
    if (parts.aura !== null) {
      const mat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: parts.aura, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      this.aura = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
      this.aura.rotation.x = -Math.PI / 2;
      this.aura.position.y = 0.03;
      this.root.add(this.aura);
    }
    this.facing.add(this.pivot);
    this.root.add(this.facing);
    this.shadow = createBlobShadow(0.42, 0.4);
    this.root.add(this.shadow);
    this.height = parts.height;
    this.muzzleLocal = new THREE.Vector3(parts.muzzle[0], parts.muzzle[1], parts.muzzle[2]).multiplyScalar(CHAR_VOXEL);
    if (def.cls === 'bombardeiro') this.armR.rotation.x = -0.35;
  }

  /** Vira para a direita (+x) ou esquerda, levemente de frente para a câmera. */
  face(dir: 1 | -1, toCamera = 0.55): void {
    this.facing.rotation.y = dir * (Math.PI / 2 - toCamera);
  }

  attack(): void {
    this.attackT = 0;
  }

  ability(): void {
    this.abilityT = 0;
    this.doFlash(0xffffff, 0.8);
  }

  hurt(color = 0xffffff): void {
    this.hurtT = 0;
    this.doFlash(color, 0.85);
  }

  doFlash(color: number, amount: number): void {
    this.flashColor.setHex(color);
    this.flash = amount;
  }

  die(): void {
    this.state = 'dead';
    this.deathT = 0;
  }

  get deathProgress(): number {
    return this.deathT;
  }

  /** Posição mundial aproximada do cano da arma / mão. */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(this.muzzleLocal);
    this.armR.localToWorld(out);
    return out;
  }

  update(dt: number): void {
    this.t += dt;
    this.attackT = Math.min(1, this.attackT + dt * 3.2);
    this.abilityT = Math.min(1, this.abilityT + dt * 1.6);
    this.hurtT = Math.min(1, this.hurtT + dt * 5);
    this.flash = Math.max(0, this.flash - dt * 5);
    const u = this.material.uniforms;
    u.uFlash.value.set(this.flashColor.r, this.flashColor.g, this.flashColor.b, this.flash);

    const t = this.t;
    const walk = this.state === 'walk';
    const swing = walk ? Math.sin(t * 11) : 0;
    let bob = walk ? Math.abs(Math.sin(t * 11)) * 0.06 : Math.sin(t * 2.2) * 0.015;
    this.legL.rotation.x = swing * 0.7;
    this.legR.rotation.x = -swing * 0.7;
    this.armL.rotation.x = -swing * 0.6;
    this.armR.rotation.x = swing * 0.6 + (this.def.cls === 'bombardeiro' ? -0.35 : 0);
    this.armL.rotation.z = 0;
    this.armR.rotation.z = 0;
    this.pivot.rotation.x = walk ? 0.12 : 0;
    this.head.rotation.z = Math.sin(t * 1.7) * 0.04;
    this.head.rotation.x = 0;

    // ataque
    if (this.attackT < 1) {
      const k = this.attackT;
      if (this.melee) {
        // levanta e desce o braço com força
        const wind = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        this.armR.rotation.x = k < 0.35 ? -2.6 * wind : -2.6 + (k - 0.35) * 5.4;
        this.armR.rotation.x = Math.min(this.armR.rotation.x, 0.9);
        this.pivot.rotation.x = 0.25 * Math.sin(k * Math.PI);
        if (this.def.cls === 'assassino') this.armL.rotation.x = this.armR.rotation.x * 0.8;
        if (this.def.cls === 'tanque') this.armL.rotation.x = -0.6;
      } else if (this.staff) {
        this.armR.rotation.x = -1.4 * Math.sin(k * Math.PI);
        this.armL.rotation.x = -0.8 * Math.sin(k * Math.PI);
      } else {
        // recuo do tiro
        this.armR.rotation.x = -0.25 * (1 - k) + (this.def.cls === 'bombardeiro' ? -0.35 : 0);
        this.pivot.position.z = -0.06 * (1 - k);
      }
    } else this.pivot.position.z = 0;

    // habilidade: pulo com giro e braços para cima
    if (this.abilityT < 1) {
      const k = this.abilityT;
      bob += Math.sin(k * Math.PI) * 0.45;
      this.pivot.rotation.y = k < 0.6 ? (k / 0.6) * Math.PI * 2 : 0;
      this.armL.rotation.z = -1.2 * Math.sin(k * Math.PI);
      this.armR.rotation.z = 1.2 * Math.sin(k * Math.PI);
      this.armL.rotation.x = -2.4 * Math.sin(k * Math.PI);
      this.armR.rotation.x = -2.4 * Math.sin(k * Math.PI);
    } else this.pivot.rotation.y = 0;

    // dano: tremida
    if (this.hurtT < 1) {
      const k = 1 - this.hurtT;
      this.pivot.position.x = Math.sin(this.hurtT * 60) * 0.05 * k;
      this.head.rotation.x = -0.3 * k;
    } else this.pivot.position.x = 0;

    if (this.state === 'celebrate') {
      bob = Math.abs(Math.sin(t * 7)) * 0.35;
      this.armL.rotation.x = -2.8 + Math.sin(t * 7) * 0.3;
      this.armR.rotation.x = -2.8 - Math.sin(t * 7) * 0.3;
      this.armL.rotation.z = -0.4;
      this.armR.rotation.z = 0.4;
    }

    if (this.state === 'dead') {
      this.deathT = Math.min(1, this.deathT + dt * 1.6);
      const k = this.deathT;
      this.pivot.rotation.z = -Math.min(1, k * 2) * (Math.PI / 2);
      this.pivot.position.y = -k * 0.2;
      this.shadow.visible = k < 0.6;
      bob = 0;
    }
    this.pivot.position.y = this.state === 'dead' ? this.pivot.position.y : bob;
    if (this.float) {
      this.float.position.y = (14 + Math.sin(t * 3) * 1.5) * CHAR_VOXEL;
      this.float.rotation.y += dt * 2;
    }
    if (this.back && this.def.look.accessory === 'cape') this.back.rotation.x = -0.15 - (walk ? 0.25 : 0.05) - Math.sin(t * 4) * 0.05;
    if (this.back && this.def.look.accessory === 'wings') this.back.rotation.y = Math.sin(t * 6) * 0.15;
    if (this.aura) {
      this.aura.rotation.z += dt;
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 4) * 0.15;
    }
    this.root.scale.setScalar(this.scale);
  }

  dispose(): void {
    this.material.dispose();
    (this.shadow.material as THREE.Material).dispose();
    if (this.aura) (this.aura.material as THREE.Material).dispose();
  }
}
