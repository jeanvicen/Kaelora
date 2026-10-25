/** Gestos de toque (e mouse) sobre o canvas do jogo. */
export interface GestureHandlers {
  onTap?(x: number, y: number): void;
  /** Retorne true para "capturar" o arraste (ex.: arrastar uma construção). */
  onDragStart?(x: number, y: number): boolean | void;
  onDrag?(dx: number, dy: number, x: number, y: number, captured: boolean): void;
  onDragEnd?(x: number, y: number, captured: boolean, vx: number, vy: number): void;
  onPinch?(scale: number, cx: number, cy: number): void;
  onWheel?(delta: number, x: number, y: number): void;
  onLongPress?(x: number, y: number): void;
  onPointerDown?(x: number, y: number): void;
}

interface Pointer {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
}

const DRAG_THRESHOLD = 9;
const LONG_PRESS_MS = 480;

export class TouchInput {
  private pointers = new Map<number, Pointer>();
  private handlers: GestureHandlers = {};
  private dragging = false;
  private captured = false;
  private pinchDist = 0;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private longFired = false;
  private velocity = { x: 0, y: 0, t: 0 };
  enabled = true;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setHandlers(h: GestureHandlers): void {
    this.handlers = h;
    this.reset();
  }

  reset(): void {
    this.pointers.clear();
    this.dragging = false;
    this.captured = false;
    this.clearLong();
  }

  private clearLong(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    this.longTimer = null;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const p: Pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.dragging = false;
      this.captured = false;
      this.longFired = false;
      this.velocity = { x: 0, y: 0, t: performance.now() };
      this.handlers.onPointerDown?.(p.x, p.y);
      this.clearLong();
      this.longTimer = setTimeout(() => {
        if (!this.dragging && this.pointers.size === 1) {
          this.longFired = true;
          this.handlers.onLongPress?.(p.x, p.y);
        }
      }, LONG_PRESS_MS);
    } else if (this.pointers.size === 2) {
      this.clearLong();
      if (this.dragging) this.handlers.onDragEnd?.(p.x, p.y, this.captured, 0, 0);
      this.dragging = false;
      this.captured = false;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    const px = p.x;
    const py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > DRAG_THRESHOLD) {
        this.dragging = true;
        this.clearLong();
        this.captured = this.handlers.onDragStart?.(p.sx, p.sy) === true;
      }
      if (this.dragging) {
        const now = performance.now();
        const dt = Math.max(1, now - this.velocity.t);
        this.velocity = { x: ((p.x - px) / dt) * 16, y: ((p.y - py) / dt) * 16, t: now };
        this.handlers.onDrag?.(p.x - px, p.y - py, p.x, p.y, this.captured);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0 && d > 0) this.handlers.onPinch?.(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchDist = d;
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this.clearLong();
    if (this.pointers.size === 0) {
      if (this.dragging) {
        const stale = performance.now() - this.velocity.t > 80;
        this.handlers.onDragEnd?.(p.x, p.y, this.captured, stale ? 0 : this.velocity.x, stale ? 0 : this.velocity.y);
      } else if (!this.longFired && performance.now() - p.t < 600) {
        this.handlers.onTap?.(p.x, p.y);
      }
      this.dragging = false;
      this.captured = false;
    } else if (this.pointers.size === 1) {
      // voltou para um dedo: recomeça o arraste a partir daqui sem "pulo"
      const rest = [...this.pointers.values()][0];
      rest.sx = rest.x;
      rest.sy = rest.y;
      this.dragging = false;
      this.longFired = true;
    }
  };

  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.handlers.onWheel?.(e.deltaY, e.clientX, e.clientY);
  };
}
