import * as THREE from 'three';
import { lightUniforms } from './toon.ts';

/**
 * Partículas em sprite (Points) com pool fixo: fumaça, faíscas, brilhos.
 * Tudo em arrays tipados — nada é alocado durante o jogo.
 */
export class SpriteParticles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private drag: Float32Array;
  private gravity: Float32Array;
  private alpha: Float32Array;
  private cursor = 0;
  readonly capacity: number;
  private geo: THREE.BufferGeometry;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uResolution: lightUniforms.uResolution },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        uniform vec2 uResolution;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // tamanho em mundo -> pixels (funciona em perspectiva)
          gl_PointSize = aSize * projectionMatrix[1][1] * uResolution.y * 0.5 / max(0.001, -mv.z);
          if (aAlpha <= 0.0) gl_PointSize = 0.0;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          if (d > 1.0) discard;
          // borda "toon": miolo cheio e aro mais escuro
          float a = smoothstep(1.0, 0.82, d);
          vec3 col = mix(vColor, vColor * 0.78, smoothstep(0.55, 0.75, d));
          gl_FragColor = vec4(col, a * vAlpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    opts: { grow?: number; drag?: number; gravity?: number } = {},
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = opts.grow ?? 0;
    this.drag[i] = opts.drag ?? 0.5;
    this.gravity[i] = opts.gravity ?? 0;
    this.alpha[i] = 1;
  }

  /** Explosão radial de partículas. */
  burst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: THREE.Color,
    speed: number,
    size: number,
    life: number,
    opts: { up?: number; gravity?: number; grow?: number; spread?: number } = {},
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      const sp = opts.spread ?? 1;
      this.emit(
        x,
        y,
        z,
        Math.cos(a) * Math.cos(b) * s * sp,
        Math.sin(b) * s + (opts.up ?? 0),
        Math.sin(a) * Math.cos(b) * s * sp,
        color,
        size * (0.6 + Math.random() * 0.7),
        life * (0.6 + Math.random() * 0.6),
        { gravity: opts.gravity ?? 0, grow: opts.grow ?? 0, drag: 1.5 },
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0, this.size[i] + this.grow[i] * dt);
      this.alpha[i] = k < 0.3 ? k / 0.3 : 1;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

/**
 * Destroços voxel: cubinhos com gravidade, quique no chão e sumiço gradual.
 * É o que faz uma construção "explodir em cubos" quando cai.
 */
export class VoxelDebris {
  readonly mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private scale: Float32Array;
  private cursor = 0;
  readonly capacity: number;
  groundY = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(capacity: number) {
    this.capacity = capacity;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: lightUniforms.uSunDir, uShadowColor: lightUniforms.uShadowColor, uMidColor: lightUniforms.uMidColor, uSunColor: lightUniforms.uSunColor },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vC;
        void main() {
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vC = instanceColor;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uShadowColor;
        uniform vec3 uMidColor;
        uniform vec3 uSunColor;
        varying vec3 vN;
        varying vec3 vC;
        void main() {
          float ndl = dot(normalize(vN), uSunDir);
          vec3 light = ndl > 0.62 ? uSunColor : ndl > 0.15 ? uMidColor : uShadowColor;
          gl_FragColor = vec4(vC * light, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.scale = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
  }

  /** Explode `count` cubos a partir de uma caixa, com cores sorteadas da lista. */
  explode(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    colors: number[],
    count: number,
    power = 5,
    size = 0.22,
  ): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const x = cx + (Math.random() - 0.5) * w;
      const y = cy + Math.random() * h;
      const z = cz + (Math.random() - 0.5) * d;
      this.pos.set([x, y, z], i * 3);
      const dx = x - cx;
      const dz = z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const sp = power * (0.4 + Math.random() * 0.8);
      this.vel.set([(dx / len) * sp * 0.6 + (Math.random() - 0.5) * 2, 2 + Math.random() * power, (dz / len) * sp * 0.6 + (Math.random() - 0.5) * 2], i * 3);
      this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.spin.set([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12], i * 3);
      this.life[i] = 1.6 + Math.random() * 1.6;
      this.scale[i] = size * (0.6 + Math.random() * 0.9);
      this.c.setHex(colors[Math.floor(Math.random() * colors.length)]);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      let vy = this.vel[i * 3 + 1] - 18 * dt;
      let y = this.pos[i * 3 + 1] + vy * dt;
      const sc = this.scale[i];
      if (y < this.groundY + sc / 2) {
        y = this.groundY + sc / 2;
        vy = Math.abs(vy) > 1.5 ? -vy * 0.35 : 0;
        this.vel[i * 3] *= 0.6;
        this.vel[i * 3 + 2] *= 0.6;
        this.spin[i * 3] *= 0.5;
        this.spin[i * 3 + 2] *= 0.5;
      }
      this.vel[i * 3 + 1] = vy;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      for (let k = 0; k < 3; k++) this.rot[i * 3 + k] += this.spin[i * 3 + k] * dt;
      const fade = Math.min(1, this.life[i] / 0.6);
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.e.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]);
      this.q.setFromEuler(this.e);
      const s = this.life[i] > 0 ? sc * fade : 0;
      this.s.set(s, s, s);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
