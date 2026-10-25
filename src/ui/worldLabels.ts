import * as THREE from 'three';

interface Label {
  el: HTMLElement;
  pos: THREE.Vector3;
  offsetY: number;
  visible: boolean;
}

/**
 * Elementos HTML presos a pontos do mundo 3D (barras de vida, timers,
 * bolhas de coleta). Atualizados por projeção a cada quadro.
 */
export class WorldLabels {
  readonly root: HTMLElement;
  private labels = new Set<Label>();
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, className = 'world-labels') {
    this.root = document.createElement('div');
    this.root.className = className;
    parent.appendChild(this.root);
  }

  add(el: HTMLElement, pos: THREE.Vector3, offsetY = 0): Label {
    const l: Label = { el, pos, offsetY, visible: true };
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.willChange = 'transform';
    this.root.appendChild(el);
    this.labels.add(l);
    return l;
  }

  remove(l: Label | null | undefined): void {
    if (!l) return;
    l.el.remove();
    this.labels.delete(l);
  }

  clear(): void {
    for (const l of this.labels) l.el.remove();
    this.labels.clear();
  }

  setVisible(l: Label, v: boolean): void {
    l.visible = v;
    l.el.style.display = v ? '' : 'none';
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    for (const l of this.labels) {
      if (!l.visible) continue;
      this.v.copy(l.pos).project(camera);
      if (this.v.z > 1 || this.v.x < -1.3 || this.v.x > 1.3 || this.v.y < -1.3 || this.v.y > 1.3) {
        l.el.style.transform = 'translate(-9999px,-9999px)';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height + l.offsetY;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  destroy(): void {
    this.clear();
    this.root.remove();
  }
}
