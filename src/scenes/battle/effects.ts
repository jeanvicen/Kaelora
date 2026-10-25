import * as THREE from 'three';
import { SpriteParticles, VoxelDebris } from '../../render/particles.ts';
import { radialTexture } from '../../render/environment.ts';

interface Beam {
  mesh: THREE.Mesh;
  life: number;
  max: number;
}
interface Bolt {
  line: THREE.LineSegments;
  life: number;
  max: number;
  a: THREE.Vector3;
  b: THREE.Vector3[];
}
interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}
interface Bubble {
  mesh: THREE.Mesh;
  life: number;
  follow: () => THREE.Vector3 | null;
}

const tmpA = new THREE.Vector3();
const tmpC = new THREE.Color();

/**
 * Efeitos da batalha com pooling: feixes, raios, anéis de choque, bolhas de
 * escudo, faíscas, fumaça e destroços voxel.
 */
export class BattleEffects {
  readonly group = new THREE.Group();
  readonly sparks: SpriteParticles;
  readonly smoke: SpriteParticles;
  readonly debris: VoxelDebris;
  private beams: Beam[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private bubbles: Bubble[] = [];
  private beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  private glowMat = new THREE.SpriteMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private flashes: { sprite: THREE.Sprite; life: number; max: number; size: number }[] = [];
  quality = 1;

  constructor(quality: number) {
    this.quality = quality;
    this.sparks = new SpriteParticles(Math.round(700 * quality) + 200, true);
    this.smoke = new SpriteParticles(Math.round(400 * quality) + 100, false);
    this.debris = new VoxelDebris(Math.round(500 * quality) + 150);
    this.debris.groundY = 0;
    this.group.add(this.smoke.points, this.sparks.points, this.debris.mesh);
  }

  /** Feixe reto (laser, cura, dreno). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.07, life = 0.14): void {
    let b = this.beams.find((x) => x.life <= 0);
    if (!b) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      b = { mesh: new THREE.Mesh(this.beamGeo, mat), life: 0, max: 0 };
      this.beams.push(b);
      this.group.add(b.mesh);
    }
    const len = from.distanceTo(to);
    b.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    b.mesh.scale.set(width, len, width);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpA.copy(to).sub(from).normalize());
    (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    b.mesh.visible = true;
    b.life = b.max = life;
    this.flash(to, color, 0.7, 0.15);
  }

  /** Raio elétrico em zigue-zague passando por vários pontos. */
  lightning(points: THREE.Vector3[], color = 0xf9ff5a, life = 0.2): void {
    if (points.length < 2) return;
    let bolt = this.bolts.find((x) => x.life <= 0);
    if (!bolt) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false;
      bolt = { line, life: 0, max: 0, a: new THREE.Vector3(), b: [] };
      this.bolts.push(bolt);
      this.group.add(line);
    }
    (bolt.line.material as THREE.LineBasicMaterial).color.setHex(color);
    bolt.a.copy(points[0]);
    bolt.b = points.slice(1).map((p) => p.clone());
    bolt.life = bolt.max = life;
    bolt.line.visible = true;
    this.rebuildBolt(bolt);
    for (const p of points) this.flash(p, color, 0.8, 0.18);
  }

  private rebuildBolt(bolt: Bolt): void {
    const attr = bolt.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let n = 0;
    let from = bolt.a.clone();
    for (const target of bolt.b) {
      let last = from.clone();
      const steps = 6;
      for (let i = 1; i <= steps && n < 64; i++) {
        const p = from.clone().lerp(target, i / steps);
        if (i < steps) {
          p.x += (Math.random() - 0.5) * 0.35;
          p.y += (Math.random() - 0.5) * 0.45;
          p.z += (Math.random() - 0.5) * 0.2;
        }
        arr.set([last.x, last.y, last.z, p.x, p.y, p.z], n * 6);
        n++;
        last = p;
      }
      from = target.clone();
    }
    bolt.line.geometry.setDrawRange(0, n * 2);
    attr.needsUpdate = true;
  }

  /** Clarão (sprite aditivo). */
  flash(at: THREE.Vector3, color: number, size: number, life: number): void {
    let f = this.flashes.find((x) => x.life <= 0);
    if (!f) {
      const sprite = new THREE.Sprite(this.glowMat.clone());
      f = { sprite, life: 0, max: 0, size: 1 };
      this.flashes.push(f);
      this.group.add(sprite);
    }
    f.sprite.position.copy(at);
    (f.sprite.material as THREE.SpriteMaterial).color.setHex(color);
    f.life = f.max = life;
    f.size = size;
    f.sprite.visible = true;
  }

