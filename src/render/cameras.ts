import * as THREE from 'three';

/**
 * Câmera "isométrica" da cidade: perspectiva com FOV estreito, yaw fixo de 45°.
 * Arrastar move o alvo no chão, pinça aproxima, com inércia e limites.
 */
export class IsoCameraRig {
  readonly camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  distance = 30;
  minDistance = 12;
  maxDistance = 60;
  yaw = Math.PI / 4;
  pitch = THREE.MathUtils.degToRad(52);
  bounds = { x0: 0, z0: 0, x1: 24, z1: 24 };
  private velocity = new THREE.Vector2();
  private goalTarget: THREE.Vector3 | null = null;
  private goalDistance: number | null = null;
  private trauma = 0;
  private shakeT = 0;

  constructor(fov = 30) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 900);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // Em telas estreitas (retrato) abre o FOV para caber a cidade.
    this.camera.fov = w / h < 1 ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  /** Converte deslocamento em pixels para deslocamento no chão. */
  panPixels(dx: number, dy: number, viewportH: number): void {
    const worldPerPx = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / viewportH;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const k = worldPerPx;
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(fwd, (-dy * k) / Math.sin(this.pitch));
    this.goalTarget = null;
    this.clamp();
  }

  fling(vx: number, vy: number): void {
    this.velocity.set(vx, vy);
  }

  zoom(factor: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance / factor, this.minDistance, this.maxDistance);
    this.goalDistance = null;
  }

  focus(x: number, z: number, distance?: number): void {
    this.goalTarget = new THREE.Vector3(x, 0, z);
    if (distance !== undefined) this.goalDistance = distance;
  }

  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t);
  }

  private clamp(): void {
    const b = this.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.x0, b.x1);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.z0, b.z1);
  }

  update(dt: number, viewportH: number): void {
    if (this.velocity.lengthSq() > 0.01) {
      this.panPixels(this.velocity.x, this.velocity.y, viewportH);
      this.velocity.multiplyScalar(Math.pow(0.006, dt));
    }
    if (this.goalTarget) {
      this.target.lerp(this.goalTarget, 1 - Math.pow(0.002, dt));
      if (this.target.distanceTo(this.goalTarget) < 0.01) this.goalTarget = null;
    }
    if (this.goalDistance !== null) {
      this.distance += (this.goalDistance - this.distance) * (1 - Math.pow(0.002, dt));
      if (Math.abs(this.distance - this.goalDistance) < 0.01) this.goalDistance = null;
    }
    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    if (this.trauma > 0) {
      this.shakeT += dt * 40;
      const s = this.trauma * this.trauma * 0.35;
      this.camera.position.x += Math.sin(this.shakeT * 1.3) * s;
      this.camera.position.y += Math.sin(this.shakeT * 1.7 + 1) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
  }

  /** Raio da tela até o plano do chão (y = 0). */
  groundPoint(nx: number, ny: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return ray.ray.intersectPlane(plane, out);
  }
}
