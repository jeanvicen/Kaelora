import * as THREE from 'three';

/**
 * Cor da paleta de um modelo voxel.
 * - `glow`: brilho permanente (néon), 0..1
 * - `night`: brilho só à noite (janelas), 0..1
 * - `sway`: quanto o voxel balança com o vento (folhas), 0..1
 */
export interface VoxelColor {
  c: number;
  glow?: number;
  night?: number;
  sway?: number;
}

/** Paleta indexada: índice 0 é sempre "vazio". */
export class Palette {
  readonly colors: VoxelColor[] = [{ c: 0 }];
  private index = new Map<string, number>();

  add(c: number, fx: Omit<VoxelColor, 'c'> = {}): number {
    const key = `${c}|${fx.glow ?? 0}|${fx.night ?? 0}|${fx.sway ?? 0}`;
    const found = this.index.get(key);
    if (found !== undefined) return found;
    if (this.colors.length >= 255) throw new Error('Paleta voxel cheia (máximo 254 cores)');
    this.colors.push({ c, ...fx });
    const i = this.colors.length - 1;
    this.index.set(key, i);
    return i;
  }
}

/** Grade voxel densa com ferramentas de "escultura". Coordenadas inteiras. */
export class VoxelGrid {
  readonly data: Uint8Array;

  constructor(
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    this.data = new Uint8Array(sx * sy * sz);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return 0;
    return this.data[x + this.sx * (y + this.sy * z)];
  }

  set(x: number, y: number, z: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (!this.inside(x, y, z)) return;
    this.data[x + this.sx * (y + this.sy * z)] = c;
  }

  /** Caixa [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    z0 = Math.round(z0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    z1 = Math.round(z1);
    for (let z = Math.max(0, z0); z < Math.min(this.sz, z1); z++)
      for (let y = Math.max(0, y0); y < Math.min(this.sy, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(this.sx, x1); x++) this.data[x + this.sx * (y + this.sy * z)] = c;
    return this;
  }

  /** Só as paredes da caixa (oca), útil para prédios com janelas. */
  shell(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number): this {
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1 || y === y0 || y === y1 - 1;
          if (edge) this.set(x, y, z, c);
        }
    return this;
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number): this {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, c);
        }
    return this;
  }

  sphere(cx: number, cy: number, cz: number, r: number, c: number): this {
    return this.ellipsoid(cx, cy, cz, r, r, r, c);
  }

  /** Cilindro vertical centrado em (cx, cz), de y0 a y1 (exclusivo). */
  cylinder(cx: number, cz: number, r: number, y0: number, y1: number, c: number, r1 = r): this {
    for (let y = y0; y < y1; y++) {
      const t = y1 - y0 > 1 ? (y - y0) / (y1 - y0 - 1) : 0;
      const rr = r + (r1 - r) * t;
      for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++)
        for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
          const dx = x + 0.5 - cx;
          const dz = z + 0.5 - cz;
          if (dx * dx + dz * dz <= rr * rr) this.set(x, y, z, c);
        }
    }
    return this;
  }

  /** Anel horizontal (para néon em volta de torres). */
  ring(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, c: number): this {
    for (let y = y0; y < y1; y++)
      for (let z = Math.floor(cz - r1); z <= Math.ceil(cz + r1); z++)
        for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d <= r1 && d >= r0) this.set(x, y, z, c);
        }
    return this;
  }

  /** Linha 3D grossa (para armas, antenas, galhos). */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, thick = 0): this {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const z = z0 + (z1 - z0) * t;
      if (thick <= 0) this.set(x, y, z, c);
      else this.sphere(x + 0.5, y + 0.5, z + 0.5, thick, c);
    }
    return this;
  }

  /** Troca uma cor por outra em toda a grade. */
  replace(from: number, to: number): this {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === from) this.data[i] = to;
    return this;
  }

  /** Aplica `fn` em cada voxel cheio; retorne outro índice para repintar. */
  paint(fn: (x: number, y: number, z: number, c: number) => number): this {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < this.sx; x++) {
          const i = x + this.sx * (y + this.sy * z);
          const c = this.data[i];
          if (c) this.data[i] = fn(x, y, z, c);
        }
    return this;
  }

  /** Espelha a metade esquerda (x < sx/2) na direita. */
  mirrorX(): this {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < Math.floor(this.sx / 2); x++) {
          const c = this.get(x, y, z);
          if (c) this.set(this.sx - 1 - x, y, z, c);
        }
    return this;
  }

  count(): number {
    let n = 0;
    for (const v of this.data) if (v) n++;
    return n;
  }
}

