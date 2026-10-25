// Vitrine temporária para validar o visual voxel toon.
import './ui/styles/base.css';
import * as THREE from 'three';
import { GameRenderer } from './render/renderer.ts';
import { applyTimeOfDay } from './render/daynight.ts';
import { lightUniforms } from './render/toon.ts';
import { createWater, waterUniforms } from './render/environment.ts';
import { animateBuilding, createBuildingView, type BuildingView } from './render/models/factory.ts';
import type { BuildingType } from './meta/types.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const gr = new GameRenderer(canvas, (params.get('q') as 'alto') ?? 'alto');
const scene = new THREE.Scene();
const t = Number(params.get('t') ?? 0.45);
applyTimeOfDay(t);
lightUniforms.uSunDir.value.set(0.55, 0.8, 0.12).normalize();
scene.add(createWater());
waterUniforms.uIsland.value.set(-9, -5, 9, 5);
const ground = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 10), new THREE.MeshBasicMaterial({ color: 0x63e07f }));
ground.position.y = -0.5;
scene.add(ground);
const types: BuildingType[] = ['core', 'cannon', 'laser', 'frost', 'tesla', 'mortar', 'generator', 'vault', 'barracks', 'lab', 'barrier', 'trap', 'palm', 'lamp', 'neon', 'flowers', 'statue', 'fountain'];
const views: BuildingView[] = [];
const lvl = Number(params.get('l') ?? 1);
types.forEach((ty, i) => {
  const v = createBuildingView(ty, lvl, 'mare', i);
  const col = i % 6;
  const row = Math.floor(i / 6);
  v.root.position.set(-7.5 + col * 3, 0, -3 + row * 3);
  scene.add(v.root);
  views.push(v);
});
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
cam.position.set(14, 18, 14);
cam.lookAt(0, 0, 0);
function frame(ms: number) {
  const time = ms / 1000;
  lightUniforms.uTime.value = time;
  gr.resize();
  cam.aspect = gr.width / gr.height;
  cam.updateProjectionMatrix();
  for (const v of views) animateBuilding(v, time, 1 / 60);
  gr.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
