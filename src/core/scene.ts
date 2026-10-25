import type * as THREE from 'three';
import type { GestureHandlers } from './input.ts';

/** Contrato de uma cena 3D (cidade, batalha, baú, vitrine). */
export interface GameScene {
  readonly id: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly gestures: GestureHandlers;
  enter(params?: unknown): void;
  exit(): void;
  /** `dt` já vem escalado pela câmera lenta; `rawDt` é o tempo real. */
  update(dt: number, time: number, rawDt: number): void;
  resize(width: number, height: number): void;
}