  /** Anel de choque no chão. */
  shockwave(x: number, z: number, radius: number, color: number, life = 0.45, y = 0.05): void {
    let r = this.rings.find((v) => v.life <= 0);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      r = { mesh: new THREE.Mesh(this.ringGeo, mat), life: 0, max: 0, size: 1 };
      r.mesh.rotation.x = -Math.PI / 2;
      this.rings.push(r);
      this.group.add(r.mesh);
    }
    r.mesh.position.set(x, y, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.life = r.max = life;
    r.size = radius;
    r.mesh.visible = true;
  }

  /** Bolha de escudo que segue um alvo. */
  shield(follow: () => THREE.Vector3 | null, color: number, life = 1.2): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), mat);
    this.group.add(mesh);
    this.bubbles.push({ mesh, life, follow });
  }

  /** Explosão completa: fogo, fumaça, faíscas, anel e destroços voxel. */
  explosion(x: number, y: number, z: number, radius: number, colors: number[], big: boolean): void {
    const q = this.quality;
    const fire = [0xfff2a8, 0xffb21a, 0xff5a2e];
    for (let i = 0; i < Math.round((big ? 40 : 16) * q); i++) {
      tmpC.setHex(fire[i % 3]);
      const a = Math.random() * Math.PI * 2;
      const s = radius * (1.5 + Math.random() * 2.5);
      this.sparks.emit(x, y, z, Math.cos(a) * s, 1 + Math.random() * 4 * (big ? 1.4 : 1), Math.sin(a) * s * 0.5, tmpC, 0.35 + Math.random() * (big ? 0.6 : 0.3), 0.5 + Math.random() * 0.4, { gravity: 6, drag: 2.5 });
    }
    for (let i = 0; i < Math.round((big ? 7 : 3) * q); i++) {
      tmpC.setRGB(0.7, 0.66, 0.8);
      this.smoke.emit(x + (Math.random() - 0.5) * radius, y + Math.random() * 0.4, z - 0.3, (Math.random() - 0.5) * 1.2, 0.7 + Math.random(), -0.1, tmpC, 0.4 + Math.random() * 0.3, 0.9 + Math.random() * 0.6, { grow: 0.7, drag: 1.6 });
    }
    this.debris.explode(x, y, z, radius, 0.6, 0.6, colors, Math.round((big ? 24 : 8) * q), big ? 6 : 4, big ? 0.2 : 0.14);
    this.shockwave(x, z, radius * (big ? 2.4 : 1.4), 0xffd23f, big ? 0.55 : 0.35);
    this.flash(new THREE.Vector3(x, y + 0.3, z), 0xfff2a8, big ? 5 : 2.2, big ? 0.3 : 0.18);
  }

  /** Construção desmoronando em cubos voxel. */
  collapse(x: number, z: number, w: number, h: number, colors: number[]): void {
    const n = Math.round(Math.min(90, 24 + w * h * 9) * this.quality);
    this.debris.explode(x, 0.1, z, w, h, w, colors, n, 5.5, 0.18);
    for (let i = 0; i < Math.round(9 * this.quality); i++) {
      tmpC.setRGB(0.78, 0.74, 0.86);
      this.smoke.emit(x + (Math.random() - 0.5) * w, Math.random() * h * 0.7, z - 0.4, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6, -0.2, tmpC, 0.45 + Math.random() * 0.35, 1.1 + Math.random() * 0.6, { grow: 0.6, drag: 1.4 });
    }
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = k;
      b.mesh.scale.x = b.mesh.scale.z = Math.max(0.01, b.mesh.scale.x * (0.85 + 0.15 * k));
      if (b.life <= 0) b.mesh.visible = false;
    }
    for (const bolt of this.bolts) {
      if (bolt.life <= 0) continue;
      bolt.life -= dt;
      if (Math.random() < 0.5) this.rebuildBolt(bolt);
      (bolt.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, bolt.life / bolt.max);
      if (bolt.life <= 0) bolt.line.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life / r.max);
      const s = 0.2 + k * r.size;
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.sprite.scale.setScalar(f.size * (1.2 - k * 0.2));
      (f.sprite.material as THREE.SpriteMaterial).opacity = k;
      if (f.life <= 0) f.sprite.visible = false;
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      const p = b.follow();
      if (!p || b.life <= 0) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.mesh.position.copy(p).add(new THREE.Vector3(0, 0.65, 0));
      b.mesh.rotation.y += dt * 2;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.35, b.life) * (0.85 + Math.sin(b.life * 20) * 0.15);
    }
  }

  clear(): void {
    this.sparks.clear();
    this.smoke.clear();
    this.debris.clear();
    for (const b of this.beams) (b.life = 0), (b.mesh.visible = false);
    for (const b of this.bolts) (b.life = 0), (b.line.visible = false);
    for (const r of this.rings) (r.life = 0), (r.mesh.visible = false);
    for (const f of this.flashes) (f.life = 0), (f.sprite.visible = false);
    for (const b of this.bubbles) this.group.remove(b.mesh);
    this.bubbles = [];
  }
}
