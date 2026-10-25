import * as THREE from 'three';

/**
 * Uniforms de iluminação compartilhados por TODOS os materiais toon.
 * O ciclo de dia e noite só mexe aqui, uma vez por quadro.
 */
export const lightUniforms = {
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.35).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.97, 0.9) },
  uSkyColor: { value: new THREE.Color(0.55, 0.7, 1) },
  uGroundColor: { value: new THREE.Color(0.45, 0.35, 0.4) },
  uShadowColor: { value: new THREE.Color(0.42, 0.4, 0.66) },
  uMidColor: { value: new THREE.Color(0.76, 0.74, 0.86) },
  uNight: { value: 0 },
  uWindowColor: { value: new THREE.Color(1, 0.78, 0.38) },
  uTime: { value: 0 },
  uWind: { value: 1 },
  uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
  uFogNear: { value: 60 },
  uFogFar: { value: 160 },
  uResolution: { value: new THREE.Vector2(1280, 720) },
  uOutlinePx: { value: 2 },
  /** Multiplicador do néon: > 1 só quando há bloom, para o brilho "vazar". */
  uGlowHDR: { value: 1 },
};

const COMMON_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  attribute vec3 aFx;
  vec4 kaeLocal(vec3 p, out vec3 worldPos) {
    vec4 local = vec4(p, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    vec4 world = modelMatrix * local;
    if (aFx.z > 0.0) {
      float ph = world.x * 0.37 + world.z * 0.29;
      float s = aFx.z * uWind;
      world.x += sin(uTime * 1.6 + ph) * s * 0.07;
      world.z += cos(uTime * 1.25 + ph * 1.3) * s * 0.05;
      world.y += sin(uTime * 2.1 + ph) * s * 0.02;
    }
    worldPos = world.xyz;
    return world;
  }
`;

const TOON_VERTEX = /* glsl */ `
  ${COMMON_VERTEX}
  attribute vec3 aColor;
  varying vec3 vColor;
  varying vec3 vFx;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vFogDepth;
  void main() {
    vec3 wp;
    vec4 world = kaeLocal(position, wp);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      n = mat3(instanceMatrix) * n;
    #endif
    vNormalW = normalize(mat3(modelMatrix) * n);
    vPosW = wp;
    vec4 mv = viewMatrix * world;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    #ifdef USE_INSTANCING_COLOR
      vColor *= instanceColor;
    #endif
    vFx = aFx;
  }
`;

const TOON_FRAGMENT = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uShadowColor;
  uniform vec3 uMidColor;
  uniform float uNight;
  uniform vec3 uWindowColor;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec4 uFlash;
  uniform vec4 uTint;
  uniform float uOpacity;
  uniform float uEmissiveBoost;
  uniform float uGlowHDR;
  varying vec3 vColor;
  varying vec3 vFx;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vFogDepth;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    float ndl = dot(N, uSunDir);
    // Três tons bem marcados: luz, meio-tom e sombra.
    float w = fwidth(ndl) * 1.5 + 0.001;
    float lit = smoothstep(0.62 - w, 0.62 + w, ndl);
    float mid = smoothstep(0.15 - w, 0.15 + w, ndl);
    vec3 light = mix(uShadowColor, mix(uMidColor, uSunColor, lit), mid);
    // Hemisfério: céu por cima, chão refletido por baixo.
    vec3 hemi = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
    vec3 col = vColor * (light + hemi * 0.14);

    // Néon permanente.
    col = mix(col, vColor * (1.1 + uEmissiveBoost) * uGlowHDR, clamp(vFx.x, 0.0, 1.0));

    // Janelas que acendem à noite (algumas ficam apagadas, sorteadas pela posição).
    if (vFx.y > 0.0) {
      float on = step(0.28, hash13(floor(vPosW * 3.0 + 0.5)));
      float flicker = 0.92 + 0.08 * sin(uTime * 3.0 + hash13(floor(vPosW * 3.0)) * 40.0);
      float k = vFx.y * uNight * on;
      col = mix(col, uWindowColor * (1.2 + uEmissiveBoost) * uGlowHDR * flicker, k);
    }

    col = mix(col, uTint.rgb * col * 1.6, uTint.a);
    col = mix(col, uFlash.rgb, uFlash.a);

    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

const OUTLINE_VERTEX = /* glsl */ `
  ${COMMON_VERTEX}
  attribute vec3 aOutline;
  uniform vec2 uResolution;
  uniform float uOutlinePx;
  uniform float uOutlineScale;
  varying float vFogDepth;
  void main() {
    vec3 wp;
    vec4 world = kaeLocal(position, wp);
    vec3 on = aOutline;
    #ifdef USE_INSTANCING
      on = mat3(instanceMatrix) * on;
    #endif
    vec3 nW = normalize(mat3(modelMatrix) * on);
    vec4 mv = viewMatrix * world;
    vFogDepth = -mv.z;
    vec4 clip = projectionMatrix * mv;
    vec4 clipN = projectionMatrix * viewMatrix * vec4(nW, 0.0);
    vec2 dirPx = clipN.xy * uResolution;
    float l = length(dirPx);
    if (l > 1e-5) {
      clip.xy += (dirPx / l) * (uOutlinePx * uOutlineScale * 2.0 / uResolution) * clip.w;
    }
    gl_Position = clip;
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 uOutlineColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uOpacity;
  varying float vFogDepth;
  void main() {
    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    gl_FragColor = vec4(mix(uOutlineColor, uFogColor, fog), uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface ToonOptions {
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  emissiveBoost?: number;
}

export type ToonMaterial = THREE.ShaderMaterial & {
  uniforms: typeof lightUniforms & {
    uFlash: { value: THREE.Vector4 };
    uTint: { value: THREE.Vector4 };
    uOpacity: { value: number };
    uEmissiveBoost: { value: number };
  };
};

/** Material toon de 3 tons para geometria voxel (atributos aColor/aFx). */
export function createToonMaterial(opts: ToonOptions = {}): ToonMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...lightUniforms,
      uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
      uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
      uOpacity: { value: opts.opacity ?? 1 },
      uEmissiveBoost: { value: opts.emissiveBoost ?? 0 },
    },
    vertexShader: TOON_VERTEX,
    fragmentShader: TOON_FRAGMENT,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
  });
  return mat as ToonMaterial;
}

