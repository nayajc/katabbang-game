/**
 * Web Audio SFX — fully synthesized, zero asset bytes.
 *
 * iOS/Safari will not let an AudioContext start outside a user gesture, so the
 * context is created lazily on the first pointerdown/keydown (`unlockOnGesture`)
 * and `resume()`d again on every play in case the OS suspended it.
 */

export type SfxName =
  | 'perfect'
  | 'good'
  | 'miss'
  | 'collision'
  | 'combo'
  | 'gameover'
  /** Air-cut whoosh for a whiffed swing — no impact body, so it can never be
   * mistaken for a landed hit. */
  | 'whiff';

const MUTE_KEY = 'katabbang.muted';

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: Ctor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedFlag = false;
  private hydrated = false;
  private noise: AudioBuffer | null = null;

  get muted(): boolean {
    this.hydrate();
    return this.mutedFlag;
  }

  toggleMute(): boolean {
    this.hydrate();
    this.mutedFlag = !this.mutedFlag;
    try {
      window.localStorage.setItem(MUTE_KEY, this.mutedFlag ? '1' : '0');
    } catch {
      // private mode / storage disabled — mute still works for this session
    }
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(this.mutedFlag ? 0 : 0.9, this.ctx.currentTime);
    }
    return this.mutedFlag;
  }

  /** Installs one-shot gesture listeners; safe to call more than once. */
  unlockOnGesture(): () => void {
    if (typeof window === 'undefined') return () => {};
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
      if (this.ctx?.state === 'running') detach();
    };
    const detach = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchend', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock);
    return detach;
  }

  play(name: SfxName): void {
    this.hydrate();
    if (this.mutedFlag) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    switch (name) {
      case 'perfect':
        this.thump(t, 150, 44, 0.16, 0.9);
        this.blip(t + 0.02, 880, 1760, 0.16, 'square', 0.32);
        this.blip(t + 0.1, 1320, 2640, 0.2, 'triangle', 0.26);
        this.crash(t, 0.24, 0.5);
        break;
      case 'good':
        this.thump(t, 130, 50, 0.14, 0.75);
        this.blip(t + 0.02, 660, 990, 0.16, 'square', 0.26);
        this.crash(t, 0.16, 0.34);
        break;
      case 'miss':
        this.blip(t, 320, 90, 0.34, 'sawtooth', 0.24);
        this.crash(t, 0.2, 0.3);
        break;
      case 'collision':
        this.thump(t, 110, 40, 0.2, 0.8);
        this.crash(t, 0.18, 0.36);
        break;
      case 'combo':
        this.blip(t, 990, 1480, 0.1, 'triangle', 0.2);
        this.blip(t + 0.07, 1480, 1980, 0.12, 'triangle', 0.18);
        break;
      case 'whiff':
        this.swish(t, 0.16);
        break;
      case 'gameover':
        this.blip(t, 440, 220, 0.3, 'sawtooth', 0.22);
        this.blip(t + 0.18, 330, 110, 0.5, 'sawtooth', 0.22);
        this.thump(t, 90, 35, 0.5, 0.7);
        break;
    }
  }

  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      this.mutedFlag = window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.mutedFlag = false;
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = audioCtor();
    if (!Ctor) return null;
    this.hydrate();
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.mutedFlag ? 0 : 0.9;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Pitch-swept oscillator with a percussive envelope. */
  private blip(
    t: number,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Low sine drop — the body of an impact. */
  private thump(t: number, from: number, to: number, dur: number, gain: number): void {
    this.blip(t, from, to, dur, 'sine', gain);
  }

  /** Filtered white-noise burst — the "crack" of an impact. */
  private crash(t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + dur);
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /**
   * Air-cut whoosh: narrow band of noise swept UP and back down, with no low
   * body at all. {@link crash} sweeps the band DOWNWARD over a thump, which is
   * what an impact sounds like — this is deliberately the inverse, and quiet,
   * so a whiffed swing can never be mistaken for a landed one.
   */
  private swish(t: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.5;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(4200, t + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }
}

export const audio = new AudioEngine();
