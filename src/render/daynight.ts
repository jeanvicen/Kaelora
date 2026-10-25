import * as THREE from 'three';
import { lightUniforms } from './toon.ts';
import { skyUniforms, waterUniforms } from './environment.ts';

interface Key {
  t: number;
  top: number;
  horizon: number;
  bottom: number;
  sun: number;
  sky: number;
  ground: number;
  shadow: number;
  mid: number;
  fog: number;
  disc: number;
  deep: number;
  shallow: number;
  night: number;
  stars: number;
}

// t: 0 = meia-noite, 0.25 = nascer, 0.5 = meio-dia, 0.75 = pôr do sol.
const KEYS: Key[] = [
  { t: 0.0, top: 0x070b2e, horizon: 0x3b1d6e, bottom: 0x080c26, sun: 0x8e96e8, sky: 0x4450a0, ground: 0x2a1c40, shadow: 0x4f529e, mid: 0x7076c4, fog: 0x1d1a52, disc: 0xeef0ff, deep: 0x0a1f52, shallow: 0x135a8a, night: 1, stars: 1 },
  { t: 0.2, top: 0x16206b, horizon: 0x8a3c8f, bottom: 0x0c1438, sun: 0xa49ae8, sky: 0x4a56b0, ground: 0x30204a, shadow: 0x5656a8, mid: 0x7c78c8, fog: 0x3a2a72, disc: 0xffe4f0, deep: 0x0d2a66, shallow: 0x1a6e9e, night: 0.85, stars: 0.6 },
  { t: 0.27, top: 0x4b8fff, horizon: 0xffa98a, bottom: 0x1d4b8f, sun: 0xffe2c8, sky: 0xb0b8ff, ground: 0x7a5466, shadow: 0x9f8cc8, mid: 0xe0c4d8, fog: 0xffc4b0, disc: 0xfff0c8, deep: 0x1460b0, shallow: 0x30c2dc, night: 0.25, stars: 0 },
  { t: 0.36, top: 0x2f8cff, horizon: 0xc6ecff, bottom: 0x1a56a0, sun: 0xfffaf0, sky: 0xb0d4ff, ground: 0x8a6a5e, shadow: 0xaaa3d8, mid: 0xdcd6f0, fog: 0xbfe6ff, disc: 0xfffbe8, deep: 0x0e66b8, shallow: 0x22d0dc, night: 0, stars: 0 },
  { t: 0.5, top: 0x2a86ff, horizon: 0xd2f2ff, bottom: 0x1a56a0, sun: 0xfffbf2, sky: 0xb4d6ff, ground: 0x8c6c60, shadow: 0xaca6da, mid: 0xdedaf2, fog: 0xc8eeff, disc: 0xffffff, deep: 0x0e66b8, shallow: 0x22d4dc, night: 0, stars: 0 },
  { t: 0.66, top: 0x3a86ff, horizon: 0xffe2b8, bottom: 0x1d58a2, sun: 0xfff2dc, sky: 0xbcccff, ground: 0x8a6656, shadow: 0xa89cd2, mid: 0xe2d4e6, fog: 0xffe6c8, disc: 0xfff2d0, deep: 0x1262b0, shallow: 0x28ccd6, night: 0, stars: 0 },
  { t: 0.745, top: 0x5a4bd6, horizon: 0xff7a59, bottom: 0x2a3a8a, sun: 0xffcf9e, sky: 0xc0a0e8, ground: 0x80505a, shadow: 0x9a7cc0, mid: 0xe8b0c0, fog: 0xff9a7a, disc: 0xffc890, deep: 0x1c4ea0, shallow: 0x3ab0d0, night: 0.35, stars: 0 },
  { t: 0.8, top: 0x2b1d6b, horizon: 0xff4f8b, bottom: 0x161a52, sun: 0xc8a0e0, sky: 0x7a5ab8, ground: 0x4a2a50, shadow: 0x6a5aa8, mid: 0x9c86c8, fog: 0x8a3a8a, disc: 0xffd0e8, deep: 0x102a72, shallow: 0x2a6ea8, night: 0.8, stars: 0.35 },
  { t: 0.88, top: 0x0c1240, horizon: 0x4a2380, bottom: 0x0a0f2c, sun: 0x8e96e8, sky: 0x4450a0, ground: 0x2a1c40, shadow: 0x4f529e, mid: 0x7076c4, fog: 0x241e5e, disc: 0xeef0ff, deep: 0x0a2156, shallow: 0x145e90, night: 1, stars: 0.9 },
  { t: 1.0, top: 0x070b2e, horizon: 0x3b1d6e, bottom: 0x080c26, sun: 0x8e96e8, sky: 0x4450a0, ground: 0x2a1c40, shadow: 0x4f529e, mid: 0x7076c4, fog: 0x1d1a52, disc: 0xeef0ff, deep: 0x0a1f52, shallow: 0x135a8a, night: 1, stars: 1 },
];