export interface VoxelModel {
  grid: VoxelGrid;
  palette: Palette;
}

export interface MeshOptions {
  /** Tamanho de um voxel em unidades do mundo. */
  scale: number;
  /** Onde fica a origem: 'bottom' = centro da base; 'center' = centro do volume. */
  pivot?: 'bottom' | 'center';
  /** Deslocamento extra do pivô, em voxels. */
  offset?: [number, number, number];
  /** Força da oclusão ambiente por vértice (0 desliga). */
  ao?: number;
}

const AO_CURVE = [0.6, 0.74, 0.87, 1];
const tmpColor = new THREE.Color();

/**
 * Gera a malha de um modelo voxel com:
 * - faces internas removidas e merge guloso (greedy meshing) por cor e AO;
 * - oclusão ambiente por vértice (deixa os cantos com profundidade);
 * - normais suavizadas (`aOutline`) para o contorno inverted hull.
 */
export function buildVoxelGeometry(model: VoxelModel, opts: MeshOptions): THREE.BufferGeometry {
  const { grid, palette } = model;
  const dims = [grid.sx, grid.sy, grid.sz];
  const scale = opts.scale;
  const aoStrength = opts.ao ?? 1;
  const pivot = opts.pivot ?? 'bottom';
  const off = opts.offset ?? [0, 0, 0];
  const cx = grid.sx / 2 + off[0];
  const cy = (pivot === 'center' ? grid.sy / 2 : 0) + off[1];
  const cz = grid.sz / 2 + off[2];

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const fx: number[] = [];
  const indices: number[] = [];

  // Cores da paleta convertidas para o espaço linear uma vez só.
  const linear = palette.colors.map((p) => {
    tmpColor.setHex(p.c);
    return [tmpColor.r, tmpColor.g, tmpColor.b];
  });

  const solid = (x: number, y: number, z: number) => grid.get(x, y, z) !== 0;
  const pos = [0, 0, 0];
  const solidAt = (d: number, u: number, v: number, a: number, b: number, c: number) => {
    pos[d] = a;
    pos[u] = b;
    pos[v] = c;
    return solid(pos[0], pos[1], pos[2]) ? 1 : 0;
  };

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);

    for (x[d] = -1; x[d] < dims[d]; ) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
          const a = x[d] >= 0 ? grid.get(x[0], x[1], x[2]) : 0;
          const b = x[d] < dims[d] - 1 ? grid.get(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
          if ((a !== 0) === (b !== 0)) {
            mask[n] = 0;
            continue;
          }
          const back = a === 0; // face virada para -d
          const ci = back ? b : a;
          const layer = back ? x[d] : x[d] + 1;
          let aoBits = 0;
          const glowing = (palette.colors[ci].glow ?? 0) > 0 || (palette.colors[ci].night ?? 0) > 0;
          if (aoStrength > 0 && !glowing) {
            // AO dos 4 cantos: (0,0) (1,0) (1,1) (0,1) em (u,v)
            const i = x[u];
            const j = x[v];
            const corners = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ];
            for (let k = 0; k < 4; k++) {
              const [du, dv] = corners[k];
              const s1 = solidAt(d, u, v, layer, i + du, j);
              const s2 = solidAt(d, u, v, layer, i, j + dv);
              const cc = solidAt(d, u, v, layer, i + du, j + dv);
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
              aoBits |= ao << (k * 2);
            }
          } else {
            aoBits = 0xff;
          }
          mask[n] = (ci | (aoBits << 8) | ((back ? 1 : 0) << 16)) + 1;
        }
      }
      x[d]++;

      // Merge guloso dos retângulos com a mesma chave.
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u]; ) {
          const key = mask[n];
          if (!key) {
            i++;
            n++;
            continue;
          }
          let w = 1;
          while (i + w < dims[u] && mask[n + w] === key) w++;
          let h = 1;
          outer: while (j + h < dims[v]) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== key) break outer;
            h++;
          }

          const raw = key - 1;
          const ci = raw & 0xff;
          const aoBits = (raw >> 8) & 0xff;
          const back = (raw >> 16) & 1;
          const ao = [0, 1, 2, 3].map((k) => (aoBits >> (k * 2)) & 3);
          const base = [0, 0, 0];
          base[d] = x[d];
          base[u] = i;
          base[v] = j;
          const du = [0, 0, 0];
          du[u] = w;
          const dv = [0, 0, 0];
          dv[v] = h;
          const corners = [
            [base[0], base[1], base[2]],
            [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
            [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
            [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]],
          ];
          const nrm = [0, 0, 0];
          nrm[d] = back ? -1 : 1;
          const col = linear[ci];
          const pc = palette.colors[ci];
          const vi = positions.length / 3;
          for (let k = 0; k < 4; k++) {
            const c = corners[k];
            positions.push((c[0] - cx) * scale, (c[1] - cy) * scale, (c[2] - cz) * scale);
            normals.push(nrm[0], nrm[1], nrm[2]);
            const shade = 1 - (1 - AO_CURVE[ao[k]]) * aoStrength;
            colors.push(col[0] * shade, col[1] * shade, col[2] * shade);
            fx.push(pc.glow ?? 0, pc.night ?? 0, pc.sway ?? 0);
          }
          // Diagonal escolhida pelo AO para evitar artefatos.
          const flip = ao[0] + ao[2] < ao[1] + ao[3];
          const tris = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
          if (back) {
            for (let k = 0; k < 6; k += 3) indices.push(vi + tris[k], vi + tris[k + 2], vi + tris[k + 1]);
          } else {
            for (const t of tris) indices.push(vi + t);
          }

          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
          i += w;
          n += w;
        }
      }
    }
  }

  // Normais suavizadas para o contorno: soma das direções distintas que tocam cada posição.
  const dirBits = new Map<string, number>();
  const keyOf = (i: number) =>
    `${Math.round(positions[i * 3] * 1000)},${Math.round(positions[i * 3 + 1] * 1000)},${Math.round(positions[i * 3 + 2] * 1000)}`;
  const vcount = positions.length / 3;
  const dirIndex = (i: number) => {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    if (nx !== 0) return nx > 0 ? 0 : 1;
    if (ny !== 0) return ny > 0 ? 2 : 3;
    return normals[i * 3 + 2] > 0 ? 4 : 5;
  };
  for (let i = 0; i < vcount; i++) {
    const k = keyOf(i);
    dirBits.set(k, (dirBits.get(k) ?? 0) | (1 << dirIndex(i)));
  }
  const DIRS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const outline = new Float32Array(vcount * 3);
  for (let i = 0; i < vcount; i++) {
    const bits = dirBits.get(keyOf(i)) ?? 0;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let b = 0; b < 6; b++)
      if (bits & (1 << b)) {
        ox += DIRS[b][0];
        oy += DIRS[b][1];
        oz += DIRS[b][2];
      }
    const len = Math.hypot(ox, oy, oz) || 1;
    outline[i * 3] = ox / len;
    outline[i * 3 + 1] = oy / len;
    outline[i * 3 + 2] = oz / len;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aFx', new THREE.Float32BufferAttribute(fx, 3));
  geo.setAttribute('aOutline', new THREE.BufferAttribute(outline, 3));
  geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Junta várias geometrias voxel (mesmos atributos) numa só, aplicando matrizes. */
