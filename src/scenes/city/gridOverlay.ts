import * as THREE from 'three';

/**
 * Grade do modo edição (linhas suaves que aparecem/somem) e a "pegada"
 * colorida embaixo da construção arrastada: verde = cabe, vermelho = não cabe.
 */
export class GridOverlay {
  readonly group = new THREE.Group();
  private grid: THREE.Mesh;
  private gridMat: THREE.ShaderMaterial;
  private foot: THREE.Mesh;
  private footMat: THREE.ShaderMaterial;
  private selection: THREE.LineLoop;
  private visibility = 0;
  private target = 0;

  constructor() {
    this.gridMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 24 }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vXZ = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uSize;
        uniform float uAlpha;
        varying vec2 vXZ;
        void main() {
          vec2 g = abs(fract(vXZ) - 0.5);
          float line = smoothstep(0.47, 0.5, max(g.x, g.y));
          vec2 c = vXZ / uSize - 0.5;
          float edge = 1.0 - smoothstep(0.42, 0.5, max(abs(c.x), abs(c.y)));
          float a = line * uAlpha * (0.25 + 0.5 * edge);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0), a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.gridMat);
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.y = 0.012;
    this.grid.renderOrder = 2;
    this.group.add(this.grid);

    this.footMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x5bff8a) }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 d = abs(vUv - 0.5);
          float border = smoothstep(0.42, 0.47, max(d.x, d.y));
          float pulse = 0.35 + 0.15 * sin(uTime * 6.0);
          gl_FragColor = vec4(uColor, max(border * 0.95, pulse));
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.footMat);
    this.foot.rotation.x = -Math.PI / 2;
    this.foot.position.y = 0.02;
    this.foot.renderOrder = 3;
    this.foot.visible = false;
    this.group.add(this.foot);

    const pts = [new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)];
    this.selection = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
    this.selection.position.y = 0.03;
    this.selection.visible = false;
    this.group.add(this.selection);
  }

  setSize(size: number): void {
    this.grid.scale.set(size, size, 1);
    this.grid.position.set(size / 2, 0.012, size / 2);
    this.gridMat.uniforms.uSize.value = size;
  }

  showGrid(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  showFootprint(x: number, z: number, w: number, d: number, valid: boolean): void {
    this.foot.visible = true;
    this.foot.position.set(x + w / 2, 0.02, z + d / 2);
    this.foot.scale.set(w, d, 1);
    (this.footMat.uniforms.uColor.value as THREE.Color).setHex(valid ? 0x5bff8a : 0xff4f5e);
  }

  hideFootprint(): void {
    this.foot.visible = false;
  }

  showSelection(x: number, z: number, w: number, d: number): void {
    this.selection.visible = true;
    this.selection.position.set(x + w / 2, 0.03, z + d / 2);
    this.selection.scale.set(w + 0.15, 1, d + 0.15);
  }

  hideSelection(): void {
    this.selection.visible = false;
  }

  update(dt: number, time: number): void {
    this.visibility += (this.target - this.visibility) * Math.min(1, dt * 8);
    this.gridMat.uniforms.uAlpha.value = this.visibility;
    this.grid.visible = this.visibility > 0.01;
    this.footMat.uniforms.uTime.value = time;
    if (this.selection.visible) {
      const s = 1 + Math.sin(time * 5) * 0.03;
      this.selection.scale.x *= s / (this.selection.userData.s ?? 1);
      this.selection.userData.s = s;
      (this.selection.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(time * 5);
    }
  }
}