const ca = new THREE.Color();
const cb = new THREE.Color();
function lerpColor(target: THREE.Color, a: number, b: number, t: number): void {
  ca.setHex(a);
  cb.setHex(b);
  target.copy(ca).lerp(cb, t);
}

export interface DayNightState {
  t: number;
  night: number;
}

/**
 * Aplica a hora do dia a todos os uniforms (luz, céu, água, neblina).
 * `t` em [0,1). Retorna o fator noite (0..1) para quem quiser reagir.
 */
export function applyTimeOfDay(t: number, fogOverride?: { near: number; far: number }): number {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);

  lerpColor(skyUniforms.uTop.value, a.top, b.top, k);
  lerpColor(skyUniforms.uHorizon.value, a.horizon, b.horizon, k);
  lerpColor(skyUniforms.uBottom.value, a.bottom, b.bottom, k);
  lerpColor(skyUniforms.uSunDisc.value, a.disc, b.disc, k);
  lerpColor(lightUniforms.uSunColor.value, a.sun, b.sun, k);
  lerpColor(lightUniforms.uSkyColor.value, a.sky, b.sky, k);
  lerpColor(lightUniforms.uGroundColor.value, a.ground, b.ground, k);
  lerpColor(lightUniforms.uShadowColor.value, a.shadow, b.shadow, k);
  lerpColor(lightUniforms.uMidColor.value, a.mid, b.mid, k);
  lerpColor(lightUniforms.uFogColor.value, a.fog, b.fog, k);
  lerpColor(waterUniforms.uDeep.value, a.deep, b.deep, k);
  lerpColor(waterUniforms.uShallow.value, a.shallow, b.shallow, k);
  const night = a.night + (b.night - a.night) * k;
  lightUniforms.uNight.value = night;
  skyUniforms.uStars.value = a.stars + (b.stars - a.stars) * k;

  // Disco do sol/lua percorre um arco no céu. A direção da LUZ é de cada cena
  // (vista isométrica e vista lateral pedem ângulos diferentes para o toon ler bem).
  const ang = (t - 0.25) * Math.PI * 2;
  const sunY = Math.sin(ang);
  const disc = new THREE.Vector3(Math.cos(ang), sunY, -0.45).normalize();
  skyUniforms.uSunDirSky.value.copy(sunY > -0.1 ? disc : disc.multiplyScalar(-1));

  if (fogOverride) {
    lightUniforms.uFogNear.value = fogOverride.near;
    lightUniforms.uFogFar.value = fogOverride.far;
  }
  return night;
}

/** Relógio do jogo: um dia inteiro a cada `dayLengthSec` segundos reais. */
export class DayClock {
  t: number;
  constructor(
    public dayLengthSec = 480,
    start = 0.42,
  ) {
    this.t = start;
  }
  update(dt: number): number {
    this.t = (this.t + dt / this.dayLengthSec) % 1;
    return this.t;
  }
  /** Rótulo amigável para a UI. */
  label(): string {
    const h = Math.floor(this.t * 24);
    const m = Math.floor((this.t * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
