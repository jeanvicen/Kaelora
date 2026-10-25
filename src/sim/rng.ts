/**
 * RNG determinístico (sfc32) — a ÚNICA fonte de aleatoriedade da simulação.
 * Mesma semente = mesma sequência em qualquer plataforma (só operações inteiras).
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  /** Quantos números já foram sorteados (útil para depurar desync). */
  calls = 0;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 12; i++) this.nextU32();
    this.calls = 0;
  }

  nextU32(): number {
    this.calls++;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Inteiro em [0, n). */
  int(n: number): number {
    return n <= 1 ? 0 : this.nextU32() % n;
  }

  /** Inteiro em [min, max]. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** true com chance `permille`/1000. */
  chance(permille: number): boolean {
    return this.int(1000) < permille;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Embaralha uma cópia (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /** Estado serializável (para salvar no meio de uma partida). */
  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }
}

/** Hash 32 bits de uma string (para derivar sementes). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mistura duas sementes numa terceira. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
