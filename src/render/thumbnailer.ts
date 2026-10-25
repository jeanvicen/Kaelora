import * as THREE from 'three';
import { lightUniforms } from './toon.ts';

/**
 * Renderiza objetos 3D em miniaturas PNG (ícones da loja, retratos dos
 * personagens) usando o mesmo renderer do jogo, com luz de meio-dia fixa.
 */
export class Thumbnailer {
  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.05, 100);
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private pixels: Uint8Array;
  private cache = new Map<string, string>();
  private queue: { key: string; make: () => THREE.Object3D; opts: ThumbOptions; resolve: (url: string) => void }[] = [];

  constructor(
    private renderer: THREE.WebGLRenderer,
    readonly size = 160,
  ) {
    this.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.pixels = new Uint8Array(size * size * 4);
  }

  /** Pede uma miniatura; o resultado vem do cache ou entra na fila (poucas por quadro). */
  request(key: string, make: () => THREE.Object3D, opts: ThumbOptions = {}): Promise<string> {
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => this.queue.push({ key, make, opts, resolve }));
  }

  cached(key: string): string | undefined {
    return this.cache.get(key);
  }

  /** Processa até `budget` miniaturas (chamar uma vez por quadro). */
  pump(budget = 2): void {
    while (budget-- > 0 && this.queue.length) {
      const job = this.queue.shift()!;
      const hit = this.cache.get(job.key);
      if (hit) {
        job.resolve(hit);
        continue;
      }
      const url = this.renderNow(job.make(), job.opts);
      this.cache.set(job.key, url);
      job.resolve(url);
    }
  }

  renderNow(obj: THREE.Object3D, opts: ThumbOptions = {}): string {
    const size = this.size;
    this.scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const yaw = opts.yaw ?? Math.PI / 4;
    const pitch = opts.pitch ?? 0.5;
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (opts.zoom ?? 1);
    const focus = center.clone();
    if (opts.focusY !== undefined) focus.y = box.min.y + (box.max.y - box.min.y) * opts.focusY;
    this.camera.position.set(
      focus.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      focus.y + Math.sin(pitch) * dist,
      focus.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(focus);
    this.camera.near = Math.max(0.01, dist - sphere.radius * 2);
    this.camera.far = dist + sphere.radius * 2;
    this.camera.updateProjectionMatrix();

    // luz de meio-dia fixa enquanto renderiza
    const saved = {
      night: lightUniforms.uNight.value,
      res: lightUniforms.uResolution.value.clone(),
      px: lightUniforms.uOutlinePx.value,
      sun: lightUniforms.uSunDir.value.clone(),
      fogNear: lightUniforms.uFogNear.value,
      fogFar: lightUniforms.uFogFar.value,
      sunC: lightUniforms.uSunColor.value.clone(),
      mid: lightUniforms.uMidColor.value.clone(),
      shadow: lightUniforms.uShadowColor.value.clone(),
      glow: lightUniforms.uGlowHDR.value,
    };
    lightUniforms.uNight.value = 0;
    lightUniforms.uResolution.value.set(size, size);
    lightUniforms.uOutlinePx.value = opts.outline ?? 2.2;
    lightUniforms.uSunDir.value.set(0.45, 0.8, 0.4).normalize();
    lightUniforms.uFogNear.value = 1000;
    lightUniforms.uFogFar.value = 2000;
    lightUniforms.uSunColor.value.setHex(0xfffbf2);
    lightUniforms.uMidColor.value.setHex(0xdedaf2);
    lightUniforms.uShadowColor.value.setHex(0xaca6da);
    lightUniforms.uGlowHDR.value = 1;

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.rt, 0, 0, size, size, this.pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);

    lightUniforms.uNight.value = saved.night;
    lightUniforms.uResolution.value.copy(saved.res);
    lightUniforms.uOutlinePx.value = saved.px;
    lightUniforms.uSunDir.value.copy(saved.sun);
    lightUniforms.uFogNear.value = saved.fogNear;
    lightUniforms.uFogFar.value = saved.fogFar;
    lightUniforms.uSunColor.value.copy(saved.sunC);
    lightUniforms.uMidColor.value.copy(saved.mid);
    lightUniforms.uShadowColor.value.copy(saved.shadow);
    lightUniforms.uGlowHDR.value = saved.glow;
    this.scene.remove(obj);

    // vira de cabeça para baixo (WebGL lê de baixo para cima)
    const img = this.ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(this.pixels.subarray(src, src + size * 4), y * size * 4);
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}

export interface ThumbOptions {
  yaw?: number;
  pitch?: number;
  zoom?: number;
  focusY?: number;
  outline?: number;
}
