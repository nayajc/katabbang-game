import { now } from './clock';
import { TUNING } from './tuning';

export type EngineCallbacks = {
  /** Fixed-timestep simulation step. `dt` is simulated ms (already timescaled). */
  update(dt: number): void;
  /** Draw. `wallTs` is the wall-clock time of the frame. */
  render(wallTs: number): void;
  /** Simulation timescale for this frame (1 = normal, 0.3 = slowmo, 0 = frozen). */
  timescale(): number;
};

/**
 * rAF loop with a fixed-timestep accumulator.
 * - single-frame delta clamped to TUNING.MAX_DELTA (250ms)
 * - auto-pauses on `visibilitychange` (hidden) and resumes without catch-up burst
 */
export class Engine {
  private cb: EngineCallbacks;
  private rafId = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private paused = false;

  constructor(cb: EngineCallbacks) {
    this.cb = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = now();
    this.acc = 0;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Drop the elapsed hidden time instead of catching up.
    this.last = now();
    this.acc = 0;
  }

  private onVisibility = () => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private frame = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    const t = now();
    const raw = t - this.last;
    this.last = t;
    if (this.paused) return;

    const delta = Math.min(raw, TUNING.MAX_DELTA);
    this.acc += delta * this.cb.timescale();

    let steps = 0;
    while (this.acc >= TUNING.FIXED_DT && steps < TUNING.MAX_STEPS_PER_FRAME) {
      this.cb.update(TUNING.FIXED_DT);
      this.acc -= TUNING.FIXED_DT;
      steps += 1;
    }
    if (steps === TUNING.MAX_STEPS_PER_FRAME) this.acc = 0;

    this.cb.render(t);
  };
}
