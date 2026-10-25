import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GraphicsPreset } from '../meta/types.ts';
import { lightUniforms, setOutlineWidth } from './toon.ts';

export interface PresetConfig {
  pixelRatio: number;
  bloom: boolean;
  outlinePx: number;
  particles: number;
  cityLife: number;
  antialias: boolean;
}

export function presetConfig(p: GraphicsPreset): PresetConfig {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (p) {
    case 'baixo':
      return { pixelRatio: Math.min(dpr, 1), bloom: false, outlinePx: 1.6, particles: 0.45, cityLife: 0.4, antialias: false };
    case 'medio':
      return { pixelRatio: Math.min(dpr, 1.5), bloom: false, outlinePx: 2, particles: 0.75, cityLife: 0.75, antialias: true };
    case 'alto':
      return { pixelRatio: Math.min(dpr, 2), bloom: true, outlinePx: 2.4, particles: 1, cityLife: 1, antialias: true };
  }
}

/** Escolhe um preset inicial pelo hardware (heurística simples e conservadora). */
export function detectPreset(): GraphicsPreset {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mem <= 2 || cores <= 2) return 'baixo';
  if (mobile && (mem <= 4 || cores <= 6)) return 'medio';
  return mobile ? 'medio' : 'alto';
}

/**
 * Wrapper do WebGLRenderer com presets de gráficos (Baixo/Médio/Alto),
 * bloom opcional para o néon e redimensionamento.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  preset: GraphicsPreset;
  config: PresetConfig;
  width = 1;
  height = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    preset: GraphicsPreset,
  ) {
    this.preset = preset;
    this.config = presetConfig(preset);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.config.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x0a1030, 1);
    this.applyPreset(preset);
    this.resize();
  }

  applyPreset(preset: GraphicsPreset): void {
    this.preset = preset;
    this.config = presetConfig(preset);
    this.renderer.setPixelRatio(this.config.pixelRatio);
    setOutlineWidth(this.config.outlinePx * this.config.pixelRatio);
    lightUniforms.uGlowHDR.value = this.config.bloom ? 1.7 : 1;
    if (this.config.bloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.5, 0.4, 1.05);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else if (!this.config.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.renderPass = null;
      this.bloom = null;
    }
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    lightUniforms.uResolution.value.set(w * pr, h * pr);
    setOutlineWidth(this.config.outlinePx * pr);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
  }

  /** Intensidade do bloom (ex.: mais forte à noite e no Ultimate). */
  setBloomStrength(s: number): void {
    if (this.bloom) this.bloom.strength = s;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }
}
