// Vitrine de desenvolvimento: ?showcase=chars&ids=1,2,3&anim=walk
import * as THREE from 'three';
import { getCharacter } from '../content/catalog.ts';
import { GameRenderer } from '../render/renderer.ts';
import { applyTimeOfDay } from '../render/daynight.ts';
import { lightUniforms } from '../render/toon.ts';
import { CharacterView } from '../render/characterView.ts';

export function runShowcase(canvas: HTMLCanvasElement, params: URLSearchParams): void {
  const gr = new GameRenderer(canvas, (params.get('q') as 'alto') ?? 'medio');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fb8ff);
  applyTimeOfDay(0.45);
  lightUniforms.uSunDir.value.set(0.35, 0.75, 0.6).normalize();
  lightUniforms.uFogNear.value = 500;
  lightUniforms.uFogFar.value = 900;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ color: 0x63e07f }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const ids = (params.get('ids') ?? '1,2,3,4,5,13,27,41,53,54,55,56,57,58,59,60').split(',').map(Number);
  const views: CharacterView[] = [];
  const cols = Math.min(8, ids.length);
  ids.forEach((id, i) => {
    const v = new CharacterView(getCharacter(id));
    v.root.position.set((i % cols) * 1.6 - (cols - 1) * 0.8, 0, Math.floor(i / cols) * 1.8);
    v.face(1, 1.2);
    v.state = (params.get('anim') as 'walk') ?? 'idle';
    scene.add(v.root);
    views.push(v);
  });
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const rows = Math.ceil(ids.length / cols);
  cam.position.set(0, 3.2, 9 + rows * 1.8);
  cam.lookAt(0, 0.6, rows * 0.7);
  let last = performance.now();
  let k = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    lightUniforms.uTime.value = now / 1000;
    gr.resize();
    cam.aspect = gr.width / gr.height;
    cam.updateProjectionMatrix();
    k += dt;
    views.forEach((v, i) => {
      if (params.get('anim') === 'attack' && (k + i * 0.13) % 1.2 < dt) v.attack();
      if (params.get('anim') === 'ability' && (k + i * 0.2) % 2 < dt) v.ability();
      v.update(dt);
    });
    gr.render(scene, cam);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