export type OutlineMaterial = THREE.ShaderMaterial & {
  uniforms: typeof lightUniforms & {
    uOutlineColor: { value: THREE.Color };
    uOutlineScale: { value: number };
    uOpacity: { value: number };
  };
};

/** Contorno preto "inverted hull" com espessura constante em pixels. */
export function createOutlineMaterial(color = 0x0b0b16, scale = 1, transparent = false): OutlineMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...lightUniforms,
      uOutlineColor: { value: new THREE.Color(color) },
      uOutlineScale: { value: scale },
      uOpacity: { value: 1 },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    transparent,
  });
  return mat as OutlineMaterial;
}

let sharedToon: ToonMaterial | null = null;
let sharedOutline: OutlineMaterial | null = null;

/** Material toon compartilhado (para tudo que não precisa de flash individual). */
export function sharedToonMaterial(): ToonMaterial {
  return (sharedToon ??= createToonMaterial());
}

export function sharedOutlineMaterial(): OutlineMaterial {
  return (sharedOutline ??= createOutlineMaterial());
}

/** Liga ou desliga contornos globalmente (preset Baixo pode afinar). */
export function setOutlineWidth(px: number): void {
  lightUniforms.uOutlinePx.value = px;
}

/**
 * Cria um objeto voxel "pronto": malha toon + casca de contorno.
 * A casca usa a MESMA geometria, então não custa memória extra.
 */
export function createVoxelObject(
  geo: THREE.BufferGeometry,
  opts: { material?: ToonMaterial; outline?: OutlineMaterial | null; name?: string } = {},
): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, opts.material ?? sharedToonMaterial());
  mesh.name = 'body';
  group.add(mesh);
  if (opts.outline !== null) {
    const hull = new THREE.Mesh(geo, opts.outline ?? sharedOutlineMaterial());
    hull.name = 'outline';
    hull.renderOrder = -1;
    group.add(hull);
  }
  if (opts.name) group.name = opts.name;
  return group;
}
