import * as THREE from 'three';
import { lightUniforms } from './toon.ts';

/** Uniforms do céu, alterados pelo ciclo de dia e noite. */
export const skyUniforms = {
  uTop: { value: new THREE.Color(0x2e8bff) },
  uHorizon: { value: new THREE.Color(0xffd6a5) },
  uBottom: { value: new THREE.Color(0x1a4f9a) },
  uSunDirSky: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() },
  uSunDisc: { value: new THREE.Color(0xfff2c0) },
  uStars: { value: 0 },
  uTime: lightUniforms.uTime,
};

/** Cúpula de céu com gradiente, disco do sol/lua e estrelas procedurais. */
export function createSky(radius = 400): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // sempre no fundo
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSunDirSky;
      uniform vec3 uSunDisc;
      uniform float uStars;
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0
          ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.62, h), 0.8))
          : mix(uHorizon, uBottom, smoothstep(0.0, 0.25, -h));
        // Faixa de brilho no horizonte, estilo pôr do sol tropical.
        col += uHorizon * 0.18 * exp(-abs(h) * 14.0);
        // Sol / lua em disco recortado (visual toon).
        float sd = dot(d, normalize(uSunDirSky));
        col = mix(col, uSunDisc, smoothstep(0.9965, 0.9975, sd));
        col += uSunDisc * 0.22 * pow(max(sd, 0.0), 24.0);
        // Estrelas quadradinhas que piscam.
        if (uStars > 0.0 && h > 0.05) {
          vec3 g = floor(d * 160.0);
          float s = hash(g);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 60.0);
          col += vec3(1.0, 0.95, 1.0) * step(0.9965, s) * uStars * tw * smoothstep(0.05, 0.3, h);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}

export const waterUniforms = {
  uDeep: { value: new THREE.Color(0x0e5aa8) },
  uShallow: { value: new THREE.Color(0x19c3d6) },
  uFoam: { value: new THREE.Color(0xe8fffb) },
  uIsland: { value: new THREE.Vector4(-12, -12, 12, 12) },
  uTime: lightUniforms.uTime,
  uNight: lightUniforms.uNight,
  uFogColor: lightUniforms.uFogColor,
  uFogNear: lightUniforms.uFogNear,
  uFogFar: lightUniforms.uFogFar,
  uSunColor: lightUniforms.uSunColor,
};

/**
 * Oceano toon: faixas de cor por distância da ilha, espuma animada na costa,
 * brilhos quadrados na água e ondas leves no vértice.
 */
export function createWater(size = 600, segments = 120): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vPos;
      varying float vFogDepth;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 0.35 + uTime * 1.2) * 0.06 + cos(p.z * 0.3 + uTime * 0.9) * 0.06;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vPos = world.xyz;
        vec4 mv = viewMatrix * world;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec4 uIsland;
      uniform float uTime;
      uniform float uNight;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uSunColor;
      varying vec3 vPos;
      varying float vFogDepth;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      void main() {
        vec2 c = (uIsland.xy + uIsland.zw) * 0.5;
        vec2 b = (uIsland.zw - uIsland.xy) * 0.5;
        float d = sdBox(vPos.xz - c, b);
        // Faixas de profundidade bem marcadas (toon).
        float t = clamp(d / 22.0, 0.0, 1.0);
        float band = floor(t * 4.0) / 4.0;
        vec3 col = mix(uShallow, uDeep, band);
        // Espuma pulsando a partir da costa.
        float wave = sin(d * 1.6 - uTime * 2.2);
        float foam = step(0.0, d) * (step(d, 0.55) + step(0.86, wave) * step(d, 4.5) * (1.0 - d / 4.5));
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
        // Brilhos quadrados (pixel-art) na água.
        vec2 g = floor(vPos.xz * 3.0);
        float s = hash(g + floor(uTime * 1.5 + hash(g) * 4.0));
        col += uSunColor * step(0.993, s) * 0.35 * (1.0 - uNight * 0.6);
        col *= mix(1.0, 0.55, uNight);
        float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.position.y = -0.6;
  return mesh;
}

/** Textura radial suave usada em sombras-bolha, brilhos e poças de luz. */
let radialTex: THREE.Texture | null = null;
export function radialTexture(): THREE.Texture {
  if (radialTex) return radialTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  radialTex = new THREE.CanvasTexture(canvas);
  radialTex.colorSpace = THREE.SRGBColorSpace;
  return radialTex;
}

/** Sombra-bolha: um disco escuro e suave no chão (barato, sem shadow map). */
export function createBlobShadow(radius: number, opacity = 0.35): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: radialTexture(),
    color: 0x10082a,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  mesh.name = 'shadow';
  return mesh;
}
