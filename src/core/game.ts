import { GameRenderer } from '../render/renderer.ts';
import { lightUniforms } from '../render/toon.ts';
import type { GraphicsPreset } from '../meta/types.ts';
import { TouchInput } from './input.ts';
import type { GameScene } from './scene.ts';

/**
 * Loop principal: um único WebGLRenderer, cenas trocáveis, câmera lenta
 * e "hit stop" (congelamento curto em golpes fortes).
 */
export class Game {
  readonly renderer: GameRenderer;
  readonly input: TouchInput;
  private scenes = new Map<string, GameScene>();
  current: GameScene | null = null;
  private last = 0;
  private time = 0;
  private running = false;
  private hitStopUntil = 0;
  private slowMo: { scale: number; until: number } | null = null;
  timeScale = 1;
  paused = false;
  /** Uma tela opaca cobre o 3D: pula o render (economiza bateria). */
  renderSuspended = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  onFrame: ((dt: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, preset: GraphicsPreset) {
    this.renderer = new GameRenderer(canvas, preset);
    this.input = new TouchInput(canvas);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.last = performance.now();
    });
  }

  register(scene: GameScene): void {
    this.scenes.set(scene.id, scene);
  }

  get<T extends GameScene>(id: string): T {
    const s = this.scenes.get(id);
    if (!s) throw new Error(`Cena desconhecida: ${id}`);
    return s as T;
  }

  go(id: string, params?: unknown): void {
    const next = this.get(id);
    if (this.current && this.current !== next) this.current.exit();
    this.current = next;
    this.input.setHandlers(next.gestures);
    next.resize(this.renderer.width, this.renderer.height);
    next.enter(params);
    this.slowMo = null;
    this.hitStopUntil = 0;
  }

  resize(): void {
    this.renderer.resize();
    this.current?.resize(this.renderer.width, this.renderer.height);
  }

  /** Congela o tempo do jogo por alguns milissegundos (impacto). */
  hitStop(ms: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + ms);
  }

  /** Câmera lenta: `scale` < 1 por `seconds` reais. */
  slowMotion(scale: number, seconds: number): void {
    this.slowMo = { scale, until: performance.now() + seconds * 1000 };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      const rawDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.fpsAcc += rawDt;
      this.fpsFrames++;
      if (this.fpsAcc >= 1) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      let scale = this.paused ? 0 : this.timeScale;
      if (now < this.hitStopUntil) scale = 0;
      if (this.slowMo) {
        if (now > this.slowMo.until) this.slowMo = null;
        else scale *= this.slowMo.scale;
      }
      const dt = rawDt * scale;
      this.time += rawDt;
      lightUniforms.uTime.value = this.time;
      this.onFrame?.(rawDt);
      if (this.current) {
        this.current.update(dt, this.time, rawDt);
        if (!this.renderSuspended) this.renderer.render(this.current.scene, this.current.camera);
      }
    };
    requestAnimationFrame(frame);
  }

  get elapsed(): number {
    return this.time;
  }
}
