/**
 * Áudio 100% procedural (Web Audio): efeitos, vozes curtas, ambiência e
 * música generativa. Nenhum arquivo de som — tudo é sintetizado na hora.
 */

export type SfxName =
  | 'tap'
  | 'open'
  | 'close'
  | 'coin'
  | 'coins'
  | 'build'
  | 'place'
  | 'invalid'
  | 'upgrade'
  | 'upgradeDone'
  | 'error'
  | 'hit'
  | 'heavyHit'
  | 'crit'
  | 'shoot'
  | 'laser'
  | 'cannon'
  | 'mortar'
  | 'tesla'
  | 'frost'
  | 'explosion'
  | 'bigExplosion'
  | 'destroy'
  | 'heal'
  | 'deploy'
  | 'ability'
  | 'ultimateReady'
  | 'ultimate'
  | 'victory'
  | 'defeat'
  | 'star'
  | 'whoosh'
  | 'chestShake'
  | 'chestOpen'
  | 'reveal'
  | 'levelUp'
  | 'trap'
  | 'energy'
  | 'frenzy'
  | 'shield'
  | 'summon'
  | 'magic'
  | 'countdown'
  | 'notify';

export type MusicTrack = 'city' | 'battle' | 'chest' | 'menu' | null;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private sfxVolume = 0.8;
  private musicVolume = 0.55;
  private musicTrack: MusicTrack = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private beat = 0;
  private ambNodes: AudioNode[] = [];
  private ambKind: 'city' | 'battle' | null = null;
  private lastPlay = new Map<string, number>();
  private duck = 1;
  rarityForReveal: number = 0;

  /** Precisa ser chamado num gesto do usuário (política de autoplay). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    if (this.musicTrack) this.startScheduler();
    if (this.ambKind) this.buildAmbience(this.ambKind);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.42 * this.duck, t, 0.15);
    this.ambBus.gain.setTargetAtTime(this.sfxVolume * 0.5, t, 0.2);
  }

  /** Abaixa a música momentaneamente (Ultimate, revelação de baú). */
  duckMusic(amount: number, seconds: number): void {
    this.duck = amount;
    this.applyVolumes();
    setTimeout(() => {
      this.duck = 1;
      this.applyVolumes();
    }, seconds * 1000);
  }

  // ------------------------------------------------------------ primitivas

  private env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0, r = 0.05): number {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    if (sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
    return t + a + d + r;
  }

  private tone(
    out: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    vol: number,
    attack = 0.005,
    detune = 0,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private noise(
    out: AudioNode,
    t: number,
    dur: number,
    vol: number,
    filter: BiquadFilterType,
    f0: number,
    f1 = f0,
    q = 1,
    attack = 0.003,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bf = ctx.createBiquadFilter();
    bf.type = filter;
    bf.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    bf.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    src.connect(bf).connect(g).connect(out);
    const off = Math.random() * 1.5;
    src.start(t, off);
    src.stop(t + attack + dur + 0.05);
  }

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || !ctx.createStereoPanner) return this.sfxBus;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    return p;
  }

  // ------------------------------------------------------------ efeitos

  /**
   * Toca um efeito. `pitch` varia levemente sozinho (evita repetição robótica).
   * Efeitos idênticos muito próximos são limitados para não estourar.
   */
  play(name: SfxName, opts: { pitch?: number; volume?: number; pan?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0) return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? 0;
    const minGap = name === 'hit' || name === 'shoot' || name === 'laser' ? 0.035 : 0.012;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    const p = (opts.pitch ?? 1) * (0.94 + Math.random() * 0.12);
    const v = opts.volume ?? 1;
    const out = this.panner(opts.pan ?? 0);
    const t = now + 0.005;
    switch (name) {
      case 'tap':
        this.tone(out, 'sine', 900 * p, 1300 * p, t, 0.05, 0.22 * v);
        this.tone(out, 'triangle', 1800 * p, 1800 * p, t, 0.025, 0.06 * v);
        break;
      case 'open':
        this.tone(out, 'sine', 520 * p, 880 * p, t, 0.09, 0.2 * v);
        this.tone(out, 'sine', 780 * p, 1320 * p, t + 0.05, 0.08, 0.14 * v);
        break;
      case 'close':
        this.tone(out, 'sine', 880 * p, 480 * p, t, 0.09, 0.18 * v);
        break;
      case 'coin':
        this.tone(out, 'square', NOTE(83) * p, NOTE(83) * p, t, 0.06, 0.09 * v);
        this.tone(out, 'square', NOTE(88) * p, NOTE(88) * p, t + 0.06, 0.16, 0.09 * v);
        break;
      case 'coins':
        for (let i = 0; i < 6; i++) {
          const tt = t + i * 0.055 + Math.random() * 0.02;
          this.tone(out, 'square', NOTE(83 + (i % 3) * 2) * p, NOTE(88 + (i % 2) * 3) * p, tt, 0.07, 0.06 * v);
        }
        break;
      case 'build':
      case 'place':
        this.tone(out, 'sine', 180 * p, 60 * p, t, 0.16, 0.5 * v);
        this.noise(out, t, 0.08, 0.25 * v, 'bandpass', 1800 * p, 900, 2);
        if (name === 'build') this.tone(out, 'triangle', NOTE(76) * p, NOTE(76) * p, t + 0.08, 0.12, 0.12 * v);
        break;
      case 'invalid':
      case 'error':
        this.tone(out, 'square', 220 * p, 140 * p, t, 0.14, 0.12 * v);
        this.tone(out, 'square', 180 * p, 110 * p, t + 0.11, 0.16, 0.1 * v);
        break;
      case 'upgrade':
        [0, 4, 7, 12].forEach((s, i) => this.tone(out, 'triangle', NOTE(72 + s) * p, NOTE(72 + s) * p, t + i * 0.06, 0.12, 0.13 * v));
        break;
      case 'upgradeDone':
      case 'levelUp':
        [0, 4, 7, 12, 16, 19].forEach((s, i) =>
          this.tone(out, i % 2 ? 'triangle' : 'square', NOTE(72 + s) * p, NOTE(72 + s) * p, t + i * 0.07, 0.22, 0.09 * v),
        );
        this.noise(out, t + 0.3, 0.6, 0.06 * v, 'highpass', 6000, 9000);
        break;
      case 'hit':
        this.noise(out, t, 0.07, 0.35 * v, 'bandpass', 1400 * p, 600, 1.4);
        this.tone(out, 'sine', 160 * p, 70 * p, t, 0.08, 0.35 * v);
        break;
      case 'heavyHit':
        this.noise(out, t, 0.14, 0.5 * v, 'lowpass', 2200 * p, 300, 0.8);
        this.tone(out, 'sine', 120 * p, 40 * p, t, 0.2, 0.6 * v);
        break;
      case 'crit':
        this.noise(out, t, 0.09, 0.4 * v, 'bandpass', 2600 * p, 900, 1.2);
        this.tone(out, 'square', 1200 * p, 2400 * p, t, 0.08, 0.08 * v);
        this.tone(out, 'sine', 140 * p, 50 * p, t, 0.16, 0.5 * v);
        break;
      case 'shoot':
        this.tone(out, 'square', 1400 * p, 300 * p, t, 0.08, 0.08 * v);
        this.noise(out, t, 0.04, 0.2 * v, 'highpass', 3000, 3000);
        break;
      case 'laser':
        this.tone(out, 'sawtooth', 2200 * p, 700 * p, t, 0.12, 0.07 * v);
        this.tone(out, 'sine', 1100 * p, 900 * p, t, 0.12, 0.08 * v);
        break;
      case 'cannon':
        this.noise(out, t, 0.25, 0.55 * v, 'lowpass', 1600 * p, 200, 0.7);
        this.tone(out, 'sine', 110 * p, 35 * p, t, 0.3, 0.6 * v);
        break;
      case 'mortar':
        this.tone(out, 'sine', 1800 * p, 600 * p, t, 0.45, 0.05 * v);
        this.noise(out, t, 0.18, 0.4 * v, 'lowpass', 900 * p, 200, 0.7);
        break;
      case 'tesla':
        for (let i = 0; i < 5; i++) this.noise(out, t + i * 0.025, 0.04, 0.22 * v, 'highpass', 2500 + Math.random() * 3000, 4000, 4);
        this.tone(out, 'sawtooth', 90 * p, 70 * p, t, 0.18, 0.12 * v);
        break;
      case 'frost':
        this.tone(out, 'sine', 2400 * p, 3200 * p, t, 0.25, 0.07 * v);
        this.tone(out, 'sine', 3600 * p, 2800 * p, t + 0.03, 0.3, 0.05 * v);
        this.noise(out, t, 0.2, 0.12 * v, 'highpass', 5000, 8000, 2);
        break;
      case 'trap':
      case 'explosion':
        this.noise(out, t, 0.45, 0.6 * v, 'lowpass', 2400 * p, 120, 0.7);
        this.tone(out, 'sine', 90 * p, 30 * p, t, 0.45, 0.7 * v);
        break;
      case 'bigExplosion':
        this.noise(out, t, 1.3, 0.8 * v, 'lowpass', 3000 * p, 80, 0.7);
        this.tone(out, 'sine', 70 * p, 25 * p, t, 1.0, 0.9 * v);
        this.noise(out, t + 0.1, 0.9, 0.3 * v, 'bandpass', 600, 200, 0.6);
        break;
      case 'destroy':
        for (let i = 0; i < 4; i++) this.noise(out, t + i * 0.07, 0.18, 0.35 * v, 'lowpass', 1800 - i * 300, 200, 0.8);
        this.tone(out, 'sine', 100 * p, 35 * p, t, 0.4, 0.6 * v);
        break;
      case 'heal':
        [0, 7, 12, 16].forEach((s, i) => this.tone(out, 'sine', NOTE(79 + s) * p, NOTE(79 + s) * p, t + i * 0.05, 0.2, 0.08 * v));
        break;
      case 'deploy':
        this.noise(out, t, 0.18, 0.18 * v, 'bandpass', 600, 3000, 1.5, 0.05);
        this.tone(out, 'sine', 300 * p, 700 * p, t + 0.12, 0.1, 0.25 * v);
        break;
      case 'ability':
        this.tone(out, 'sawtooth', 220 * p, 880 * p, t, 0.25, 0.08 * v, 0.02);
        [0, 4, 7].forEach((s) => this.tone(out, 'triangle', NOTE(76 + s) * p, NOTE(76 + s) * p, t + 0.22, 0.3, 0.07 * v));
        break;
      case 'magic':
        this.tone(out, 'sine', 600 * p, 1600 * p, t, 0.3, 0.12 * v, 0.03);
        this.noise(out, t, 0.3, 0.1 * v, 'bandpass', 3000, 6000, 3);
        break;
      case 'summon':
        [0, 5, 10, 15].forEach((s, i) => this.tone(out, 'triangle', NOTE(60 + s) * p, NOTE(64 + s) * p, t + i * 0.06, 0.16, 0.1 * v));
        break;
      case 'shield':
        this.tone(out, 'sine', 300 * p, 900 * p, t, 0.25, 0.15 * v);
        this.tone(out, 'triangle', 450 * p, 1350 * p, t, 0.25, 0.08 * v);
        break;
      case 'ultimateReady':
        [0, 7, 12, 19, 24].forEach((s, i) => this.tone(out, 'square', NOTE(67 + s) * p, NOTE(67 + s) * p, t + i * 0.05, 0.12, 0.06 * v));
        break;
      case 'ultimate':
        this.noise(out, t, 1.0, 0.25 * v, 'bandpass', 200, 4000, 1.2, 0.6);
        this.tone(out, 'sawtooth', 55 * p, 220 * p, t, 1.0, 0.18 * v, 0.5);
        this.tone(out, 'sine', 80 * p, 25 * p, t + 1.0, 0.8, 0.9 * v);
        this.noise(out, t + 1.0, 1.0, 0.7 * v, 'lowpass', 4000, 100, 0.7);
        break;
      case 'victory':
        [
          [0, 0],
          [4, 0.12],
          [7, 0.24],
          [12, 0.36],
          [7, 0.56],
          [12, 0.68],
          [16, 0.8],
        ].forEach(([s, d]) => {
          this.tone(out, 'square', NOTE(72 + s) * p, NOTE(72 + s) * p, t + d, 0.22, 0.08 * v);
          this.tone(out, 'triangle', NOTE(60 + s) * p, NOTE(60 + s) * p, t + d, 0.3, 0.1 * v);
        });
        this.noise(out, t + 0.8, 1.2, 0.08 * v, 'highpass', 6000, 9000);
        break;
      case 'defeat':
        [
          [7, 0],
          [6, 0.25],
          [5, 0.5],
          [0, 0.8],
        ].forEach(([s, d]) => this.tone(out, 'triangle', NOTE(64 + s) * p, NOTE(64 + s) * p * 0.98, t + d, 0.4, 0.12 * v));
        break;
      case 'star':
        this.tone(out, 'triangle', NOTE(88) * p, NOTE(88) * p, t, 0.3, 0.14 * v);
        this.tone(out, 'sine', NOTE(95) * p, NOTE(95) * p, t + 0.04, 0.4, 0.08 * v);
        this.noise(out, t, 0.3, 0.06 * v, 'highpass', 7000, 9000);
        break;
      case 'whoosh':
        this.noise(out, t, 0.6, 0.4 * v, 'bandpass', 300, 3500, 1.2, 0.25);
        this.tone(out, 'sine', 120, 60, t + 0.3, 0.4, 0.25 * v);
        break;
      case 'chestShake':
        for (let i = 0; i < 3; i++) this.noise(out, t + i * 0.05, 0.05, 0.3 * v, 'bandpass', 900 * p + i * 200, 700, 3);
        this.tone(out, 'sine', 140 * p, 90 * p, t, 0.1, 0.2 * v);
        break;
      case 'chestOpen':
        this.noise(out, t, 0.5, 0.5 * v, 'lowpass', 5000, 300, 0.7);
        this.tone(out, 'sine', 90, 40, t, 0.4, 0.5 * v);
        [0, 7, 12, 19].forEach((s, i) => this.tone(out, 'sine', NOTE(84 + s) * p, NOTE(84 + s) * p, t + 0.1 + i * 0.04, 0.6, 0.06 * v));
        break;
      case 'reveal': {
        const r = this.rarityForReveal;
        const steps = [
          [0, 4],
          [0, 4, 7],
          [0, 4, 7, 11],
          [0, 4, 7, 11, 14, 16],
          [0, 3, 7, 10, 14, 17, 19, 24],
        ][Math.max(0, Math.min(4, r))];
        steps.forEach((s, i) => this.tone(out, i % 2 ? 'triangle' : 'square', NOTE(72 + s) * p, NOTE(72 + s) * p, t + i * 0.06, 0.35, 0.07 * v));
        if (r >= 3) {
          [0, 4, 7].forEach((s) => this.tone(out, 'sawtooth', NOTE(48 + s), NOTE(48 + s), t, 1.6, 0.05 * v, 0.2, 7));
          this.noise(out, t, 1.4, 0.1 * v, 'highpass', 6000, 10000);
        }
        break;
      }
      case 'energy':
        this.tone(out, 'sine', NOTE(84) * p, NOTE(91) * p, t, 0.08, 0.06 * v);
        break;
      case 'frenzy':
        [0, 3, 7, 10, 12].forEach((s, i) => this.tone(out, 'sawtooth', NOTE(64 + s), NOTE(64 + s), t + i * 0.05, 0.15, 0.06 * v));
        break;
      case 'countdown':
        this.tone(out, 'square', NOTE(81) * p, NOTE(81) * p, t, 0.1, 0.08 * v);
        break;
      case 'notify':
        this.tone(out, 'sine', NOTE(84), NOTE(84), t, 0.12, 0.12 * v);
        this.tone(out, 'sine', NOTE(91), NOTE(91), t + 0.1, 0.18, 0.12 * v);
        break;
    }
  }

  /**
   * "Voz" curta de personagem: sílabas com formantes sintetizados.
   * `seed` define o timbre (cada personagem soa diferente).
   */
  voice(seed: number, kind: 'deploy' | 'ability' | 'hurt' | 'victory' | 'death', volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0) return;
    const now = ctx.currentTime;
    const key = `voice-${kind}`;
    if (now - (this.lastPlay.get(key) ?? 0) < 0.18) return;
    this.lastPlay.set(key, now);
    const rnd = (k: number) => {
      const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const base = 140 + rnd(1) * 260;
    const syll = kind === 'victory' ? 3 : kind === 'ability' ? 2 : 1;
    const vowels = [
      [800, 1200],
      [400, 2000],
      [300, 870],
      [600, 1000],
      [350, 2300],
    ];
    for (let s = 0; s < syll; s++) {
      const t = now + 0.01 + s * 0.11;
      const [f1, f2] = vowels[Math.floor(rnd(s + 3) * vowels.length)];
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const pitchUp = kind === 'hurt' || kind === 'death' ? 1.25 : kind === 'victory' ? 1.1 + s * 0.08 : 1;
      o.frequency.setValueAtTime(base * pitchUp, t);
      o.frequency.exponentialRampToValueAtTime(base * pitchUp * (kind === 'death' ? 0.5 : kind === 'ability' ? 1.3 : 0.85), t + 0.12);
      const g = ctx.createGain();
      this.env(g, t, 0.01, 0.16 * volume, kind === 'death' ? 0.3 : 0.11);
      const a = ctx.createBiquadFilter();
      a.type = 'bandpass';
      a.frequency.value = f1;
      a.Q.value = 6;
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = f2;
      b.Q.value = 8;
      o.connect(a).connect(g);
      o.connect(b).connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.4);
    }
  }

  // ------------------------------------------------------------ ambiência

  /** Ambiência em camadas: brisa/mar/pássaros na cidade; multidão na batalha. */
  setAmbience(kind: 'city' | 'battle' | null): void {
    if (this.ambKind === kind) return;
    this.ambKind = kind;
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        // já parado
      }
      n.disconnect();
    }
    this.ambNodes = [];
    if (kind && this.ctx) this.buildAmbience(kind);
  }

  private buildAmbience(kind: 'city' | 'battle'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'city' ? 520 : 900;
    const g = ctx.createGain();
    g.gain.value = kind === 'city' ? 0.22 : 0.16;
    // ondas do mar / murmúrio da multidão: volume oscilando devagar
    const lfo = ctx.createOscillator();
    lfo.frequency.value = kind === 'city' ? 0.11 : 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = kind === 'city' ? 0.12 : 0.06;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    lfo.start();
    this.ambNodes.push(src, f, g, lfo, lfoGain);
    if (kind === 'battle') {
      const v = ctx.createBufferSource();
      v.buffer = this.noiseBuf;
      v.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 0.8;
      const vg = ctx.createGain();
      vg.gain.value = 0.05;
      v.connect(bp).connect(vg).connect(this.ambBus);
      v.start();
      this.ambNodes.push(v, bp, vg);
    }
  }

  /** Pássaros na cidade (chamado de vez em quando pela cena). */
  chirp(): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0 || this.ambKind !== 'city') return;
    const t = ctx.currentTime + 0.01;
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(this.ambBus, 'sine', base, base * (1.2 + Math.random() * 0.3), t + i * 0.09, 0.06, 0.05);
  }

  /** Multidão comemorando (golpes grandes, Núcleo caindo). */
  cheer(intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0) return;
    const t = ctx.currentTime + 0.01;
    this.noise(this.ambBus, t, 1.2 * intensity, 0.35 * intensity, 'bandpass', 900, 1500, 0.7, 0.2);
    this.noise(this.ambBus, t + 0.1, 1.0 * intensity, 0.2 * intensity, 'bandpass', 2200, 1800, 1.2, 0.25);
  }

  // ------------------------------------------------------------ música

  setMusic(track: MusicTrack): void {
    if (this.musicTrack === track) return;
    this.musicTrack = track;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (track && this.ctx) this.startScheduler();
  }

  private startScheduler(): void {
    const ctx = this.ctx!;
    this.nextBeatTime = ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicTrack) return;
    if (ctx.state !== 'running') return;
    const bpm = this.musicTrack === 'battle' ? 132 : this.musicTrack === 'chest' ? 70 : 98;
    const step = 60 / bpm / 2; // colcheias
    while (this.nextBeatTime < ctx.currentTime + 0.12) {
      this.playStep(this.beat, this.nextBeatTime, step);
      this.nextBeatTime += step;
      this.beat++;
    }
  }

  private playStep(i: number, t: number, step: number): void {
    const out = this.musicBus;
    const track = this.musicTrack;
    const bar = Math.floor(i / 8);
    const s = i % 8;
    if (track === 'city' || track === 'menu') {
      // Tropical-futurista: Fmaj7 – Dm7 – Bbmaj7 – C (vibe de praia neon)
      const prog = [
        [53, 57, 60, 64],
        [50, 53, 57, 60],
        [46, 50, 53, 57],
        [48, 52, 55, 59],
      ];
      const chord = prog[bar % 4];
      if (s === 0) for (const n of chord) this.tone(out, 'sawtooth', NOTE(n), NOTE(n), t, step * 7.5, 0.025, 0.25, (n % 3) * 6 - 6);
      if (s === 0 || s === 3 || s === 6) this.tone(out, 'triangle', NOTE(chord[0] - 12), NOTE(chord[0] - 12), t, step * 1.6, 0.16);
      // marimba
      const mel = [0, 2, 3, 1, 2, 3, 1, 0];
      if (s % 2 === 0 || (bar % 2 === 1 && s === 5)) {
        const n = chord[mel[(s + bar) % 8]] + 12;
        this.tone(out, 'sine', NOTE(n), NOTE(n), t, step * 1.2, 0.07);
        this.tone(out, 'sine', NOTE(n) * 4, NOTE(n) * 4, t, step * 0.3, 0.012);
      }
      // percussão leve
      if (s === 0 || s === 4) this.tone(out, 'sine', 120, 45, t, 0.12, 0.22);
      if (s % 2 === 1) this.noise(out, t, 0.04, 0.035, 'highpass', 8000);
      if (s === 2 || s === 6) this.noise(out, t, 0.08, 0.05, 'bandpass', 4500, 4500, 2);
    } else if (track === 'battle') {
      // Am – F – C – G, baixo pulsante e pads tensos
      const prog = [
        [45, 48, 52],
        [41, 45, 48],
        [48, 52, 55],
        [43, 47, 50],
      ];
      const chord = prog[bar % 4];
      this.tone(out, 'sawtooth', NOTE(chord[0] - 12), NOTE(chord[0] - 12), t, step * 0.8, 0.1);
      if (s === 0) for (const n of chord) this.tone(out, 'square', NOTE(n + 12), NOTE(n + 12), t, step * 7, 0.016, 0.1, 5);
      if (s % 2 === 0) this.tone(out, 'sine', 140, 40, t, 0.13, 0.3);
      if (s === 2 || s === 6) this.noise(out, t, 0.12, 0.16, 'bandpass', 1800, 1200, 0.9);
      this.noise(out, t, 0.03, 0.04, 'highpass', 9000);
      if (bar % 2 === 1 && (s === 3 || s === 5 || s === 7)) {
        const n = chord[(s + bar) % 3] + 24;
        this.tone(out, 'square', NOTE(n), NOTE(n), t, step * 0.8, 0.035);
      }
    } else if (track === 'chest') {
      if (s === 0) this.tone(out, 'sawtooth', NOTE(38), NOTE(38), t, step * 8, 0.05, 0.4, 4);
      if (s === 0 || s === 4) this.tone(out, 'sine', NOTE(62 + (bar % 2) * 3), NOTE(62 + (bar % 2) * 3), t, step * 2, 0.04);
    }
  }
}

export const audio = new AudioEngine();
