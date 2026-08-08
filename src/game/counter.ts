import { judge, type Grade } from './judge';
import { TUNING } from './tuning';
import type { Entity } from './entities/spawner';

/**
 * Counter (어깨빵 반격) window controller.
 *
 * Slow motion scales the *simulation* only, so the wall-clock time until impact
 * is `simMsToImpact / SLOWMO_TIMESCALE`. The resulting `windowCenterTs` lives on
 * the `performance.now()` timeline, identical to `PointerEvent.timeStamp`.
 */
export class CounterWindow {
  target: Entity | null = null;
  windowCenterTs = 0;
  resolved = false;

  get active(): boolean {
    return this.target !== null && !this.resolved;
  }

  arm(target: Entity, simMsToImpact: number, wallNow: number): void {
    this.target = target;
    this.resolved = false;
    this.windowCenterTs = wallNow + simMsToImpact / TUNING.SLOWMO_TIMESCALE;
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