export function mergeVoxelGeometries(parts: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]): THREE.BufferGeometry {
  let vtotal = 0;
  let itotal = 0;
  for (const p of parts) {
    vtotal += p.geo.getAttribute('position').count;
    itotal += p.geo.getIndex()!.count;
  }
  const pos = new Float32Array(vtotal * 3);
  const nrm = new Float32Array(vtotal * 3);
  const col = new Float32Array(vtotal * 3);
  const fx = new Float32Array(vtotal * 3);
  const out = new Float32Array(vtotal * 3);
  const idx = vtotal > 65535 ? new Uint32Array(itotal) : new Uint16Array(itotal);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    nm.getNormalMatrix(p.matrix);
    const P = p.geo.getAttribute('position');
    const N = p.geo.getAttribute('normal');
    const Cc = p.geo.getAttribute('aColor');
    const F = p.geo.getAttribute('aFx');
    const O = p.geo.getAttribute('aOutline');
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nrm.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(O, i).applyMatrix3(nm).normalize();
      out.set([v.x, v.y, v.z], (vo + i) * 3);
      col.set([Cc.getX(i), Cc.getY(i), Cc.getZ(i)], (vo + i) * 3);
      fx.set([F.getX(i), F.getY(i), F.getZ(i)], (vo + i) * 3);
    }
    const I = p.geo.getIndex()!;
    for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
    vo += P.count;
    io += I.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFx', new THREE.BufferAttribute(fx, 3));
  geo.setAttribute('aOutline', new THREE.BufferAttribute(out, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
