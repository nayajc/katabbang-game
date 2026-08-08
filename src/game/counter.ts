import { judge, type Grade } from './judge';
import { TUNING } from './tuning';
import type { Entity } from './entities/spawner';

/**
 * Simulated ms for the world to scroll `dist` vu, accounting for the linear
 * speed ramp (`SPEED_PER_SEC` vu/s per second). Solves
 * `dist = v0*t + a*t^2 / 2` for t, in seconds, then converts to ms.
 */
export function simMsToTravel(dist: number, speed: number): number {
  if (dist <= 0) return 0;
  const a = TUNING.SPEED_PER_SEC;
  if (speed >= TUNING.MAX_SPEED || a <= 0) return (dist / speed) * 1000;
  const t = (Math.sqrt(speed * speed + 2 * a * dist) - speed) / a;
  return t * 1000;
}

/**
 * Counter (어깨빵 반격) window controller.
 *
 * Slow motion scales the *simulation* only, so the wall-clock time until impact
 * is `simMsToImpact / SLOWMO_TIMESCALE`. The resulting `windowCenterTs` lives on
 * the `performance.now()` timeline, identical to `PointerEvent.timeStamp`.
 *
 * `pendingSimMs` is the engine's un-stepped accumulator: simulated time whose
 * wall-clock cost was ALREADY paid, so it must not be charged again. Ignoring it
 * pushed the window centre up to `FIXED_DT / SLOWMO_TIMESCALE` (~55ms) late.
 */
export class CounterWindow {
  target: Entity | null = null;
  windowCenterTs = 0;
  resolved = false;

  get active(): boolean {
    return this.target !== null && !this.resolved;
  }

  arm(target: Entity, simMsToImpact: number, wallNow: number, pendingSimMs = 0): void {
    this.target = target;
    this.resolved = false;
    const billableSimMs = Math.max(0, simMsToImpact - pendingSimMs);
    this.windowCenterTs = wallNow + billableSimMs / TUNING.SLOWMO_TIMESCALE;
  }

  /** Judge a counter input. Returns null when no window is armed. */
  submit(inputTs: number): Grade | null {
    if (!this.active) return null;
    this.resolved = true;
    return judge(inputTs, this.windowCenterTs);
  }

  /** True once the good window (plus grace) has closed with no input. */
  isExpired(wallNow: number): boolean {
    if (!this.active) return false;
    return wallNow > this.windowCenterTs + TUNING.GOOD_MS + TUNING.MISS_GRACE_MS;
  }

  /** Force a miss (window elapsed). */
  expire(): Grade {
    this.resolved = true;
    return 'miss';
  }

  clear(): void {
    this.target = null;
    this.resolved = false;
    this.windowCenterTs = 0;
  }
}
